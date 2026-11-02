import assert from 'node:assert/strict';
import { assertAssignmentHarvest } from './e2e-assignment-harvest-proof.mjs';
import { assertAssignmentReportReply } from './e2e-assignment-report-proof.mjs';
import { assignmentProbe, waitFor, captureAssignmentInbox } from './e2e-assignment-probe.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const phase = process.argv[2] ?? 'prepare';
assert.ok(origin && home && evidence);
assert.ok(['prepare', 'complete', 'verify', 'capture'].includes(phase));
assert.ok(
  new URL(origin).protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname),
);
const privateDir = resolve('.humanlayer/tasks/194-report-harvest');
mkdirSync(privateDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const statePath = process.env.BH_E2E_STATE ?? resolve(privateDir, 'qa-state.json');
const { rpc, nativeSnapshot, cookie } = assignmentProbe({ origin, home });
let scene;
const assignmentRows = async () => (await rpc('assignments', { slug: scene.bot.slug })).assignments;
const messages = async () => (await rpc('channelMessages', { channelId: scene.dm })).messages;
const pending = async (sessionId) => {
  const rows = await messages();
  const resolved = new Set(
    rows.flatMap((m) => (m.toolApprovalDecision ? [m.toolApprovalDecision.requestMessageId] : [])),
  );
  return rows.findLast(
    (m) => m.toolApprovalRequest?.sessionId === sessionId && !resolved.has(m.id),
  );
};
const writeState = () => writeFileSync(statePath, JSON.stringify(scene, null, 2));
const writeProof = (name, proof) =>
  writeFileSync(resolve(evidence, name), JSON.stringify(proof, null, 2) + '\n');
const reports = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (item) =>
      item.assignmentSessionId === scene.sessionId && item.sourceKind === 'assignment-report',
  );
const orchestrator = async () =>
  (await rpc('sessions', { slug: scene.bot.slug })).sessions.find(
    (session) => session.role === 'orchestrator',
  );
const nativeEvents = async () =>
  (await nativeSnapshot((await orchestrator()).sessionId)).records.map((record) => record.event);
if (phase === 'prepare') {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Report harvest QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Report harvest QA ' + stamp,
      persona:
        'Follow the Human exactly. Use only the requested single Assignment. Never use Shell in the Orchestrator, approve tools, modify files or create subagents. After creation send only REPORT_BATCH_CREATED via bot_send_message and end. When the completed Assignment Report arrives send only REPORT_BATCH_DONE via bot_send_message, then end. Do not send progress summaries to the Channel, and do not send completion before the completed Report.',
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
      ' with purpose: Report harvest acceptance. Assignment must first call report_to_orchestrator state progress summary REPORT_PROGRESS_ONE, then call it again state progress summary REPORT_PROGRESS_TWO; next invoke native Shell exactly once with command node -e "setTimeout(() => {}, 1000)" and description "Report harvest QA timer", awaiting Human approval; ONLY after the timer succeeds call report_to_orchestrator state completed summary REPORT_BATCH_DONE. No files, subagents or extra Reports. After creation you must send only REPORT_BATCH_CREATED via bot_send_message and end. Wait for the completed Report before sending REPORT_BATCH_DONE. Never approve tools or use Shell yourself.',
  });
  scene.sessionId = (
    await waitFor(async () => (await assignmentRows())[0], 'owned Assignment')
  ).sessionId;
  writeState();
  const card = await waitFor(() => pending(scene.sessionId), 'pending timer after progress');
  scene.approvalId = card.id;
  scene.lastPhase = 'pending';
  writeState();
  assert.equal(
    JSON.parse(card.toolApprovalRequest.input).command,
    'node -e "setTimeout(() => {}, 1000)"',
  );
  assert.ok(['pwsh', 'bash'].includes(card.toolApprovalRequest.toolName));
  await waitFor(
    async () => (await nativeEvents()).filter((e) => e.type === 'turn/end').length === 1,
    'initial Orchestrator Turn settled',
  );
  const items = await reports();
  assert.equal(items.length, 2);
  assert.ok(
    items.every(
      (item) =>
        item.state === 'pending' &&
        item.assignmentReportState === 'progress' &&
        item.sourceAvailable,
    ),
  );
  assert.deepEqual(items.map((item) => item.summary).sort(), [
    'REPORT_PROGRESS_ONE',
    'REPORT_PROGRESS_TWO',
  ]);
  assert.equal((await assignmentRows()).length, 1);
  assert.equal(
    (await nativeEvents()).filter((e) => e.type === 'turn/start').length,
    1,
    'progress must not wake another Turn',
  );
  scene.progressIds = items.map((item) => item.id);
  writeState();
  writeProof('01-pending-proof.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    orchestratorTurns: 1,
    progress: items.map(({ id, state, assignmentReportState, sourceAvailable, summary }) => ({
      id,
      state,
      assignmentReportState,
      sourceAvailable,
      summary,
    })),
    timerPending: true,
  });
} else {
  scene = JSON.parse(readFileSync(statePath, 'utf8'));
}
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
    async () =>
      (await messages()).some(
        (message) => message.author.kind === 'bot' && message.body === 'REPORT_BATCH_DONE',
      ),
    'real Report completion DM',
  );
  scene.lastPhase = 'completed';
  writeState();
}
if (phase === 'complete' || phase === 'verify') {
  await waitFor(
    async () => (await nativeEvents()).filter((e) => e.type === 'turn/end').length === 2,
    'harvest Orchestrator Turn settled',
  );
  const events = await nativeEvents();
  const items = await reports();
  const native = await nativeSnapshot(scene.sessionId);
  const calls = native.records.filter(
    ({ event }) => event.type === 'tool/call' && event.data.name === 'report_to_orchestrator',
  );
  assert.equal(calls.length, 3, 'exactly three actual Assignment Report calls');
  const successful = calls.map(({ event: call }) => {
    const result = native.records.find(
      ({ event }) =>
        event.type === 'tool/result' && event.data.message.toolCallId === call.data.callId,
    )?.event;
    assert.equal(result?.data.message.isError, false, 'each actual Report succeeded');
    const args = JSON.parse(call.data.arguments);
    return { state: args.state, summary: args.summary, callAt: call.time, resultAt: result.time };
  });
  const batch = assertAssignmentHarvest(events, items, scene.sessionId, scene.progressIds);
  const reportDelivery = assertAssignmentReportReply(
    native.records,
    await messages(),
    'REPORT_BATCH_DONE',
  );
  writeProof('02-harvest-proof.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    orchestratorSessionId: (await orchestrator()).sessionId,
    orchestratorTurns: 2,
    ...batch,
    reports: items.map(
      ({ id, state, assignmentReportState, sourceAvailable, summary, observedAt, handledAt }) => ({
        id,
        state,
        assignmentReportState,
        sourceAvailable,
        summary,
        observedAt,
        handledAt,
      }),
    ),
    successfulReports: successful,
    reportDelivery,
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
  expectedTurns: scene.lastPhase === 'pending' ? 1 : 2,
  purpose: 'Report harvest acceptance',
  sourceSummary: 'REPORT_PROGRESS_ONE',
});
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
