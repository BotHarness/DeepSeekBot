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
const privateDir = resolve('.humanlayer/tasks/123-grant-attention');
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
    await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => {});
  }
  await page.waitForSelector(`[data-channel-id="${channelId}"]`);
  await page.click(`[data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-composer-shell');
}
const shot = async (name) => {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.includes('bh123-grant-workspace-'))
        node.textContent = node.textContent.replace(
          /[A-Z]:\\Users\\[^\\]+\\AppData\\Local\\Temp\\bh123-grant-workspace-[^\s]+/g,
          '[isolated QA workspace]',
        );
    }
  });
  return page.screenshot({ path: resolve(evidence, `${name}.png`) });
};
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
      displayName: `Workspace attention QA ${Date.now()}`,
      persona:
        'Follow exact Human requests. Request a Workspace Grant before delegated work if none is available. End the Turn after requesting it. After a Human Grant-linked authorization reply, use bot_send_message with GRANT_VERIFIED and the granted workspace title. Do not create an Assignment unless explicitly asked.',
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
  return { slug: bot.slug, displayName: bot.displayName, channelId };
}
async function start(scene) {
  await rpc('channelSend', {
    channelId: scene.channelId,
    messageId: `human-${crypto.randomUUID()}`,
    body: 'I want to delegate work in a project folder, but you have no authorized Workspace Grant. Call request_workspace_grant once with reason "Please authorize the QA project folder", then end this Turn. Do not create an Assignment yet. After actual Grant-linked Human authorization, use list_workspace_grants and bot_send_message GRANT_VERIFIED with the authorized workspace title.',
  });
  const request = await waitFor(
    async () =>
      (await rpc('humanAttention', { category: 'action', botSlug: scene.slug })).items.find(
        (item) => item.kind === 'workspace-grant-request',
      ),
    'real model-created Workspace Grant request',
  );
  await waitFor(async () => (await host(scene.slug)).state === 'idle', 'settled request');
  return request;
}
async function assertUI(scene, count) {
  await page.waitForFunction(
    ({ channelId, count }) => {
      const nodes = [
        ...document.querySelectorAll(
          `[data-channel-id="${channelId}"] .bh-avatar-attention, .bh-composer-activity-status .bh-avatar-attention`,
        ),
      ];
      return count
        ? nodes.length >= 2 &&
            nodes.every(
              (node) =>
                Number(node.dataset.workspaceGrantCount) === count &&
                node.textContent === String(count),
            )
        : nodes.length === 0;
    },
    { timeout: 20000 },
    { channelId: scene.channelId, count },
  );
}
async function authorize(scene, request) {
  const folder = resolve(tmpdir(), `bh123-grant-workspace-${scene.slug}`);
  mkdirSync(folder, { recursive: true });
  const workspace = await rpc('create', { request: { path: folder } }, 'workspace');
  const grant = (
    await rpc('grantCreate', { slug: scene.slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
  await rpc('channelSend', {
    channelId: scene.channelId,
    messageId: `human-${crypto.randomUUID()}`,
    body: 'Workspace authorized. Please confirm GRANT_VERIFIED.',
    replyTo: request.messageId,
    grantRequestResolution: { requestMessageId: request.messageId, grantId: grant.id },
  });
  await waitFor(
    async () => (await host(scene.slug)).attention === undefined,
    'authorized reply clears attention',
  );
  await waitFor(
    async () =>
      (await rpc('channelMessages', { channelId: scene.channelId })).messages.some(
        (message) => message.author.kind === 'bot' && message.body.includes('GRANT_VERIFIED'),
      ),
    'actual post-authorization model reply',
  );
  await waitFor(async () => (await host(scene.slug)).state === 'idle', 'confirmed idle');
}
try {
  if (mode === 'capture-pending') {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const scene = state.humanScene;
    await open(scene.channelId);
    await assertUI(scene, 1);
    await page.waitForFunction(() =>
      document.body.textContent.includes('Please authorize the QA project folder'),
    );
    await shot('grant-pending-light');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await page.waitForFunction(() =>
      document.body.textContent.includes('Please authorize the QA project folder'),
    );
    await delay(500);
    await shot('grant-pending-dark');
  } else if (mode === 'recapture') {
    const proof = JSON.parse(readFileSync(resolve(evidence, 'proof.json'), 'utf8'));
    const scene = { ...proof.scene, channelId: `dm-${proof.scene.slug}` };
    await open(scene.channelId);
    await assertUI(scene, 0);
    await shot('reconnected-authorized-idle');
  } else if (mode === 'before') {
    const scene = await prepare();
    const request = await start(scene);
    await open(scene.channelId);
    assert.equal((await host(scene.slug)).attention, undefined);
    await shot('before-grant-not-indicated');
    await rpc('humanAttentionDismiss', { itemId: request.id, sourceKey: request.sourceEventId });
  } else if (mode === 'restarted') {
    const scene = JSON.parse(readFileSync(statePath, 'utf8'));
    const baseline = await host(scene.slug);
    assert.notEqual(baseline.generation, scene.beforeRestart.generation);
    assert.deepEqual(baseline.attention, { approvalCount: 0, workspaceGrantCount: 1 });
    assert.equal(baseline.state, 'idle');
    await open(scene.channelId);
    await assertUI(scene, 1);
    await shot('restart-pending-grant');
    await authorize(scene, scene.restartRequest);
    await assertUI(scene, 0);
    await shot('restart-authorized-idle');
    const human = await prepare();
    const humanRequest = await start(human);
    await open(human.channelId);
    await assertUI(human, 1);
    await shot('human-qa-pending-grant');
    writeFileSync(
      statePath,
      JSON.stringify({ ...scene, humanScene: human, humanRequest }, null, 2),
    );
    writeFileSync(
      resolve(evidence, 'restart-proof.json'),
      JSON.stringify(
        {
          previousGeneration: scene.beforeRestart.generation,
          baseline,
          postRestartConfirmed: await host(scene.slug),
          durablePendingRetained: true,
          actualAuthorizationReply: true,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ restart: true, humanQA: human.displayName }));
  } else {
    const scene = await prepare();
    await open(scene.channelId);
    const request = await start(scene);
    await assertUI(scene, 1);
    const pending = await host(scene.slug);
    assert.deepEqual(pending.attention, { approvalCount: 0, workspaceGrantCount: 1 });
    await shot('grant-pending-light');
    await page.click('.bh-human-inbox-entry');
    await page.waitForSelector(
      `.bh-overview-bot[data-bot-id="${scene.slug}"] [data-workspace-grant-count="1"]`,
    );
    const overview = (await rpc('activityOverview')).bots.find((bot) => bot.slug === scene.slug);
    assert.deepEqual(overview.attention, pending.attention);
    assert.equal(overview.state, pending.state);
    await shot('overview-pending-grant');
    await open(scene.channelId);
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await shot('grant-pending-dark');
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bh-composer-shell');
    await assertUI(scene, 1);
    const refreshed = await host(scene.slug);
    assert.equal(refreshed.revision, pending.revision);
    await rpc('channelSend', {
      channelId: scene.channelId,
      messageId: `human-${crypto.randomUUID()}`,
      body: 'This is ordinary text only; no workspace authorization is being granted. Keep waiting for an actual Grant-linked authorization.',
    });
    await waitFor(async () => (await host(scene.slug)).state === 'idle', 'plain text settled');
    assert.equal((await host(scene.slug)).attention.workspaceGrantCount, 1);
    await page.setOfflineMode(true);
    await authorize(scene, request);
    await page.setOfflineMode(false);
    await assertUI(scene, 0);
    const resolved = await host(scene.slug);
    await shot('reconnected-authorized-idle');
    const dismissedScene = await prepare();
    const dismissedRequest = await start(dismissedScene);
    await open(dismissedScene.channelId);
    await assertUI(dismissedScene, 1);
    await rpc('humanAttentionDismiss', {
      itemId: dismissedRequest.id,
      sourceKey: dismissedRequest.sourceEventId,
    });
    await assertUI(dismissedScene, 0);
    assert.equal((await host(dismissedScene.slug)).state, 'idle');
    const restartScene = await prepare();
    const restartRequest = await start(restartScene);
    await open(restartScene.channelId);
    await assertUI(restartScene, 1);
    const beforeRestart = await host(restartScene.slug);
    await shot('before-restart-pending');
    writeFileSync(
      statePath,
      JSON.stringify({ ...restartScene, restartRequest, beforeRestart }, null, 2),
    );
    writeFileSync(
      resolve(evidence, 'proof.json'),
      JSON.stringify(
        {
          scene: { slug: scene.slug, displayName: scene.displayName },
          pending,
          refreshed,
          overview: { state: overview.state, attention: overview.attention },
          resolved,
          plainTextKeptPending: true,
          dismissalCleared: true,
          offlineReplyRecovered: true,
          beforeRestart,
          frames: frames
            .filter((frame) => frame.bots.some((bot) => bot.slug === scene.slug))
            .map((frame) => ({
              ...frame,
              bots: frame.bots.filter((bot) => bot.slug === scene.slug),
            })),
          clientErrors,
        },
        null,
        2,
      ),
    );
    assert.deepEqual(clientErrors, []);
    console.log(
      JSON.stringify({
        actualRequest: true,
        authorizedReply: true,
        plainText: true,
        dismissal: true,
        reconnect: true,
        restartReady: true,
      }),
    );
  }
} finally {
  await browser.close();
}
