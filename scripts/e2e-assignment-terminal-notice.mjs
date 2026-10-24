import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignmentProbe, waitFor, captureAssignmentInbox } from './e2e-assignment-probe.mjs';
const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const phase = process.argv[2] ?? 'prepare';
assert.ok(origin && home && evidence);
assert.ok(['prepare', 'complete', 'after-restart', 'review', 'capture'].includes(phase));
const privateDir = resolve('.humanlayer/tasks/194-terminal-notice');
mkdirSync(privateDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const statePath = process.env.BH_E2E_STATE ?? resolve(privateDir, 'qa-state.json');
const { rpc, nativeSnapshot, cookie } = assignmentProbe({ origin, home });
let scene;
const writeState = () => writeFileSync(statePath, JSON.stringify(scene, null, 2));
const writeProof = (name, proof) =>
  writeFileSync(resolve(evidence, name), JSON.stringify(proof, null, 2) + '\n');
const messages = async () => (await rpc('channelMessages', { channelId: scene.dm })).messages;
const proofItem = ({
  id,
  state,
  createdAt,
  observedAt,
  handledAt,
  sourceKind,
  assignmentSessionId,
  assignmentReportState,
  assignmentTurn,
  relatedReportSourceEventId,
  sourceAvailable,
  authorKind,
  authorBotSlug,
  summary,
}) => ({
  id,
  state,
  createdAt,
  observedAt,
  handledAt,
  sourceKind,
  assignmentSessionId,
  assignmentReportState,
  assignmentTurn,
  relatedReportSourceEventId,
  sourceAvailable,
  authorKind,
  authorBotSlug,
  summary,
});
const reports = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (i) =>
      i.assignmentSessionId === scene.sessionId &&
      ['assignment-report', 'assignment-lifecycle'].includes(i.sourceKind),
  );
const orchestrator = async () =>
  (await rpc('sessions', { slug: scene.bot.slug })).sessions.find((s) => s.role === 'orchestrator');
const nativeEvents = async () =>
  (await nativeSnapshot((await orchestrator()).sessionId)).records.map((r) => r.event);
if (phase === 'prepare') {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Terminal notice QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Terminal notice QA ' + stamp,
      persona:
        'Follow the Human exactly. Use only one requested Assignment. Never use Shell in the Orchestrator, approve tools, modify files or create subagents. After creation send only TERMINAL_CREATED via bot_send_message and end. When the completed Assignment Report arrives send only TERMINAL_REPORT_SEEN via bot_send_message and end. A Report is the Assignment semantic outcome; do not claim its native Turn already finished. On Human request REVIEW_NATIVE_COMPLETION inspect Bot Inbox and send only NATIVE_COMPLETION_REVIEWED via bot_send_message, then end. Never create more Assignments or repeat the completed work.',
    })
  ).bot;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  const folder = resolve(home, 'qa-workspace');
  mkdirSync(folder, { recursive: true });
  const workspace = (await rpc('create', { request: { path: folder } }, 'workspace')).workspace;
  const grant = (await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspaceId }))
    .grant;
  scene = {
    stamp,
    bot: { slug: bot.slug, name: bot.displayName },
    dm: dm.id,
    grantId: grant.id,
    route,
  };
  writeState();
  await rpc('channelSend', {
    channelId: scene.dm,
    body:
      'Create exactly one Assignment using grant_id ' +
      grant.id +
      ' with purpose: Terminal notice acceptance. Assignment must FIRST call report_to_orchestrator state completed summary TERMINAL_RESULT_VERIFIED, then invoke native Shell exactly once with command node -e "setTimeout(() => {}, 1000)" and description "Terminal notice QA timer", awaiting Human approval. After the timer succeeds end your Turn immediately without more Reports, tools, files or subagents. The semantic result is already verified before the timer. After creating the Assignment send only TERMINAL_CREATED via bot_send_message and end. When the completed Report arrives send only TERMINAL_REPORT_SEEN via bot_send_message and end. Never approve tools or use Shell yourself.',
  });
  scene.sessionId = (
    await waitFor(
      async () => (await rpc('assignments', { slug: scene.bot.slug })).assignments[0],
      'owned Assignment',
    )
  ).sessionId;
  writeState();
  const card = await waitFor(async () => {
    const rows = await messages();
    const resolved = new Set(
      rows.flatMap((m) =>
        m.toolApprovalDecision ? [m.toolApprovalDecision.requestMessageId] : [],
      ),
    );
    return rows.findLast(
      (m) => m.toolApprovalRequest?.sessionId === scene.sessionId && !resolved.has(m.id),
    );
  }, 'timer approval after terminal Report');
  assert.equal(
    JSON.parse(card.toolApprovalRequest.input).command,
    'node -e "setTimeout(() => {}, 1000)"',
  );
  scene.approvalId = card.id;
  await waitFor(
    async () => (await nativeEvents()).filter((e) => e.type === 'turn/end').length === 2,
    'Report harvest settled',
  );
  const items = await reports();
  assert.equal(items.length, 1);
  assert.equal(items[0].assignmentReportState, 'completed');
  assert.equal(items[0].state, 'handled');
  assert.equal(items[0].authorKind, 'bot');
  assert.equal(items[0].assignmentTurn, 1);
  scene.reportId = items[0].id;
  scene.reportObservedAt = items[0].observedAt;
  scene.reportHandledAt = items[0].handledAt;
  scene.lastPhase = 'reported';
  writeState();
  writeProof('01-reported-proof.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    orchestratorTurns: 2,
    report: proofItem(items[0]),
    nativeCompletion: false,
  });
} else scene = JSON.parse(readFileSync(statePath, 'utf8'));
if (phase === 'complete') {
  if (
    (await rpc('toolApprovalStatus', { channelId: scene.dm, messageId: scene.approvalId }))
      .status === 'pending'
  )
    await rpc('toolApprovalDecide', {
      channelId: scene.dm,
      messageId: scene.approvalId,
      outcome: 'allowed-once',
    });
  await waitFor(
    async () => (await reports()).find((i) => i.sourceKind === 'assignment-lifecycle'),
    'Host native-completion notice',
  );
  scene.lastPhase = 'completed';
  writeState();
}
if (['complete', 'after-restart', 'review'].includes(phase)) {
  const items = await reports();
  assert.equal(items.length, 2);
  const report = items.find((i) => i.sourceKind === 'assignment-report');
  const notice = items.find((i) => i.sourceKind === 'assignment-lifecycle');
  assert.equal(report.id, scene.reportId);
  assert.equal(report.observedAt, scene.reportObservedAt);
  assert.equal(report.handledAt, scene.reportHandledAt);
  assert.equal(notice.authorKind, 'system');
  assert.equal(notice.relatedReportSourceEventId, report.id);
  assert.equal(notice.assignmentTurn, report.assignmentTurn);
  assert.equal(notice.sourceAvailable, true);
  const ends = (await nativeSnapshot(scene.sessionId)).records
    .map((r) => r.event)
    .filter((e) => e.type === 'turn/end');
  assert.equal(ends.length, 1);
  assert.equal(ends[0].data.turn, notice.assignmentTurn);
  assert.equal(ends[0].data.reason.kind, 'completed');
  assert.equal(
    (await nativeEvents()).filter((e) => e.type === 'turn/start').length,
    2,
    'paired Notice must not wake another Turn',
  );
  assert.equal(notice.state, 'pending');
  assert.equal(notice.observedAt, undefined);
  assert.equal(notice.handledAt, undefined);
  if (scene.noticeId) assert.equal(notice.id, scene.noticeId);
  scene.noticeId = notice.id;
  if (phase === 'after-restart') scene.lastPhase = 'after-restart';
  writeState();
  writeProof(phase === 'after-restart' ? '03-restart-proof.json' : '02-completed-proof.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    orchestratorTurns: 2,
    sources: items.map(proofItem),
    nativeEnd: { turn: ends[0].data.turn, seq: ends[0].seq, reason: ends[0].data.reason.kind },
    duplicateWake: false,
  });
}
if (phase === 'review') {
  await rpc('channelSend', {
    channelId: scene.dm,
    body: 'REVIEW_NATIVE_COMPLETION: Inspect the pending Host completion notice in Bot Inbox. Send only NATIVE_COMPLETION_REVIEWED via bot_send_message and end. Do not create or resume any Assignment.',
  });
  await waitFor(
    async () => (await nativeEvents()).filter((e) => e.type === 'turn/end').length === 3,
    'next real Human Turn settled',
  );
  const items = await reports();
  assert.ok(items.every((i) => i.state === 'handled'));
  const notice = items.find((i) => i.id === scene.noticeId);
  assert.ok(notice.observedAt && notice.handledAt);
  const deliveries = (await nativeEvents()).filter(
    (e) =>
      e.type === 'user/message' &&
      e.data.content?.some((c) => c.type === 'text' && c.text.includes(scene.noticeId)),
  );
  assert.equal(deliveries.length, 1, 'exact Notice exposure once');
  assert.ok(
    deliveries[0].data.content.some((c) => c.type === 'text' && c.text.includes(scene.reportId)),
    'causal Report reference survives',
  );
  assert.ok(
    (await messages()).some(
      (m) => m.author.kind === 'bot' && m.body === 'NATIVE_COMPLETION_REVIEWED',
    ),
  );
  scene.lastPhase = 'reviewed';
  writeState();
  writeProof('04-review-proof.json', {
    bot: scene.bot.name,
    orchestratorTurns: 3,
    sources: items.map(proofItem),
    noticeDeliveries: 1,
    reportReferenceRetained: true,
  });
}
await captureAssignmentInbox({
  origin,
  cookie,
  evidence,
  scene,
  reports,
  nativeEvents,
  writeProof,
  expectedTurns: scene.lastPhase === 'reviewed' ? 3 : 2,
  purpose: 'Terminal notice acceptance',
  sourceSummary:
    scene.lastPhase === 'reported'
      ? 'TERMINAL_RESULT_VERIFIED'
      : 'DSH confirmed successful completion of Assignment Turn 1.',
});
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
