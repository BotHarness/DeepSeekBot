import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(['--serve', '--prepare', '--ready', '--paused', '--resume'].includes(mode));
const port = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32017);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const fixture = `http://127.0.0.1:${port}`;
const digest = (data) => createHash('sha256').update(data).digest('hex');
if (mode === '--serve') {
  let item = 'Original item';
  let count = 0;
  let confirmed = '';
  createServer(async (request, response) => {
    const path = new URL(request.url, fixture).pathname;
    if (path === '/state') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ item, count, confirmed }));
    } else if (path === '/edit' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        assert.ok(body.length < 1000);
      }
      const value = JSON.parse(body).item;
      assert.equal(typeof value, 'string');
      assert.ok(value.length < 100);
      item = value;
      response.end('changed');
    } else if (path === '/confirm' && request.method === 'POST') {
      count += 1;
      confirmed = item;
      response.end('confirmed');
    } else {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(
        `<!doctype html><title>Browser observation QA</title><body style="font:24px sans-serif;padding:32px;background:white;color:#111"><h1>Browser observation QA</h1><p id="item"></p><label>Human edit <input aria-label="Human edit" value="Original item" style="font:20px sans-serif"></label><button id="edit" style="font:20px sans-serif">Apply Human edit</button><p><button id="confirm" style="font:24px sans-serif">Confirm current item</button></p><p id="receipt"></p><p>Disposable QA page: OBSERVATION-CONTENT-REDACTION</p><script>async function refresh(){const s=await(await fetch('/state')).json();document.querySelector('#item').textContent='Current item: '+s.item;document.querySelector('#receipt').textContent=s.count?'Confirmed '+s.confirmed+' ('+s.count+')':'Awaiting confirmation';}document.querySelector('#edit').onclick=async()=>{await fetch('/edit',{method:'POST',body:JSON.stringify({item:document.querySelector('input').value})});await refresh()};document.querySelector('#confirm').onclick=async()=>{await fetch('/confirm',{method:'POST'});await refresh()};refresh();setInterval(refresh,250);</script></body>`,
      );
    }
  }).listen(port, '127.0.0.1');
} else {
  const origin = process.env.BH_E2E_ORIGIN;
  const home = process.env.BH_E2E_HOME;
  const statePath = process.env.BH_E2E_STATE;
  assert.ok(origin && home && statePath);
  const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
    ';',
  )[0];
  async function rpc(namespace, method, args) {
    const response = await fetch(`${origin}/api/${namespace}/${method}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `observation-qa-${Date.now()}-${Math.random()}`,
        method: `${namespace}/${method}`,
        payload: { args },
      }),
    });
    const result = (await response.json()).result;
    assert.equal(result?.ok, true, JSON.stringify(result?.error));
    return result.value;
  }
  const api = (method, args = {}) => rpc('botharness', method, args);
  async function route(path, body) {
    const response = await fetch(`${origin}/api/${path}`, {
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: { cookie, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true);
    return response.json();
  }
  async function until(read, predicate, message) {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const value = await read();
      if (predicate(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw Error(message);
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
  const save = (state) =>
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const counter = async () => (await fetch(`${fixture}/state`)).json();
  const frame = (slug) => route(`browser/observation?slug=${encodeURIComponent(slug)}`);
  const native = (state, name, args = {}) =>
    route('browser-queue-qa', { sessionId: state.sessionId, name, args });
  const textOf = (result) =>
    result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  function resultsOf(rows) {
    const calls = new Map(
      rows
        .filter((event) => event.type === 'tool/call')
        .map((event) => [event.data.callId, event.data]),
    );
    return rows
      .filter((event) => event.type === 'tool/result')
      .map((event) => ({
        call: calls.get(event.data.message.toolCallId),
        message: event.data.message,
        seq: event.seq,
      }));
  }
  function successful(results, name) {
    const result = results.find((row) => row.call?.name === name && !row.message.isError);
    assert.ok(result, `${name} must succeed`);
    return result;
  }
  if (mode === '--prepare') {
    assert.equal((await counter()).count, 0);
    const bot = (await api('create', { displayName: 'Observation QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    await api('channelSend', {
      channelId: dm.id,
      body: `本地 QA：用 browser_open 打开 ${fixture}/page，再 browser_observe 读取页面，再 browser_screenshot 截图。只用 bot_send_message 回复实际标题、Current item 的文字、截图工具是否成功。如模型路线不支持图片，说明 readable fallback，不猜图。不点击，不操作输入框，不发送截图路径。`,
    });
    const sessionId = await until(
      async () =>
        (await api('sessions', { slug: bot.slug })).sessions.find(
          (session) => session.role === 'orchestrator',
        )?.sessionId,
      Boolean,
      'Session missing',
    );
    save({ slug: bot.slug, channelId: dm.id, sessionId, phase: 'approval' });
    console.log('Real model started. Approve the first Browser action in the Client.');
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (mode === '--ready') {
      assert.equal(state.phase, 'approval');
      const rows = await until(
        () => events(state.sessionId),
        (value) => value.some((event) => event.type === 'turn/end'),
        'Real model did not finish',
      );
      const results = resultsOf(rows);
      successful(results, 'browser_open');
      successful(results, 'browser_observe');
      successful(results, 'bot_send_message');
      const shot = successful(results, 'browser_screenshot').message;
      const image = shot.content.find((block) => block.type === 'image');
      let imageAttachment = false;
      let readableModelFallback = false;
      if (image) {
        const ref = image.attachment;
        assert.equal(ref.mediaType, 'image/jpeg');
        const hash = ref.attachmentId.match(/^sha256:([a-f0-9]{64})$/)?.[1];
        assert.ok(hash);
        const bytes = readFileSync(
          join(home, 'attachments', 'v1', 'objects', hash.slice(0, 2), hash),
        );
        assert.equal(digest(bytes), hash);
        assert.equal(bytes.length, ref.bytes);
        assert.ok(ref.width > 0 && ref.height > 0);
        imageAttachment = true;
      } else {
        assert.match(textOf(shot), /image unavailable/);
        readableModelFallback = true;
      }
      assert.ok(
        !/"data":"[A-Za-z0-9+/]{100,}/u.test(JSON.stringify(rows)),
        'Base64 cannot enter Session events',
      );
      const read = await native(state, 'browser_observe');
      assert.equal(read.isError, false);
      const ref = textOf(read).match(/^(e\S+) button Confirm current item$/mu)?.[1];
      assert.ok(ref);
      const view = await frame(state.slug);
      assert.match(view.frame, /^data:image\/jpeg;base64,/);
      assert.equal(view.tabs.length, 1);
      assert.equal(view.takeover, false);
      const unauthenticated = await fetch(`${origin}/api/browser/observation?slug=${state.slug}`);
      assert.equal(unauthenticated.status, 401);
      save({
        ...state,
        phase: 'ready',
        ref,
        target: view.focused,
        firstFrameHash: digest(view.frame),
        imageAttachment,
        readableModelFallback,
      });
      console.log(
        JSON.stringify({
          realModelScreenshot: true,
          imageAttachment,
          readableModelFallback,
          authenticatedPreview: true,
        }),
      );
    } else if (mode === '--paused') {
      assert.equal(state.phase, 'ready');
      const view = await frame(state.slug);
      assert.equal(view.takeover, true);
      const opened = await route('browser/open', { slug: state.slug, tab: state.target });
      assert.equal(opened.tabId, state.target);
      assert.equal(view.focused, state.target);
      assert.match(view.frame, /^data:image\/jpeg;base64,/);
      for (const [name, args] of [
        ['browser_screenshot', {}],
        ['browser_click', { ref: state.ref }],
      ]) {
        const refused = await native(state, name, args);
        assert.equal(refused.isError, true);
        assert.match(textOf(refused), /Browser Pause is active/);
        assert.ok(!refused.content.some((block) => block.type === 'image'));
      }
      assert.equal((await native(state, 'browser_observe')).isError, false);
      assert.equal((await counter()).count, 0);
      save({ ...state, phase: 'paused' });
      console.log(
        'Pause refuses model actions/screenshots; Human preview and read-only observation remain available.',
      );
    } else {
      assert.equal(state.phase, 'paused');
      assert.deepEqual(await counter(), { item: 'Updated by Human', count: 0, confirmed: '' });
      const view = await frame(state.slug);
      assert.equal(view.takeover, false);
      const opened = await route('browser/open', { slug: state.slug, tab: state.target });
      assert.equal(opened.tabId, state.target);
      assert.equal(view.focused, state.target);
      assert.notEqual(digest(view.frame), state.firstFrameHash);
      const stale = await native(state, 'browser_click', { ref: state.ref });
      assert.equal(stale.isError, true);
      assert.match(textOf(stale), /Resume requires a fresh browser_observe/);
      assert.equal((await counter()).count, 0);
      const prior = Math.max(...(await events(state.sessionId)).map((event) => event.seq));
      await api('channelSend', {
        channelId: state.channelId,
        body: 'Human 已暂停并把页面 item 改为 Updated by Human，现已 Resume。先用 browser_observe 重新读取当前页，再用新 ref 点击 Confirm current item 恰好一次，重新 observe 验证，然后 browser_screenshot 记录结果，最后 bot_send_message 回复实际 item、确认次数和截图状态。不要打开新页面，不要操作 Human edit 输入框，不发送本地路径。',
      });
      const rows = (
        await until(
          () => events(state.sessionId),
          (value) => value.some((event) => event.seq > prior && event.type === 'turn/end'),
          'Resumed model did not finish',
        )
      ).filter((event) => event.seq > prior);
      const results = resultsOf(rows);
      const read = successful(results, 'browser_observe');
      const click = successful(results, 'browser_click');
      assert.ok(read.seq < click.seq);
      assert.match(textOf(read.message), /Updated by Human/);
      successful(results, 'browser_screenshot');
      const reply = successful(results, 'bot_send_message');
      const args =
        typeof reply.call.arguments === 'string'
          ? JSON.parse(reply.call.arguments)
          : reply.call.arguments;
      assert.match(args.body, /Updated by Human/);
      assert.deepEqual(await counter(), {
        item: 'Updated by Human',
        count: 1,
        confirmed: 'Updated by Human',
      });
      const logs = (await route('computer/logs?plugin=browser&limit=1000')).entries.filter(
        (row) => row.kind === 'browser-action' && row.detail.includes(`bot=${state.slug}`),
      );
      assert.ok(logs.some((row) => row.detail.includes('browser_screenshot screenshot -> ok')));
      assert.ok(logs.some((row) => row.detail.includes('browser_screenshot screenshot -> error')));
      assert.ok(logs.every((row) => row.detail.includes(`session=${state.sessionId}`)));
      assert.ok(
        !/OBSERVATION-CONTENT-REDACTION|Updated by Human|data:image|sha256:/u.test(
          JSON.stringify(logs),
        ),
      );
      const final = await frame(state.slug);
      assert.equal(final.focused, state.target);
      assert.equal(final.tabs.length, 1);
      assert.match(final.frame, /^data:image\/jpeg;base64,/);
      if (process.env.BH_E2E_SCREENSHOT)
        writeFileSync(
          process.env.BH_E2E_SCREENSHOT,
          Buffer.from(final.frame.split(',')[1], 'base64'),
        );
      const report = {
        realModelScreenshot: true,
        imageAttachment: state.imageAttachment,
        readableModelFallback: state.readableModelFallback,
        noBase64SessionEvents: true,
        authenticatedLivePreview: true,
        unauthenticatedFrameDenied: true,
        pauseRefusesActionAndModelScreenshot: true,
        humanPreviewRemainsAvailable: true,
        pauseAllowsReadOnlyObservation: true,
        humanChangedPageWhilePaused: true,
        humanOpenRetainedBotTab: true,
        resumeRefusesOldObservation: true,
        modelReobservedBeforeAction: true,
        actualConfirmations: 1,
        confirmedItem: 'Updated by Human',
        auditAttributedAndRedacted: true,
        retainedCurrentTab: true,
      };
      assert.ok(process.env.BH_E2E_RESULTS);
      writeFileSync(process.env.BH_E2E_RESULTS, `${JSON.stringify(report, null, 2)}\n`);
      save({ ...state, phase: 'completed' });
      console.log(JSON.stringify(report));
    }
  }
}
