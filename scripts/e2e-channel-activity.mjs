import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_CHANNEL_ACTIVITY_QA_PORT ?? 32018);
const home = resolve(
  process.env.BH_CHANNEL_ACTIVITY_QA_HOME ?? resolve(tmpdir(), 'bh-703-channel-activity'),
);
const out = resolve(repo, '.humanlayer/tasks/issue-703', mode === 'before' ? 'before' : 'evidence');
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
    const existing = (await rpc('list')).bots;
    const bots = [];
    for (const name of ['Release QA', 'Review QA'])
      bots.push(
        existing.find((b) => b.displayName === name) ??
          (
            await rpc('create', {
              displayName: name,
              persona:
                'Reply exactly CHANNEL_READY using bot_send_message once; no tools or Assignments.',
            })
          ).bot,
      );
    const dm = (await rpc('channelDm', { slug: bots[0].slug })).channel;
    if (
      !(await rpc('channelMessages', { channelId: dm.id })).messages.some(
        (m) => m.author.kind === 'bot' && m.body.includes('CHANNEL_READY'),
      )
    ) {
      await rpc('channelSend', {
        channelId: dm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Send one Channel reply exactly CHANNEL_READY; no other work.',
      });
      await waitFor(
        async () =>
          (await rpc('channelMessages', { channelId: dm.id })).messages.some(
            (m) => m.author.kind === 'bot' && m.body.includes('CHANNEL_READY'),
          ),
        'live model',
      );
    }
    const all = (await rpc('channels')).channels;
    const group =
      all.find((c) => c.name === 'Release room') ??
      (await rpc('channelCreate', { name: 'Release room', members: bots.map((b) => b.slug) }))
        .channel;
    for (const bot of bots)
      await rpc('channelGroupWakeSet', {
        channelId: group.id,
        botSlug: bot.slug,
        mode: 'silent',
        count: 20,
        intervalSeconds: 300,
      });
    await rpc('channelHumanNameSet', { channelId: group.id, nickname: 'Captain' });
    let messages = (await rpc('channelMessages', { channelId: group.id })).messages;
    for (let n = messages.length; n < 6; n++)
      await rpc('channelSend', {
        channelId: group.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Release checklist ' + (n + 1) + ': review deployment readiness.',
      });
    const quiet =
      all.find((c) => c.name === 'Planning room') ??
      (await rpc('channelCreate', { name: 'Planning room', members: [] })).channel;
    writeFileSync(
      resolve(out, 'scene.json'),
      JSON.stringify({
        dm: dm.id,
        group: group.id,
        quiet: quiet.id,
        bots: bots.map((b) => b.slug),
      }),
    );
    console.log('Prepared isolated Channels with a real model reply');
  } else {
    await overview();
    if (mode !== 'before') {
      await page.waitForSelector('[data-activity-total]');
      const stats = await rpc('channelActivityToday');
      const expectedGroup = (await rpc('channelMessages', { channelId: 'group-release-room' }))
        .messages.length;
      assert.equal(stats.total, expectedGroup + 2);
      const scene = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
      const group = stats.channels.find((c) => c.channelId === scene.group);
      assert.equal(group.total, expectedGroup);
      assert.equal(group.human, expectedGroup);
      assert.equal(group.bot, 0);
      const dm = stats.channels.find((c) => c.channelId === scene.dm);
      assert.equal(dm.total, 2);
      assert.equal(dm.human, 1);
      assert.equal(dm.bot, 1);
      const unread = await rpc('humanAttentionStatus');
      await page.click('[data-activity-channel="' + scene.group + '"] .bh-channel-activity-toggle');
      assert.ok(
        await page.$eval('[data-activity-channel="' + scene.group + '"]', (n) =>
          n.textContent.includes('Captain'),
        ),
      );
      assert.deepEqual(await rpc('humanAttentionStatus'), unread);
      await page.click('[data-activity-channel="' + scene.dm + '"] .bh-channel-activity-toggle');
      assert.ok(
        await page.$eval('[data-activity-channel="' + scene.dm + '"]', (n) =>
          n.textContent.includes('Release QA'),
        ),
      );
      const measure = await page.evaluate(() => ({
        rows: [...document.querySelectorAll('.bh-channel-activity-row')].map((n) => ({
          height: n.getBoundingClientRect().height,
          padding: getComputedStyle(n).padding,
        })),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        shell: [...document.querySelectorAll('button')]
          .filter((n) => ['新会话', '设置'].includes(n.textContent.trim()))
          .map((n) => ({ label: n.textContent.trim(), height: n.getBoundingClientRect().height })),
      }));
      writeFileSync(resolve(out, 'measure.json'), JSON.stringify(measure, null, 2));
      assert.equal(measure.overflow, false);
    }
    await theme(false);
    await delay(400);
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
    if (mode !== 'before') {
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      const scene = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
      await theme(false);
      await page.click('[aria-label="打开 Channel: Release room"]');
      await page.waitForSelector('.bh-channel-options');
      await page.waitForFunction(() => document.body.textContent.includes('Release checklist 6'));
      assert.ok(
        await page.evaluate(() => document.body.textContent.includes('Release checklist 6')),
      );
      await shot('channel-navigation');
      await overview();
      await page.waitForSelector('[data-activity-total]');
      await page.click('[data-activity-channel="' + scene.group + '"] .bh-channel-activity-toggle');
      const beforeLate = await rpc('channelActivityToday');
      const existing = await rpc('channelMessages', { channelId: scene.group });
      if (!existing.messages.some((message) => message.body === 'Daily activity follow-up')) {
        await rpc('channelSend', {
          channelId: scene.group,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Daily activity follow-up',
        });
        await click('.bh-channel-activity button', '更新活跃度');
        await page.waitForFunction(
          (total) => document.querySelector('[data-activity-total]')?.textContent === String(total),
          {},
          beforeLate.total + 1,
        );
        assert.equal((await rpc('channelActivityToday')).total, beforeLate.total + 1);
      }
      writeFileSync(
        resolve(out, 'result.json'),
        JSON.stringify({
          total: (await rpc('channelActivityToday')).total,
          group: (await rpc('channelMessages', { channelId: scene.group })).messages.length,
          dm: 2,
          modelReply: true,
          expansionPreservesUnread: true,
          navigation: true,
          lateCommitRefresh: true,
        }),
      );
    }
    console.log('Captured and verified real Overview');
  }
} finally {
  await browser.close();
}
