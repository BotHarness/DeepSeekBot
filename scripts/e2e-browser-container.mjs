import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
assert.ok(
  ['fixture', 'prepare', 'observed', 'act', 'verify', 'snapshot', 'send', 'view'].includes(mode),
);
const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const statePath = process.env.BH_E2E_STATE;
assert.ok(origin && home && statePath);
const fixturePort = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32019);
const container = process.env.BH_E2E_CONTAINER;
const fixture = `http://${container ? '127.0.0.1' : 'host.docker.internal'}:${fixturePort}`;
const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(';')[0];
async function rpc(namespace, method, args) {
  const response = await fetch(`${origin}/api/${namespace}/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `container-qa-${Date.now()}-${Math.random()}`,
      method: `${namespace}/${method}`,
      payload: { args },
    }),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, JSON.stringify(result?.error));
  return result.value;
}
const api = (method, args = {}) => rpc('botharness', method, args);
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
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error(message);
}
function successfulCalls(rows) {
  const calls = new Map(
    rows.filter((r) => r.type === 'tool/call').map((r) => [r.data.callId, r.data]),
  );
  return rows
    .filter((r) => r.type === 'tool/result')
    .map((r) => ({ call: calls.get(r.data.message.toolCallId), message: r.data.message }));
}
function requireSuccess(results, name) {
  assert.ok(
    results.some((r) => r.call?.name === name && !r.message.isError),
    `${name} must succeed`,
  );
}
const save = (state) =>
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
const counter = async () =>
  container
    ? JSON.parse(
        execFileSync(
          'docker',
          [
            'exec',
            container,
            'curl',
            '--max-time',
            '5',
            '-fsS',
            `http://127.0.0.1:${fixturePort}/state`,
          ],
          { encoding: 'utf8', timeout: 30_000 },
        ),
      )
    : (await fetch(`http://127.0.0.1:${fixturePort}/state`)).json();
async function send(state, body) {
  const prior = Math.max(0, ...(await events(state.sessionId)).map((r) => r.seq));
  await api('channelSend', { channelId: state.channelId, body });
  save({ ...state, prior });
}
if (mode === 'fixture') {
  assert.ok(container, 'BH_E2E_CONTAINER identifies the task-owned running Browser container');
  execFileSync(
    'docker',
    [
      'cp',
      fileURLToPath(new URL('./e2e-browser-container-fixture.py', import.meta.url)),
      `${container}:/tmp/bh726-fixture.py`,
    ],
    { timeout: 30_000 },
  );
  execFileSync('docker', ['exec', '-d', container, 'python3', '/tmp/bh726-fixture.py'], {
    timeout: 30_000,
  });
  assert.deepEqual(await counter(), { queries: [], firstResultOpens: 0 });
  console.log('Task-owned container loopback fixture ready.');
} else if (mode === 'prepare') {
  assert.deepEqual(await counter(), { queries: [], firstResultOpens: 0 });
  const bot = (await api('create', { displayName: 'Container Browser QA' })).bot;
  const dm = (await api('channelDm', { slug: bot.slug })).channel;
  await api('browserAccessSet', { slug: bot.slug, enabled: true });
  await api('channelSend', {
    channelId: dm.id,
    body: `Container Browser QA：只用 browser_open 打开 ${fixture}/page，然后 browser_observe，bot_send_message 回复标题和搜索框。不输入，不点击。`,
  });
  const sessionId = await until(
    async () =>
      (await api('sessions', { slug: bot.slug })).sessions.find((s) => s.role === 'orchestrator')
        ?.sessionId,
    Boolean,
    'Session missing',
  );
  save({ slug: bot.slug, channelId: dm.id, sessionId, prior: 0 });
  console.log(
    JSON.stringify({ slug: bot.slug, phase: 'approve the first Browser action in the Client' }),
  );
} else {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (mode === 'view') {
    const response = await fetch(`${origin}/api/browser/open`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ slug: state.slug }),
      signal: AbortSignal.timeout(40_000),
    });
    console.log(await response.text());
  } else if (mode === 'act') {
    await send(
      state,
      'Container Browser QA：用 browser_observe 获取最新 ref，再用 browser_type 输入 Aurora container QA，用 browser_click 提交搜索，再 observe 并 click 打开第一个结果 Aurora field notes，最后 browser_screenshot 截图。bot_send_message 回复页面标题和 INTERACTION-FIRST-RESULT 标记。不得用 browser_open 或 navigate 绕过输入点击。',
    );
    console.log('Real PersonaBot interaction requested.');
  } else if (mode === 'send') {
    assert.ok(process.argv[3]);
    await send(state, process.argv[3]);
    console.log('QA prompt sent.');
  } else if (mode === 'snapshot') {
    const rows = await events(state.sessionId);
    console.log(
      JSON.stringify(
        rows
          .filter((r) =>
            ['tool/call', 'tool/result', 'turn/end', 'approval/asked'].includes(r.type),
          )
          .slice(-20),
        null,
        2,
      ),
    );
  } else {
    const rows = (
      await until(
        () => events(state.sessionId),
        (r) => r.some((e) => e.seq > state.prior && e.type === 'turn/end'),
        'Real PersonaBot turn did not complete',
      )
    ).filter((r) => r.seq > state.prior);
    const results = successfulCalls(rows);
    if (mode === 'observed') {
      for (const name of ['browser_open', 'browser_observe', 'bot_send_message'])
        requireSuccess(results, name);
      assert.deepEqual(await counter(), { queries: [], firstResultOpens: 0 });
    } else {
      for (const name of [
        'browser_observe',
        'browser_type',
        'browser_click',
        'browser_screenshot',
        'bot_send_message',
      ])
        requireSuccess(results, name);
      assert.deepEqual(await counter(), { queries: ['Aurora container QA'], firstResultOpens: 1 });
    }
    console.log(
      JSON.stringify(
        {
          phase: mode,
          calls: results.map((r) => ({ name: r.call?.name, isError: r.message.isError })),
          fixture: await counter(),
        },
        null,
        2,
      ),
    );
  }
}
