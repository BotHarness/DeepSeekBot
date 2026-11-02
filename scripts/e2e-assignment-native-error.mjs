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
assert.ok(['prepare', 'baseline', 'failed', 'restart', 'verify'].includes(phase));
mkdirSync(evidence, { recursive: true });
const { rpc, nativeSnapshot } = assignmentProbe({ origin, home });
const marker = 'NATIVE_ERROR_PROGRESS: Evidence retained before execution failure.';
let scene;
const save = () => writeFileSync(statePath, JSON.stringify(scene, null, 2), { mode: 0o600 });
const events = async (id) => (await nativeSnapshot(id)).records.map((r) => r.event);
const counts = (rows) => ({
  starts: rows.filter((e) => e.type === 'turn/start').length,
  ends: rows.filter((e) => e.type === 'turn/end').length,
});
const sources = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (i) => i.assignmentSessionId === scene.sessionId,
  );
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
      summary: i.summary,
      sourceAvailable: i.sourceAvailable,
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
      name: 'Native execution error QA ' + Date.now(),
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Native execution error QA',
      persona:
        'Follow the Human exactly. In the Assignment role, follow the full purpose: report exactly once as instructed, then end; no Shell, files, questions, subagents or other tools. In the Orchestrator role, create exactly one Assignment with the full purpose verbatim, then bot_send_message ERROR_CREATED and end. On a Host execution-error Lifecycle Notice, bot_send_message ERROR_NOTICE_SEEN exactly once and end. Never resume, retry or replace an Assignment or claim successful work.',
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
  save();
  const purpose =
    'Execution-error acceptance. FIRST invoke report_to_orchestrator exactly once with state progress, summary ' +
    JSON.stringify(marker) +
    ', expects_reply false; then end. No Shell, files, questions or other tools.';
  await rpc('channelSend', {
    channelId: dm.id,
    body:
      'Create one Assignment using grant_id ' +
      grant.id +
      ' and continuity key native-error-direction. Its full purpose must be exactly: ' +
      JSON.stringify(purpose) +
      '. Do not shorten it. After creation bot_send_message ERROR_CREATED and end. On a Host execution-error notice bot_send_message ERROR_NOTICE_SEEN once and end without retry/resume/replacement.',
  });
  scene.sessionId = (
    await waitFor(
      async () => (await rpc('assignments', { slug: bot.slug })).assignments[0],
      'real Assignment',
    )
  ).sessionId;
  scene.orchestratorId = (await rpc('sessions', { slug: bot.slug })).sessions.find(
    (s) => s.role === 'orchestrator',
  ).sessionId;
  save();
  await waitFor(
    async () =>
      (await events(scene.sessionId)).some(
        (e) => e.type === 'turn/end' && e.data.reason.kind === 'error',
      ),
    'actual native execution-error Turn',
  );
  await waitFor(
    async () =>
      (await rpc('assignment', { slug: bot.slug, sessionId: scene.sessionId })).assignment
        .activity === 'error',
    'settled Assignment execution',
  );
  await waitFor(
    async () => counts(await events(scene.orchestratorId)).ends >= 1,
    'settled Orchestrator creation',
  );
  const items = await sources();
  const report = items.find((i) => i.sourceKind === 'assignment-report');
  assert.ok(report);
  scene.report = publicSource(report);
  save();
  console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
  process.exit(0);
}
scene = JSON.parse(readFileSync(statePath, 'utf8'));
if (phase === 'failed')
  await waitFor(
    async () =>
      (await sources()).length === 2 &&
      (await sources()).every((i) => i.state === 'handled') &&
      counts(await events(scene.orchestratorId)).ends === 2,
    'one error notice harvest',
  );
const native = await events(scene.sessionId),
  orch = await events(scene.orchestratorId);
assert.deepEqual(counts(native), { starts: 1, ends: 1 });
const end = native.find((e) => e.type === 'turn/end');
assert.equal(end.data.reason.kind, 'error');
assert.ok(
  end.data.reason.error.message.includes('PRIVATE_QA_ERROR_CANARY'),
  'real injected native failure, not fabricated error',
);
const calls = native.filter((e) => e.type === 'tool/call');
assert.equal(calls.length, 1);
assert.equal(calls[0].data.name, 'report_to_orchestrator');
assert.equal(
  native.find((e) => e.type === 'tool/result' && e.data.message.toolCallId === calls[0].data.callId)
    ?.data.message.isError,
  false,
);
const headers = native.filter((e) => e.type === 'request/header');
assert.ok(headers.length > 0);
for (const event of headers)
  assert.deepEqual(
    {
      provider: event.data.header.config.provider,
      model: event.data.header.config.model,
      reasoningEffort: event.data.header.config.reasoningEffort,
    },
    { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'low' },
  );
const items = await sources();
const report = items.find((i) => i.id === scene.report.id);
assert.ok(report);
assert.equal(report.summary, marker);
assert.equal(report.assignmentReportState, 'progress');
assert.equal(report.assignmentTurn, 1);
assert.equal(report.authorKind, 'bot');
assert.equal(report.createdAt, scene.report.createdAt);
const notices = items.filter((i) => i.sourceKind === 'assignment-lifecycle');
const messages = (await rpc('channelMessages', { channelId: scene.dm })).messages;
let nativeNotice;
if (phase === 'baseline') {
  assert.equal(notices.length, 0);
  assert.equal(report.state, 'pending');
  assert.deepEqual(counts(orch), { starts: 1, ends: 1 });
} else {
  assert.equal(notices.length, 1);
  assert.equal(notices[0].authorKind, 'system');
  assert.equal(notices[0].relatedReportSourceEventId, undefined);
  assert.equal(notices[0].assignmentTurn, 1);
  assert.ok(notices[0].summary.includes('execution error'));
  assert.ok(!notices[0].summary.includes('PRIVATE_QA_ERROR_CANARY'));
  assert.equal(report.state, 'handled');
  assert.equal(notices[0].state, 'handled');
  assert.deepEqual(counts(orch), { starts: 2, ends: 2 });
  assert.equal(
    messages.filter((m) => m.author.kind === 'bot' && m.body === 'ERROR_NOTICE_SEEN').length,
    1,
  );
  const exposures = orch.filter(
    (e) =>
      e.type === 'user/message' &&
      (e.data.content ?? []).some(
        (c) =>
          c.type === 'text' &&
          c.text.includes('Host lifecycle notice [Source Event ' + notices[0].id + ']:'),
      ),
  );
  assert.equal(exposures.length, 1);
  const database = new DatabaseSync(resolve(home, 'botharness', 'botharness.db'), {
    readOnly: true,
  });
  try {
    const row = database
      .prepare(
        'SELECT payload_json FROM source_events WHERE source_event_id = ? AND assignment_session_id = ?',
      )
      .get(notices[0].id, scene.sessionId);
    const payload = JSON.parse(row.payload_json);
    assert.equal(payload.author.kind, 'system');
    nativeNotice = payload.assignmentLifecycle;
    assert.deepEqual(nativeNotice, {
      state: 'failed',
      cause: 'native-turn-error',
      turn: 1,
      endSeq: end.seq,
    });
  } finally {
    database.close();
  }
}
assert.equal((await rpc('assignments', { slug: scene.bot.slug })).assignments.length, 1);
const a = (await rpc('assignment', { slug: scene.bot.slug, sessionId: scene.sessionId }))
  .assignment;
assert.equal(a.activity, 'error');
assert.equal(a.continuityKey, phase === 'baseline' ? 'native-error-direction' : undefined);
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
    ...counts(native),
    turn: end.data.turn,
    endSeq: end.seq,
    endReason: end.data.reason.kind,
    errorCode: end.data.reason.error.code,
    faultInjectedAfterRealReport: true,
    actualProvider: 'deepseek-official',
    actualModel: 'deepseek-flash',
    reasoningEffort: 'low',
  },
  ...(nativeNotice ? { nativeNotice } : {}),
  orchestrator: counts(orch),
  acknowledgementCount: messages.filter(
    (m) => m.author.kind === 'bot' && m.body === 'ERROR_NOTICE_SEEN',
  ).length,
  assignmentCount: 1,
};
if (phase === 'failed') {
  scene.after = proof;
  save();
}
if (['restart', 'verify'].includes(phase))
  assert.deepEqual(proof, scene.after, 'exact facts retained without replay');
writeFileSync(resolve(evidence, phase + '.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
