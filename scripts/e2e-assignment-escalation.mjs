import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignmentProbe, waitFor } from './e2e-assignment-probe.mjs';

const { BH_E2E_ORIGIN: origin, BH_E2E_HOME: home, BH_E2E_EVIDENCE: evidence } = process.env;
assert.ok(origin && home && evidence);
const phase = process.argv[2] ?? 'prepare';
assert.ok(['prepare', 'pending', 'verify', 'answered'].includes(phase));
const privateDir = resolve('.humanlayer/tasks/194-escalation');
mkdirSync(privateDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const statePath = process.env.BH_E2E_STATE ?? resolve(privateDir, 'qa-state.json');
const { rpc, nativeSnapshot } = assignmentProbe({ origin, home });
let scene;
const writeState = () => writeFileSync(statePath, JSON.stringify(scene, null, 2));
const writeProof = (name, proof) =>
  writeFileSync(resolve(evidence, name), JSON.stringify(proof, null, 2) + '\n');
const assignment = async () =>
  (await rpc('assignment', { slug: scene.bot.slug, sessionId: scene.sessionId })).assignment;
const reports = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (i) => i.assignmentSessionId === scene.sessionId && i.sourceKind === 'assignment-report',
  );
const actions = async () =>
  (await rpc('humanAttention', { category: 'action', botSlug: scene.bot.slug })).items.filter(
    (i) => i.assignmentSessionId === scene.sessionId,
  );
const messages = async () => (await rpc('channelMessages', { channelId: scene.dm })).messages;
const orchestratorEvents = async () => {
  const session = (await rpc('sessions', { slug: scene.bot.slug })).sessions.find(
    (s) => s.role === 'orchestrator',
  );
  assert.ok(session);
  return (await nativeSnapshot(session.sessionId)).records.map((r) => r.event);
};
const proofSource = ({
  id,
  summary,
  assignmentReportState,
  assignmentTurn,
  sourceAvailable,
  authorKind,
  state,
  observedAt,
  handledAt,
}) => ({
  id,
  summary,
  assignmentReportState,
  assignmentTurn,
  sourceAvailable,
  authorKind,
  state,
  ...(observedAt === undefined ? {} : { observedAt }),
  ...(handledAt === undefined ? {} : { handledAt }),
});
const expected = [
  'ESCALATION_WAITING: Choose Canary or Stable?',
  'ESCALATION_BLOCKED: Release is blocked. Choose Canary or Stable.',
  'WEAKER_WAITING: Still awaiting a route.',
  'WEAKER_PROGRESS: Documentation checked.',
];

if (phase === 'prepare') {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Escalation QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Escalation QA ' + stamp,
      persona:
        'Follow the Human exactly. Only create one requested Assignment. Never use Shell, files or subagents. Never answer a question reserved for the Human yourself. After creation bot_send_message ESCALATION_CREATED and end. On an Assignment Report bot_send_message ESCALATION_WAITING_FOR_HUMAN and end, without resuming the Assignment. When the Human explicitly sends an Assignment response, inspect_assignment and forward that exact Human response through send_assignment_request mode next-turn with answer_to equal to its canonical openAsk Source Event. After completed Report bot_send_message ESCALATION_RESOLVED and end.',
    })
  ).bot;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  const folder = resolve(home, 'qa-workspace');
  mkdirSync(folder, { recursive: true });
  const workspace = (await rpc('create', { request: { path: folder } }, 'workspace')).workspace;
  const grant = (await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspaceId }))
    .grant;
  scene = { bot: { slug: bot.slug, name: bot.displayName }, dm: dm.id, grantId: grant.id, route };
  writeState();
  await rpc('channelSend', {
    channelId: dm.id,
    body: `Create exactly one Assignment using grant_id ${grant.id}, purpose Escalation acceptance. Assignment must call report_to_orchestrator exactly four times in order: (1) state waiting-human, expects_reply true, summary ${JSON.stringify(expected[0])}; (2) state blocked, expects_reply true, summary ${JSON.stringify(expected[1])}; (3) state waiting-human, expects_reply true, summary ${JSON.stringify(expected[2])}; (4) state progress, summary ${JSON.stringify(expected[3])}, expects_reply false. End the Turn without any other tools, files, Shell or subagents. Do not choose a route. Only after an actual Human answer is forwarded, report_to_orchestrator state completed summary ESCALATION_RESOLVED: plus that exact route, then end. You must never answer this question yourself; after creation send ESCALATION_CREATED and end; on Reports send ESCALATION_WAITING_FOR_HUMAN and end.`,
  });
  scene.sessionId = (
    await waitFor(
      async () => (await rpc('assignments', { slug: bot.slug })).assignments[0],
      'owned Assignment',
    )
  ).sessionId;
  writeState();
  await waitFor(
    async () => (await reports()).length === 4 && (await assignment()).activity === 'idle',
    'four Reports and settled Assignment',
  );
  await waitFor(
    async () =>
      (await rpc('activitySnapshot')).bots.find((b) => b.slug === scene.bot.slug)?.state === 'idle',
    'settled Orchestrator',
  );
} else scene = JSON.parse(readFileSync(statePath, 'utf8'));

const items = await reports();
const native = (await nativeSnapshot(scene.sessionId)).records;
const calls = native.filter(
  (r) => r.event.type === 'tool/call' && r.event.data.name === 'report_to_orchestrator',
);
for (const { event: call } of calls) {
  const result = native.find(
    (r) => r.event.type === 'tool/result' && r.event.data.message.toolCallId === call.data.callId,
  )?.event;
  assert.equal(result?.data.message.isError, false, 'actual Report must succeed');
}
assert.deepEqual(
  calls.slice(0, 4).map((r) => JSON.parse(r.event.data.arguments).summary),
  expected,
);
assert.equal(new Set(items.map((i) => i.id)).size, items.length);
assert.ok(items.every((i) => i.sourceAvailable && i.authorKind === 'bot'));
const blocked = items.find((i) => i.assignmentReportState === 'blocked');
assert.ok(blocked);
if (scene.blockedId) assert.equal(blocked.id, scene.blockedId);
scene.blockedId = blocked.id;
scene.reportIds ??= items.map((i) => i.id);
writeState();

if (phase !== 'answered') {
  assert.equal(items.length, 4);
  assert.equal(calls.length, 4);
  const current = await assignment();
  assert.equal(current.latestReport.state, 'progress');
  assert.equal(current.openAsk.sourceEventId, blocked.id);
  assert.equal(current.openAsk.summary, expected[1]);
  const action = await actions();
  assert.equal(action.length, 1);
  assert.equal(action[0].kind, 'assignment-blocked');
  assert.equal(action[0].sourceEventId, blocked.id);
  assert.equal(action[0].summary, expected[1]);
  const context = (
    await rpc('humanAssignmentContext', {
      slug: scene.bot.slug,
      sessionId: scene.sessionId,
      sourceEventId: blocked.id,
    })
  ).context;
  assert.equal(context.canReply, true);
  assert.deepEqual(
    context.reports.map((r) => r.summary),
    expected,
  );
  const events = await orchestratorEvents();
  const deliveries = events
    .filter((e) => e.type === 'user/message')
    .flatMap((e) => e.data.content ?? [])
    .filter((c) => c.type === 'text' && c.text.includes('answer_to: ' + blocked.id));
  assert.ok(
    deliveries.some((c) => c.text.includes(expected[1])),
    'native harvest exposes canonical blocker',
  );
  assert.ok(
    items.every(
      (i) => i.state === 'pending' || (i.state === 'handled' && i.observedAt && i.handledAt),
    ),
  );
  const allDeliveries = events
    .filter((e) => e.type === 'user/message')
    .flatMap((e) => e.data.content ?? [])
    .filter((c) => c.type === 'text' && c.text.includes('- ' + scene.sessionId + ' ('));
  const units = allDeliveries.flatMap((c) =>
    c.text
      .split('\n')
      .filter((line) => line.startsWith('- ' + scene.sessionId + ' ('))
      .flatMap((line) => [...line.matchAll(/repeats (\d+)/gu)].map((m) => Number(m[1]))),
  );
  const batches = new Map();
  for (const item of items.filter((i) => i.observedAt))
    batches.set(item.observedAt, (batches.get(item.observedAt) ?? 0) + 1);
  assert.deepEqual(
    units.toSorted((a, b) => a - b),
    [...batches.values()].toSorted((a, b) => a - b),
    'each native repeat count matches its actually observed source batch',
  );
  if (phase === 'verify') {
    const before = JSON.parse(readFileSync(resolve(evidence, '01-pending-proof.json'), 'utf8'));
    assert.deepEqual(
      items.map(proofSource),
      before.sources,
      'Human viewing preserves every source and handling timestamp',
    );
    assert.equal(
      events.filter((e) => e.type === 'turn/start').length,
      before.orchestratorTurns,
      'Human viewing causes no wake',
    );
  }
  writeProof(phase === 'verify' ? '02-source-view-proof.json' : '01-pending-proof.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    latestReportState: current.latestReport.state,
    openAskSourceEventId: blocked.id,
    action: {
      kind: action[0].kind,
      sourceEventId: action[0].sourceEventId,
      summary: action[0].summary,
    },
    canReply: true,
    sources: items.map(proofSource),
    orchestratorTurns: events.filter((e) => e.type === 'turn/start').length,
    nativeReportCalls: calls.length,
    canonicalBlockerExposed: true,
    harvestRepeatCounts: units,
  });
} else {
  await waitFor(
    async () => (await assignment()).latestReport?.state === 'completed',
    'real Human response resumed Assignment',
  );
  await waitFor(
    async () =>
      (await rpc('activitySnapshot')).bots.find((b) => b.slug === scene.bot.slug)?.state === 'idle',
    'resolved Orchestrator',
  );
  const current = await assignment();
  assert.equal(current.openAsk, undefined);
  assert.deepEqual(await actions(), []);
  const finalItems = await reports();
  assert.equal(finalItems.length, 5);
  assert.ok(
    scene.reportIds.every((id) => finalItems.some((i) => i.id === id)),
    'all original sources retained',
  );
  const finalNative = (await nativeSnapshot(scene.sessionId)).records;
  const ends = finalNative.filter((r) => r.event.type === 'turn/end');
  assert.equal(ends.length, 2, 'one actual resumed Assignment Turn');
  assert.ok(ends.every((r) => r.event.data.reason.kind === 'completed'));
  const reply = (await messages()).find(
    (m) => m.author.kind === 'human' && m.assignmentReply?.sourceEventId === blocked.id,
  );
  assert.ok(reply && reply.assignmentReply.sessionId === scene.sessionId);
  assert.ok(current.latestReport.summary.includes('Canary'));
  assert.ok(
    (await messages()).some(
      (m) => m.author.kind === 'bot' && /^ESCALATION_RESOLVED(?:: Canary)?$/u.test(m.body),
    ),
  );
  writeProof('03-answered-proof.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    replySourceEventId: blocked.id,
    replyBody: reply.body,
    assignmentTurns: ends.length,
    openAskCleared: true,
    humanActionCount: 0,
    originalSourcesRetained: true,
    sources: finalItems.map(proofSource),
    completedSummary: current.latestReport.summary,
  });
}
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
