import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_OVERVIEW_PRIORITY_QA_PORT ?? 32019);
const home = resolve(
  process.env.BH_OVERVIEW_PRIORITY_QA_HOME ?? resolve(tmpdir(), 'bh-705-overview-priority'),
);
const out = resolve(repo, '.humanlayer/tasks/issue-705', mode === 'before' ? 'before' : 'evidence');
mkdirSync(out, { recursive: true });
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch isolated DSH first');
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 60000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const shot = (name) =>
  page.screenshot({
    path: resolve(
      out,
      name + (mode === 'resume' && name !== 'overview-restarted' ? '-restart' : '') + '.png',
    ),
  });
const theme = async (dark) => {
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
  ]);
  await page.evaluate(async (dark) => {
    if (dark) document.body.setAttribute('data-ds-dark-theme', '');
    else document.body.removeAttribute('data-ds-dark-theme');
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }, dark);
};
const rpc = async (method, args = {}, client = page, namespace = 'botharness') =>
  client.evaluate(
    async ({ method, args, namespace }) => {
      const response = await fetch('/api/' + namespace + '/' + method, {
        method: 'POST',
        signal: AbortSignal.timeout(50000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: namespace + '/' + method,
          payload: { args },
        }),
      });
      if (!response.ok) throw new Error(method + ': HTTP ' + response.status);
      const result = (await response.json()).result;
      if (result?.ok !== true) throw new Error(method + ': ' + JSON.stringify(result?.error));
      return result.value;
    },
    { method, args, namespace },
  );
const click = async (selector, text, client = page) => {
  await client.waitForFunction(
    ({ selector, text }) =>
      [...document.querySelectorAll(selector)].some((n) => n.textContent?.trim() === text),
    {},
    { selector, text },
  );
  assert.ok(
    await client.evaluate(
      ({ selector, text }) => {
        const n = [...document.querySelectorAll(selector)].find(
          (n) => n.textContent?.trim() === text,
        );
        n?.click();
        return !!n;
      },
      { selector, text },
    ),
  );
};
const login = async (client) => {
  await client.goto(url, { waitUntil: 'domcontentloaded' });
  await client.goto(url, { waitUntil: 'domcontentloaded' });
  await client
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((n) =>
          ['继续', 'Continue'].includes(n.textContent?.trim() ?? ''),
        ),
      { timeout: 6000 },
    )
    .catch(() => undefined);
  await client.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((n) => ['继续', 'Continue'].includes(n.textContent?.trim() ?? ''))
      ?.click(),
  );
  await client.waitForSelector('.bh-panel-activity', { timeout: 5000 }).catch(async () => {
    await client.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) => n.textContent?.includes('Bot 模式'))
        ?.click(),
    );
    await client.waitForSelector('.bh-panel-activity');
  });
};
const _inbox = async (client = page) => {
  await client.bringToFront();
  await client.evaluate(() => document.querySelector('.bh-panel-activity')?.click());
  await client.waitForSelector('.bh-human-inbox-tabs');
  await click('.bh-human-inbox-tabs button', '需要我处理', client);
  await delay(700);
};
const _openDM = async (id, client = page) => {
  await client.bringToFront();
  await client.waitForSelector(`[data-channel-id="${id}"]`);
  await client.evaluate((id) => document.querySelector(`[data-channel-id="${id}"]`)?.click(), id);
  await client.waitForSelector('.bh-channel-options');
  await delay(700);
};
const waitFor = async (test, label) => {
  for (let n = 0; n < 60; n++) {
    const result = await test();
    if (result) return result;
    await delay(2000);
  }
  throw new Error('Timed out: ' + label);
};

const overview = async (client = page) => {
  await client.evaluate(() => document.querySelector('.bh-panel-activity')?.click());
  await client.waitForSelector('.bh-activity-center-header');
  await click('.bh-activity-center-header [role=tab]', '总览', client);
  await client.waitForSelector('.bh-overview');
};

try {
  await login(page);
  if (mode === 'prepare') {
    const all = (await rpc('list')).bots;
    const bot = async (displayName, persona) =>
      all.find((b) => b.displayName === displayName) ??
      (await rpc('create', { displayName, persona })).bot;
    const decision = await bot(
      'Release Choice QA',
      'Follow the Human precisely. Use native ask_user_question once when requested, then wait. No Assignments.',
    );
    const idle = await bot(
      'Release QA',
      'Reply only with requested marker using bot_send_message once. No other tools or Assignments.',
    );
    const dm = (await rpc('channelDm', { slug: idle.slug })).channel;
    if (
      !(await rpc('channelMessages', { channelId: dm.id })).messages.some(
        (m) => m.body.includes('CHANNEL_READY') && m.author.kind === 'bot',
      )
    ) {
      await rpc('channelSend', {
        channelId: dm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Reply exactly CHANNEL_READY using bot_send_message once.',
      });
      await waitFor(
        async () =>
          (await rpc('channelMessages', { channelId: dm.id })).messages.some(
            (m) => m.body.includes('CHANNEL_READY') && m.author.kind === 'bot',
          ),
        'real model reply',
      );
    }
    const channels = (await rpc('channels')).channels;
    const group =
      channels.find((c) => c.name === 'Release room') ??
      (await rpc('channelCreate', { name: 'Release room', members: [idle.slug, decision.slug] }))
        .channel;
    for (const member of group.members)
      await rpc('channelGroupWakeSet', {
        channelId: group.id,
        botSlug: member,
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      });
    for (
      let n = (await rpc('channelMessages', { channelId: group.id })).messages.length;
      n < 6;
      n++
    )
      await rpc('channelSend', {
        channelId: group.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Release checklist ' + (n + 1) + ': deployment readiness.',
      });
    const choiceDm = (await rpc('channelDm', { slug: decision.slug })).channel;
    if (
      !(await rpc('humanAttention', { category: 'action', botSlug: decision.slug })).items.some(
        (i) => i.kind === 'user-question',
      )
    )
      await rpc('channelSend', {
        channelId: choiceDm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Call native ask_user_question once: id release-route; question "Which release channel should I use?"; options Canary and Stable. Wait for the Human answer. No other tools or Assignment.',
      });
    await waitFor(
      async () =>
        (await rpc('humanAttention', { category: 'action', botSlug: decision.slug })).items.some(
          (i) => i.kind === 'user-question',
        ),
      'real native question',
    );
    writeFileSync(
      resolve(out, 'scene.json'),
      JSON.stringify({ decision: decision.slug, idle: idle.slug, dm: dm.id, group: group.id }),
    );
    console.log('PASS: real model reply, native pending question and group messages');
  } else {
    await overview();
    await delay(1000);
    const scene = JSON.parse(
      readFileSync(resolve(repo, '.humanlayer/tasks/issue-705/evidence/scene.json'), 'utf8'),
    );
    const prior = await rpc('humanAttentionStatus');
    const pending = (await rpc('humanAttention', { category: 'action' })).items;
    assert.ok(pending.some((i) => i.kind === 'user-question'));
    if (mode !== 'before') {
      await page.waitForSelector('.bh-channel-statistics-chart svg');
      assert.equal(await page.$('[data-bot-id="' + scene.idle + '"]'), null);
      await page.click('[data-activity-channel="' + scene.group + '"] .bh-channel-activity-toggle');
      assert.deepEqual(await rpc('humanAttentionStatus'), prior);
      const iconCount = await page.$$eval('.bh-overview-toolbar button', (buttons) =>
        buttons.map((b) => b.querySelectorAll('svg').length),
      );
      assert.ok(iconCount.every((n) => n > 0));
      const measure = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        toolbar: [...document.querySelectorAll('.bh-overview-toolbar button')].map((n) => ({
          height: n.getBoundingClientRect().height,
        })),
        chart: document.querySelector('.bh-channel-statistics-chart').getBoundingClientRect().width,
      }));
      assert.equal(measure.overflow, false);
      writeFileSync(resolve(out, 'measure.json'), JSON.stringify(measure));
    }
    await theme(false);
    await shot('overview-light');
    await theme(true);
    await shot('overview-dark');
    await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 1 });
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) => n.getAttribute('aria-label')?.includes('侧栏'))
        ?.click(),
    );
    await theme(false);
    await shot('overview-narrow-light');
    await theme(true);
    await shot('overview-narrow-dark');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    if (mode !== 'before') {
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await theme(false);
      await page.click('.bh-statistics-toggle');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await overview();
      await page.waitForSelector('[data-bot-id="' + scene.decision + '"] [data-attention-id]');
      await page.waitForSelector('[data-activity-total]');
      await delay(200);
      assert.equal(
        await page.$eval('.bh-statistics-toggle', (n) => n.getAttribute('aria-expanded')),
        'false',
      );
      await page.click('.bh-statistics-toggle');
      await page.waitForSelector('.bh-channel-statistics-chart svg');
      assert.ok(prior.unreadCount > 0, 'mark all read starts with genuine unread');
      await page.click('[data-mark-all-read]');
      await waitFor(
        async () => (await rpc('humanAttentionStatus')).unreadCount === 0,
        'mark all read',
      );
      const after = (await rpc('humanAttention', { category: 'action' })).items;
      assert.deepEqual(
        after.map((i) => i.id),
        pending.map((i) => i.id),
      );
      await page.waitForFunction(() => document.querySelector('[data-mark-all-read]')?.disabled);
      await shot('read-with-action-pending');
      await rpc('channelSend', {
        channelId: scene.dm,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Reply exactly CHANNEL_LATE_READY using bot_send_message once. No other work.',
      });
      await waitFor(
        async () => (await rpc('humanAttentionStatus')).unreadCount === 1,
        'later Bot message unread',
      );
      assert.equal((await rpc('humanAttentionStatus')).unreadCount, 1);
      await click(
        '[data-bot-id="' + scene.decision + '"] .bh-human-inbox-row-actions button',
        '回答问题',
      );
      await page.waitForSelector('.bh-question-card');
      await shot('pending-question-after-read');
      writeFileSync(
        resolve(out, 'result.json'),
        JSON.stringify({
          realModelReply: true,
          nativeQuestion: true,
          unreadBefore: prior.unreadCount,
          allRead: true,
          requestsUnchanged: true,
          lateUnread: 1,
          statisticsPersistence: true,
          nativeIcons: true,
          chart: true,
        }),
      );
      console.log(
        'PASS: actual stacked chart, icons, collapse persistence, mark all read, requests remain actionable, late message unread',
      );
    }
  }
} catch (error) {
  await shot('diagnostic-error');
  console.log(
    JSON.stringify(
      await page.evaluate(() => ({
        expanded: document.querySelector('.bh-statistics-toggle')?.getAttribute('aria-expanded'),
        hidden: document.querySelector('.bh-statistics-content')?.hidden,
        alerts: [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent),
        charts: document.querySelectorAll('.bh-channel-statistics-chart').length,
        title: document.querySelector('.bh-channel-activity header')?.textContent,
      })),
    ),
  );
  throw error;
} finally {
  await browser.close();
}
