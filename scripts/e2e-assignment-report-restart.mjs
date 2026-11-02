import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignmentProbe, waitFor, captureAssignmentInbox } from './e2e-assignment-probe.mjs';
import {
  assertPendingReportRestart,
  assertRestartHarvest,
} from './e2e-assignment-restart-proof.mjs';
const origin = process.env.BH_E2E_ORIGIN,
  home = process.env.BH_E2E_HOME,
  evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(origin && home && evidence);
const phase = process.argv[2] ?? 'prepare';
assert.ok(['prepare', 'after-restart', 'harvest', 'verify', 'capture'].includes(phase));
const dir = resolve('.humanlayer/tasks/194-report-restart');
mkdirSync(dir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const statePath = process.env.BH_E2E_STATE ?? resolve(dir, 'qa-state.json');
const { rpc, nativeSnapshot, cookie } = assignmentProbe({ origin, home });
let scene;
const assignments = async () => (await rpc('assignments', { slug: scene.bot.slug })).assignments;
const reports = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (i) => i.sourceKind === 'assignment-report' && i.assignmentSessionId === scene.sessionId,
  );
const orchestrator = async () =>
  (await rpc('sessions', { slug: scene.bot.slug })).sessions.find((s) => s.role === 'orchestrator');
const nativeEvents = async () =>
  (await nativeSnapshot((await orchestrator()).sessionId)).records.map((r) => r.event);
const save = () => writeFileSync(statePath, JSON.stringify(scene, null, 2));
const writeProof = (name, value) =>
  writeFileSync(resolve(evidence, name), JSON.stringify(value, null, 2) + '\n');
async function successfulReports() {
  const snapshot = await nativeSnapshot(scene.sessionId);
  const calls = snapshot.records.filter(
    ({ event }) => event.type === 'tool/call' && event.data.name === 'report_to_orchestrator',
  );
  assert.equal(calls.length, 2);
  return calls.map(({ event: call }) => {
    const result = snapshot.records.find(
      ({ event }) =>
        event.type === 'tool/result' && event.data.message.toolCallId === call.data.callId,
    )?.event;
    assert.equal(result?.data.message.isError, false);
    const args = JSON.parse(call.data.arguments);
    assert.equal(args.state, 'progress');
    return { summary: args.summary, callAt: call.time, resultAt: result.time, successful: true };
  });
}
if (phase === 'prepare') {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Report restart QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Report restart QA ' + stamp,
      persona:
        'Follow Human instructions exactly. Create only one requested Assignment. Never use Shell, modify files, create subagents or send additional Assignment Requests. After creation bot_send_message only RESTART_CREATED then end. Only when Human later sends RESTART_HARVEST, inspect the Inbox context and bot_send_message RESTART_REVIEWED then end. Do not send progress summaries automatically.',
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
  save();
  await rpc('channelSend', {
    channelId: scene.dm,
    body:
      'Create exactly one Assignment with grant_id ' +
      grant.id +
      ' and purpose: Report restart acceptance. Assignment must call report_to_orchestrator state progress summary RESTART_PROGRESS_ONE, then state progress summary RESTART_PROGRESS_TWO, then end this Turn with no completed Report. No Shell, files, subagents or further reports. After creation bot_send_message only RESTART_CREATED and end. Do not send Assignment Requests or wait tools.',
  });
  scene.sessionId = (
    await waitFor(async () => (await assignments())[0], 'owned Assignment')
  ).sessionId;
  save();
  await waitFor(
    async () => (await reports()).length === 2 && (await assignments())[0].activity === 'idle',
    'two Reports and settled Assignment',
  );
  await waitFor(
    async () => (await nativeEvents()).filter((e) => e.type === 'turn/end').length === 1,
    'initial Orchestrator settled',
  );
  scene.orchestratorSessionId = (await orchestrator()).sessionId;
  scene.before = await reports();
  scene.progressIds = scene.before.map((r) => r.id);
  scene.lastPhase = 'before-restart';
  save();
  assert.deepEqual(scene.before.map((r) => r.summary).sort(), [
    'RESTART_PROGRESS_ONE',
    'RESTART_PROGRESS_TWO',
  ]);
  const proof = assertPendingReportRestart({
    reports: scene.before,
    before: scene.before,
    sessionId: scene.sessionId,
    events: await nativeEvents(),
    orchestratorSessionId: scene.orchestratorSessionId,
    expectedOrchestratorSessionId: scene.orchestratorSessionId,
  });
  writeProof('01-before-restart.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    orchestratorSessionId: scene.orchestratorSessionId,
    ...proof,
    reports: scene.before.map(
      ({ id, state, summary, assignmentReportState, sourceAvailable, createdAt }) => ({
        id,
        state,
        summary,
        assignmentReportState,
        sourceAvailable,
        createdAt,
      }),
    ),
    successfulReports: await successfulReports(),
  });
} else scene = JSON.parse(readFileSync(statePath, 'utf8'));
if (phase === 'after-restart') {
  const items = await reports();
  const proof = assertPendingReportRestart({
    reports: items,
    before: scene.before,
    sessionId: scene.sessionId,
    events: await nativeEvents(),
    orchestratorSessionId: (await orchestrator()).sessionId,
    expectedOrchestratorSessionId: scene.orchestratorSessionId,
  });
  assert.equal((await assignments()).length, 1);
  assert.equal((await assignments())[0].activity, 'idle');
  scene.lastPhase = 'after-restart';
  save();
  writeProof('02-after-restart.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    orchestratorSessionId: scene.orchestratorSessionId,
    ...proof,
    reports: items.map(
      ({ id, state, summary, assignmentReportState, sourceAvailable, createdAt }) => ({
        id,
        state,
        summary,
        assignmentReportState,
        sourceAvailable,
        createdAt,
      }),
    ),
    successfulReports: await successfulReports(),
  });
}
if (phase === 'harvest') {
  assert.equal(scene.lastPhase, 'after-restart', 'verify pending restart before sending Human DM');
  await rpc('channelSend', {
    channelId: scene.dm,
    body: 'RESTART_HARVEST: review the two pending progress Reports already in your Inbox context; bot_send_message only RESTART_REVIEWED then end. Do not create, resume or stop Assignments; no Shell or files.',
  });
}
if (phase === 'harvest' || phase === 'verify') {
  await waitFor(
    async () => (await nativeEvents()).filter((e) => e.type === 'turn/end').length === 2,
    'Human harvest settled',
  );
  const messages = (await rpc('channelMessages', { channelId: scene.dm })).messages;
  assert.ok(messages.some((m) => m.author.kind === 'bot' && m.body === 'RESTART_REVIEWED'));
  const items = await reports();
  const proof = assertRestartHarvest({
    reports: items,
    before: scene.before,
    sessionId: scene.sessionId,
    events: await nativeEvents(),
  });
  assert.equal((await orchestrator()).sessionId, scene.orchestratorSessionId);
  assert.equal((await assignments()).length, 1);
  scene.lastPhase = 'handled';
  save();
  writeProof('03-handled.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    orchestratorSessionId: scene.orchestratorSessionId,
    ...proof,
    reports: items.map(({ id, state, summary, sourceAvailable, observedAt, handledAt }) => ({
      id,
      state,
      summary,
      sourceAvailable,
      observedAt,
      handledAt,
    })),
    successfulReports: await successfulReports(),
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
  expectedTurns: scene.lastPhase === 'handled' ? 2 : 1,
  purpose: 'Report restart acceptance',
  sourceSummary: 'RESTART_PROGRESS_ONE',
});
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
