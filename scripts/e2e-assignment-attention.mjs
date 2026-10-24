import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const mode = process.argv[2] ?? 'check';
assert.ok(origin && home && evidence, 'set BH_E2E_ORIGIN, HOME and EVIDENCE');
mkdirSync(evidence, { recursive: true });
const privateDir = resolve('.humanlayer/tasks/123-assignment-attention');
mkdirSync(privateDir, { recursive: true });
const statePath = resolve(privateDir, 'qa-state.json');
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}, namespace = 'botharness') {
  const response = await fetch(`${origin}/api/${namespace}/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: `${namespace}/${method}`,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()).result;
  assert.equal(
    result?.ok,
    true,
    `${namespace}/${method} failed: ${result?.error?.code}: ${result?.error?.message}`,
  );
  return result.value;
}
const pnpm = resolve('node_modules/.pnpm');
const pkg = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
assert.ok(pkg);
const puppeteer = createRequire(resolve(pnpm, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const clientErrors = [];
page.on('pageerror', (error) => clientErrors.push(error.message));
await page.setViewport({ width: 1500, height: 1000 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
const separator = cookie.indexOf('=');
await browser.setCookie({
  name: cookie.slice(0, separator),
  value: cookie.slice(separator + 1),
  domain: new URL(origin).hostname,
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const frames = [];
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.eventSourceMessageReceived', (event) => {
  if (event.eventName !== 'activity/snapshot') return;
  const value = JSON.parse(event.data);
  frames.push({
    generation: value.generation,
    revision: value.revision,
    bots: value.bots.map(({ slug, state, attention }) => ({ slug, state, attention })),
  });
});
async function waitFor(test, label) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const value = await test();
    if (value) return value;
    await delay(1000);
  }
  throw Error(`Timed out: ${label}`);
}
async function open(channelId) {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await delay(500);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  if (!(await page.$('.bh-main')))
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-main') ||
      [...document.querySelectorAll('button')].some((button) =>
        ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
      ),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page.waitForSelector(`[data-channel-id="${channelId}"]`);
  await page.click(`[data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-composer-shell');
}
const shot = (name) => page.screenshot({ path: resolve(evidence, `${name}.png`) });
async function host(slug) {
  const snapshot = await rpc('activitySnapshot');
  return {
    generation: snapshot.generation,
    revision: snapshot.revision,
    ...snapshot.bots.find((bot) => bot.slug === slug),
  };
}
async function prepare() {
  const bot = (
    await rpc('create', {
      displayName: `Assignment attention Human QA ${Date.now()}`,
      persona:
        'Follow Human instructions precisely. Create one Assignment only when asked. Forward Human decisions to that Assignment with send_assignment_request and exact answer_to. Do not answer a question reserved for the Human yourself. End the current turn while awaiting a Human decision.',
    })
  ).bot;
  const channelId = (await rpc('channelDm', { slug: bot.slug })).channel.id;
  const model = (await rpc('modelCatalog')).models.find(
    (model) => model.model.includes('flash') && model.efforts.some((effort) => effort.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: bot.displayName,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const folder = resolve(tmpdir(), `bh123-attention-workspace-${bot.slug}`);
  mkdirSync(folder, { recursive: true });
  const workspace = await rpc('create', { request: { path: folder } }, 'workspace');
  const grant = (
    await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
  return { slug: bot.slug, displayName: bot.displayName, channelId, grantId: grant.id };
}
async function start(scene, state) {
  const tag = `${state.replace('-', '_').toUpperCase()}_QA_${Date.now()}`;
  await rpc('channelSend', {
    channelId: scene.channelId,
    messageId: `human-${crypto.randomUUID()}`,
    body: `Create exactly one Assignment with Grant ${scene.grantId}, continuity key ${tag}. Its purpose must instruct it to report_to_orchestrator state ${state}, summary "${tag}: Which release route should I use, Canary or Stable?", expects_reply true, then end the Turn. It must use no other tools until an actual Human response. On resume with the Human route it must report_to_orchestrator completed with summary "${tag}_DONE:" plus the route. You, the Orchestrator, must not answer the question yourself. After create_assignment, end your Turn. On that report, use bot_send_message to say "${tag}: waiting for Human" and end your Turn. Once the Human explicitly responds, inspect_assignment and forward the exact Human response through send_assignment_request with answer_to equal to the openAsk Source Event ID and mode next-turn. After completed report use bot_send_message to say "${tag}: finished".`,
  });
  const action = await waitFor(
    async () =>
      (await rpc('humanAttention', { category: 'action', botSlug: scene.slug })).items.find(
        (item) => item.summary.includes(tag),
      ),
    'real Assignment report',
  );
  assert.equal(
    action.kind,
    state === 'blocked' ? 'assignment-blocked' : 'assignment-waiting-human',
  );
  await waitFor(
    async () => (await host(scene.slug)).state === 'idle',
    'Orchestrator and Assignment turns settled',
  );
  return { tag, sessionId: action.assignmentSessionId, sourceEventId: action.sourceEventId };
}
async function assertUI(scene, waiting, blocked) {
  await page.waitForFunction(
    ({ channelId, waiting, blocked }) => {
      const nodes = [
        ...document.querySelectorAll(
          `[data-channel-id="${channelId}"] .bh-avatar-attention, .bh-composer-activity-status .bh-avatar-attention`,
        ),
      ];
      return waiting + blocked > 0
        ? nodes.length >= 2 &&
            nodes.every(
              (node) =>
                Number(node.dataset.waitingHumanCount) === waiting &&
                Number(node.dataset.blockedCount) === blocked &&
                node.textContent === String(waiting + blocked),
            )
        : nodes.length === 0;
    },
    { timeout: 20000 },
    { channelId: scene.channelId, waiting, blocked },
  );
  if (waiting + blocked > 0) {
    const avatars = await page.$$eval(
      `[data-channel-id="${scene.channelId}"] .bh-persona-avatar, .bh-composer-activity-status .bh-persona-avatar`,
      (nodes) => nodes.map((node) => node.dataset.state),
    );
    assert.ok(
      avatars.every((state) => state === 'idle'),
      'durable attention does not fabricate running or waiting execution',
    );
  }
}
async function answer(scene, request) {
  await rpc('channelSend', {
    channelId: scene.channelId,
    messageId: `human-${crypto.randomUUID()}`,
    body: 'Use Canary for this Assignment.',
    assignmentReply: { sessionId: request.sessionId, sourceEventId: request.sourceEventId },
  });
}
async function completed(scene, request) {
  await waitFor(
    async () =>
      (await rpc('assignment', { slug: scene.slug, sessionId: request.sessionId })).assignment
        .latestReport?.state === 'completed',
    'actual Assignment resumed and completed',
  );
  await waitFor(async () => (await host(scene.slug)).state === 'idle', 'settled execution');
}
try {
  if (mode === 'restarted') {
    const scene = JSON.parse(readFileSync(statePath, 'utf8'));
    const baseline = await host(scene.slug);
    assert.notEqual(baseline.generation, scene.beforeRestart.generation);
    assert.deepEqual(baseline.attention, { approvalCount: 0, waitingHumanCount: 1 });
    assert.equal(baseline.state, 'idle');
    await open(scene.channelId);
    await assertUI(scene, 1, 0);
    await shot('restarted-durable-waiting');
    writeFileSync(
      resolve(evidence, 'restart-proof.json'),
      JSON.stringify(
        {
          previousGeneration: scene.beforeRestart.generation,
          baseline,
          durablePendingRetained: true,
          historyDidNotFabricateExecution: true,
        },
        null,
        2,
      ),
    );
    await answer(scene, scene.restartRequest);
    await completed(scene, scene.restartRequest);
    await assertUI(scene, 0, 0);
    await shot('restart-answer-completed');
    const humanScene = await prepare();
    await open(humanScene.channelId);
    const humanRequest = await start(humanScene, 'waiting-human');
    await assertUI(humanScene, 1, 0);
    await shot('human-qa-pending-assignment');
    writeFileSync(statePath, JSON.stringify({ ...scene, humanScene, humanRequest }, null, 2));
    console.log(
      JSON.stringify({
        restartPendingRetained: true,
        actualPostRestartResponseCompleted: true,
        humanQA: humanScene.displayName,
      }),
    );
  } else {
    const scene = await prepare();
    await open(scene.channelId);
    const waiting = await start(scene, 'waiting-human');
    await assertUI(scene, 1, 0);
    const pending = await host(scene.slug);
    await shot('assignment-waiting-light');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await shot('assignment-waiting-dark');
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bh-composer-shell');
    await assertUI(scene, 1, 0);
    const refreshed = await host(scene.slug);
    assert.deepEqual(refreshed, pending);
    await page.click('.bh-human-inbox-entry');
    await page.waitForSelector(
      `.bh-overview-bot[data-bot-id="${scene.slug}"] .bh-avatar-attention`,
    );
    await page.waitForFunction(
      (slug) =>
        document.querySelector(
          `.bh-overview-bot[data-bot-id="${slug}"] [data-waiting-human-count="1"]`,
        ),
      {},
      scene.slug,
    );
    const overview = (await rpc('activityOverview')).bots.find((bot) => bot.slug === scene.slug);
    assert.deepEqual(overview.attention, pending.attention);
    assert.equal(overview.state, pending.state);
    await shot('overview-assignment-waiting');
    await open(scene.channelId);
    await page.setOfflineMode(true);
    await answer(scene, waiting);
    const answered = await host(scene.slug);
    assert.equal(answered.attention, undefined);
    assert.ok(answered.revision > pending.revision);
    await page.setOfflineMode(false);
    await completed(scene, waiting);
    await assertUI(scene, 0, 0);
    await shot('reconnected-answer-completed');
    const blocked = await start(scene, 'blocked');
    await assertUI(scene, 0, 1);
    const blockedSnapshot = await host(scene.slug);
    await shot('assignment-blocked');
    await rpc('channelSend', {
      channelId: scene.channelId,
      body: `Stop Assignment ${blocked.sessionId} using stop_assignment exactly once. Do not answer or continue its task. Then bot_send_message "Blocked Assignment stopped".`,
    });
    await waitFor(
      async () =>
        (await rpc('assignment', { slug: scene.slug, sessionId: blocked.sessionId })).assignment
          .activity === 'stopped',
      'real native Assignment stopped',
    );
    await waitFor(
      async () => !(await host(scene.slug)).attention && (await host(scene.slug)).state === 'idle',
      'stop clears canonical action',
    );
    await assertUI(scene, 0, 0);
    await shot('blocked-stopped');
    const restartRequest = await start(scene, 'waiting-human');
    await assertUI(scene, 1, 0);
    const beforeRestart = await host(scene.slug);
    writeFileSync(statePath, JSON.stringify({ ...scene, restartRequest, beforeRestart }, null, 2));
    writeFileSync(
      resolve(evidence, 'proof.json'),
      JSON.stringify(
        {
          pending,
          refreshed,
          answered,
          overview: { state: overview.state, attention: overview.attention },
          blocked: blockedSnapshot,
          offlineResponseAndReconnect: true,
          realAssignmentCompleted: true,
          realAssignmentStopped: true,
          beforeRestart,
          frames,
        },
        null,
        2,
      ),
    );
    console.log(
      'REAL Assignment report, response, completion, blocked stop and offline reconnect verified; restart next',
    );
  }
} catch (error) {
  await page.screenshot({ path: resolve(privateDir, 'failure.png') });
  writeFileSync(
    resolve(privateDir, 'failure.json'),
    JSON.stringify(
      { clientErrors, text: await page.evaluate(() => document.body.innerText) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
