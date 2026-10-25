import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(['--serve', '--prepare', '--attach', '--publish', '--retention'].includes(mode));
const fixturePort = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32012);
assert.ok(Number.isInteger(fixturePort) && fixturePort > 0 && fixturePort < 65536);
const fixture = `http://127.0.0.1:${fixturePort}`;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (mode === '--serve') {
  let count = 0;
  let receipt;
  createServer(async (request, response) => {
    const url = new URL(request.url, fixture);
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/state') response.end(JSON.stringify({ count, receipt }));
    else if (url.pathname === '/submit' && request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const form = await new Response(Buffer.concat(chunks), {
        headers: { 'content-type': request.headers['content-type'] },
      }).formData();
      const file = form.get('capture');
      if (!(file instanceof File) || !/^screenshot-\d+\.jpg$/.test(file.name) || count > 0) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'A fresh screenshot submission is required' }));
        return;
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.length < 1000 || bytes[0] !== 255 || bytes[1] !== 216) {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: 'JPEG payload required' }));
        return;
      }
      count += 1;
      receipt = { filename: file.name, bytes: bytes.length, sha256: digest(bytes) };
      response.end(JSON.stringify({ count, receipt }));
    } else if (url.pathname === '/page') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(
        `<!doctype html><title>Screenshot publishing QA</title><body style="font:20px sans-serif;padding:20px;background:#fff;color:#111"><h1>Screenshot publishing QA</h1><p>Capture this page, attach the saved JPEG, then publish once.</p><section style="padding:20px;border:2px solid #555;margin:20px 0"><h2>Local draft</h2><p>This disposable page contains no account or personal data.</p><form><button type="button" id="attach" style="font:20px sans-serif;padding:10px">Attach screenshot</button><p id="file">Attachment: none</p><button id="publish" disabled style="font:20px sans-serif;padding:10px">Publish screenshot</button></form></section><p id="state">Published: 0</p><script>const form=document.querySelector('form'),button=document.querySelector('#publish');let input;document.querySelector('#attach').onclick=()=>{if(!input){input=document.createElement('input');input.type='file';input.name='capture';input.accept='image/jpeg';input.hidden=true;form.append(input);input.onchange=()=>{document.querySelector('#file').textContent='Attachment: '+(input.files[0]?.name||'none');button.disabled=!input.files.length}}input.click()};form.onsubmit=async e=>{e.preventDefault();button.disabled=true;const response=await fetch('/submit',{method:'POST',body:new FormData(form)});if(!response.ok)throw Error('Submission failed');const result=await response.json();document.querySelector('#state').textContent='Published: '+result.count+'; JPEG received: '+result.receipt.bytes+' bytes';document.querySelector('#attach').disabled=true};</script></body>`,
      );
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'Unknown fixture route' }));
    }
  }).listen(fixturePort, '127.0.0.1');
} else {
  const origin = process.env.BH_E2E_ORIGIN;
  const home = process.env.BH_E2E_HOME;
  const statePath = process.env.BH_E2E_STATE;
  assert.ok(origin && home && statePath, 'Set private origin, home and state path');
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
        rpcId: `capture-qa-${Date.now()}-${Math.random()}`,
        method: `${namespace}/${method}`,
        payload: { args },
      }),
    });
    const result = (await response.json()).result;
    assert.equal(result?.ok, true, `${namespace}/${method}: ${JSON.stringify(result?.error)}`);
    return result.value;
  }
  const api = (method, args) => rpc('botharness', method, args);
  const counter = async () => (await fetch(`${fixture}/state`)).json();
  const textOf = (result) =>
    result.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
  const saveState = (state) =>
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  async function observation(slug) {
    const response = await fetch(
      `${origin}/api/browser/observation?slug=${encodeURIComponent(slug)}`,
      { headers: { cookie }, signal: AbortSignal.timeout(30000) },
    );
    assert.equal(response.ok, true);
    return response.json();
  }
  async function saveFrame(slug) {
    if (!process.env.BH_E2E_SCREENSHOT) return;
    const view = await observation(slug);
    assert.match(view.frame, /^data:image\/jpeg;base64,/);
    writeFileSync(process.env.BH_E2E_SCREENSHOT, Buffer.from(view.frame.split(',')[1], 'base64'));
  }
  async function events(sessionId) {
    const projection = await rpc('session', 'projections', { request: { sessionId } });
    const page = await rpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId },
        throughSeq: projection.asOfSeq,
        maxMessages: 200,
      },
    });
    return page.records.filter((record) => record.type === 'event').map((record) => record.event);
  }
  async function modelTurn(slug, channelId, body) {
    const session = (await api('sessions', { slug })).sessions.find(
      (record) => record.role === 'orchestrator',
    )?.sessionId;
    const prior = new Set(session ? (await events(session)).map((event) => event.seq) : []);
    await api('channelSend', { channelId, body });
    const deadline = Date.now() + 240000;
    let sessionId, fresh;
    while (Date.now() < deadline) {
      sessionId = (await api('sessions', { slug })).sessions.find(
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
      'Real model turn must complete',
    );
    const calls = new Map(
      fresh
        .filter((event) => event.type === 'tool/call')
        .map((event) => [event.data.callId, event.data]),
    );
    const results = fresh
      .filter((event) => event.type === 'tool/result')
      .map((event) => ({
        call: calls.get(event.data.message.toolCallId),
        message: event.data.message,
      }));
    assert.ok(
      results.some((result) => result.call?.name === 'bot_send_message' && !result.message.isError),
      'Committed DM reply required',
    );
    return { sessionId, results, fresh };
  }
  async function auditRows() {
    const response = await fetch(`${origin}/api/computer/logs?plugin=browser&limit=1000`, {
      headers: { cookie },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true);
    return (await response.json()).entries;
  }
  async function nativeScreenshot(sessionId) {
    const response = await fetch(`${origin}/api/browser-queue-qa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ sessionId, name: 'browser_screenshot', args: {} }),
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true);
    return response.json();
  }
  function verifyImageAttachment(block) {
    assert.ok(block && block.attachment.mediaType === 'image/jpeg');
    const ref = block.attachment;
    const hash = ref.attachmentId.match(/^sha256:([a-f0-9]{64})$/)?.[1];
    assert.ok(hash);
    const image = readFileSync(join(home, 'attachments', 'v1', 'objects', hash.slice(0, 2), hash));
    assert.equal(digest(image), hash);
    assert.equal(image.length, ref.bytes);
    assert.equal(image[0], 255);
    assert.equal(image[1], 216);
    assert.ok(ref.width > 0 && ref.height > 0 && ref.bytes > 1000);
    return image;
  }
  const success = (results, name) =>
    results.filter((result) => result.call?.name === name && !result.message.isError);
  if (mode === '--prepare') {
    assert.equal(
      (await counter()).count,
      0,
      'Fresh fixture required; restart the isolated server for another run',
    );
    const bot =
      (await api('list')).bots.find((record) => record.displayName === 'Screenshot QA') ??
      (await api('create', { displayName: 'Screenshot QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    await api('browserProfileSet', { slug: bot.slug, profile: 'screenshot-qa' });
    const turn = await modelTurn(
      bot.slug,
      dm.id,
      `本地功能验收。只调用 browser_open 打开 ${fixture}/page，再 browser_observe，最后 bot_send_message 回复页面标题。不要截图、上传或发布。`,
    );
    assert.equal(success(turn.results, 'browser_open').length, 1);
    assert.ok(
      success(turn.results, 'browser_observe').some((result) =>
        JSON.stringify(result.message).includes('Screenshot publishing QA'),
      ),
    );
    const view = await observation(bot.slug);
    assert.equal(view.tabs.length, 1);
    assert.ok(view.focused);
    const rows = await auditRows();
    saveState({
      slug: bot.slug,
      channelId: dm.id,
      sessionId: turn.sessionId,
      target: view.focused,
      phase: 'prepared',
      lastLogId: Math.max(0, ...rows.map((row) => row.id)),
    });
    await saveFrame(bot.slug);
    console.log(
      'Real model opened the screenshot publishing fixture; ready to capture and attach.',
    );
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (mode === '--attach') {
      assert.equal(state.phase, 'prepared');
      assert.equal((await counter()).count, 0);
      const turn = await modelTurn(
        state.slug,
        state.channelId,
        '我已授权本次本地截图上传验收：调用 browser_screenshot 截取当前无私密信息的测试页；使用返回的保存路径，browser_observe 后取 Attach screenshot 的 ref，调用 browser_upload 上传截图到这个本地页面。然后重新 observe，bot_send_message 回复附件名称。此步不要点击 Publish screenshot。',
      );
      const shots = success(turn.results, 'browser_screenshot');
      const uploads = success(turn.results, 'browser_upload');
      assert.equal(shots.length, 1);
      assert.equal(uploads.length, 1);
      const path = textOf(shots[0].message).match(/Screenshot saved to (.+?\.jpg)/)?.[1];
      assert.ok(path);
      const uploadArgs =
        typeof uploads[0].call.arguments === 'string'
          ? JSON.parse(uploads[0].call.arguments)
          : uploads[0].call.arguments;
      assert.equal(uploadArgs.path, path);
      assert.equal(path.startsWith(join(home, 'botharness', 'browser', 'screenshots') + '/'), true);
      const bytes = readFileSync(path);
      assert.equal(bytes[0], 255);
      assert.equal(bytes[1], 216);
      assert.ok(bytes.length > 1000);
      const modelImage = shots[0].message.content.find((item) => item.type === 'image');
      const normalizedImage = verifyImageAttachment(modelImage);
      assert.ok(
        success(turn.results, 'browser_observe').some((result) =>
          textOf(result.message).includes(`Attachment: ${basename(path)}`),
        ),
      );
      assert.equal((await counter()).count, 0);
      saveState({
        ...state,
        phase: 'attached',
        path,
        bytes: bytes.length,
        sha256: digest(bytes),
        modelCalls: turn.results
          .filter((result) => result.call?.name.startsWith('browser_'))
          .map((result) => ({ name: result.call.name, ok: !result.message.isError })),
        persistedImageBytes:
          JSON.stringify(turn.fresh).includes(bytes.toString('base64')) ||
          JSON.stringify(turn.fresh).includes(normalizedImage.toString('base64')),
      });
      await saveFrame(state.slug);
      console.log(
        'Real model captured a saved JPEG and attached that exact path without publishing.',
      );
    } else if (mode === '--publish') {
      assert.equal(state.phase, 'attached');
      assert.equal((await counter()).count, 0);
      const turn = await modelTurn(
        state.slug,
        state.channelId,
        '我已授权向这个本地 disposable 测试页发布一次截图。browser_observe 后取 Publish screenshot 的新 ref，browser_click 点击一次。再次 observe 确认 Published: 1，bot_send_message 回复真实结果，不重复提交。',
      );
      assert.equal(success(turn.results, 'browser_click').length, 1);
      assert.ok(
        success(turn.results, 'browser_observe').some((result) =>
          textOf(result.message).includes('Published: 1'),
        ),
      );
      const server = await counter();
      assert.equal(server.count, 1);
      assert.deepEqual(server.receipt, {
        filename: basename(state.path),
        bytes: state.bytes,
        sha256: state.sha256,
      });
      const view = await observation(state.slug);
      assert.equal(view.focused, state.target);
      assert.equal(view.tabs.length, 1);
      const rows = (await auditRows()).filter(
        (row) => row.id > state.lastLogId && /browser_(screenshot|upload|click)/.test(row.detail),
      );
      assert.equal(rows.length, 3);
      assert.ok(
        rows.every(
          (row) =>
            row.detail.includes(`bot=${state.slug}`) &&
            row.detail.includes(`session=${state.sessionId}`) &&
            row.detail.includes('role=orchestrator') &&
            / -> ok \(/.test(row.detail) &&
            !row.detail.includes(state.path) &&
            !row.detail.includes(state.sha256) &&
            !row.detail.includes(readFileSync(state.path).toString('base64')),
        ),
      );
      assert.equal(
        state.persistedImageBytes,
        false,
        'JPEG base64 must not enter durable Session events',
      );
      saveState({ ...state, phase: 'published', serverVerified: true, auditVerified: true });
      await saveFrame(state.slug);
      console.log(
        'Real model published once; server verified the original JPEG bytes and Audit redaction.',
      );
    } else {
      assert.equal(state.phase, 'published');
      assert.ok(process.env.BH_E2E_RESULTS, 'Set a public-safe result path');
      const dir = join(home, 'botharness', 'browser', 'screenshots');
      assert.equal(
        readdirSync(dir).filter((name) => name.endsWith('.jpg')).length,
        1,
        'Dedicated fresh screenshot store required',
      );
      const image = readFileSync(state.path);
      const captureStamp = Number(basename(state.path).match(/^screenshot-(\d+)\.jpg$/)?.[1]);
      assert.ok(Number.isSafeInteger(captureStamp) && captureStamp > 105);
      const seedStamp = captureStamp - 105;
      mkdirSync(dir, { recursive: true });
      const seeded = Array.from({ length: 105 }, (_, i) => `screenshot-${seedStamp + i}.jpg`);
      for (const name of seeded) writeFileSync(join(dir, name), image);
      const result = await nativeScreenshot(state.sessionId);
      assert.equal(result.isError, false);
      const shot = result.content.find((item) => item.type === 'image');
      verifyImageAttachment(shot);
      const saved = textOf(result).match(/Screenshot saved to (.+?\.jpg)/)?.[1];
      assert.ok(saved);
      const savedBytes = readFileSync(saved);
      assert.equal(savedBytes[0], 255);
      assert.equal(savedBytes[1], 216);
      assert.ok(savedBytes.length > 1000);
      const names = readdirSync(dir)
        .filter((name) => name.endsWith('.jpg'))
        .sort();
      assert.equal(names.length, 100);
      for (const name of seeded.slice(0, 7)) assert.equal(names.includes(name), false);
      for (const name of seeded.slice(7)) assert.equal(names.includes(name), true);
      assert.ok(names.includes(basename(state.path)) && names.includes(basename(saved)));
      const final = await observation(state.slug);
      assert.equal(final.focused, state.target);
      assert.equal(final.tabs.length, 1);
      assert.equal((await counter()).count, 1);
      const report = {
        build: 'original slice acceptance',
        model: {
          setup: true,
          screenshotToUpload: true,
          freshObservationToPublish: true,
          calls: state.modelCalls,
        },
        savedScreenshot: { jpeg: true, bytes: state.bytes, uploadedPathMatchesToolResult: true },
        submission: { count: 1, exactJpegPayloadVerified: state.serverVerified },
        retention: {
          seededHistoricalCaptures: 105,
          nativeNewCapture: true,
          remaining: 100,
          oldestRemoved: 7,
          newestRetained: true,
          normalizedImageAttachmentContentAddressVerified: true,
        },
        audit: {
          screenshotUploadPublishAttributed: state.auditVerified,
          absolutePathAndContentsRedacted: true,
        },
        session: { jpegBase64Absent: !state.persistedImageBytes },
        currentTargetRetained: final.focused === state.target,
        ownedTabs: final.tabs.length,
      };
      writeFileSync(process.env.BH_E2E_RESULTS, `${JSON.stringify(report, null, 2)}\n`);
      saveState({ ...state, phase: 'completed' });
      console.log(JSON.stringify(report));
    }
  }
}
