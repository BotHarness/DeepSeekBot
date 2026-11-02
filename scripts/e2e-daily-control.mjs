import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const statePath = process.env.BH_E2E_STATE;
const fixturePort = Number(process.env.BH_E2E_FIXTURE_PORT ?? 32021);
assert.ok(origin && home && statePath);
const mode = process.argv[2];
assert.ok(['prepare', 'read', 'edit', 'resumed', 'returned', 'navigate', 'verify'].includes(mode));
const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(';')[0];
async function rpc(namespace, method, args) {
  const envelope = await (
    await fetch(`${origin}/api/${namespace}/${method}`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `daily-qa-${Date.now()}`,
        method: `${namespace}/${method}`,
        payload: { args },
      }),
      signal: AbortSignal.timeout(30_000),
    })
  ).json();
  assert.equal(envelope.result?.ok, true, JSON.stringify(envelope.result?.error));
  return envelope.result.value;
}
const api = (method, args = {}) => rpc('botharness', method, args);
const save = (state) => writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
if (mode === 'prepare') {
  const bot = (await api('create', { displayName: 'Daily Chrome QA' })).bot;
  const dm = (await api('channelDm', { slug: bot.slug })).channel;
  assert.notEqual(bot.computerAccess, true);
  await api('browserAccessSet', { slug: bot.slug, enabled: true });
  save({ slug: bot.slug, channelId: dm.id });
  console.log(
    'Open the synthetic /signin page in Chrome. Select it in the official extension, then confirm control in the Browser entry.',
  );
} else {
  const state = JSON.parse(readFileSync(statePath));
  if (mode === 'verify') {
    const bot = (await api('list')).bots.find((bot) => bot.slug === state.slug);
    assert.notEqual(bot.computerAccess, true);
    const sessionId = (await api('sessions', { slug: state.slug })).sessions.find(
      (session) => session.role === 'orchestrator',
    )?.sessionId;
    assert.ok(sessionId);
    const projection = await rpc('session', 'projections', { request: { sessionId } });
    const page = await rpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId },
        throughSeq: projection.asOfSeq,
        maxMessages: 300,
      },
    });
    const events = page.records.filter((row) => row.type === 'event').map((row) => row.event);
    const calls = new Map(
      events
        .filter((row) => row.type === 'tool/call')
        .map((row) => [row.data.callId, row.data.name]),
    );
    const results = events
      .filter((row) => row.type === 'tool/result')
      .map((row) => ({
        name: calls.get(row.data.message.toolCallId),
        error: row.data.message.isError,
        content: row.data.message.content,
      }));
    for (const name of ['browser_observe', 'browser_type', 'browser_click'])
      assert.ok(
        results.some((row) => row.name === name && !row.error),
        `${name} must succeed through the real PersonaBot`,
      );
    assert.ok(
      events.some(
        (row) => row.type === 'approval/asked' && row.data.toolName === 'browser_observe',
      ),
      'First Browser observation must request native approval',
    );
    assert.ok(
      results.some(
        (row) =>
          row.name === 'browser_type' && row.error && JSON.stringify(row.content).includes('Pause'),
      ),
      'Paused type must be refused',
    );
    assert.ok(
      results.some(
        (row) =>
          row.name === 'browser_observe' &&
          !row.error &&
          JSON.stringify(row.content).includes('HUMAN-EDITED-766'),
      ),
      'Fresh observation must see the Human edit',
    );
    const fixture = await (await fetch(`http://127.0.0.1:${fixturePort}/state`)).json();
    assert.ok(fixture.saves.includes('BOT-SAVED-766') && fixture.saves.includes('BOT-RESUMED-766'));
    assert.ok(!fixture.saves.includes('MUST-NOT-WRITE'));
    console.log(
      JSON.stringify(
        {
          computerAccess: false,
          realModelTools: results
            .filter((row) => row.name?.startsWith('browser_'))
            .map(({ name, error }) => ({ name, error })),
          fixture,
        },
        null,
        2,
      ),
    );
  } else {
    const prompts = {
      read: '只用 browser_observe 读取 Human 选定的日常 Chrome 页面。bot_send_message 回复登录名、余额和 Account note 当前内容，不输入或点击。',
      edit: '先 browser_observe 获取最新 ref，再 browser_type 将 Account note 填为 BOT-SAVED-766，browser_click 点击 Save note，最后观察并 bot_send_message 回复保存结果。不导航。',
      resumed:
        '先 browser_observe 重新观察 Human 编辑，再 browser_type 输入 BOT-RESUMED-766，browser_click 点击 Save note，观察并回复保存结果。不导航。',
      returned:
        '尝试 browser_observe 读取原页面；若拒绝，不重试、不绕过，bot_send_message 报告需要 Human 重新连接授权。',
      navigate:
        '用 browser_observe 获取最新 ref，browser_click 点击 Navigate to another document。若授权被撤销，停止并回复，不自动重连或用其他工具绕过。',
    };
    await api('channelSend', { channelId: state.channelId, body: prompts[mode] });
    console.log(
      'Real PersonaBot QA step requested; approve any native request in the UI and inspect the fixture.',
    );
  }
}
