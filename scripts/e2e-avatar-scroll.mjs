import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookieFor, rpc } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.env.BH_E2E_NAME ?? 'avatar-4268';
const directory = resolve(root, '.humanlayer/verify', name);
const instance = JSON.parse(readFileSync(resolve(directory, 'instance.json'), 'utf8'));
const evidence = resolve(directory, 'evidence', process.env.BH_E2E_LABEL ?? 'scroll');
mkdirSync(evidence, { recursive: true });
const pnpm = resolve(root, 'node_modules/.pnpm');
const entry = readdirSync(pnpm).find((row) => row.startsWith('puppeteer@'));
assert.ok(entry, 'Puppeteer installed');
const puppeteer = createRequire(resolve(pnpm, entry, 'node_modules/'))('puppeteer');
const bot =
  (await rpc(instance, 'botharness/activitySnapshot')).bots.find(
    (row) => row.displayName === 'Avatar scroll QA',
  ) ?? (await rpc(instance, 'botharness/create', { displayName: 'Avatar scroll QA' })).bot;
const dm = (await rpc(instance, 'botharness/channelDm', { slug: bot.slug })).channel;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
const results = [];
let page;
try {
  page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US'] });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1024, height: 667 });
  await page.setExtraHTTPHeaders({ cookie: cookieFor(instance.home) });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some((b) =>
      ['Settings', 'More'].includes(b.textContent?.trim() ?? ''),
    ),
  );
  const click = async (label) => {
    console.log(`Click: ${label}`);
    try {
      await page.locator(`::-p-aria(${JSON.stringify(label)})`).click();
    } catch (error) {
      await page.screenshot({ path: resolve(evidence, 'failure.png') });
      writeFileSync(
        resolve(evidence, 'failure-aria.json'),
        JSON.stringify(await page.accessibility.snapshot(), null, 2),
      );
      throw error;
    }
  };
  for (const label of ['Continue', 'Configure later', 'Skip']) {
    await page.evaluate(
      (text) =>
        [...document.querySelectorAll('button')]
          .find((b) => b.offsetParent !== null && b.textContent?.trim() === text)
          ?.click(),
      label,
    );
  }
  if (!(await page.$('.bh-root.bh-main'))) await click('Bot mode');
  await page.waitForSelector('.bh-root.bh-main');
  await page.waitForFunction(
    () => document.querySelector('[role="dialog"]') || document.querySelector('[data-channel-id]'),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find(
        (b) =>
          b.offsetParent !== null &&
          ['Skip', 'Skip tutorial'].includes(b.textContent?.trim() ?? ''),
      )
      ?.click(),
  );
  await page.waitForSelector(`[data-dock-panel="bh:channels"] [data-channel-id="${dm.id}"]`);
  await page.locator(`[data-dock-panel="bh:channels"] [data-channel-id="${dm.id}"]`).click();
  for (let i = 0; i < 6; i++) {
    await new Promise((done) => setTimeout(done, 300));
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (b) =>
            b.offsetParent !== null &&
            ['Skip', 'Skip tutorial'].includes(b.textContent?.trim() ?? ''),
        )
        ?.click(),
    );
  }
  await page.evaluate(() =>
    document.querySelector('[role="dialog"] button[aria-label="Close"]')?.click(),
  );
  await page.locator(`[data-dock-panel="bh:channels"] [data-channel-id="${dm.id}"]`).click();
  await click("Open Avatar scroll QA's Profile");
  await page.waitForSelector('.bh-profile-avatar-button');
  await click('Change avatar');
  await page.locator('[data-avatar-edit]').click();
  await page.locator('[data-avatar-family="illustrated"]').click();
  await page.waitForSelector('[data-avatar-category="bangs"]');
  await page.locator('[data-avatar-category="bangs"]').click();
  await click('Draw or edit this piece');
  await page.waitForSelector('[data-part-canvas]');
  const tools = await page.$$eval('[data-part-tool]', (buttons) =>
    buttons.map((button) => ({
      icon: button.querySelector('svg')?.getAttribute('aria-hidden'),
      label: button.textContent.trim(),
    })),
  );
  assert.equal(tools.length, 9);
  assert.ok(
    tools.every((tool) => tool.icon === 'true' && tool.label.length > 0),
    'drawing tools have decorative icons and visible labels',
  );
  await click('Eraser');
  assert.equal(
    await page.$eval('[data-part-tool="eraser"]', (button) => button.getAttribute('aria-pressed')),
    'true',
  );
  await click('Pencil');
  assert.equal(await page.$eval('[data-part-undo]', (button) => button.disabled), true);
  for (const [width, height, theme] of [
    [1024, 667, 'light'],
    [1100, 600, 'dark'],
    [1440, 900, 'light'],
  ]) {
    await page.setViewport({ width, height });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
    await page.waitForFunction(
      (mode) => document.documentElement.dataset.bhAppearance === mode,
      {},
      theme,
    );
    const prefix = `${width}-${height}-${theme}`;
    await page.$eval('[data-part-canvas]', (canvas) => {
      for (let node = canvas.parentElement; node; node = node.parentElement) node.scrollTop = 0;
    });
    await page.screenshot({ path: resolve(evidence, `${prefix}-top.png`) });
    const point = await page.$eval('[data-part-canvas]', (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left + 10, y: Math.min(innerHeight - 80, Math.max(100, r.top + 10)) };
    });
    await page.mouse.move(point.x, point.y);
    for (let i = 0; i < 6; i++) await page.mouse.wheel({ deltaY: 700 });
    await new Promise((done) => setTimeout(done, 200));
    const measurement = await page.evaluate(() => {
      const swatch = [...document.querySelectorAll('[data-part-ink]')].at(-1);
      const footer = document.querySelector('[data-part-cancel]');
      const visible = (node) => {
        const r = node.getBoundingClientRect();
        return (
          r.top >= 0 &&
          r.bottom <= innerHeight &&
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') ===
            node
        );
      };
      return {
        swatchReachable: visible(swatch),
        footerReachable: visible(footer),
        footerBottom: footer.getBoundingClientRect().bottom,
        height: innerHeight,
      };
    });
    results.push({ width, height, theme, ...measurement });
    if (measurement.swatchReachable) {
      const swatches = await page.$$('[data-part-ink]');
      await swatches.at(-1).click();
      assert.equal(
        await swatches.at(-1).evaluate((node) => node.getAttribute('aria-pressed')),
        'true',
      );
    }
    await page.screenshot({ path: resolve(evidence, `${prefix}-bottom.png`) });
  }
  writeFileSync(
    resolve(evidence, 'aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  writeFileSync(resolve(evidence, 'result.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
  assert.ok(
    results.every((r) => r.swatchReachable && r.footerReachable),
    'last palette color and footer must be reachable by wheel scrolling',
  );
  assert.deepEqual(errors, [], 'no page errors');
  const previewBefore = await page.$eval('[data-avatar-preview]', (node) => node.innerHTML);
  const selectedInk = await page.$eval('.bh-part-swatch[aria-pressed="true"]', (node) =>
    node.getAttribute('data-part-ink'),
  );
  await page.locator('[data-part-cell="16,8"]').click();
  assert.equal(
    await page.$eval('[data-part-cell="16,8"]', (node) => node.getAttribute('data-part-ink')),
    selectedInk,
  );
  await page.waitForFunction(
    (before) => document.querySelector('[data-avatar-preview]').innerHTML !== before,
    {},
    previewBefore,
  );
  await page.locator('[data-part-cancel]').click();
  await page.locator('[data-avatar-cancel]').click();
  const savedBot = (await rpc(instance, 'botharness/activitySnapshot')).bots.find(
    (row) => row.slug === bot.slug,
  );
  assert.deepEqual(savedBot.appearance, bot.appearance, 'cancel keeps the saved appearance');
} catch (error) {
  if (page) {
    await page.screenshot({ path: resolve(evidence, 'failure.png') });
    writeFileSync(
      resolve(evidence, 'failure-aria.json'),
      JSON.stringify(await page.accessibility.snapshot(), null, 2),
    );
  }
  throw error;
} finally {
  await browser.close();
}
