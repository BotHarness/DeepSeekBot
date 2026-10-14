import assert from 'node:assert/strict';
import {
  assertGroupAssignmentCompletion,
  assertSingleAssignment,
  nativeTimerCall,
} from './e2e-group-assignment-proof.mjs';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const mode = process.argv[2] ?? 'check';
assert.ok(origin && home && evidence, 'set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_EVIDENCE');
const privateDir = resolve('.humanlayer/tasks/124-group-assignment-activity');
mkdirSync(privateDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const statePath = resolve(privateDir, 'qa-state.json');
const cookie = readFileSync(resolve(tmpdir(), 'dsh-' + basename(home) + '.cookies'), 'utf8').split(
  ';',
)[0];
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
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
  for (let attempt = 0; attempt < 180; attempt++) {
    const result = await test();
    if (result) return result;
    await delay(1000);
  }
  throw Error('Timed out: ' + label);
}
async function prepare() {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (model) => model.model.includes('flash') && model.efforts.some((effort) => effort.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Group Assignment QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const owner = (
    await rpc('create', {
      displayName: 'Assignment owner QA ' + stamp,
      persona:
        'Follow Human instructions precisely. Create only the requested single Assignment. Use native Shell only for the exact bounded timer requested by Human. Do not create subagents, change files, or react to other Bots. After successful Assignment completion, send the requested marker in the originating Group. End Turns while awaiting reports; do not poll.',
    })
  ).bot;
  await rpc('modelPresetApply', { slug: owner.slug, presetId: preset.id });
  const quiet = (await rpc('create', { displayName: 'Quiet control QA ' + stamp })).bot;
  const folder = resolve(home, 'assignment-qa-workspace');
  mkdirSync(folder, { recursive: true });
  const workspace = (await rpc('create', { request: { path: folder } }, 'workspace')).workspace;
  const grant = (await rpc('grantCreate', { slug: owner.slug, workspaceId: workspace.workspaceId }))
    .grant;
  const channel = (
    await rpc('channelCreate', {
      name: 'Group Assignment Human QA ' + stamp,
      members: [quiet.slug, owner.slug],
    })
  ).channel;
  for (const bot of [owner, quiet])
    await rpc('channelGroupWakeSet', {
      channelId: channel.id,
      botSlug: bot.slug,
      mode: 'mentions',
      count: 5,
      intervalSeconds: 60,
    });
  return {
    channelId: channel.id,
    name: channel.name,
    owner: { slug: owner.slug, name: owner.displayName },
    quiet: { slug: quiet.slug, name: quiet.displayName },
    grantId: grant.id,
    route,
  };
}
const scene = mode === 'prepare' ? await prepare() : JSON.parse(readFileSync(statePath, 'utf8'));
writeFileSync(statePath, JSON.stringify(scene, null, 2));
if (mode === 'prepare') {
  console.log(JSON.stringify({ prepared: true, group: scene.name }));
  process.exit(0);
}
const timers = {
  orchestrator: 'node -e "setTimeout(() => {}, 45000)"',
  assignment: 'node -e "setTimeout(() => {}, 120000)"',
};
const previous =
  mode === 'resume'
    ? (await rpc('channelMessages', { channelId: scene.channelId })).messages.findLast(
        (message) =>
          message.author.kind === 'human' && message.body.includes('GROUP_ASSIGNMENT_DONE_'),
      )
    : undefined;
const marker = previous
  ? previous.body.match(/GROUP_ASSIGNMENT_DONE_\d+/)[0]
  : 'GROUP_ASSIGNMENT_DONE_' + Date.now();
const sent = previous
  ? { message: previous }
  : await rpc('channelSend', {
      channelId: scene.channelId,
      body:
        '@' +
        scene.owner.name +
        ' Create exactly one Assignment using active Workspace Grant ' +
        scene.grantId +
        '. Omit provider/model/effort. Its purpose: use native Shell exactly once with command ' +
        timers.assignment +
        ' and description "Group Assignment activity QA"; await Human approval and actual successful completion, then report_to_orchestrator state completed with summary ' +
        marker +
        '. No other command, file modification, or subagent. After create_assignment returns, you the Orchestrator must use native Shell exactly once with command ' +
        timers.orchestrator +
        ' and description "Group Orchestrator activity QA". After your own timer completes, end the Turn and wait for the Assignment report, without polling. After its successful completed report, use channel_send to send ' +
        marker +
        ' to originating Group ' +
        scene.channelId +
        ' and end. Never send completion before the Assignment succeeds.',
      mentions: [
        {
          botSlug: scene.owner.slug,
          label: scene.owner.name,
          start: 0,
          end: scene.owner.name.length + 1,
        },
      ],
    });
const dmId = (await rpc('channelDm', { slug: scene.owner.slug })).channel.id;
const approvals = await waitFor(async () => {
  const messages = (await rpc('channelMessages', { channelId: dmId })).messages;
  const resolved = new Set(
    messages.flatMap((message) =>
      message.toolApprovalDecision ? [message.toolApprovalDecision.requestMessageId] : [],
    ),
  );
  const pending = messages.filter(
    (message) =>
      message.at >= sent.message.at && message.toolApprovalRequest && !resolved.has(message.id),
  );
  return pending.length === 2 ? pending : false;
}, 'both owned Session timer approvals');
const owned = (await rpc('sessions', { slug: scene.owner.slug })).sessions;
assertSingleAssignment(owned);
const approvedRoles = approvals.map((approval) => {
  const session = owned.find(
    (session) => session.sessionId === approval.toolApprovalRequest.sessionId,
  );
  assert.ok(session);
  assert.ok(['orchestrator', 'assignment'].includes(session.role));
  assert.equal(JSON.parse(approval.toolApprovalRequest.input).command, timers[session.role]);
  return { approval, role: session.role, sessionId: session.sessionId };
});
assert.deepEqual(
  new Set(approvedRoles.map((row) => row.role)),
  new Set(['orchestrator', 'assignment']),
);
if (mode === 'human') {
  console.log(JSON.stringify({ group: scene.name, pendingApprovals: 2, marker }));
  process.exit(0);
}
const modules = resolve('node_modules/.pnpm');
function installed(name) {
  const dir = readdirSync(modules).find((dir) => dir.startsWith(name + '@'));
  assert.ok(dir);
  return createRequire(resolve(modules, dir, 'node_modules/'))(name);
}
const puppeteer = installed('puppeteer');
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
      const timeout = setTimeout(() => reject(Error('native Session snapshot timeout')), 20000);
      socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'error') {
          clearTimeout(timeout);
          reject(Error(JSON.stringify(frame.error)));
        }
        if (frame.type === 'item' && frame.value.type === 'snapshot') {
          clearTimeout(timeout);
          done(frame.value);
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
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
const split = cookie.indexOf('=');
await browser.setCookie({
  name: cookie.slice(0, split),
  value: cookie.slice(split + 1),
  domain: new URL(origin).hostname,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const frames = [];
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.eventSourceMessageReceived', (event) => {
  if (event.eventName === 'activity/snapshot') frames.push(JSON.parse(event.data));
});
const proof = { group: scene.name, route: scene.route, phases: [], nativeTimers: [] };
async function shot(name) {
  await page.screenshot({ path: resolve(evidence, name + '.png') });
}
async function openGroup() {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((button) =>
          ['Continue', '继续'].includes(button.textContent?.trim() ?? ''),
        ),
      { timeout: 8000 },
    )
    .catch(() => undefined);

  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  await delay(500);
  if (!(await page.$('.bh-main')))
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  for (let attempt = 0; attempt < 3 && !(await page.$('.bh-main')); attempt++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((button) =>
          ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
        )
        ?.click(),
    );
    if (attempt > 0)
      await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
    await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => undefined);
  }
  await page.waitForSelector('.bh-main');
  await page.waitForSelector('[data-channel-id="' + scene.channelId + '"]');
  await page.click('[data-channel-id="' + scene.channelId + '"]');
  await page.waitForSelector('.bh-composer-shell');
}
async function verifyPhase(label, predicate) {
  const snapshot = await waitFor(async () => {
    const snapshot = await rpc('activitySnapshot');
    const owner = snapshot.bots.find((bot) => bot.slug === scene.owner.slug);
    return owner &&
      predicate(owner) &&
      frames.some(
        (frame) => frame.generation === snapshot.generation && frame.revision === snapshot.revision,
      )
      ? snapshot
      : false;
  }, label + ' Host + SSE');
  const owner = snapshot.bots.find((bot) => bot.slug === scene.owner.slug);
  if (label === 'concurrent')
    assert.deepEqual(
      owner.activity?.sources?.map((source) => source.role),
      ['orchestrator'],
    );
  if (label === 'assignment-handoff')
    assert.deepEqual(
      owner.activity?.sources?.map((source) => source.role),
      ['assignment'],
    );
  const quiet = snapshot.bots.find((bot) => bot.slug === scene.quiet.slug);
  assert.equal(quiet.state, 'idle');
  const expected = owner.state;
  await page.waitForFunction(
    ({ name, expected }) =>
      [...document.querySelectorAll('.bh-group-channel-header .bh-persona-avatar')].some(
        (node) => node.title.startsWith(name) && node.dataset.state === expected,
      ),
    {},
    { name: scene.owner.name, expected },
  );
  const quietNode = await page.$$eval(
    '.bh-group-channel-header .bh-persona-avatar',
    (nodes, name) => nodes.find((node) => node.title.startsWith(name))?.dataset.state,
    scene.quiet.name,
  );
  assert.equal(quietNode, 'idle');
  if (expected !== 'idle') {
    const details = await page.$('.bh-composer-activity-status');
    assert.ok(details);
    if (!(await details.evaluate((node) => node.open)))
      await page.click('.bh-composer-activity-status summary');
    await page.waitForFunction(
      ({ slug, expected }) =>
        document.querySelector(
          '.bh-composer-activity-bot[data-bot-id="' + slug + '"] .bh-persona-avatar',
        )?.dataset.state === expected,
      {},
      { slug: scene.owner.slug, expected },
    );
    const row = await page.$eval(
      '.bh-composer-activity-bot[data-bot-id="' + scene.owner.slug + '"]',
      (node) => node.textContent,
    );
    assert.ok(row.includes(scene.owner.name));
    if (owner.activity?.sources?.some((source) => source.role === 'assignment'))
      assert.match(row, /Assignment|任务会话/);
    if (owner.activity?.sources?.some((source) => source.role === 'orchestrator'))
      assert.match(row, /Orchestrator|主会话/);
    assert.doesNotMatch(row, /setTimeout|120000|45000|PRIVATE_/);
    assert.equal(await page.$$eval('.bh-composer-activity-bot', (nodes) => nodes.length), 1);
    await page.click('[data-group-channel-name]');
    await page.waitForFunction(
      ({ slug, expected }) =>
        document.querySelector(
          '.bh-group-activity-chip[data-bot-id="' + slug + '"] .bh-persona-avatar',
        )?.dataset.state === expected,
      {},
      { slug: scene.owner.slug, expected },
    );
    await shot(label + '-popover-light');
    await page.keyboard.press('Escape');
  } else {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.bh-composer-activity-status .bh-persona-avatar')].every(
        (node) => node.dataset.state === 'idle',
      ),
    );
    assert.equal(owner.activity, undefined);
    assert.ok(
      (owner.sessions ?? []).every((session) => !['working', 'thinking'].includes(session.state)),
    );
    const retained = await page.$('.bh-composer-activity-status');
    if (retained) {
      const summary = await page.$eval('.bh-composer-activity-summary', (node) => node.textContent);
      assert.doesNotMatch(summary, /正在执行|正在思考|Executing|Thinking/);
    }
  }
  proof.phases.push({
    label,
    generation: snapshot.generation,
    revision: snapshot.revision,
    owner,
    quiet,
  });
  return snapshot;
}
try {
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await openGroup();
  await shot('pending-light');
  for (const { approval } of approvedRoles)
    assert.equal(
      (
        await rpc('toolApprovalDecide', {
          channelId: dmId,
          messageId: approval.id,
          outcome: 'allowed-once',
        })
      ).accepted,
      true,
    );
  await verifyPhase(
    'concurrent',
    (owner) =>
      owner.state === 'working' &&
      !owner.attention?.approvalCount &&
      ['orchestrator', 'assignment'].every((role) =>
        owner.sessions?.some((session) => session.role === role && session.state === 'working'),
      ),
  );
  await shot('concurrent-light');
  await page.setOfflineMode(true);
  await delay(1500);
  const count = frames.length;
  await page.setOfflineMode(false);
  const recovered = await waitFor(async () => {
    const snapshot = await rpc('activitySnapshot');
    return frames
      .slice(count)
      .some(
        (frame) => frame.generation === snapshot.generation && frame.revision === snapshot.revision,
      )
      ? snapshot
      : false;
  }, 'new snapshot after disconnect');
  proof.reconnect = {
    generation: recovered.generation,
    revision: recovered.revision,
    freshFrame: true,
  };
  await verifyPhase(
    'assignment-handoff',
    (owner) =>
      owner.state === 'working' &&
      owner.sessions?.some(
        (session) => session.role === 'assignment' && session.state === 'working',
      ) &&
      !owner.sessions?.some(
        (session) =>
          session.role === 'orchestrator' && ['working', 'thinking'].includes(session.state),
      ) &&
      owner.activity?.sources?.some((source) => source.role === 'assignment'),
  );
  await shot('assignment-handoff-light');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await shot('assignment-handoff-dark');
  await page.setViewport({ width: 420, height: 860 });
  await shot('assignment-handoff-narrow-dark');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewport({ width: 1500, height: 1000 });
  await waitFor(
    async () =>
      (await rpc('channelMessages', { channelId: scene.channelId })).messages.some(
        (message) =>
          message.at >= sent.message.at &&
          message.author.kind === 'bot' &&
          message.author.slug === scene.owner.slug &&
          message.body.includes(marker),
      ),
    'actual Group completion reply',
  );
  await verifyPhase('completed', (owner) => owner.state === 'idle');
  await shot('completed-dark');
  for (const row of approvedRoles) {
    const native = await nativeSnapshot(row.sessionId);
    writeFileSync(resolve(privateDir, 'native-' + row.role + '.json'), JSON.stringify(native));
    const call = nativeTimerCall(native.records, Date.parse(sent.message.at), timers[row.role]);
    const result = native.records.find(
      (record) =>
        record.event.type === 'tool/result' &&
        record.event.data.message.toolCallId === call.data.callId,
    )?.event;
    assert.ok(result, 'completed native timer result');
    assert.equal(result.data.message.isError, false);
    assert.equal(result.data.error, undefined);
    proof.nativeTimers.push({
      role: row.role,
      tool: call.data.name,
      callAt: call.time,
      resultAt: result.time,
      completed: true,
      isError: false,
    });
  }
  assert.deepEqual(errors, []);
  proof.completion = (await rpc('channelMessages', { channelId: scene.channelId })).messages
    .filter(
      (message) =>
        message.at >= sent.message.at &&
        message.author.kind === 'bot' &&
        message.author.slug === scene.owner.slug &&
        message.body.includes(marker),
    )
    .map(({ id, at, author, body }) => ({ id, at, author, body }));
  assertGroupAssignmentCompletion(proof);
  proof.clientErrors = errors;
  proof.verdict = 'PASS';
  writeFileSync(resolve(evidence, 'runtime-proof.json'), JSON.stringify(proof, null, 2));
  console.log(
    JSON.stringify({
      success: true,
      group: scene.name,
      phases: proof.phases.map((phase) => phase.label),
    }),
  );
} catch (error) {
  await page.screenshot({ path: resolve(privateDir, 'failure.png') });
  writeFileSync(
    resolve(privateDir, 'failure-dom.json'),
    JSON.stringify(
      await page.evaluate(() => ({
        groupName: document.querySelector('[data-group-channel-name]')?.outerHTML,
        popover: document.querySelector('.bh-profile-popover')?.outerHTML,
        chips: [...document.querySelectorAll('.bh-group-activity-chip')].map(
          (node) => node.outerHTML,
        ),
        header: [...document.querySelectorAll('.bh-group-channel-header .bh-persona-avatar')].map(
          (node) => ({ title: node.title, state: node.dataset.state }),
        ),
      })),
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
