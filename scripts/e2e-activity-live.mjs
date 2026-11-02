import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { installed, assignmentProbe } from './e2e-assignment-probe.mjs';
assert.ok(
  process.env.BH_E2E_INSTANCE,
  'Set BH_E2E_INSTANCE to this task’s verify-app instance.json',
);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const { rpc } = assignmentProbe({ origin: new URL(instance.url).origin, home: instance.home });
const out = resolve(process.env.BH_E2E_INSTANCE, '..', 'evidence', 'activity-live');
mkdirSync(out, { recursive: true });
const browser = await installed('puppeteer').launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
const consoleMessages = [];
page.on('console', (message) =>
  consoleMessages.push({ type: message.type(), text: message.text() }),
);
const requests = [];
const sockets = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (req) => {
  if (req.url().endsWith('/humanAttention')) requests.push(Date.now());
});
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.webSocketCreated', (e) => sockets.push(new URL(e.url).pathname));
await page.evaluateOnNewDocument(() => {
  const Native = window.WebSocket;
  window.qaSockets = [];
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      window.qaSockets.push(this);
    }
  };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (name) => {
  for (const button of await page.$$('button')) {
    if (!(await button.isVisible())) continue;
    const matches = await button.evaluate(
      (element, label) =>
        element.getAttribute('aria-label') === label || element.textContent.trim() === label,
      name,
    );
    if (matches) {
      await button.click();
      return;
    }
  }
  throw Error('Visible button unavailable: ' + name);
};
const dismiss = async () => {
  for (let i = 0; i < 5; i++) {
    const label = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (e) =>
            [
              'Continue',
              '继续',
              'Configure later',
              '稍后配置',
              'Skip tutorial',
              '跳过教程',
              '跳过引导',
              '稍后继续',
            ].includes(e.textContent.trim()) && e.offsetParent !== null,
        )
        ?.textContent.trim(),
    );
    if (!label) break;
    await click(label);
    await sleep(250);
  }
};
const shot = async (name) => {
  await page.screenshot({ path: out + '/' + name + '.png' });
  writeFileSync(
    out + '/' + name + '.aria.json',
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};
const wait = async (test, label, ms = 120000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const result = await test();
    if (result) return result;
    await sleep(250);
  }
  throw Error('Timed out: ' + label);
};
try {
  await page.setViewport({ width: 1440, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot 模式"]');
  await sleep(500);
  await dismiss();
  await click('Bot 模式');
  await sleep(1000);
  await dismiss();
  const label = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="活动中心"]')]
      .find((e) => e.offsetParent !== null)
      .getAttribute('aria-label'),
  );
  await click(label);
  await page.waitForSelector('.bh-activity-section-empty');
  await sleep(1000);
  const idleStart = requests.length;
  await sleep(12000);
  assert.equal(requests.length, idleStart, 'healthy Activity must not poll');
  const healthyIdleQueries = requests.length - idleStart;
  let slow = true;
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    if (slow && req.url().endsWith('/humanAttention')) await sleep(350);
    await req.continue();
  });
  const emptyBefore = await page.$eval('.bh-activity-center', (e) => e.innerHTML);
  const beforeCreate = requests.length;
  const created = await rpc('create', {
    displayName: 'Activity QA',
    persona:
      'You are a disposable verification bot. Follow the requested exact short response. Use bot_send_message for replies. Never modify files or settings.',
  });
  const slug = created.bot?.slug ?? created.slug ?? created.record?.slug;
  assert.ok(slug, 'created Bot slug: ' + JSON.stringify(Object.keys(created)));
  await wait(() => requests.length > beforeCreate, 'live invalidation after creation', 3000);
  assert.equal(
    await page.$eval('.bh-activity-center', (e) => e.innerHTML),
    emptyBefore,
    'background read retains the loaded empty DOM',
  );
  await shot('background-refresh-stable');
  await sleep(500);
  slow = false;
  await rpc('modelPlanCustomize', {
    slug,
    orchestrator: {
      provider: process.env.BH_QA_PROVIDER ?? 'deepseek-official',
      model: process.env.BH_QA_MODEL ?? 'deepseek-flash',
      effort: 'low',
    },
  });
  const { channel } = await rpc('channelDm', { slug });
  console.log(JSON.stringify({ slug, channelId: channel.id }));
  const messagesLabel = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="消息"]')]
      .find((e) => e.offsetParent !== null)
      ?.getAttribute('aria-label'),
  );
  assert.ok(messagesLabel, 'Messages workspace control');
  await click(messagesLabel);
  const started = Date.now();
  await rpc('channelSend', {
    channelId: channel.id,
    body: 'Reply exactly with ACTIVITY_LIVE_2230_READY. Use bot_send_message; do not use other tools.',
  });
  const canonical = await wait(async () => {
    const items = (await rpc('humanAttention', { category: 'unread', channelId: channel.id }))
      .items;
    return items.find((x) => x.summary.includes('ACTIVITY_LIVE_2230_READY'));
  }, 'real model reply');
  const observed = Date.now();
  await page.waitForFunction(
    (id) => document.querySelector(`[data-attention-id="${id}"]`),
    { timeout: 3000 },
    canonical.id,
  );
  const shown = Date.now();
  const messages = await rpc('channelMessages', { channelId: channel.id });
  assert.ok(
    messages.messages.some(
      (m) => m.id === canonical.messageId && m.body.includes('ACTIVITY_LIVE_2230_READY'),
    ),
  );
  await shot('cross-channel-arrival');
  await page
    .locator(`[data-attention-id="${canonical.id}"] ::-p-aria([name="标为已读"][role="button"])`)
    .click();
  await page.waitForSelector(`[data-attention-id="${canonical.id}"]`, {
    hidden: true,
    timeout: 3000,
  });
  assert.equal(
    (await rpc('humanAttention', { category: 'unread', channelId: channel.id })).items.length,
    0,
  );
  await shot('marked-read');
  await page.setOfflineMode(true);
  await page.evaluate(() => window.qaSockets.forEach((socket) => socket.close()));
  await sleep(500);
  await rpc('channelSend', {
    channelId: channel.id,
    body: 'Reply exactly with ACTIVITY_RECONNECTED_2230. Use bot_send_message; do not use other tools.',
  });
  const offline = await wait(
    async () =>
      (await rpc('humanAttention', { category: 'unread', channelId: channel.id })).items.find((x) =>
        x.summary.includes('ACTIVITY_RECONNECTED_2230'),
      ),
    'reply while browser offline',
  );
  assert.equal(
    await page.$(`[data-attention-id="${offline.id}"]`),
    null,
    'offline carrier cannot deliver the new item',
  );
  await page.setOfflineMode(false);
  await page.waitForFunction(
    (id) => document.querySelector(`[data-attention-id="${id}"]`),
    { timeout: 15000 },
    offline.id,
  );
  await shot('reconnected');

  assert.ok(
    sockets.filter((path) => path === '/api/remote.mux').length >= 2,
    'a new real WebSocket reconnects',
  );
  const sourceLabel = await page.$eval(
    `[data-attention-id="${offline.id}"] .bh-human-inbox-source-link`,
    (e) => e.getAttribute('aria-label'),
  );
  await click(sourceLabel);
  await page.waitForSelector(`.bh-bubble-wrap[data-message-id="${offline.messageId}"]`);
  await shot('same-message-source');
  const questionBot = await rpc('create', {
    displayName: 'Activity Request QA',
    persona:
      'Follow verification instructions exactly. Use group_join_request for the selected Group when asked; do not modify files or settings.',
  });
  const qslug = questionBot.bot.slug;
  await rpc('modelPlanCustomize', {
    slug: qslug,
    orchestrator: {
      provider: process.env.BH_QA_PROVIDER ?? 'deepseek-official',
      model: process.env.BH_QA_MODEL ?? 'deepseek-flash',
      effort: 'low',
    },
  });
  const qchannel = (await rpc('channelDm', { slug: qslug })).channel;
  const group = (await rpc('channelCreate', { name: 'Activity QA Group', members: [slug] }))
    .channel;
  const reference = '#' + group.name;
  await rpc('channelSend', {
    channelId: qchannel.id,
    body:
      reference +
      '\nCall group_join_request for this selected Group now, then send REQUESTED in this DM. Do not ask any questions or run other tools.',
    channelRefs: [{ channelId: group.id, label: group.name, start: 0, end: reference.length }],
  });
  const question = await wait(
    async () =>
      (await rpc('humanAttention', { category: 'action', channelId: group.id })).items.find(
        (x) => x.kind === 'group-join-request',
      ),
    'real pending group join request',
  );
  await page.waitForFunction(
    (id) => document.querySelector(`[data-attention-id="${id}"]`),
    { timeout: 3000 },
    question.id,
  );
  await shot('cross-channel-request');
  const cli = promisify(execFile)(
    process.execPath,
    [
      'packages/deepseekbot/dist/deepseekbot.mjs',
      'inbox-watch',
      '--category',
      'action',
      '--watch-seconds',
      '5',
    ],
    {
      env: {
        ...process.env,
        DEEPSEEKBOT_HOST: new URL(instance.url).origin,
        DEEPSEEKBOT_HOST_TOKEN: new URL(instance.url).searchParams.get('token'),
      },
    },
  );
  await sleep(500);
  await rpc('humanAttentionSnooze', {
    itemId: question.id,
    sourceKey: question.sourceEventId ?? '',
    until: new Date(Date.now() + 2000).toISOString(),
  });
  await page.waitForSelector(`[data-attention-id="${question.id}"]`, {
    hidden: true,
    timeout: 1500,
  });
  await page.waitForSelector(`[data-attention-id="${question.id}"]`, { timeout: 3000 });
  const decided = await rpc('channelGroupJoinDecide', {
    channelId: group.id,
    requestId: question.requestId,
    accept: false,
  });
  await page.waitForSelector(`[data-attention-id="${question.id}"]`, {
    hidden: true,
    timeout: 3000,
  });
  assert.equal(
    decided.channel.joinRequests.find((request) => request.id === question.requestId).status,
    'declined',
  );
  const cliResult = JSON.parse((await cli).stdout);
  assert.ok(cliResult.invalidations > 0);
  await shot('request-resolved');
  const result = {
    canonical,
    offline,
    question,
    cli: cliResult,
    modelReplyMs: observed - started,
    uiAfterCanonicalMs: shown - observed,
    healthyIdleQueries,
    sockets,
    errors,
  };
  writeFileSync(out + '/proof.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (e) {
  await shot('failure');
  writeFileSync(
    out + '/failure.json',
    JSON.stringify({ error: e.message, errors, sockets }, null, 2),
  );
  console.error(e);
  process.exitCode = 1;
} finally {
  writeFileSync(out + '/console.json', JSON.stringify(consoleMessages, null, 2));
  await browser.close();
}
