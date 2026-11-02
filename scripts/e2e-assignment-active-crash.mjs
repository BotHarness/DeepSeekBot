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
const marker = 'ACTIVE_PROGRESS: Evidence retained before interruption.';
let scene;
const saveState = () => writeFileSync(statePath, JSON.stringify(scene, null, 2), { mode: 0o600 });
const save = (name, proof) =>
  writeFileSync(resolve(evidence, name), JSON.stringify(proof, null, 2) + '\n');
const assignment = async () =>
  (await rpc('assignment', { slug: scene.bot.slug, sessionId: scene.sessionId })).assignment;
const sources = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (i) => i.assignmentSessionId === scene.sessionId,
  );
const rows = async (id) => (await nativeSnapshot(id)).records.map((r) => r.event);
const counts = (events) => ({
  starts: events.filter((e) => e.type === 'turn/start').length,
  ends: events.filter((e) => e.type === 'turn/end').length,
});
const sourceProof = (i) => ({
  id: i.id,
  summary: i.summary,
  createdAt: i.createdAt,
  sourceKind: i.sourceKind,
  assignmentSessionId: i.assignmentSessionId,
  assignmentReportState: i.assignmentReportState,
  assignmentTurn: i.assignmentTurn,
  authorKind: i.authorKind,
  authorBotSlug: i.authorBotSlug,
  sourceAvailable: i.sourceAvailable,
  state: i.state,
  ...(i.observedAt === undefined ? {} : { observedAt: i.observedAt }),
  ...(i.handledAt === undefined ? {} : { handledAt: i.handledAt }),
});
const assignmentProof = (a) => ({
  sessionId: a.sessionId,
  activity: a.activity,
  title: a.title,
  description: a.description,
  latestReport: a.latestReport,
  permission: { grantId: a.permission.grantId, workspaceId: a.permission.workspaceId },
  ...(a.continuityKey === undefined ? {} : { continuityKey: a.continuityKey }),
});

if (phase === 'prepare') {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Active crash QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Active crash QA ' + stamp,
      persona:
        'Follow the Human exactly. Create only the one requested Assignment, with continuity key active-crash-direction. Never approve tools, run Shell in the Orchestrator, create subagents or edit files. After creation bot_send_message ACTIVE_CREATED then end. Never resume the Assignment or create replacement work unless the Human explicitly asks.',
    })
  ).bot;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  const folder = resolve(home, 'qa-workspace');
  mkdirSync(folder, { recursive: true });
  const workspace = (await rpc('create', { request: { path: folder } }, 'workspace')).workspace;
  const grant = (await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspaceId }))
    .grant;
  scene = { bot: { slug: bot.slug, name: bot.displayName }, dm: dm.id, grantId: grant.id };
  saveState();
  await rpc('channelSend', {
    channelId: scene.dm,
    body:
      'Create exactly one Assignment using grant_id ' +
      grant.id +
      ' and continuity key active-crash-direction. Purpose: Active Assignment crash QA. It must FIRST invoke report_to_orchestrator exactly once with state progress, summary ' +
      JSON.stringify(marker) +
      ', expects_reply false. Then invoke native Shell with only command sleep 1 and description Active crash QA timer, omitting sandbox_permissions and justification. Wait for Human approval. Do not report completed, stop, use files or perform any other tool. After creating it bot_send_message ACTIVE_CREATED and end without waiting.',
  });
  scene.sessionId = (
    await waitFor(
      async () => (await rpc('assignments', { slug: bot.slug })).assignments[0],
      'active Assignment',
    )
  ).sessionId;
  scene.orchestratorId = (await rpc('sessions', { slug: bot.slug })).sessions.find(
    (s) => s.role === 'orchestrator',
  ).sessionId;
  saveState();
  const card = await waitFor(
    async () =>
      (await rpc('channelMessages', { channelId: scene.dm })).messages.findLast(
        (m) => m.toolApprovalRequest?.sessionId === scene.sessionId,
      ),
    'Assignment timer approval',
  );
  assert.equal(JSON.parse(card.toolApprovalRequest.input).command, 'sleep 1');
  scene.approvalId = card.id;
  await waitFor(
    async () => counts(await rows(scene.orchestratorId)).ends === 1,
    'settled creating Orchestrator',
  );
  const a = await assignment();
  assert.equal(a.activity, 'working');
  assert.equal(a.continuityKey, 'active-crash-direction');
  const items = await sources();
  assert.equal(items.length, 1);
  assert.equal(items[0].summary, marker);
  assert.equal(items[0].state, 'pending');
  scene.before = {
    assignment: assignmentProof(a),
    sources: items.map(sourceProof),
    assignmentTurns: counts(await rows(scene.sessionId)),
    orchestratorTurns: counts(await rows(scene.orchestratorId)),
  };
  assert.deepEqual(scene.before.assignmentTurns, { starts: 1, ends: 0 });
  assert.deepEqual(scene.before.orchestratorTurns, { starts: 1, ends: 1 });
  saveState();
  save('01-active.json', { bot: scene.bot.name, ...scene.before, timerExecuted: false });
} else {
  scene = JSON.parse(readFileSync(statePath, 'utf8'));
  const a = await assignment();
  const { continuityKey, ...beforeAssignment } = scene.before.assignment;
  assert.equal(continuityKey, 'active-crash-direction');
  assert.deepEqual(assignmentProof(a), { ...beforeAssignment, activity: 'error' });
  const items = (await sources()).map(sourceProof);
  assert.deepEqual(items, scene.before.sources);
  const events = await rows(scene.sessionId);
  assert.deepEqual(counts(events), { starts: 1, ends: 1 });
  assert.equal(events.find((e) => e.type === 'turn/end').data.reason.kind, 'interrupted');
  assert.deepEqual(counts(await rows(scene.orchestratorId)), scene.before.orchestratorTurns);
  assert.equal(
    (await rpc('toolApprovalStatus', { channelId: scene.dm, messageId: scene.approvalId })).status,
    'expired',
  );
  const calls = events.filter((e) => e.type === 'tool/call' && e.data.name === 'bash');
  assert.equal(calls.length, 1);
  assert.equal(
    events.filter(
      (e) =>
        e.type === 'tool/result' &&
        e.data.message.toolCallId === calls[0].data.callId &&
        e.data.message.isError !== true,
    ).length,
    0,
  );
  save(phase === 'restart' ? '02-restarted.json' : '03-source-view.json', {
    bot: scene.bot.name,
    assignment: assignmentProof(a),
    sources: items,
    assignmentTurns: counts(events),
    orchestratorTurns: counts(await rows(scene.orchestratorId)),
    nativeEndReason: 'interrupted',
    approvalExpired: true,
    timerExecuted: false,
    noAutomaticReplay: true,
    noFabricatedCompletion: true,
  });
}
const events = await rows(scene.sessionId);
const reports = events.filter(
  (e) => e.type === 'tool/call' && e.data.name === 'report_to_orchestrator',
);
assert.equal(reports.length, 1);
assert.deepEqual(JSON.parse(reports[0].data.arguments), {
  state: 'progress',
  summary: marker,
  expects_reply: false,
});
assert.equal(
  events.find(
    (e) => e.type === 'tool/result' && e.data.message.toolCallId === reports[0].data.callId,
  )?.data.message.isError,
  false,
);
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
