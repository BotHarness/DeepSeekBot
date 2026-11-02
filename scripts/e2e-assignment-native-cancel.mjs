import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { assignmentProbe, waitFor } from './e2e-assignment-probe.mjs';

const {
  BH_E2E_ORIGIN: origin,
  BH_E2E_HOME: home,
  BH_E2E_EVIDENCE: evidence,
  BH_E2E_STATE: statePath,
} = process.env;
assert.ok(origin && home && evidence && statePath);
const phase = process.argv[2] ?? 'prepare';
assert.ok(['prepare', 'baseline', 'cancelled', 'restart', 'verify'].includes(phase));
mkdirSync(evidence, { recursive: true });
const { rpc, nativeSnapshot } = assignmentProbe({ origin, home });
const marker = 'CANCEL_PROGRESS: Evidence retained before Human cancellation.';
let scene;
const saveState = () => writeFileSync(statePath, JSON.stringify(scene, null, 2), { mode: 0o600 });
const rows = async (id) => (await nativeSnapshot(id)).records.map((r) => r.event);
const counts = (events) => ({
  starts: events.filter((e) => e.type === 'turn/start').length,
  ends: events.filter((e) => e.type === 'turn/end').length,
});
const sources = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (i) => i.assignmentSessionId === scene.sessionId,
  );
const assignment = async () =>
  (await rpc('assignment', { slug: scene.bot.slug, sessionId: scene.sessionId })).assignment;
const publicSource = (i) =>
  Object.fromEntries(
    Object.entries({
      id: i.id,
      state: i.state,
      createdAt: i.createdAt,
      observedAt: i.observedAt,
      handledAt: i.handledAt,
      sourceKind: i.sourceKind,
      assignmentSessionId: i.assignmentSessionId,
      assignmentReportState: i.assignmentReportState,
      assignmentTurn: i.assignmentTurn,
      relatedReportSourceEventId: i.relatedReportSourceEventId,
      authorKind: i.authorKind,
      authorBotSlug: i.authorBotSlug,
      sourceAvailable: i.sourceAvailable,
      summary: i.summary,
    }).filter(([, value]) => value !== undefined),
  );
if (phase === 'prepare') {
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
      name: 'Native cancellation QA',
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Native cancellation QA',
      persona:
        'Follow the Human exactly. Create only one requested Assignment. Never run Shell in the Orchestrator, approve tools, edit files, create subagents or retry work. After creation bot_send_message CANCEL_CREATED and end. When a Host lifecycle cancellation notice arrives bot_send_message CANCEL_NOTICE_SEEN and end. Do not claim successful task completion, resume the Assignment or create replacement work.',
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
      ' and continuity key native-cancel-direction. Purpose: Human cancellation acceptance. It must FIRST invoke report_to_orchestrator once with state progress, summary ' +
      JSON.stringify(marker) +
      ', expects_reply false. Then invoke native Shell with only command sleep 1 and description Native cancellation QA timer, omitting sandbox_permissions and justification. Await Human approval. Do not report completed, use files, subagents or other tools. After creating it bot_send_message CANCEL_CREATED and end without waiting. When a Host cancellation Lifecycle Notice arrives bot_send_message CANCEL_NOTICE_SEEN and end; never retry, resume or create more work.',
  });
  scene.sessionId = (
    await waitFor(
      async () => (await rpc('assignments', { slug: bot.slug })).assignments[0],
      'running Assignment',
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
    'ungranted timer approval',
  );
  assert.equal(JSON.parse(card.toolApprovalRequest.input).command, 'sleep 1');
  scene.approvalId = card.id;
  await waitFor(
    async () => counts(await rows(scene.orchestratorId)).ends === 1,
    'creation Turn settled',
  );
  const items = await sources();
  assert.equal(items.length, 1);
  assert.equal(items[0].state, 'pending');
  assert.equal(items[0].summary, marker);
  scene.originalReport = publicSource(items[0]);
  saveState();
  console.log(JSON.stringify({ phase, bot: scene.bot.name, readyForHumanNativeCancel: true }));
  process.exit(0);
}
scene = JSON.parse(readFileSync(statePath, 'utf8'));
await waitFor(async () => (await assignment()).activity === 'error', 'native cancellation settled');
const native = await rows(scene.sessionId);
assert.deepEqual(counts(native), { starts: 1, ends: 1 });
const end = native.find((e) => e.type === 'turn/end');
assert.equal(end.data.reason.kind, 'aborted');
assert.equal(end.data.reason.reason.kind, 'user');
const calls = native.filter((e) => e.type === 'tool/call');
assert.equal(calls.filter((e) => e.data.name === 'report_to_orchestrator').length, 1);
const shell = calls.find((e) => ['bash', 'pwsh'].includes(e.data.name));
assert.ok(shell);
assert.ok(
  !native.some(
    (e) =>
      e.type === 'tool/result' &&
      e.data.message.toolCallId === shell.data.callId &&
      e.data.message.isError === false,
  ),
  'ungranted Shell never succeeded',
);
if (phase === 'cancelled')
  await waitFor(async () => {
    const i = await sources();
    const c = counts(await rows(scene.orchestratorId));
    return (
      i.filter((s) => s.sourceKind === 'assignment-lifecycle').length === 1 &&
      i.every((s) => s.state === 'handled') &&
      c.starts === 2 &&
      c.ends === 2
    );
  }, 'one Host notice harvest');
const items = await sources();
const report = items.find((i) => i.id === scene.originalReport.id);
assert.ok(report);
assert.equal(report.summary, marker);
assert.equal(report.assignmentReportState, 'progress');
assert.equal(report.assignmentTurn, 1);
assert.equal(report.authorKind, 'bot');
assert.equal(report.createdAt, scene.originalReport.createdAt);
const notices = items.filter((i) => i.sourceKind === 'assignment-lifecycle');
let nativeNotice;
if (phase !== 'baseline') {
  assert.equal(notices.length, 1);
  const database = new DatabaseSync(resolve(home, 'botharness', 'botharness.db'), {
    readOnly: true,
  });
  try {
    const row = database
      .prepare(
        'SELECT payload_json FROM source_events WHERE source_event_id = ? AND assignment_session_id = ?',
      )
      .get(notices[0].id, scene.sessionId);
    assert.ok(row);
    const payload = JSON.parse(row.payload_json);
    assert.equal(payload.author.kind, 'system');
    nativeNotice = payload.assignmentLifecycle;
    assert.deepEqual(nativeNotice, {
      state: 'cancelled',
      cause: 'native-turn-aborted',
      turn: end.data.turn,
      endSeq: end.seq,
    });
  } finally {
    database.close();
  }
}
const a = await assignment();
const orch = await rows(scene.orchestratorId);
const messages = (await rpc('channelMessages', { channelId: scene.dm })).messages;
if (phase === 'baseline') {
  assert.equal(notices.length, 0);
  assert.equal(report.state, 'pending');
  assert.deepEqual(counts(orch), { starts: 1, ends: 1 });
} else {
  assert.equal(notices.length, 1);
  assert.equal(notices[0].authorKind, 'system');
  assert.equal(notices[0].assignmentTurn, 1);
  assert.equal(notices[0].state, 'handled');
  assert.equal(notices[0].relatedReportSourceEventId, undefined);
  assert.match(notices[0].summary, /cancelled/);
  assert.equal(report.state, 'handled');
  assert.equal(a.continuityKey, undefined);
  assert.deepEqual(counts(orch), { starts: 2, ends: 2 });
  assert.equal(
    orch.filter((e) => e.type === 'user/message' && JSON.stringify(e.data).includes(notices[0].id))
      .length,
    1,
  );
  assert.equal(
    messages.filter((m) => m.author.kind === 'bot' && m.body === 'CANCEL_NOTICE_SEEN').length,
    1,
  );
}
assert.equal((await rpc('assignments', { slug: scene.bot.slug })).assignments.length, 1);
assert.equal(
  (await rpc('toolApprovalStatus', { channelId: scene.dm, messageId: scene.approvalId })).status,
  'expired',
);
const proof = {
  bot: scene.bot.name,
  assignment: {
    sessionId: a.sessionId,
    activity: a.activity,
    latestReport: a.latestReport,
    ...(a.continuityKey === undefined ? {} : { continuityKey: a.continuityKey }),
  },
  sources: items.map(publicSource),
  native: {
    turn: end.data.turn,
    endSeq: end.seq,
    endReason: end.data.reason.kind,
    cancelCause: end.data.reason.reason.kind,
    ...counts(native),
    ungrantedShellNeverSucceeded: true,
  },
  orchestrator: counts(orch),
  ...(nativeNotice === undefined ? {} : { nativeNotice }),
  cancellationAcknowledgements: messages.filter(
    (m) => m.author.kind === 'bot' && m.body === 'CANCEL_NOTICE_SEEN',
  ).length,
  approvalExpired: true,
  assignmentCount: 1,
};
if (phase === 'cancelled') {
  scene.after = proof;
  saveState();
}
if (['restart', 'verify'].includes(phase))
  assert.deepEqual(
    proof,
    scene.after,
    'cold restart/source viewing must retain exact facts without replay',
  );
writeFileSync(resolve(evidence, phase + '.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
