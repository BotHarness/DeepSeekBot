import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignmentProbe, waitFor } from './e2e-assignment-probe.mjs';

const {
  BH_E2E_ORIGIN: origin,
  BH_E2E_HOME: home,
  BH_E2E_EVIDENCE: evidence,
  BH_E2E_STATE: statePath,
} = process.env;
assert.ok(origin && home && evidence && statePath);
const phase = process.argv[2] ?? 'weaker';
assert.ok(['weaker', 'restart', 'verify'].includes(phase));
const { rpc, nativeSnapshot } = assignmentProbe({ origin, home });
const scene = JSON.parse(readFileSync(statePath, 'utf8'));
const before = JSON.parse(readFileSync(resolve(evidence, '03-restarted.json'), 'utf8'));
const marker = 'WEAKER_PROGRESS: Additional information remains available.';
const sourceProof = (i) =>
  Object.fromEntries(
    Object.entries({
      id: i.id,
      summary: i.summary,
      assignmentSessionId: i.assignmentSessionId,
      assignmentReportState: i.assignmentReportState,
      assignmentTurn: i.assignmentTurn,
      authorKind: i.authorKind,
      sourceAvailable: i.sourceAvailable,
      state: i.state,
      observedAt: i.observedAt,
      handledAt: i.handledAt,
    }).filter(([, value]) => value !== undefined),
  );
const sources = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (i) => i.assignmentSessionId === scene.sessionId,
  );
const events = async (id) => (await nativeSnapshot(id)).records.map((r) => r.event);
const counts = (rows) => ({
  starts: rows.filter((e) => e.type === 'turn/start').length,
  ends: rows.filter((e) => e.type === 'turn/end').length,
});
const exposures = (rows, id) =>
  rows.filter(
    (e) =>
      e.type === 'user/message' &&
      (e.data.content ?? []).some(
        (c) => c.type === 'text' && c.text.includes('reported [Source Event ' + id + ']:'),
      ),
  ).length;
const saveState = () => writeFileSync(statePath, JSON.stringify(scene, null, 2), { mode: 0o600 });
const original = (await sources()).find((i) => i.id === scene.reportId);
assert.ok(original);
assert.equal(original.state, 'needs-repair');
assert.deepEqual(sourceProof(original), before.source);

if (phase === 'weaker' && !scene.weakerProof) {
  if (!scene.weakerRequested) {
    await rpc('channelSend', {
      channelId: scene.dm,
      body: `REPAIR_WEAKER_UPDATE: Explicitly resume only Assignment ${scene.sessionId}. Use send_assignment_request with session_id ${scene.sessionId}, mode next-turn, text: Invoke report_to_orchestrator exactly once, state progress, summary ${JSON.stringify(marker)}, expects_reply false; then end without any other tools. After this request bot_send_message REPAIR_WEAKER_REQUESTED and end. No new Assignment, Shell, files, repair, retries or ignoring of Inbox items.`,
    });
    scene.weakerRequested = true;
    saveState();
  }
  await waitFor(
    async () => (await sources()).some((i) => i.summary === marker),
    'real weaker progress Report',
  );
  await waitFor(
    async () =>
      counts(await events(scene.sessionId)).ends === 2 &&
      counts(await events(scene.orchestratorId)).ends === 3,
    'explicit request settled',
  );
  const rows = await sources();
  assert.equal(rows.length, 2);
  const weaker = rows.find((i) => i.summary === marker);
  assert.equal(weaker.state, 'pending');
  assert.equal(weaker.assignmentTurn, 2);
  assert.notEqual(weaker.id, original.id);
  assert.deepEqual(sourceProof(rows.find((i) => i.id === original.id)), before.source);
  scene.weakerReportId = weaker.id;
  saveState();
  writeFileSync(
    resolve(evidence, '04-weaker-pending.json'),
    JSON.stringify({ original: before.source, weaker: sourceProof(weaker) }, null, 2) + '\n',
  );
  if (!scene.weakerReadRequested) {
    await rpc('channelSend', {
      channelId: scene.dm,
      body: 'READ_WEAKER_INFORMATION: Read only the new supplied Inbox information. bot_send_message REPAIR_WEAKER_READ once and end; no Assignment requests, no repair/ignore, no Shell or files.',
    });
    scene.weakerReadRequested = true;
    saveState();
  }
  await waitFor(
    async () => (await sources()).find((i) => i.id === scene.weakerReportId)?.state === 'handled',
    'weaker information handled',
  );
  await waitFor(
    async () => counts(await events(scene.orchestratorId)).ends === 4,
    'Human information Turn settled',
  );
}
assert.ok(scene.weakerReportId);
const rows = await sources();
assert.equal(rows.length, 2);
const repair = rows.find((i) => i.id === original.id);
const weaker = rows.find((i) => i.id === scene.weakerReportId);
assert.deepEqual(
  sourceProof(repair),
  before.source,
  'weaker reports cannot alter repair identity/status/timestamps',
);
assert.equal(weaker.state, 'handled');
assert.equal(weaker.assignmentReportState, 'progress');
assert.equal(weaker.assignmentTurn, 2);
assert.equal(weaker.authorKind, 'bot');
assert.equal(weaker.summary, marker);
const native = await events(scene.sessionId);
assert.deepEqual(counts(native), { starts: 2, ends: 2 });
assert.deepEqual(
  native.filter((e) => e.type === 'turn/end').map((e) => e.data.reason.kind),
  ['completed', 'completed'],
);
const calls = native.filter(
  (e) => e.type === 'tool/call' && e.data.name === 'report_to_orchestrator',
);
assert.equal(calls.length, 2);
assert.deepEqual(JSON.parse(calls[1].data.arguments), {
  state: 'progress',
  summary: marker,
  expects_reply: false,
});
assert.equal(
  native.find((e) => e.type === 'tool/result' && e.data.message.toolCallId === calls[1].data.callId)
    ?.data.message.isError,
  false,
);
const orch = await events(scene.orchestratorId);
assert.deepEqual(counts(orch), { starts: 4, ends: 4 });
const shellCalls = orch.filter(
  (e) => e.type === 'tool/call' && ['bash', 'pwsh'].includes(e.data.name),
);
assert.equal(shellCalls.length, 1);
assert.equal(JSON.parse(shellCalls[0].data.arguments).command, 'sleep 1');
assert.equal(
  orch.find(
    (e) => e.type === 'tool/result' && e.data.message.toolCallId === shellCalls[0].data.callId,
  )?.data.message.isError,
  true,
);

const modelRoutes = [];
for (const [role, history] of [
  ['assignment', native],
  ['orchestrator', orch],
]) {
  const requests = history.filter((e) => e.type === 'request/header');
  assert.ok(requests.length > 0);
  for (const event of requests) {
    const config = event.data.header.config;
    const route = {
      provider: config.provider,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
    };
    assert.deepEqual(route, {
      provider: 'deepseek-official',
      model: 'deepseek-flash',
      reasoningEffort: 'low',
    });
    modelRoutes.push({ role, seq: event.seq, ...route });
  }
}
writeFileSync(resolve(evidence, 'model-routes.json'), JSON.stringify(modelRoutes, null, 2) + '\n');

assert.deepEqual(
  orch.filter((e) => e.type === 'turn/end').map((e) => e.data.reason.kind),
  ['completed', 'interrupted', 'completed', 'completed'],
);
assert.equal(exposures(orch, repair.id), 1, 'repair never re-enters a later harvest');
assert.equal(exposures(orch, weaker.id), 1, 'new information is harvested once');
assert.equal((await rpc('assignments', { slug: scene.bot.slug })).assignments.length, 1);
assert.equal(
  (await rpc('assignment', { slug: scene.bot.slug, sessionId: scene.sessionId })).assignment
    .activity,
  'idle',
);
assert.equal(
  (await rpc('toolApprovalStatus', { channelId: scene.dm, messageId: scene.approvalId })).status,
  'expired',
);
const messages = (await rpc('channelMessages', { channelId: scene.dm })).messages;
assert.equal(
  messages.filter((m) => m.author.kind === 'bot' && m.body === 'REPAIR_WEAKER_READ').length,
  1,
);
const proof = {
  bot: scene.bot.name,
  original: sourceProof(repair),
  weaker: sourceProof(weaker),
  assignmentTurns: counts(native),
  orchestratorTurns: counts(orch),
  nativeOrchestratorEndReasons: orch
    .filter((e) => e.type === 'turn/end')
    .map((e) => e.data.reason.kind),
  repairExposures: exposures(orch, repair.id),
  weakerExposures: exposures(orch, weaker.id),
  explicitHumanContinuation: true,
  noAutomaticReplayOrReplacement: true,
  noSuccessfulCompletionNotice: true,
  approvalExpired: true,
  assignmentCount: 1,
};
if (phase === 'weaker' && !scene.weakerProof) {
  scene.weakerProof = proof;
  saveState();
} else
  assert.deepEqual(
    proof,
    scene.weakerProof,
    'restart/source viewing retain exact repair and new-information facts',
  );
writeFileSync(
  resolve(
    evidence,
    phase === 'weaker'
      ? '05-weaker-handled.json'
      : phase === 'restart'
        ? '06-weaker-restarted.json'
        : '07-source-view.json',
  ),
  JSON.stringify(proof, null, 2) + '\n',
);
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
