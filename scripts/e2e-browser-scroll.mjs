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
const fixture = 'http://127.0.0.1:32010';
if (mode === '--serve') {
  let count = 0;
  let submitted;
  createServer((request, response) => {
    const url = new URL(request.url, fixture);
    if (url.pathname === '/state') response.end(JSON.stringify({ count, submitted }));
    else if (url.pathname === '/reset') {
      count = 0;
      submitted = undefined;
      response.end('reset');
    } else {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      if (url.pathname === '/confirm') {
        count += 1;
        response.end(JSON.stringify({ count }));
      } else if (url.pathname === '/document') {
        response.end(
          `<!doctype html><title>Document scroll QA</title><body style="font:22px sans-serif;height:2600px;padding:24px;overflow:auto"><h1>Document scroll QA</h1><p id="state" style="position:fixed;top:20px;right:20px;background:white">Document Y: 0; Trusted wheel: none</p><script>let trusted='none';const refresh=()=>document.querySelector('#state').textContent='Document Y: '+Math.round(scrollY)+'; Trusted wheel: '+trusted;document.addEventListener('wheel',e=>{trusted=String(e.isTrusted);setTimeout(refresh,0)});document.addEventListener('scroll',refresh);setInterval(refresh,100);</script></body>`,
        );
      } else {
        response.end(
          `<!doctype html><title>Nested scroll QA</title><body style="font:22px sans-serif;margin:0;overflow:hidden"><h1 style="margin:24px 40px">Nested scroll QA</h1><p id="state" style="position:fixed;top:88px;left:40px;right:40px;font-size:18px">Inner Y: 0; Document Y: 0; Trusted wheel: none; Completed: 0</p><div id="scroller" style="position:fixed;top:144px;bottom:100px;left:40px;right:40px;overflow:auto;border:2px solid #777;background:#f7f7f7">${Array.from({ length: 10 }, (_, i) => `<div style="height:160px;box-sizing:border-box;padding:24px;border-bottom:1px solid #ccc">Item ${i + 1}</div>`).join('')}</div><footer style="position:fixed;bottom:24px;left:40px"></footer><script>let trusted='none',completed=0;const pane=document.querySelector('#scroller');const refresh=()=>{document.querySelector('#state').textContent='Inner Y: '+Math.round(pane.scrollTop)+'; Document Y: '+Math.round(scrollY)+'; Trusted wheel: '+trusted+'; Completed: '+completed;if(trusted==='true'&&pane.scrollTop+pane.clientHeight>=pane.scrollHeight-2&&!document.querySelector('button')){const button=document.createElement('button');button.textContent='Confirm loaded content';button.style.font='22px sans-serif';button.onclick=async()=>{button.disabled=true;completed=(await(await fetch('/confirm')).json()).count;refresh()};document.querySelector('footer').append(button)}};document.addEventListener('wheel',e=>{trusted=String(e.isTrusted);setTimeout(refresh,0)});pane.addEventListener('scroll',refresh);</script></body>`,
        );
      }
    }
  }).listen(32010, '127.0.0.1');
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
        rpcId: `scroll-qa-${Date.now()}-${Math.random()}`,
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
      bots.find((record) => record.displayName === 'Scroll QA') ??
      (await api('create', { displayName: 'Scroll QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    await api('browserProfileSet', { slug: bot.slug, profile: 'scroll' });
    const oldSession = (await api('sessions', { slug: bot.slug })).sessions.find(
      (record) => record.role === 'orchestrator',
    )?.sessionId;
    const prior = new Set(oldSession ? (await events(oldSession)).map((event) => event.seq) : []);
    await api('channelSend', {
      channelId: dm.id,
      body: `本地 QA。只调用 browser_open 打开 ${fixture}/page，再调用 browser_observe，然后调用 bot_send_message 向当前频道回复页面标题，不滚动、不点击按钮。`,
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
          JSON.stringify(result.message).includes('Nested scroll QA'),
      ),
    );
    const original = (await observation(bot.slug)).focused;
    assert.ok(original);
    assert.equal((await counter()).count, 0);
    const entries = await auditRows();
    writeFileSync(
      statePath,
      `${JSON.stringify({ slug: bot.slug, sessionId, original, modelPassed: true, lastLogId: Math.max(0, ...entries.map((row) => row.id)) }, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log('Real model opened and observed the scroll fixture. Run --probe on this build.');
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(state.modelPassed, true);
    assert.notEqual(state.probePassed, true, 'Probe already completed; prepare a fresh run');
    assert.equal((await counter()).count, 0, 'Fresh fixture required before mutation');
    const call = (name, args = {}) => tool(state.sessionId, name, args);
    const initial = await observation(state.slug);
    assert.equal(initial.focused, state.original);
    assert.equal(initial.tabs.length, 1);
    const observed = await call('browser_observe');
    assert.equal(observed.isError, false);
    async function readState() {
      const result = await call('browser_observe');
      assert.equal(result.isError, false);
      return textOf(result);
    }
    async function waitFixture(title) {
      const deadline = Date.now() + 5000;
      let text;
      do {
        text = await readState();
        if (text.includes(`Title: ${title}`)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.fail('Expected fixture must load before input');
    }
    async function scroll(direction, amount, valueOf, expected) {
      assert.equal((await call('browser_scroll', { direction, amount })).isError, false);
      const deadline = Date.now() + 5000;
      let text;
      do {
        text = await readState();
        if (expected(valueOf(text))) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.ok(expected(valueOf(text)), 'Expected scroll movement in fresh observation');
      return text;
    }
    const docY = (text) => Number(text.match(/Document Y: (\d+)/)?.[1] ?? NaN);
    const innerY = (text) => Number(text.match(/Inner Y: (\d+)/)?.[1] ?? NaN);
    assert.equal((await call('browser_open', { url: `${fixture}/document` })).isError, false);
    await waitFixture('Document scroll QA');
    const documentDown = await scroll('down', 600, docY, (y) => y > 0);
    const documentUp = await scroll('up', 200, docY, (y) => y >= 0 && y < docY(documentDown));
    assert.match(documentDown, before ? /Trusted wheel: none/ : /Trusted wheel: true/);
    assert.equal((await call('browser_open', { url: `${fixture}/page` })).isError, false);
    await waitFixture('Nested scroll QA');
    const down = await scroll('down', 2000, innerY, (y) => (before ? y === 0 : y > 0));
    const up = await scroll('up', 300, innerY, (y) =>
      before ? y === 0 : y >= 0 && y < innerY(down),
    );
    const restored = await scroll('down', 600, innerY, (y) => (before ? y === 0 : y > innerY(up)));
    assert.equal(docY(restored), 0);
    assert.match(restored, before ? /Trusted wheel: none/ : /Trusted wheel: true/);
    const view = await observation(state.slug);
    assert.equal(view.focused, state.original);
    assert.equal(view.tabs.length, 1);
    if (process.env.BH_E2E_SCREENSHOT) {
      assert.match(view.frame, /^data:image\/jpeg;base64,/);
      writeFileSync(process.env.BH_E2E_SCREENSHOT, Buffer.from(view.frame.split(',')[1], 'base64'));
    }
    const fresh = await readState();
    const confirmRef = fresh
      .split('\n')
      .find((line) => line.includes('button') && line.includes('Confirm loaded content'))
      ?.match(/(e[\w]+)/)?.[1];
    if (before) assert.equal(confirmRef, undefined);
    else {
      assert.ok(confirmRef);
      assert.equal((await call('browser_click', { ref: confirmRef })).isError, false);
      const deadline = Date.now() + 5000;
      while (!(await readState()).includes('Completed: 1') && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 100));
      assert.match(await readState(), /Completed: 1/);
    }
    const resultState = await counter();
    assert.equal(resultState.count, before ? 0 : 1);
    const final = await observation(state.slug);
    assert.equal(final.focused, state.original);
    assert.equal(final.tabs.length, 1);
    const rows = (await auditRows()).filter(
      (row) => row.id > state.lastLogId && row.detail.includes('browser_scroll'),
    );
    assert.equal(rows.length, 5);
    assert.ok(
      rows.every(
        (row) =>
          row.detail.includes(`bot=${state.slug}`) &&
          row.detail.includes(`session=${state.sessionId}`) &&
          row.detail.includes('role=orchestrator') &&
          / -> ok \(/.test(row.detail),
      ),
    );
    const report = {
      build: before ? 'before' : 'after',
      modelSetupVerified: true,
      document: { down: docY(documentDown), up: docY(documentUp), nativeWheel: !before },
      nested: {
        down: innerY(down),
        up: innerY(up),
        restored: innerY(restored),
        documentY: docY(restored),
        nativeWheel: !before,
        confirmRevealed: !!confirmRef,
      },
      submission: resultState,
      final: { currentRetained: final.focused === state.original, ownedTabs: final.tabs.length },
      audit: {
        matchedAttempts: rows.length,
        ok: 5,
        error: 0,
        attributed: true,
      },
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
