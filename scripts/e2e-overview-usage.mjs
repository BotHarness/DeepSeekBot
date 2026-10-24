import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_OVERVIEW_USAGE_QA_PORT ?? 32023);
const home = resolve(
  process.env.BH_OVERVIEW_USAGE_QA_HOME ?? resolve(tmpdir(), 'bh-709-overview-usage'),
);
const out = process.env.BH_OVERVIEW_USAGE_QA_OUT
  ? resolve(process.env.BH_OVERVIEW_USAGE_QA_OUT)
  : resolve(repo, '.humanlayer/tasks/issue-709', mode === 'before' ? 'before' : 'evidence');
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
const shot = async (name) => {
  await page.evaluate(() => {
    const overview = document.querySelector('.bh-overview');
    if (overview) overview.scrollTop = 0;
  });
  return page.screenshot({
    path: resolve(
      out,
      name + (mode === 'resume' && name !== 'overview-restarted' ? '-restart' : '') + '.png',
    ),
  });
};
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
  const sceneFile = resolve(repo, '.humanlayer/tasks/issue-709/scene.json');
  if (mode === 'prepare') {
    const bots = [];
    const all = (await rpc('list')).bots;
    for (const name of ['Budget Writer QA', 'Budget Reviewer QA']) {
      const bot =
        all.find((bot) => bot.displayName === name) ??
        (
          await rpc('create', {
            displayName: name,
            persona:
              'Follow the Human precisely. Reply only with the exact requested marker using bot_send_message once. No Assignments or other tools.',
          })
        ).bot;
      const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
      if (
        !(await rpc('channelMessages', { channelId: dm.id })).messages.some(
          (message) => message.author.kind === 'bot' && message.body.includes('USAGE_READY'),
        )
      ) {
        await rpc('channelSend', {
          channelId: dm.id,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Reply exactly USAGE_READY using bot_send_message once. No other work.',
        });
        await waitFor(
          async () =>
            (await rpc('channelMessages', { channelId: dm.id })).messages.some(
              (message) => message.author.kind === 'bot' && message.body.includes('USAGE_READY'),
            ),
          'real model reply',
        );
      }
      bots.push({ slug: bot.slug, dm: dm.id, name });
    }
    await waitFor(async () => {
      const usage = await rpc('overviewUsage', { period: 'today' });
      return bots.every((bot) =>
        usage.bots.some((row) => row.slug === bot.slug && row.outputTokens > 0),
      );
    }, 'real usage settlements');
    writeFileSync(sceneFile, JSON.stringify({ bots }));
    console.log('Prepared two real Bot replies and observed usage');
  } else {
    const scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
    await overview();
    await page.waitForSelector('[data-activity-total]');
    if (
      (await page.$eval('.bh-statistics-toggle', (node) => node.getAttribute('aria-expanded'))) ===
      'false'
    )
      await page.click('.bh-statistics-toggle');
    if (mode === 'before') {
      for (const dark of [false, true]) {
        await theme(dark);
        await shot('overview-' + (dark ? 'dark' : 'light'));
      }
    } else {
      await page.waitForSelector('[data-usage-total]');
      const compare = async (period) => {
        await waitFor(async () => {
          const bots = (await rpc('list')).bots;
          return scene.bots.every(
            (bot) => bots.find((row) => row.slug === bot.slug)?.aggregateState === 'idle',
          );
        }, 'settled real Bot work');
        const overview = await rpc('overviewUsage', { period });
        const profiles = await Promise.all(
          scene.bots.map((bot) =>
            rpc('profileUsage', {
              channelId: bot.dm,
              filter: { start: overview.start, end: overview.end },
            }),
          ),
        );
        const botTotals = scene.bots.map((bot) => {
          const row = overview.bots.find((row) => row.slug === bot.slug);
          return row ? row.totalTokens : 0;
        });
        assert.deepEqual(
          botTotals,
          profiles.map((profile) => profile.periodTotal),
        );
        assert.equal(
          overview.totals.totalTokens,
          botTotals.some((total) => total === null)
            ? null
            : botTotals.reduce((sum, total) => sum + total, 0),
        );
        assert.equal(overview.days.length, period === 'week' ? 7 : 1);
        return overview;
      };
      const today = await compare('today');
      const unreadBefore = (await rpc('humanAttentionStatus')).unreadCount;
      await page.click('[data-usage-period=week]');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-usage-period=week]')?.getAttribute('aria-pressed') ===
            'true' &&
          document.querySelectorAll('.bh-overview-usage-days li, .bh-overview-usage-days tbody tr')
            .length === 7,
      );
      await page.waitForSelector('.bh-overview-usage .bh-profile-bar-chart svg');
      const week = await compare('week');
      if (mode === 'resume')
        assert.equal(
          week.totals.totalTokens,
          JSON.parse(
            readFileSync(resolve(repo, '.humanlayer/tasks/issue-709/evidence/result.json'), 'utf8'),
          ).final,
          'retained seven-day usage after Host restart and local date rollover',
        );
      assert.equal(
        await page.$$eval(
          '.bh-overview-usage-days li, .bh-overview-usage-days tbody tr',
          (rows) => rows.length,
        ),
        7,
      );
      assert.equal((await rpc('humanAttentionStatus')).unreadCount, unreadBefore);
      for (const dark of [false, true]) {
        await theme(dark);
        await shot('overview-' + (dark ? 'dark' : 'light'));
      }
      await page.click('.bh-overview-usage-days summary');
      assert.equal(await page.$eval('.bh-overview-usage-days', (node) => node.open), true);
      const detailsSection = await page.$('.bh-overview-usage');
      await theme(false);
      await detailsSection.screenshot({ path: resolve(out, 'usage-exact-details.png') });
      await page.click('.bh-overview-usage-days summary');
      const overviewGeometry = await page.$eval('.bh-overview-usage', (node) => {
        const style = getComputedStyle(node);
        return {
          profileCard: node.classList.contains('bh-profile-card'),
          padding: style.padding,
          totalFont: getComputedStyle(node.querySelector('[data-usage-total]')).fontSize,
          dailyHeight: node.querySelector('.bh-profile-bar-chart')?.getBoundingClientRect().height,
          detailOpen: node.querySelector('details').open,
        };
      });
      if (overviewGeometry.profileCard) {
        assert.equal(overviewGeometry.detailOpen, false);
        await page.waitForSelector(
          '.bh-overview-usage .bh-usage-model-plot .bh-profile-bar-chart svg',
        );
      }
      await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 1 });
      for (const dark of [false, true]) {
        await theme(dark);
        await shot('overview-narrow-' + (dark ? 'dark' : 'light'));
      }
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      const usageSection = await page.$('.bh-overview-usage');
      for (const dark of [false, true]) {
        await theme(dark);
        await usageSection.screenshot({
          path: resolve(out, 'usage-bot-detail-' + (dark ? 'dark' : 'light') + '.png'),
        });
      }
      await theme(false);
      await page.click('[data-usage-bot="' + scene.bots[0].slug + '"] button');
      await page.waitForSelector('.bh-profile-view');
      assert.ok(
        await page.$eval('.bh-profile-view', (node) =>
          node.textContent.includes('Budget Writer QA'),
        ),
      );
      await page.waitForSelector(
        '.bh-profile-view .bh-model-usage-overview .bh-profile-card-total',
      );
      const profileGeometry = await page.$eval(
        '.bh-profile-view .bh-model-usage-overview',
        (node) => ({
          padding: getComputedStyle(node.closest('.bh-profile-card')).padding,
          totalFont: getComputedStyle(node.querySelector('.bh-profile-card-total')).fontSize,
          dailyHeight: node.querySelector('.bh-profile-bar-chart')?.getBoundingClientRect().height,
        }),
      );
      if (overviewGeometry.profileCard) {
        assert.equal(overviewGeometry.padding, profileGeometry.padding);
        assert.equal(overviewGeometry.totalFont, profileGeometry.totalFont);
        assert.equal(overviewGeometry.dailyHeight, profileGeometry.dailyHeight);
      }
      writeFileSync(
        resolve(out, 'geometry.json'),
        JSON.stringify({ overviewGeometry, profileGeometry }),
      );
      await shot('bot-profile');
      if (mode !== 'resume') {
        await rpc('channelSend', {
          channelId: scene.bots[0].dm,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Reply exactly USAGE_LATE_READY using bot_send_message once. No other work.',
        });
        await waitFor(
          async () =>
            (await rpc('channelMessages', { channelId: scene.bots[0].dm })).messages.some(
              (message) =>
                message.author.kind === 'bot' && message.body.includes('USAGE_LATE_READY'),
            ),
          'later real reply',
        );
        await waitFor(
          async () =>
            (await rpc('overviewUsage', { period: 'today' })).bots.find(
              (row) => row.slug === scene.bots[0].slug,
            )?.outputTokens >
            today.bots.find((row) => row.slug === scene.bots[0].slug).outputTokens,
          'later usage',
        );
      }
      await overview();
      await page.waitForSelector('[data-usage-total]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-overview-usage [aria-busy]')?.getAttribute('aria-busy') ===
          'false',
      );
      await page.click('.bh-overview-usage [aria-label="刷新用量"]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-overview-usage [aria-busy]')?.getAttribute('aria-busy') ===
          'false',
      );
      const final = await compare('today');
      const expected =
        final.totals.totalTokens === null ? '未知' : final.totals.totalTokens.toLocaleString();
      await page.waitForFunction(
        (expected) => document.querySelector('[data-usage-total]')?.textContent === expected,
        {},
        expected,
      );
      await shot(mode === 'resume' ? 'overview-restarted' : 'overview-later-usage');
      writeFileSync(
        resolve(out, 'result' + (mode === 'resume' ? '-restart' : '') + '.json'),
        JSON.stringify({
          realModelReplies: 2,
          today: today.totals.totalTokens,
          week: week.totals.totalTokens,
          final: final.totals.totalTokens,
          unreadUnchanged: true,
          sevenDays: true,
          profileMatch: true,
          profileNavigation: true,
          chart: true,
          narrowOverflow: false,
          restart: mode === 'resume',
        }),
      );
      console.log(
        'PASS: canonical Overview/Profile totals, real model usage, range switch, chart, read state, Profile navigation and subsequent usage',
      );
    }
  }
} catch (error) {
  await shot('diagnostic-error');
  throw error;
} finally {
  await browser.close();
}
