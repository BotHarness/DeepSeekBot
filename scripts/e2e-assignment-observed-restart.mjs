import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignmentProbe, waitFor } from './e2e-assignment-probe.mjs';

const { BH_E2E_ORIGIN: origin, BH_E2E_HOME: home, BH_E2E_EVIDENCE: evidence } = process.env;
assert.ok(origin && home && evidence);
const phase = process.argv[2] ?? 'prepare';
assert.ok(['prepare', 'observe', 'restart', 'verify'].includes(phase));
const privateDir = resolve('.humanlayer/tasks/194-observed-restart');
mkdirSync(privateDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const statePath = process.env.BH_E2E_STATE ?? resolve(privateDir, 'qa-state.json');
const { rpc, nativeSnapshot } = assignmentProbe({ origin, home });
let scene;
const marker = 'OBSERVED_REPORT: Research remains available.';
const sources = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (i) => i.assignmentSessionId === scene.sessionId && i.sourceKind === 'assignment-report',
  );
const assignmentEvents = async () =>
  (await nativeSnapshot(scene.sessionId)).records.map((r) => r.event);
const events = async () => (await nativeSnapshot(scene.orchestratorId)).records.map((r) => r.event);
const sourceProof = (i) => ({
  id: i.id,
  summary: i.summary,
  assignmentSessionId: i.assignmentSessionId,
  assignmentReportState: i.assignmentReportState,
  assignmentTurn: i.assignmentTurn,
  authorKind: i.authorKind,
  sourceAvailable: i.sourceAvailable,
  state: i.state,
  ...(i.observedAt === undefined ? {} : { observedAt: i.observedAt }),
  ...(i.handledAt === undefined ? {} : { handledAt: i.handledAt }),
});
const saveState = () => writeFileSync(statePath, JSON.stringify(scene, null, 2));
const save = (name, proof) =>
  writeFileSync(resolve(evidence, name), JSON.stringify(proof, null, 2) + '\n');
const turnCounts = (rows) => ({
  starts: rows.filter((e) => e.type === 'turn/start').length,
  ends: rows.filter((e) => e.type === 'turn/end').length,
});
const exposures = (rows) =>
  rows.filter(
    (e) =>
      e.type === 'user/message' &&
      (e.data.content ?? []).some(
        (c) =>
          c.type === 'text' &&
          c.text.includes('reported [Source Event ' + scene.reportId + ']: ' + marker),
      ),
  ).length;

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
      name: 'Observed restart QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Observed restart QA ' + stamp,
      persona:
        'Follow the Human exactly. When running as an Assignment, follow the full purpose: only invoke report_to_orchestrator as instructed and end; never use Shell, question tools, bot_send_message, files or subagents. When running as Orchestrator, create only one requested Assignment, which reports one progress update and ends. After creation bot_send_message OBSERVED_CREATED and end. Never use files or subagents. Only when the Human says OBSERVE_AND_WAIT, first bot_send_message OBSERVED_READ, then invoke native Shell exactly once with command sleep 1 and description Observed report QA timer. Omit sandbox_permissions and justification. Await Human approval; never approve it yourself. Do not create another Assignment. ' +
        (process.env.BH_E2E_REPAIR_SCENARIO === '1'
          ? 'Only when the Human explicitly says REPAIR_WEAKER_UPDATE, forward their exact supplied request to the same Assignment Session through send_assignment_request mode next-turn exactly once, then bot_send_message REPAIR_WEAKER_REQUESTED and end. On READ_WEAKER_INFORMATION, only bot_send_message REPAIR_WEAKER_READ and end. Otherwise never resume the Assignment.'
          : 'Do not resume the Assignment.'),
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
    channelId: dm.id,
    body: `Create exactly one Assignment using grant_id ${grant.id}. Set its purpose to this full text verbatim, including the Report instructions: ${JSON.stringify('Observed report restart acceptance. Invoke report_to_orchestrator exactly once, state progress, summary ' + JSON.stringify(marker) + ', expects_reply false, then end without any other tools or Reports. Do not ask questions or run Shell.')} After creating it you must bot_send_message OBSERVED_CREATED and end, without Shell, files or subagents.`,
  });
  scene.sessionId = (
    await waitFor(
      async () => (await rpc('assignments', { slug: bot.slug })).assignments[0],
      'owned Assignment',
    )
  ).sessionId;
  scene.orchestratorId = (await rpc('sessions', { slug: bot.slug })).sessions.find(
    (s) => s.role === 'orchestrator',
  ).sessionId;
  saveState();
  await waitFor(async () => (await sources()).length === 1, 'real progress Report');
  await waitFor(
    async () => (await events()).some((e) => e.type === 'turn/end'),
    'settled creation',
  );
  await waitFor(
    async () =>
      (await rpc('assignment', { slug: bot.slug, sessionId: scene.sessionId })).assignment
        .activity === 'idle',
    'settled Assignment',
  );
  const [report] = await sources();
  assert.equal(report.state, 'pending');
  assert.equal(report.observedAt, undefined);
  assert.equal(report.summary, marker);
  scene.reportId = report.id;
  assert.equal(exposures(await events()), 0, 'pending Report never entered the creation Turn');
  saveState();
  save('01-pending.json', {
    bot: bot.displayName,
    source: sourceProof(report),
    turns: turnCounts(await events()),
    reportExposures: exposures(await events()),
  });
} else scene = JSON.parse(readFileSync(statePath, 'utf8'));

if (phase === 'observe') {
  if (!scene.approvalId)
    await rpc('channelSend', {
      channelId: scene.dm,
      body: 'OBSERVE_AND_WAIT: Read the supplied Inbox progress Report. First bot_send_message OBSERVED_READ. Then call native Shell with only command sleep 1 and description Observed report QA timer, omitting sandbox_permissions and justification. Wait for Human approval. No other tools, no Assignment requests.',
    });
  const card = await waitFor(async () => {
    const rows = (await rpc('channelMessages', { channelId: scene.dm })).messages;
    return rows.findLast((m) => m.toolApprovalRequest?.sessionId === scene.orchestratorId);
  }, 'actual Orchestrator approval');
  assert.equal(JSON.parse(card.toolApprovalRequest.input).command, 'sleep 1');
  assert.ok(['bash', 'pwsh'].includes(card.toolApprovalRequest.toolName));
  scene.approvalId = card.id;
  saveState();
  await waitFor(async () => (await sources())[0]?.state === 'processing', 'observed Processing');
  const [report] = await sources();
  assert.equal(report.id, scene.reportId);
  assert.ok(report.observedAt && !report.handledAt);
  const rows = await events();
  assert.equal(exposures(rows), 1);
  assert.deepEqual(turnCounts(rows), { starts: 2, ends: 1 });
  save('02-processing.json', {
    bot: scene.bot.name,
    source: sourceProof(report),
    turns: turnCounts(rows),
    reportExposures: exposures(rows),
    heldOnActualToolApproval: true,
    timerExecuted: false,
  });
}

if (phase === 'restart' || phase === 'verify') {
  const before = JSON.parse(readFileSync(resolve(evidence, '02-processing.json'), 'utf8'));
  const [report] = await sources();
  assert.ok(report);
  assert.equal(report.state, 'needs-repair');
  assert.deepEqual(sourceProof(report), { ...before.source, state: 'needs-repair' });
  const rows = await events();
  assert.equal(exposures(rows), before.reportExposures);
  assert.equal(turnCounts(rows).starts, before.turns.starts);
  assert.deepEqual(
    rows.filter((e) => e.type === 'turn/end').map((e) => e.data.reason.kind),
    ['completed', 'interrupted'],
    'native cold-start closure preserves interruption instead of success',
  );
  assert.equal(
    (await rpc('toolApprovalStatus', { channelId: scene.dm, messageId: scene.approvalId })).status,
    'expired',
  );
  const current = (await rpc('assignment', { slug: scene.bot.slug, sessionId: scene.sessionId }))
    .assignment;
  assert.equal(current.activity, 'idle');
  const assignmentRows = await assignmentEvents();
  assert.deepEqual(turnCounts(assignmentRows), { starts: 1, ends: 1 });
  save(phase === 'restart' ? '03-restarted.json' : '04-source-view.json', {
    bot: scene.bot.name,
    source: sourceProof(report),
    turns: turnCounts(rows),
    reportExposures: exposures(rows),
    assignmentTurns: turnCounts(assignmentRows),
    noAutomaticReplay: true,
    nativeEndReasons: rows.filter((e) => e.type === 'turn/end').map((e) => e.data.reason.kind),
    approvalExpired: true,
  });
}
const reportHistory = await assignmentEvents();
const reportCalls = reportHistory.filter(
  (e) => e.type === 'tool/call' && e.data.name === 'report_to_orchestrator',
);
assert.equal(reportCalls.length, 1);
assert.deepEqual(JSON.parse(reportCalls[0].data.arguments), {
  state: 'progress',
  summary: marker,
  expects_reply: false,
});
assert.equal(
  reportHistory.find(
    (e) => e.type === 'tool/result' && e.data.message.toolCallId === reportCalls[0].data.callId,
  )?.data.message.isError,
  false,
  'actual native Report succeeded',
);
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
