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
const privateDir = resolve('.humanlayer/tasks/123-question-attention');
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
async function requestQuestion(scene) {
  const previous = new Set(
    (await rpc('channelMessages', { channelId: scene.channelId })).messages.map((m) => m.id),
  );
  await rpc('channelSend', {
    channelId: scene.channelId,
    messageId: `human-${crypto.randomUUID()}`,
    body: 'Use native ask_user_question exactly once. Question id release-route: "Which release channel should I use?" Options Canary and Stable. Wait for the actual Human answer, then use bot_send_message to report it in this DM beginning ANSWER_QA:. Do not create Assignments or ask again.',
  });
  const request = await waitFor(
    async () =>
      (await rpc('channelMessages', { channelId: scene.channelId })).messages.find(
        (message) => !previous.has(message.id) && message.userQuestionRequest,
      ),
    'real model question',
  );
  await waitFor(
    async () => (await host(scene.slug)).attention?.questionCount === 1,
    'Host question count',
  );
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
            nodes.every((node) => node.getAttribute('data-question-count') === String(count))
        : nodes.length === 0;
    },
    { timeout: 20000 },
    { channelId: scene.channelId, count },
  );
  if (count) {
    const summary = await page.$eval('.bh-composer-activity-summary', (node) => node.textContent);
    assert.match(summary, /1 个问题待回答|1 question(?:s)? awaiting an answer/);
  }
}
async function prepare() {
  const bot = (
    await rpc('create', {
      displayName: `Question attention Human QA ${Date.now()}`,
      persona:
        'Follow the Human precisely. Use the native ask_user_question Tool when requested and await the Human answer. Report the actual returned answer through bot_send_message in your DM. Do not ask again or create Assignments.',
    })
  ).bot;
  const channelId = (await rpc('channelDm', { slug: bot.slug })).channel.id;
  const model = (await rpc('modelCatalog')).models.find(
    (model) => model.model.includes('flash') && model.efforts.some((effort) => effort.id === 'low'),
  );
  assert.ok(model, 'qualified Flash low route');
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: bot.displayName,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  return { slug: bot.slug, channelId, displayName: bot.displayName };
}
try {
  if (mode === 'restarted') {
    const scene = JSON.parse(readFileSync(statePath, 'utf8'));
    const baseline = await host(scene.slug);
    assert.notEqual(baseline.generation, scene.beforeRestart.generation);
    assert.equal(baseline.attention, undefined);
    assert.equal(baseline.state, 'idle');
    const historical = await rpc('userQuestionStatus', {
      channelId: scene.channelId,
      messageId: scene.restartRequest.id,
    });
    assert.equal(historical.status, 'expired');
    await open(scene.channelId);
    await assertUI(scene, 0);
    await shot('restarted-history-no-attention');
    writeFileSync(
      resolve(evidence, 'restart-proof.json'),
      JSON.stringify(
        {
          baseline,
          historical,
          previousGeneration: scene.beforeRestart.generation,
          historicalRequestRetained: true,
        },
        null,
        2,
      ),
    );
    const humanScene = await prepare();
    await open(humanScene.channelId);
    const humanRequest = await requestQuestion(humanScene);
    await assertUI(humanScene, 1);
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await delay(200);
    await shot('human-qa-pending-question');
    await shot('pending-question-light');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await shot('pending-question-dark');
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    writeFileSync(statePath, JSON.stringify({ ...scene, humanScene, humanRequest }, null, 2));
    console.log('RESTART verified; Human QA pending question retained');
  } else {
    const scene = await prepare();
    const bot = { slug: scene.slug };
    const channelId = scene.channelId;
    await open(channelId);
    const request = await requestQuestion(scene);
    await assertUI(scene, 1);
    const pending = await host(bot.slug);
    assert.equal(pending.state, 'working');
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await delay(200);
    await shot('pending-question-light');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await shot('pending-question-dark');
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.bh-composer-shell');
    await assertUI(scene, 1);
    const refreshed = await host(bot.slug);
    assert.equal(refreshed.revision, pending.revision);
    await page.evaluate(() => document.querySelector('.bh-human-inbox-entry')?.click());
    await page.waitForSelector(`.bh-overview-bot[data-bot-id="${bot.slug}"] .bh-avatar-attention`);
    await shot('overview-question-attention');
    await open(channelId);
    await page.setOfflineMode(true);
    const offline = await page.$eval('.bh-avatar-attention', (node) => node.textContent);
    assert.equal(offline, '1');
    const answered = await rpc('userQuestionAnswer', {
      channelId,
      messageId: request.id,
      answer: {
        answers: request.userQuestionRequest.questions.map((question) => ({
          id: question.id,
          selected: ['Canary'],
        })),
      },
    });
    assert.equal(answered.accepted, true);
    const answeredHost = await host(bot.slug);
    assert.equal(answeredHost.attention, undefined);
    assert.ok(answeredHost.revision > pending.revision);
    await page.setOfflineMode(false);
    await assertUI(scene, 0);
    const reply = await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId })).messages.find(
          (message) =>
            message.author.kind === 'bot' &&
            message.body.startsWith('ANSWER_QA:') &&
            message.body.includes('Canary'),
        ),
      'real reply after native answer',
    );
    await waitFor(
      async () => (await host(bot.slug)).state === 'idle',
      'execution idle after answer',
    );
    await shot('reconnected-answer-cleared');
    const cancelledRequest = await requestQuestion(scene);
    await assertUI(scene, 1);
    const cancelled = await rpc(
      'cancel',
      { request: { sessionId: cancelledRequest.userQuestionRequest.sessionId } },
      'session',
    );
    assert.equal(cancelled.accepted, true);
    await waitFor(async () => !(await host(bot.slug)).attention, 'native cancel clears attention');
    await assertUI(scene, 0);
    await shot('native-cancel-cleared');
    const restartRequest = await requestQuestion(scene);
    await assertUI(scene, 1);
    const beforeRestart = await host(bot.slug);
    writeFileSync(statePath, JSON.stringify({ ...scene, restartRequest, beforeRestart }, null, 2));
    writeFileSync(
      resolve(evidence, 'proof.json'),
      JSON.stringify(
        {
          pending,
          refreshed,
          answeredHost,
          nativeReplyVerified: !!reply,
          nativeCancelAccepted: cancelled.accepted,
          offlineBadgeRetained: offline,
          restoredWithoutReload: true,
          frames,
          beforeRestart,
        },
        null,
        2,
      ),
    );
    console.log(
      'REAL MODEL, cross-surface attention, reload, offline answer/reconnect and native cancel verified; restart next',
    );
  }
} finally {
  await browser.close();
}
