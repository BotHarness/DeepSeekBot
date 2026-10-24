import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const flags = process.argv.slice(2);
const modes = [
  '--serve',
  '--prepare',
  '--ready',
  '--reopen',
  '--search',
  '--probe',
  '--timeout-model',
  '--complete',
];
assert.equal(flags.filter((flag) => modes.includes(flag)).length, 1);
assert.ok(flags.every((flag) => modes.includes(flag) || flag === '--before'));
const mode = flags.find((flag) => modes.includes(flag));
const before = flags.includes('--before');
assert.ok(!before || ['--probe', '--timeout-model'].includes(mode));
const port = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32018);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const fixture = `http://127.0.0.1:${port}`;
if (mode === '--serve') {
  const queries = [];
  let firstResultOpens = 0;
  createServer((request, response) => {
    const url = new URL(request.url, fixture);
    if (url.pathname === '/state') {
      response.setHeader('content-type', 'application/json');
      return response.end(JSON.stringify({ queries, firstResultOpens }));
    }
    if (url.pathname === '/stall') {
      response.setHeader('content-type', 'image/png');
      response.flushHeaders();
      return;
    }
    const page = (title, content) =>
      response.end(
        `<!doctype html><title>${title}</title><body style="font:24px sans-serif;padding:32px;background:white;color:#111"><h1>${title}</h1>${content}</body>`,
      );
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (url.pathname === '/results') {
      queries.push(url.searchParams.get('q'));
      page(
        'Search results',
        '<p>Results for the synthetic search</p><p><a href="/article/first">Aurora field notes</a></p><p><a href="/article/second">Aurora archive</a></p>',
      );
    } else if (url.pathname === '/article/first') {
      firstResultOpens += 1;
      page(
        'Aurora field notes',
        '<p>INTERACTION-FIRST-RESULT</p><p>The first result was opened.</p><div style="height:1200px"></div><p>End of first result</p>',
      );
    } else if (url.pathname === '/article/second') {
      page('Aurora archive', '<p>Second result</p>');
    } else if (url.pathname === '/never') {
      page(
        'Unsettled page',
        '<p>Loading an image that never completes.</p><img src="/stall" alt="Pending fixture image">',
      );
    } else {
      page(
        'Browser interaction QA',
        '<form action="/results"><label>Search <input name="q" aria-label="Search" style="font:24px sans-serif"></label><button>Search</button></form><p><a href="/never">Never settle</a></p>',
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
        rpcId: `interaction-qa-${Date.now()}-${Math.random()}`,
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
  async function until(read, predicate, message) {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const value = await read();
      if (predicate(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw Error(message);
  }
  const save = (state) =>
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const counter = async () => (await fetch(`${fixture}/state`)).json();
  const frame = (slug) => route(`browser/observation?slug=${encodeURIComponent(slug)}`);
  const native = (state, name, args = {}) =>
    route('browser-queue-qa', { sessionId: state.sessionId, name, args });
  const textOf = (result) =>
    result.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
  function resultsOf(rows) {
    const calls = new Map(
      rows.filter((row) => row.type === 'tool/call').map((row) => [row.data.callId, row.data]),
    );
    return rows
      .filter((row) => row.type === 'tool/result')
      .map((row) => ({
        call: calls.get(row.data.message.toolCallId),
        message: row.data.message,
        seq: row.seq,
      }));
  }
  function success(results, name) {
    const row = results.find((row) => row.call?.name === name && !row.message.isError);
    assert.ok(row, `${name} must succeed`);
    return row;
  }
  async function model(state, body) {
    const prior = Math.max(0, ...(await events(state.sessionId)).map((row) => row.seq));
    await api('channelSend', { channelId: state.channelId, body });
    return (
      await until(
        () => events(state.sessionId),
        (rows) => rows.some((row) => row.seq > prior && row.type === 'turn/end'),
        'Real model turn did not complete',
      )
    ).filter((row) => row.seq > prior);
  }
  if (mode === '--prepare') {
    assert.deepEqual(await counter(), { queries: [], firstResultOpens: 0 });
    const bot = (await api('create', { displayName: 'Interaction QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    await api('channelSend', {
      channelId: dm.id,
      body: `本地 QA：只用 browser_open 打开 ${fixture}/page，然后 browser_observe，bot_send_message 回复标题和搜索框。不输入，不点击。`,
    });
    const sessionId = await until(
      async () =>
        (await api('sessions', { slug: bot.slug })).sessions.find((s) => s.role === 'orchestrator')
          ?.sessionId,
      Boolean,
      'Session missing',
    );
    save({ slug: bot.slug, channelId: dm.id, sessionId, phase: 'approval' });
    console.log('Approve the first Browser action in the Client, then run --ready.');
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (mode === '--ready') {
      assert.equal(state.phase, 'approval');
      const rows = await until(
        () => events(state.sessionId),
        (rows) => rows.some((row) => row.type === 'turn/end'),
        'Model setup did not complete',
      );
      const results = resultsOf(rows);
      success(results, 'browser_open');
      success(results, 'browser_observe');
      success(results, 'bot_send_message');
      const observed = await native(state, 'browser_observe');
      assert.equal(observed.isError, false);
      const ref = textOf(observed).match(/^(e\S+) (?:input|textbox) Search$/mu)?.[1];
      assert.ok(ref);
      const view = await frame(state.slug);
      assert.equal(view.tabs.length, 1);
      assert.ok(view.focused);
      save({ ...state, phase: 'ready', ref, target: view.focused });
      console.log('Initial real-model page and fresh Search ref verified.');
    } else if (mode === '--reopen') {
      assert.ok(['ready', 'searched', 'probed', 'completed'].includes(state.phase));
      const rows = await model(
        state,
        `QA 复验：用 browser_open 打开 ${fixture}/page，然后 browser_observe，bot_send_message 回复标题。只打开和观察，不搜索、不点击。`,
      );
      const results = resultsOf(rows);
      success(results, 'browser_open');
      success(results, 'browser_observe');
      success(results, 'bot_send_message');
      const observed = await native(state, 'browser_observe');
      assert.equal(observed.isError, false);
      const ref = textOf(observed).match(/^(e\S+) (?:input|textbox) Search$/mu)?.[1];
      assert.ok(ref);
      const tabs = await native(state, 'browser_tabs', { action: 'list' });
      assert.equal(tabs.isError, false);
      const targets = textOf(tabs)
        .split('\n')
        .filter((line) => line.startsWith('* '));
      assert.equal(targets.length, 1);
      const target = targets[0].split(' ')[1];
      assert.ok(target);
      save({ ...state, phase: 'ready', ref, target });
      console.log('Current-build real model reopened the search page.');
    } else if (mode === '--search') {
      assert.equal(state.phase, 'ready');
      const priorCounter = await counter();
      const rows = await model(
        state,
        '在当前网站搜索 aurora，并打开第一条结果 Aurora field notes。先 browser_observe，用 browser_type 输入，browser_press_key Enter 提交，再 browser_observe，然后 browser_click 第一条结果，再 browser_wait ms=100，browser_scroll down amount=600，最后 browser_observe 和 browser_screenshot。不要通过 browser_open 直接打开结果。用 bot_send_message 回复实际标题、结果标记和完成情况。',
      );
      const results = resultsOf(rows);
      for (const name of [
        'browser_observe',
        'browser_type',
        'browser_press_key',
        'browser_click',
        'browser_wait',
        'browser_scroll',
        'browser_screenshot',
        'bot_send_message',
      ])
        success(results, name);
      assert.ok(success(results, 'browser_observe').seq < success(results, 'browser_type').seq);
      assert.ok(!results.some((row) => row.call?.name === 'browser_open'));
      const searched = await counter();
      assert.deepEqual(searched.queries.slice(priorCounter.queries.length), ['aurora']);
      assert.equal(searched.firstResultOpens - priorCounter.firstResultOpens, 1);
      const observed = await native(state, 'browser_observe');
      assert.match(textOf(observed), /Aurora field notes/);
      assert.match(textOf(observed), /INTERACTION-FIRST-RESULT/);
      const stale = await native(state, 'browser_type', {
        ref: state.ref,
        text: 'STALE-TEXT-MUST-NOT-APPEAR',
      });
      assert.equal(stale.isError, true);
      assert.match(textOf(stale), /stale.*browser_observe/);
      const logs = (await route('computer/logs?plugin=browser&limit=1000')).entries.filter(
        (row) => row.kind === 'browser-action' && row.detail.includes(`bot=${state.slug}`),
      );
      for (const name of ['type', 'press_key', 'click', 'wait', 'scroll'])
        assert.ok(logs.some((row) => row.detail.includes(`browser_${name}`)));
      assert.ok(logs.every((row) => row.detail.includes(`session=${state.sessionId}`)));
      assert.ok(logs.some((row) => /browser_type.*chars=6.*-> ok/.test(row.detail)));
      assert.ok(
        !/aurora|STALE-TEXT-MUST-NOT-APPEAR|INTERACTION-FIRST-RESULT/i.test(JSON.stringify(logs)),
      );
      save({ ...state, phase: 'searched', searchAuditRedacted: true });
      console.log(
        'Real model searched, opened first result, used all five interaction tools; stale ref refused and Audit redacted.',
      );
    } else if (mode === '--timeout-model') {
      assert.equal(state.phase, before ? 'searched' : 'probed');
      const rows = await model(
        state,
        `只用 browser_open 打开 ${fixture}/page，再 browser_observe，再 browser_click 点击 Never settle 恰好一次。这是持续加载的 QA fixture，不重试、不另行导航。最后 bot_send_message 回复该 browser_click 工具的实际结果：成功就说明成功，若超时要引用超时毫秒数并说明应先观察。不要把加载中的页面误认为已完成。`,
      );
      const results = resultsOf(rows);
      const clicks = results.filter((row) => row.call?.name === 'browser_click');
      assert.equal(clicks.length, 1);
      assert.equal(clicks[0].message.isError, !before);
      if (!before)
        assert.match(textOf(clicks[0].message), /did not settle within 15000ms.*browser_observe/);
      const reply = success(results, 'bot_send_message');
      const args =
        typeof reply.call.arguments === 'string'
          ? JSON.parse(reply.call.arguments)
          : reply.call.arguments;
      assert.equal(typeof args.body, 'string');
      assert.ok(process.env.BH_E2E_RESULTS);
      writeFileSync(
        process.env.BH_E2E_RESULTS,
        `${JSON.stringify({ build: before ? 'before' : 'after', realModelClickCalls: 1, timeoutReported: !before, realModelReply: args.body, actualClickResult: textOf(clicks[0].message) }, null, 2)}\n`,
      );
      console.log('Real model completed the single-click timeout comparison.');
    } else if (mode === '--probe') {
      assert.equal(state.phase, 'searched');
      assert.equal(
        (await native(state, 'browser_open', { url: `${fixture}/page` })).isError,
        false,
      );
      const probeTarget = (await frame(state.slug)).focused;
      assert.ok(probeTarget);
      const observed = await native(state, 'browser_observe');
      const ref = textOf(observed).match(/^(e\S+) (?:a|link) Never settle$/mu)?.[1];
      assert.ok(ref);
      const started = Date.now();
      const clicked = await native(state, 'browser_click', { ref });
      const elapsedMs = Date.now() - started;
      assert.equal(clicked.isError, !before);
      if (!before) assert.match(textOf(clicked), /did not settle within 15000ms.*browser_observe/);
      assert.ok(
        elapsedMs >= 14000 && elapsedMs < 21000,
        'Readiness must be bounded, not a hanging call',
      );
      const view = await frame(state.slug);
      assert.equal(view.focused, probeTarget);
      const partial = await native(state, 'browser_observe');
      assert.equal(partial.isError, false);
      assert.match(textOf(partial), /Unsettled page/);
      const audits = (await route('computer/logs?plugin=browser&limit=1000')).entries.filter(
        (row) =>
          row.kind === 'browser-action' &&
          row.detail.includes(`bot=${state.slug}`) &&
          row.detail.includes('browser_click'),
      );
      audits.sort((a, b) => a.id - b.id);
      assert.match(audits.at(-1).detail, before ? / -> ok / : / -> error:.*did not settle/);
      assert.ok(audits.at(-1).detail.includes(`session=${state.sessionId}`));
      const report = {
        build: before ? 'before' : 'after',
        timeoutReported: clicked.isError === true,
        elapsedMs,
        currentRetained: true,
        partialObservationAvailable: true,
      };
      assert.ok(process.env.BH_E2E_RESULTS);
      writeFileSync(process.env.BH_E2E_RESULTS, `${JSON.stringify(report, null, 2)}\n`);
      if (!before)
        save({ ...state, target: probeTarget, phase: 'probed', toolRoundTripMs: elapsedMs });
      console.log(JSON.stringify(report));
    } else {
      assert.equal(state.phase, 'probed');
      assert.equal(
        (await native(state, 'browser_open', { url: `${fixture}/article/first` })).isError,
        false,
      );
      const rows = await model(
        state,
        'QA 完成，请 browser_observe 确认当前第一条结果，browser_screenshot，然后 bot_send_message 回复真实标题和 INTERACTION-FIRST-RESULT 标记。不要再搜索或点击。',
      );
      const results = resultsOf(rows);
      success(results, 'browser_observe');
      success(results, 'browser_screenshot');
      success(results, 'bot_send_message');
      const view = await frame(state.slug);
      assert.equal(view.focused, state.target);
      assert.equal(view.tabs.length, 1);
      assert.match(view.frame, /^data:image\/jpeg;base64,/);
      if (process.env.BH_E2E_SCREENSHOT)
        writeFileSync(
          process.env.BH_E2E_SCREENSHOT,
          Buffer.from(view.frame.split(',')[1], 'base64'),
        );
      const report = {
        realModelSearchCompleted: true,
        nativeInteractionTools: ['type', 'press_key', 'click', 'wait', 'scroll'],
        searchSubmissions: 1,
        firstResultOpenedDuringTask: 1,
        staleRefRefused: true,
        typedTextAuditRedacted: true,
        auditAttributed: true,
        readinessTimeoutReported: true,
        toolRoundTripMs: state.toolRoundTripMs,
        partialObservationAvailable: true,
        retryRetainsCurrentTab: true,
        finalModelReplyAndScreenshot: true,
      };
      assert.ok(process.env.BH_E2E_RESULTS);
      writeFileSync(process.env.BH_E2E_RESULTS, `${JSON.stringify(report, null, 2)}\n`);
      save({ ...state, phase: 'completed' });
      console.log(JSON.stringify(report));
    }
  }
}
