import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignmentProbe, waitFor } from './e2e-assignment-probe.mjs';

const {
  BH_E2E_ORIGIN: origin,
  BH_E2E_HOME: home,
  BH_E2E_EVIDENCE: evidence,
  BH_E2E_STATE: statePath,
} = process.env;
assert.ok(origin && home && evidence && statePath);
const phase = process.argv[2] ?? 'prepare';
assert.ok(['prepare', 'restart', 'verify'].includes(phase));
mkdirSync(evidence, { recursive: true });
const { rpc, nativeSnapshot } = assignmentProbe({ origin, home });
const marker = 'FAILED_RESULT: Required input is unavailable; no result was produced.';
let scene;
const saveState = () => writeFileSync(statePath, JSON.stringify(scene, null, 2), { mode: 0o600 });
const rows = async (id) => (await nativeSnapshot(id)).records.map((r) => r.event);
const counts = (events) => ({
  starts: events.filter((e) => e.type === 'turn/start').length,
  ends: events.filter((e) => e.type === 'turn/end').length,
});
const sourceProof = (item) => ({
  id: item.id,
  state: item.state,
  createdAt: item.createdAt,
  observedAt: item.observedAt,
  handledAt: item.handledAt,
  sourceKind: item.sourceKind,
  assignmentSessionId: item.assignmentSessionId,
  assignmentReportState: item.assignmentReportState,
  assignmentTurn: item.assignmentTurn,
  authorKind: item.authorKind,
  authorBotSlug: item.authorBotSlug,
  sourceAvailable: item.sourceAvailable,
  summary: item.summary,
});
const sources = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (i) => i.assignmentSessionId === scene.sessionId,
  );
const assignment = async () =>
  (await rpc('assignment', { slug: scene.bot.slug, sessionId: scene.sessionId })).assignment;

if (phase === 'prepare') {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) =>
      m.provider === 'deepseek-official' &&
      m.model.includes('flash') &&
      m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Failed result QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Failed result QA ' + stamp,
      persona:
        'Follow the Human exactly. Create only one requested Assignment. Never run Shell, approve tools, edit files or create subagents. After creation bot_send_message FAILED_CREATED and end. When its failed Report arrives, bot_send_message FAILED_REPORT_SEEN and end. Do not claim task success, retry work, create replacement work or resume the Assignment. Distinguish semantic task failure from a native Turn ending normally.',
    })
  ).bot;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  const folder = resolve(home, 'qa-workspace');
  mkdirSync(folder, { recursive: true });
  const workspace = (await rpc('create', { request: { path: folder } }, 'workspace')).workspace;
  const grant = (await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspaceId }))
    .grant;
  scene = { bot: { slug: bot.slug, name: bot.displayName }, dm: dm.id };
  saveState();
  await rpc('channelSend', {
    channelId: scene.dm,
    body:
      'Create exactly one Assignment using grant_id ' +
      grant.id +
      '. Purpose: Failed semantic result QA. Its only task is to demonstrate that a required synthetic input was not supplied. It must invoke report_to_orchestrator exactly once with state failed, summary ' +
      JSON.stringify(marker) +
      ', expects_reply false, then end normally. Do not use files, Shell, subagents or other tools, retry, or send completed Reports. After creating it bot_send_message FAILED_CREATED and end. When the failed Report arrives bot_send_message FAILED_REPORT_SEEN and end without starting further work.',
  });
  scene.sessionId = (
    await waitFor(
      async () => (await rpc('assignments', { slug: bot.slug })).assignments[0],
      'failed-result Assignment',
    )
  ).sessionId;
  scene.orchestratorId = (await rpc('sessions', { slug: bot.slug })).sessions.find(
    (s) => s.role === 'orchestrator',
  ).sessionId;
  saveState();
  await waitFor(async () => {
    const items = await sources();
    const native = counts(await rows(scene.orchestratorId));
    const messages = (await rpc('channelMessages', { channelId: scene.dm })).messages;
    return (
      items.length === 1 &&
      items[0].state === 'handled' &&
      (await assignment()).activity === 'idle' &&
      native.starts === native.ends &&
      messages.some((m) => m.author.kind === 'bot' && m.body === 'FAILED_REPORT_SEEN')
    );
  }, 'failed Report harvest and native settlement');
} else scene = JSON.parse(readFileSync(statePath, 'utf8'));

const items = await sources();
assert.equal(items.length, 1, 'No fabricated successful Host notice or extra Report');
const source = sourceProof(items[0]);
assert.equal(source.summary, marker);
assert.equal(source.assignmentReportState, 'failed');
assert.equal(source.assignmentTurn, 1);
assert.equal(source.state, 'handled');
assert.equal(source.authorKind, 'bot');
assert.equal(source.authorBotSlug, scene.bot.slug);
assert.equal(source.sourceKind, 'assignment-report');
assert.equal(source.sourceAvailable, true);
assert.ok(source.observedAt && source.handledAt);
assert.equal(items[0].relatedReportSourceEventId, undefined);
const a = await assignment();
assert.equal(a.activity, 'idle');
assert.equal(a.latestReport.state, 'failed');
assert.equal(a.latestReport.summary, marker);
const native = await rows(scene.sessionId);
assert.deepEqual(counts(native), { starts: 1, ends: 1 });
const end = native.find((e) => e.type === 'turn/end');
assert.equal(end.data.reason.kind, 'completed');
const calls = native.filter((e) => e.type === 'tool/call');
assert.equal(calls.length, 1);
assert.equal(calls[0].data.name, 'report_to_orchestrator');
assert.deepEqual(JSON.parse(calls[0].data.arguments), {
  state: 'failed',
  summary: marker,
  expects_reply: false,
});
assert.equal(
  native.find((e) => e.type === 'tool/result' && e.data.message.toolCallId === calls[0].data.callId)
    ?.data.message.isError,
  false,
);
const orchEvents = await rows(scene.orchestratorId);
const orchTurns = counts(orchEvents);
assert.equal(orchTurns.starts, orchTurns.ends);
assert.equal(orchTurns.starts, 2);
const exposure = orchEvents.filter(
  (e) =>
    e.type === 'user/message' &&
    e.data.content?.some((c) => c.type === 'text' && c.text.includes(source.id)),
);
assert.equal(exposure.length, 1);
const channel = (await rpc('channelMessages', { channelId: scene.dm })).messages;
assert.equal(
  channel.filter((m) => m.author.kind === 'bot' && m.body === 'FAILED_REPORT_SEEN').length,
  1,
);
assert.equal((await rpc('assignments', { slug: scene.bot.slug })).assignments.length, 1);
const proof = {
  bot: scene.bot.name,
  source,
  assignment: { sessionId: a.sessionId, activity: a.activity, latestReport: a.latestReport },
  assignmentTurns: counts(native),
  nativeEnd: { turn: end.data.turn, seq: end.seq, reason: end.data.reason.kind },
  orchestratorTurns: orchTurns,
  reportExposures: exposure.length,
  assignmentCount: 1,
  successfulHostNotices: 0,
  automaticRetry: false,
};
if (phase === 'prepare') {
  scene.before = proof;
  saveState();
} else assert.deepEqual(proof, scene.before);
writeFileSync(
  resolve(
    evidence,
    { prepare: '01-settled.json', restart: '02-restarted.json', verify: '03-source-view.json' }[
      phase
    ],
  ),
  JSON.stringify(proof, null, 2) + '\n',
);
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
