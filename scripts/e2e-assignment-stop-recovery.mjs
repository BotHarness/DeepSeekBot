import assert from 'node:assert/strict';
import { assertAssignmentReportReply } from './e2e-assignment-report-proof.mjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const phase = process.argv[2] ?? 'prepare';
assert.ok(origin && home && evidence);
assert.ok(['prepare', 'pending', 'stop', 'restart', 'capture'].includes(phase));
assert.ok(
  new URL(origin).protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname),
);
const privateDir = resolve('.humanlayer/tasks/81-assignment-stop-recovery');
mkdirSync(privateDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const statePath = resolve(privateDir, 'qa-state.json');
const cookie = readFileSync(resolve(tmpdir(), 'dsh-' + basename(home) + '.cookies'), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}, namespace = 'botharness') {
  const response = await fetch(origin + '/api/' + namespace + '/' + method, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: namespace + '/' + method,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, method + ': ' + JSON.stringify(result?.error));
  return result.value;
}
async function waitFor(test, label) {
  for (let n = 0; n < 180; n++) {
    const result = await test();
    if (result) return result;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw Error('Timed out: ' + label);
}
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
if (phase === 'prepare') {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Stop recovery QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Stop recovery QA ' + stamp,
      persona:
        'Follow the Human exactly. Use only the requested single Assignment and native tools. Never run Shell in the Orchestrator, approve tools, modify files, or create subagents. Respond in the Channel only with the exact requested marker after the specified operation succeeds. On lifecycle notices, do not create or resume work.',
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
    key: 'stop-recovery-qa',
  };
  writeState();
  await rpc('channelSend', {
    channelId: scene.dm,
    body:
      'Create exactly one Assignment using grant_id ' +
      scene.grantId +
      ' and key "' +
      scene.key +
      '". Purpose: invoke native Shell exactly once with command node -e "setTimeout(() => {}, 60000)" and description "Stop recovery QA timer", then await approval. No file modification or subagent. You the Orchestrator must not use Shell. After create_assignment returns, send exactly "ASSIGNMENT_CREATED" using bot_send_message and end the Turn. Never approve the Assignment tool.',
  });
  const row = await waitFor(
    async () => (await assignmentRows()).find((a) => a.activity === 'working'),
    'owned working Assignment',
  );
  scene.firstSessionId = row.sessionId;
  writeState();
} else {
  scene = JSON.parse(readFileSync(statePath, 'utf8'));
}
if (phase === 'prepare' || phase === 'pending') {
  const row = (await assignmentRows()).find((a) => a.sessionId === scene.firstSessionId);
  const card = await waitFor(() => pending(row.sessionId), 'Assignment tool approval');
  assert.ok(['bash', 'pwsh'].includes(card.toolApprovalRequest.toolName));
  assert.equal(
    JSON.parse(card.toolApprovalRequest.input).command,
    'node -e "setTimeout(() => {}, 60000)"',
  );
  assert.equal(row.permission.mode, 'workspace-write');
  assert.equal(row.permission.grantId, scene.grantId);
  assert.equal(row.continuityKey, scene.key);
  scene.approvalId = card.id;
  scene.permission = row.permission;
  writeState();
  assert.equal(
    (await rpc('toolApprovalStatus', { channelId: scene.dm, messageId: card.id })).status,
    'pending',
  );
  writeProof('01-pending-proof.json', {
    bot: scene.bot.name,
    sessionId: row.sessionId,
    activity: row.activity,
    permissionMode: row.permission.mode,
    grantId: scene.grantId,
    continuityKey: scene.key,
    pendingApproval: true,
  });
}
if (phase === 'stop') {
  if (
    !(await assignmentRows()).some(
      (a) => a.sessionId === scene.firstSessionId && a.activity === 'stopped',
    )
  )
    await rpc('channelSend', {
      channelId: scene.dm,
      body:
        'Inspect Assignment Session ' +
        scene.firstSessionId +
        ', then use stop_assignment to stop it. Do not resume it or approve its tool. After the tool confirms stopped, send exactly "ASSIGNMENT_STOPPED" using bot_send_message and end. Do not create any new Assignment.',
    });
  const row = await waitFor(
    async () =>
      (await assignmentRows()).find(
        (a) => a.sessionId === scene.firstSessionId && a.activity === 'stopped',
      ),
    'Assignment stop confirmed',
  );
  await waitFor(
    async () =>
      (await messages()).some((m) => m.author.kind === 'bot' && m.body === 'ASSIGNMENT_STOPPED'),
    'actual stop Channel reply',
  );
  assert.equal(row.continuityKey, undefined);
  assert.equal(row.latestReport, undefined);
  assert.deepEqual(row.permission, scene.permission);
  assert.equal(
    (await rpc('toolApprovalStatus', { channelId: scene.dm, messageId: scene.approvalId })).status,
    'expired',
  );
  const activity = await waitFor(
    async () =>
      (await rpc('activitySnapshot')).bots.find(
        (b) => b.slug === scene.bot.slug && b.state === 'idle',
      ),
    'Bot returns to idle after stop',
  );
  writeProof('02-stopped-proof.json', {
    bot: scene.bot.name,
    sessionId: row.sessionId,
    activity: row.activity,
    permissionMode: row.permission.mode,
    samePermissionSnapshot: true,
    continuityKeyReleased: true,
    lateReportAbsent: true,
    pendingApprovalExpired: true,
    botState: activity.state,
  });
}
if (phase === 'restart') {
  const rows = await assignmentRows();
  const stopped = rows.find((a) => a.sessionId === scene.firstSessionId);
  assert.equal(stopped.activity, 'stopped');
  assert.equal(stopped.continuityKey, undefined);
  assert.deepEqual(stopped.permission, scene.permission);
  const history = await messages();
  assert.ok(history.some((m) => m.author.kind === 'bot' && m.body === 'ASSIGNMENT_STOPPED'));
  assert.equal(
    (await rpc('toolApprovalStatus', { channelId: scene.dm, messageId: scene.approvalId })).status,
    'expired',
  );
  await rpc('channelSend', {
    channelId: scene.dm,
    body:
      'Create exactly one NEW Assignment using grant_id ' +
      scene.grantId +
      ' and the same released key "' +
      scene.key +
      '". Its purpose: immediately report_to_orchestrator state completed with summary "RESTART_REUSE_DONE". Use no Shell, file modification or subagent. After create_assignment returns, end and wait for the report; after successful report send exactly "RESTART_REUSE_DONE" using bot_send_message. Never resume the stopped Session.',
  });
  const newer = await waitFor(
    async () => (await assignmentRows()).find((a) => a.sessionId !== scene.firstSessionId),
    'fresh Assignment after stop and restart',
  );
  scene.secondSessionId = newer.sessionId;
  writeState();
  const finished = await waitFor(
    async () =>
      (await assignmentRows()).find(
        (a) => a.sessionId === newer.sessionId && a.latestReport?.summary === 'RESTART_REUSE_DONE',
      ),
    'new Assignment completed report',
  );
  await waitFor(
    async () =>
      (await messages()).some((m) => m.author.kind === 'bot' && m.body === 'RESTART_REUSE_DONE'),
    'Orchestrator actual completion reply',
  );
  assert.equal(finished.permission.mode, 'workspace-write');
  assert.equal(finished.permission.grantId, scene.grantId);
  assert.equal(
    (await assignmentRows()).find((a) => a.sessionId === scene.firstSessionId).activity,
    'stopped',
  );
  assert.notEqual(scene.firstSessionId, scene.secondSessionId);
  assert.equal(finished.continuityKey, scene.key);
  assert.equal((await assignmentRows()).length, 2);
  writeProof('03-restart-proof.json', {
    bot: scene.bot.name,
    oldSessionId: scene.firstSessionId,
    newSessionId: scene.secondSessionId,
    stoppedStatePreserved: true,
    permissionSnapshotPreserved: true,
    approvalRemainsExpired: true,
    historyPreserved: true,
    sameGrantReused: true,
    sameContinuityKeyCreatedNewSession: true,
    newReport: finished.latestReport.summary,
  });
}

const modules = resolve('node_modules/.pnpm');
const installed = (name) =>
  createRequire(
    resolve(
      modules,
      readdirSync(modules).find((d) => d.startsWith(name + '@')),
      'node_modules/',
    ),
  )(name);
const WebSocket = installed('ws');
async function nativeSnapshot(sessionId) {
  const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/api/remote.mux', {
    headers: { cookie },
  });
  try {
    await new Promise((done, reject) => {
      socket.once('open', done);
      socket.once('error', reject);
    });
    return await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(Error('native snapshot timeout')), 20000);
      socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      socket.on('message', (raw) => {
        const f = JSON.parse(String(raw));
        if (f.type === 'error') {
          clearTimeout(timeout);
          reject(Error(JSON.stringify(f.error)));
        }
        if (f.type === 'item' && f.value.type === 'snapshot') {
          clearTimeout(timeout);
          done(f.value);
        }
      });
      socket.send(
        JSON.stringify({
          type: 'open',
          streamId: crypto.randomUUID(),
          endpoint: 'session/follow',
          payload: {
            args: { request: { address: { kind: 'session', sessionId }, maxMessages: 100 } },
          },
        }),
      );
    });
  } finally {
    socket.terminate();
  }
}

if (phase !== 'capture') {
  scene.lastPhase = phase;
  writeState();
}
if (phase === 'stop' || phase === 'restart') {
  const session = (await rpc('sessions', { slug: scene.bot.slug })).sessions.find(
    (s) => s.role === 'orchestrator',
  );
  const native = await nativeSnapshot(session.sessionId);
  const stop = native.records.find(
    (r) => r.event.type === 'tool/call' && r.event.data.name === 'stop_assignment',
  );
  assert.ok(stop, 'native stop_assignment call exists');
  assert.equal(JSON.parse(stop.event.data.arguments).session_id, scene.firstSessionId);
  const result = native.records.find(
    (r) =>
      r.event.type === 'tool/result' && r.event.data.message.toolCallId === stop.event.data.callId,
  );
  assert.ok(result && result.event.data.message.isError === false, 'native successful stop result');
  const assignmentNative = await nativeSnapshot(scene.firstSessionId);
  const shell = assignmentNative.records.find(
    (r) => r.event.type === 'tool/call' && ['bash', 'pwsh'].includes(r.event.data.name),
  );
  assert.ok(shell, 'native Assignment Shell call exists');
  assert.ok(
    !assignmentNative.records.some(
      (r) =>
        r.event.type === 'tool/result' &&
        r.event.data.message.toolCallId === shell.event.data.callId &&
        r.event.data.message.isError === false,
    ),
    'cancelled pending Shell has no successful result',
  );
  writeProof('native-stop-proof.json', {
    orchestratorSessionId: session.sessionId,
    stoppedAssignmentSessionId: scene.firstSessionId,
    tool: stop.event.data.name,
    callAt: stop.event.time,
    resultAt: result.event.time,
    successful: true,
    pendingToolNeverSucceeded: true,
    assignmentTool: shell.event.data.name,
  });
}

if (phase === 'restart') {
  const native = await nativeSnapshot(scene.secondSessionId);
  const reportDelivery = assertAssignmentReportReply(
    native.records,
    await messages(),
    'RESTART_REUSE_DONE',
  );
  const path = resolve(evidence, '03-restart-proof.json');
  const proof = JSON.parse(readFileSync(path, 'utf8'));
  writeProof('03-restart-proof.json', { ...proof, reportDelivery });
}

const puppeteer = installed('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const split = cookie.indexOf('=');
  await browser.setCookie({
    name: cookie.slice(0, split),
    value: cookie.slice(split + 1),
    domain: new URL(origin).hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((b) =>
          ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
        ),
      { timeout: 10000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  for (let n = 0; n < 3 && !(await page.$('.bh-main')); n++) {
    await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some((b) =>
            ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''),
          ) || document.querySelector('.bh-main'),
        { timeout: 5000 },
      )
      .catch(() => undefined);
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''))
        ?.click(),
    );
    await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => undefined);
  }
  await page.waitForSelector('.bh-main');
  await page.waitForSelector('[data-channel-id="' + scene.dm + '"]');
  await page.click('[data-channel-id="' + scene.dm + '"]');

  await page.click('.bh-panel-activity');
  await page.waitForSelector('.bh-activity-center');
  if (!(await page.$('.bh-overview'))) {
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')]
        .find((b) => ['Overview', '总览'].includes(b.textContent.trim()))
        ?.click(),
    );
  }
  await page.waitForSelector('.bh-overview');
  await page.click('.bh-overview-toolbar button[aria-pressed]');
  await page.waitForSelector('[data-bot-id="' + scene.bot.slug + '"]');
  const label = phase === 'capture' ? scene.lastPhase : phase;
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.screenshot({ path: resolve(evidence, label + '-overview-dark.png') });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.screenshot({ path: resolve(evidence, label + '-overview-light.png') });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
