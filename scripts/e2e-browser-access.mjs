import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(
  ['--serve', '--prepare', '--start', '--finish', '--guards', '--restart', '--review'].includes(
    mode,
  ),
);
const port = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32016);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
const fixture = `http://127.0.0.1:${port}`;
if (mode === '--serve') {
  createServer((request, response) => {
    const url = new URL(request.url, fixture);
    response.setHeader('content-type', 'text/html; charset=utf-8');
    const second = url.pathname === '/next';
    response.end(
      `<!doctype html><title>Browser Access QA${second ? ' — next page' : ''}</title><body style="font:24px sans-serif;padding:40px;background:white;color:#111"><h1>Browser Access QA</h1><h2>${second ? 'Next page' : 'Orchard delivery bulletin'}</h2><p>Delivery day: Thursday. Boxes prepared: 37. Pickup window: 14:00–16:00.</p><p>QA page marker: ORCHARD-CONTENT-REDACTION</p><a href="${second ? '/page' : '/next'}">${second ? 'Return to bulletin' : 'Next page'}</a><label>Private draft <input aria-label="Private draft"></label></body>`,
    );
  }).listen(port, '127.0.0.1');
} else {
  const origin = process.env.BH_E2E_ORIGIN;
  const home = process.env.BH_E2E_HOME;
  const statePath = process.env.BH_E2E_STATE;
  assert.ok(origin && home && statePath);
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
        rpcId: `access-qa-${Date.now()}-${Math.random()}`,
        method: `${namespace}/${method}`,
        payload: { args },
      }),
    });
    const result = (await response.json()).result;
    assert.equal(result?.ok, true, `${namespace}/${method}: ${JSON.stringify(result?.error)}`);
    return result.value;
  }
  const api = (method, args) => rpc('botharness', method, args);
  const save = (state) =>
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const delay = () => new Promise((resolve) => setTimeout(resolve, 500));
  async function until(read, predicate, message, ms = 180000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = await read();
      if (predicate(value)) return value;
      await delay();
    }
    throw Error(message);
  }
  async function route(path, body) {
    const response = await fetch(`${origin}/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true);
    return response.json();
  }
  const sessionOf = async (slug) =>
    (await api('sessions', { slug })).sessions.find((s) => s.role === 'orchestrator')?.sessionId;
  async function events(sessionId) {
    const projection = await rpc('session', 'projections', { request: { sessionId } });
    const page = await rpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId },
        throughSeq: projection.asOfSeq,
        maxMessages: 200,
      },
    });
    return page.records.filter((r) => r.type === 'event').map((r) => r.event);
  }
  const schemas = async (sessionId) =>
    (await route('browser-access-qa', { sessionId, action: 'schemas' })).names;
  const native = (state, name, args = {}) =>
    route('browser-access-qa', { sessionId: state.sessionId, action: 'execute', name, args });
  const textOf = (result) =>
    result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  async function frame(slug) {
    const view = await route(`browser/observation?slug=${encodeURIComponent(slug)}`);
    if (process.env.BH_E2E_SCREENSHOT) {
      assert.match(view.frame, /^data:image\/jpeg;base64,/);
      writeFileSync(process.env.BH_E2E_SCREENSHOT, Buffer.from(view.frame.split(',')[1], 'base64'));
    }
    return view;
  }
  if (mode === '--prepare') {
    const bot = (await api('create', { displayName: 'Access QA' })).bot;
    assert.notEqual(bot.browserAccess, true);
    assert.notEqual(bot.computerAccess, true);
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('channelSend', {
      channelId: dm.id,
      body: '本地验收准备：仅用 bot_send_message 回复“Browser Access QA ready”，不要调用其他工具。',
    });
    const sessionId = await until(() => sessionOf(bot.slug), Boolean, 'Session unavailable');
    await until(
      () => events(sessionId),
      (rows) => rows.some((e) => e.type === 'turn/end'),
      'Initial model reply missing',
    );
    assert.equal(
      (await schemas(sessionId)).some((n) => n.startsWith('browser_')),
      false,
    );
    const independent = (await api('computerAccessSet', { slug: bot.slug, enabled: true })).bot;
    assert.notEqual(independent.browserAccess, true);
    assert.equal(independent.computerAccess, true);
    await api('computerAccessSet', { slug: bot.slug, enabled: false });
    save({ slug: bot.slug, channelId: dm.id, sessionId, phase: 'off' });
    console.log('Fresh Bot: Browser tools absent; Computer Access is independent.');
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (mode === '--review') {
      assert.equal(state.phase, 'completed');
      const prior = Math.max(...(await events(state.sessionId)).map((e) => e.seq));
      await api('channelSend', {
        channelId: state.channelId,
        body: `重启后 QA 预览：用 browser_open 打开 ${fixture}/page，然后 browser_observe 读取页面，用 bot_send_message 回复页面标题、37 箱和配送时间。不修改页面。`,
      });
      console.log('Review DM sent. Approve its first Browser action in the Client.');
      const records = await until(
        () => events(state.sessionId),
        (rows) => rows.some((e) => e.seq > prior && e.type === 'turn/end'),
        'Review model turn did not finish',
      );
      const calls = new Map(
        records
          .filter((e) => e.seq > prior && e.type === 'tool/call')
          .map((e) => [e.data.callId, e.data.name]),
      );
      for (const name of ['browser_open', 'browser_observe', 'bot_send_message'])
        assert.ok(
          records.some(
            (e) =>
              e.seq > prior &&
              e.type === 'tool/result' &&
              calls.get(e.data.message.toolCallId) === name &&
              !e.data.message.isError,
          ),
          `${name} review success required`,
        );
      await frame(state.slug);
      console.log('Post-restart real-model review page is ready.');
    } else if (mode === '--start') {
      assert.equal(state.phase, 'off');
      const bot = (await api('browserAccessSet', { slug: state.slug, enabled: true })).bot;
      assert.notEqual(bot.computerAccess, true);
      await until(
        () => schemas(state.sessionId),
        (names) => names.includes('browser_open') && names.includes('browser_observe'),
        'Browser registrations unavailable',
      );
      const priorSeq = Math.max(...(await events(state.sessionId)).map((e) => e.seq));
      await api('channelSend', {
        channelId: state.channelId,
        body: `请用 browser_open 打开 ${fixture}/page，然后 browser_observe 读取实际页面，再用 bot_send_message 告诉我配送日、箱数、取货时间。不要猜测，不要截图，不要修改页面。`,
      });
      const messages = await until(
        () => api('channelMessages', { channelId: state.channelId, limit: 100 }),
        (value) => value.messages.some((m) => m.toolApprovalRequest?.toolName === 'browser_open'),
        'First browser approval missing',
      );
      const approval = messages.messages.find(
        (m) => m.toolApprovalRequest?.toolName === 'browser_open',
      );
      assert.equal(
        (await api('toolApprovalStatus', { channelId: state.channelId, messageId: approval.id }))
          .status,
        'pending',
      );
      assert.equal((await frame(state.slug)).running, false);
      save({ ...state, phase: 'approval', priorSeq, approvalId: approval.id });
      console.log('First Browser action waits on a native pending approval; browser not launched.');
    } else if (mode === '--finish') {
      assert.equal(state.phase, 'approval');
      const fresh = await until(
        () => events(state.sessionId),
        (rows) => rows.some((e) => e.seq > state.priorSeq && e.type === 'turn/end'),
        'Approved real model turn did not finish',
      );
      const rows = fresh.filter((e) => e.seq > state.priorSeq);
      const calls = new Map(
        rows.filter((e) => e.type === 'tool/call').map((e) => [e.data.callId, e.data]),
      );
      const results = rows
        .filter((e) => e.type === 'tool/result')
        .map((e) => ({ call: calls.get(e.data.message.toolCallId), message: e.data.message }));
      for (const name of ['browser_open', 'browser_observe', 'bot_send_message'])
        assert.ok(
          results.some((r) => r.call?.name === name && !r.message.isError),
          `${name} success required`,
        );
      const observation = results.find(
        (r) => r.call?.name === 'browser_observe' && !r.message.isError,
      ).message;
      assert.match(textOf(observation), /e\S+ a Next page/);
      assert.match(textOf(observation), /37/);
      const reply = results.find((r) => r.call?.name === 'bot_send_message');
      const args =
        typeof reply.call.arguments === 'string'
          ? JSON.parse(reply.call.arguments)
          : reply.call.arguments;
      assert.match(args.body, /37/);
      assert.match(args.body, /14[:：]00/);
      assert.match(args.body, /16[:：]00/);
      assert.match(args.body, /Thursday|星期四|周四|木曜日/i);
      const messages = (await api('channelMessages', { channelId: state.channelId, limit: 100 }))
        .messages;
      assert.equal(
        messages.filter((m) => m.toolApprovalRequest?.toolName.startsWith('browser_')).length,
        1,
      );
      assert.ok(
        messages.some(
          (m) =>
            m.toolApprovalDecision?.requestMessageId === state.approvalId &&
            m.toolApprovalDecision.outcome === 'allowed-once',
        ),
      );
      const view = await frame(state.slug);
      assert.equal(view.tabs.length, 1);
      save({ ...state, phase: 'read', target: view.focused, modelReplyVerified: true });
      console.log(
        'Real model read and summarized all three page facts; exactly one approval for open + observe.',
      );
    } else if (mode === '--guards') {
      assert.equal(state.phase, 'read');
      const observed = await native(state, 'browser_observe');
      assert.equal(observed.isError, false);
      const ref = textOf(observed).match(/(e\S+) a Next page/)?.[1];
      assert.ok(ref);
      assert.equal(
        (await native(state, 'browser_open', { url: `${fixture}/next` })).isError,
        false,
      );
      const stale = await native(state, 'browser_click', { ref });
      assert.equal(stale.isError, true);
      assert.match(textOf(stale), /stale|observe|unknown ref|no element/i);
      const fresh = await native(state, 'browser_observe');
      assert.equal(fresh.isError, false);
      assert.match(textOf(fresh), /Next page/);
      const input = textOf(fresh).match(/(e\S+) input Private draft/)?.[1];
      assert.ok(input);
      assert.equal(
        (await native(state, 'browser_type', { ref: input, text: 'TYPED-CONTENT-REDACTION' }))
          .isError,
        false,
      );
      await route('browser/stop', { slug: state.slug });
      const stopped = await native(state, 'browser_observe');
      assert.equal(stopped.isError, true);
      assert.match(textOf(stopped), /no Bot Browser tab|browser_open/i);
      assert.equal(
        (await native(state, 'browser_open', { url: `${fixture}/page` })).isError,
        false,
      );
      const waiting = native(state, 'browser_wait', { ms: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 750));
      const revocationStart = Date.now();
      await api('browserAccessSet', { slug: state.slug, enabled: false });
      const cancelled = await waiting;
      const revocationMs = Date.now() - revocationStart;
      assert.equal(cancelled.isError, true, 'Revocation must abort the active call');
      assert.ok(revocationMs < 2500, 'Cancellation must settle promptly');
      await until(
        () => schemas(state.sessionId),
        (names) => !names.some((n) => n.startsWith('browser_')),
        'Revoked tools remain registered',
        10000,
      );
      const denied = await native(state, 'browser_observe');
      assert.equal(denied.isError, true);
      const logs = (await route('computer/logs?plugin=browser&limit=1000')).entries.filter(
        (r) => r.kind === 'browser-action' && r.detail.includes(`bot=${state.slug}`),
      );
      assert.ok(logs.some((r) => r.detail.includes('browser_open') && r.detail.includes(' -> ok')));
      assert.ok(
        logs.some((r) => r.detail.includes('browser_observe') && r.detail.includes(' -> ok')),
      );
      assert.ok(
        logs.every(
          (r) =>
            r.detail.includes(`bot=${state.slug}`) &&
            r.detail.includes(`session=${state.sessionId}`),
        ),
      );
      const logText = JSON.stringify(logs);
      assert.ok(
        !logText.includes('ORCHARD-CONTENT-REDACTION') &&
          !logText.includes('TYPED-CONTENT-REDACTION') &&
          !logText.includes('data:image'),
      );
      const other = (await api('create', { displayName: 'Approval revoke QA' })).bot;
      const otherDm = (await api('channelDm', { slug: other.slug })).channel;
      await api('channelSend', {
        channelId: otherDm.id,
        body: '本地验收准备，仅用 bot_send_message 回复 ready，不要调用其他工具。',
      });
      const otherSession = await until(
        () => sessionOf(other.slug),
        Boolean,
        'Other session unavailable',
      );
      await until(
        () => events(otherSession),
        (rows) => rows.some((e) => e.type === 'turn/end'),
        'Other model preparation failed',
      );
      assert.equal(
        (await schemas(otherSession)).some((n) => n.startsWith('browser_')),
        false,
      );
      await api('browserAccessSet', { slug: other.slug, enabled: true });
      const otherPrior = Math.max(...(await events(otherSession)).map((e) => e.seq));
      await api('channelSend', {
        channelId: otherDm.id,
        body: `本地撤销验收，请 browser_open 打开 ${fixture}/page，然后 observe 并用 bot_send_message 回复实际结果。如果工具被拒绝，直接回复拒绝原因，不重试。`,
      });
      const pendingMessages = await until(
        () => api('channelMessages', { channelId: otherDm.id, limit: 100 }),
        (value) => value.messages.some((m) => m.toolApprovalRequest?.toolName === 'browser_open'),
        'Pending approval unavailable',
      );
      const card = pendingMessages.messages.find(
        (m) => m.toolApprovalRequest?.toolName === 'browser_open',
      );
      assert.equal(
        (await api('toolApprovalStatus', { channelId: otherDm.id, messageId: card.id })).status,
        'pending',
      );
      if (process.env.BH_E2E_MANUAL_REVOKE === '1') {
        console.log('Approval revoke QA is pending. Turn its Browser Access off in the Client.');
        await until(
          () => api('list'),
          (value) => value.bots.find((b) => b.slug === other.slug)?.browserAccess !== true,
          'Manual revocation not received',
        );
      } else await api('browserAccessSet', { slug: other.slug, enabled: false });
      const otherEvents = await until(
        () => events(otherSession),
        (rows) => rows.some((e) => e.seq > otherPrior && e.type === 'turn/end'),
        'Cancelled model turn did not settle',
      );
      const otherCalls = new Map(
        otherEvents
          .filter((e) => e.seq > otherPrior && e.type === 'tool/call')
          .map((e) => [e.data.callId, e.data.name]),
      );
      assert.ok(
        otherEvents.some(
          (e) =>
            e.seq > otherPrior &&
            e.type === 'tool/result' &&
            otherCalls.get(e.data.message.toolCallId) === 'browser_open' &&
            e.data.message.isError,
        ),
      );
      assert.equal(
        (await api('toolApprovalStatus', { channelId: otherDm.id, messageId: card.id })).status,
        'expired',
      );
      assert.equal((await frame(other.slug)).tabs.length, 0);
      await api('browserAccessSet', { slug: state.slug, enabled: true });
      save({
        ...state,
        phase: 'restart',
        revocationMs,
        staleRefDenied: true,
        stoppedErrorVerified: true,
        auditRedacted: true,
        pendingApprovalCancelled: true,
      });
      console.log(
        'Navigation, stopped browser, revocation and redacted Audit guards passed. Restart the same isolated Host.',
      );
    } else {
      assert.equal(state.phase, 'restart');
      const bot = (await api('list')).bots.find((b) => b.slug === state.slug);
      assert.equal(bot.browserAccess, true);
      assert.notEqual(bot.computerAccess, true);
      assert.ok(process.env.BH_E2E_RESULTS);
      const report = {
        defaultOff: true,
        computerIndependent: true,
        scopedTools: true,
        firstApproval: 'allowed-once',
        approvalCards: 1,
        modelReadAndSummary: state.modelReplyVerified,
        navigationInvalidatesRefs: state.staleRefDenied,
        stoppedBrowserReadable: state.stoppedErrorVerified,
        revokedToolsAbsent: true,
        revocationToSettlementMs: state.revocationMs,
        auditAttributedAndRedacted: state.auditRedacted,
        pendingApprovalCancelled: state.pendingApprovalCancelled,
        accessSurvivesHostRestart: true,
      };
      writeFileSync(process.env.BH_E2E_RESULTS, `${JSON.stringify(report, null, 2)}\n`);
      save({ ...state, phase: 'completed' });
      console.log(JSON.stringify(report));
    }
  }
}
