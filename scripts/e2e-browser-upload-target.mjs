import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const flags = process.argv.slice(2);
const modes = ['--serve', '--prepare', '--probe'];
assert.ok(
  flags.every((flag) => modes.includes(flag) || flag === '--before'),
  'Unknown QA flag',
);
assert.equal(flags.filter((flag) => modes.includes(flag)).length, 1, 'Pass exactly one QA mode');
const mode = flags.find((flag) => modes.includes(flag));
const before = flags.includes('--before');
assert.ok(!before || mode === '--probe', '--before requires --probe');
const fixture = 'http://127.0.0.1:32011';
if (mode === '--serve') {
  let count = 0;
  let receipt;
  createServer(async (request, response) => {
    const url = new URL(request.url, fixture);
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/state') response.end(JSON.stringify({ count, receipt }));
    else if (url.pathname === '/reset') {
      count = 0;
      receipt = undefined;
      response.end(JSON.stringify({ count }));
    } else if (url.pathname === '/submit' && request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      const target = body.match(/name="target"; filename="([^"]*)"/);
      const other = body.match(/name="other"; filename="([^"]*)"/);
      if (
        target?.[1] !== 'qa-target.txt' ||
        other?.[1] !== '' ||
        !body.includes('Upload target QA proof')
      ) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'Unexpected uploaded form data' }));
        return;
      }
      count += 1;
      receipt = { target: target[1], other: other[1], payloadVerified: true };
      response.end(JSON.stringify({ count, receipt }));
    } else if (url.pathname === '/page') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(
        `<!doctype html><title>Upload target QA</title><body style="font:24px sans-serif;padding:32px;background:#fff;color:#111"><h1>Upload target QA</h1><p>Attach the document to the first field, then submit once.</p><form id="upload"><div style="margin:32px 0;padding:24px;border:2px solid #555"><label>Target document <input type="file" name="target" aria-label="Target document" style="font:22px sans-serif;display:block;margin-top:20px"></label></div><div style="margin:32px 0;padding:24px;border:2px solid #999"><label>Other attachment <input type="file" name="other" aria-label="Other attachment" style="font:22px sans-serif;display:block;margin-top:20px"></label></div><p id="state">Target: none; Other: none; Completed: 0</p><button disabled style="font:24px sans-serif;padding:14px">Submit target document</button></form><script>const form=document.querySelector('form'),target=form.elements.target,other=form.elements.other,button=document.querySelector('button');let completed=0;const refresh=()=>{document.querySelector('#state').textContent='Target: '+(target.files[0]?.name||'none')+'; Other: '+(other.files[0]?.name||'none')+'; Completed: '+completed;button.disabled=!target.files.length||completed>0};form.addEventListener('change',refresh);form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;const response=await fetch('/submit',{method:'POST',body:new FormData(form)});if(!response.ok)throw Error('Unexpected form data');completed=(await response.json()).count;refresh()});</script></body>`,
      );
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'Unknown fixture route' }));
    }
  }).listen(32011, '127.0.0.1');
} else {
  const origin = process.env.BH_E2E_ORIGIN;
  const home = process.env.BH_E2E_HOME;
  const statePath = process.env.BH_E2E_STATE;
  assert.ok(origin && home && statePath, 'Set private QA origin, home and state path');
  if (mode === '--probe')
    assert.ok(process.env.BH_E2E_RESULTS, 'Set a QA result path before probing');
  const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
    ';',
  )[0];
  async function rpc(namespace, method, args = {}) {
    const response = await fetch(`${origin}/api/${namespace}/${method}`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `upload-qa-${Date.now()}-${Math.random()}`,
        method: `${namespace}/${method}`,
        payload: { args },
      }),
    });
    const result = (await response.json()).result;
    assert.equal(result?.ok, true, `${namespace}/${method}: ${JSON.stringify(result?.error)}`);
    return result.value;
  }
  const api = (method, args) => rpc('botharness', method, args);
  async function observation(slug) {
    const response = await fetch(
      `${origin}/api/browser/observation?slug=${encodeURIComponent(slug)}`,
      { headers: { cookie }, signal: AbortSignal.timeout(30000) },
    );
    assert.equal(response.ok, true);
    return response.json();
  }
  async function tool(sessionId, name, args) {
    const response = await fetch(`${origin}/api/browser-queue-qa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ sessionId, name, args }),
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true);
    return response.json();
  }
  async function events(sessionId) {
    const projection = await rpc('session', 'projections', { request: { sessionId } });
    const page = await rpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId },
        throughSeq: projection.asOfSeq,
        maxMessages: 100,
      },
    });
    return page.records.filter((record) => record.type === 'event').map((record) => record.event);
  }
  const textOf = (result) =>
    result.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
  const counter = async () => (await fetch(`${fixture}/state`)).json();
  async function auditRows() {
    const response = await fetch(`${origin}/api/computer/logs?plugin=browser&limit=1000`, {
      headers: { cookie },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true);
    return (await response.json()).entries;
  }
  if (mode === '--prepare') {
    await fetch(`${fixture}/reset`);
    const bots = (await api('list')).bots;
    const bot =
      bots.find((record) => record.displayName === 'Upload QA') ??
      (await api('create', { displayName: 'Upload QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    await api('browserProfileSet', { slug: bot.slug, profile: 'upload' });
    const oldSession = (await api('sessions', { slug: bot.slug })).sessions.find(
      (record) => record.role === 'orchestrator',
    )?.sessionId;
    const prior = new Set(oldSession ? (await events(oldSession)).map((event) => event.seq) : []);
    await api('channelSend', {
      channelId: dm.id,
      body: `本地 QA。只调用 browser_open 打开 ${fixture}/page，再调用 browser_observe，然后调用 bot_send_message 向当前频道回复页面标题，不上传、不点击按钮。`,
    });
    const deadline = Date.now() + 180000;
    let sessionId, fresh;
    while (Date.now() < deadline) {
      sessionId = (await api('sessions', { slug: bot.slug })).sessions.find(
        (record) => record.role === 'orchestrator',
      )?.sessionId;
      if (sessionId) {
        fresh = (await events(sessionId)).filter((event) => !prior.has(event.seq));
        if (fresh.some((event) => event.type === 'turn/end')) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(
      fresh?.some((event) => event.type === 'turn/end'),
      'Real model must complete',
    );
    const calls = new Map(
      fresh
        .filter((event) => event.type === 'tool/call')
        .map((event) => [event.data.callId, event.data.name]),
    );
    const results = fresh
      .filter((event) => event.type === 'tool/result')
      .map((event) => ({
        name: calls.get(event.data.message.toolCallId),
        message: event.data.message,
      }));
    assert.ok(results.some((result) => result.name === 'browser_open' && !result.message.isError));
    assert.ok(
      results.some(
        (result) =>
          result.name === 'browser_observe' &&
          !result.message.isError &&
          JSON.stringify(result.message).includes('Upload target QA'),
      ),
    );
    const original = (await observation(bot.slug)).focused;
    assert.ok(original);
    assert.equal((await counter()).count, 0);
    const entries = await auditRows();
    const path = join(home, 'qa-target.txt');
    writeFileSync(path, 'Upload target QA proof\n', { mode: 0o600 });
    writeFileSync(
      statePath,
      `${JSON.stringify({ slug: bot.slug, sessionId, original, path, modelPassed: true, lastLogId: Math.max(0, ...entries.map((row) => row.id)) }, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log('Real model opened and observed the upload fixture. Run --probe on this build.');
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(state.modelPassed, true);
    assert.notEqual(state.probePassed, true, 'Probe already completed; prepare a fresh run');
    assert.equal((await counter()).count, 0, 'Fresh fixture required before mutation');
    const call = (name, args = {}) => tool(state.sessionId, name, args);
    const initial = await observation(state.slug);
    assert.equal(initial.focused, state.original);
    assert.equal(initial.tabs.length, 1);
    async function readState() {
      const result = await call('browser_observe');
      assert.equal(result.isError, false);
      return textOf(result);
    }
    const targetRef = (text) =>
      text
        .split('\n')
        .find((line) => line.includes('input') && line.includes('Target document'))
        ?.match(/(e[\w]+)/)?.[1];
    const first = await readState();
    assert.match(first, /Title: Upload target QA/);
    const staleRef = targetRef(first);
    assert.ok(staleRef);
    await readState();
    const stale = await call('browser_upload', { ref: staleRef, path: state.path });
    assert.equal(stale.isError, true);
    assert.match(textOf(stale), /stale/i);
    const ready = await readState();
    assert.match(ready, /Target: none; Other: none; Completed: 0/);
    const ref = targetRef(ready);
    assert.ok(ref);
    const upload = await call('browser_upload', { ref, path: state.path });
    assert.equal(upload.isError, false);
    const expected = before
      ? /Target: none; Other: qa-target.txt; Completed: 0/
      : /Target: qa-target.txt; Other: none; Completed: 0/;
    const deadline = Date.now() + 5000;
    let text;
    do {
      text = await readState();
      if (expected.test(text)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    assert.match(text, expected);
    const view = await observation(state.slug);
    assert.equal(view.focused, state.original);
    assert.equal(view.tabs.length, 1);
    if (process.env.BH_E2E_SCREENSHOT) {
      assert.match(view.frame, /^data:image\/jpeg;base64,/);
      writeFileSync(process.env.BH_E2E_SCREENSHOT, Buffer.from(view.frame.split(',')[1], 'base64'));
    }
    if (!before) {
      const fresh = await readState();
      const submitRef = fresh
        .split('\n')
        .find((line) => line.includes('button') && line.includes('Submit target document'))
        ?.match(/(e[\w]+)/)?.[1];
      assert.ok(submitRef);
      assert.equal((await call('browser_click', { ref: submitRef })).isError, false);
      const deadline = Date.now() + 5000;
      while (!(await readState()).includes('Completed: 1') && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 100));
      assert.match(await readState(), /Target: qa-target.txt; Other: none; Completed: 1/);
    }
    const resultState = await counter();
    assert.equal(resultState.count, before ? 0 : 1);
    if (!before)
      assert.deepEqual(resultState.receipt, {
        target: 'qa-target.txt',
        other: '',
        payloadVerified: true,
      });
    const final = await observation(state.slug);
    assert.equal(final.focused, state.original);
    assert.equal(final.tabs.length, 1);
    const rows = (await auditRows()).filter(
      (row) => row.id > state.lastLogId && row.detail.includes('browser_upload'),
    );
    assert.equal(rows.length, 2);
    assert.ok(
      rows.every(
        (row) =>
          row.detail.includes(`bot=${state.slug}`) &&
          row.detail.includes(`session=${state.sessionId}`) &&
          row.detail.includes('role=orchestrator') &&
          !row.detail.includes(state.path),
      ),
    );
    const ok = rows.filter((row) => / -> ok \(/.test(row.detail)).length;
    const error = rows.filter((row) => / -> error:/.test(row.detail)).length;
    assert.equal(ok, 1);
    assert.equal(error, 1);
    const report = {
      build: before ? 'before' : 'after',
      modelSetupVerified: true,
      staleRefRefused: true,
      upload: { target: before ? '' : 'qa-target.txt', other: before ? 'qa-target.txt' : '' },
      submission: resultState,
      final: { currentRetained: final.focused === state.original, ownedTabs: final.tabs.length },
      audit: { matchedAttempts: rows.length, ok, error, attributed: true, hostPathRedacted: true },
    };
    if (process.env.BH_E2E_COMPLETED_SCREENSHOT) {
      assert.match(final.frame, /^data:image\/jpeg;base64,/);
      writeFileSync(
        process.env.BH_E2E_COMPLETED_SCREENSHOT,
        Buffer.from(final.frame.split(',')[1], 'base64'),
      );
    }
    writeFileSync(process.env.BH_E2E_RESULTS, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(statePath, `${JSON.stringify({ ...state, probePassed: true }, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(JSON.stringify(report));
  }
}
