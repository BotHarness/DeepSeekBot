import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const modules = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((x) => x.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const native = !!process.env.BH_DESKTOP_CDP;
assert.ok(native || (process.env.BH_E2E_INSTANCE && process.env.BH_BROWSER_PROFILE));
const browser = native
  ? await puppeteer.connect({ browserURL: process.env.BH_DESKTOP_CDP, defaultViewport: null })
  : await puppeteer.launch({ headless: true, userDataDir: process.env.BH_BROWSER_PROFILE });
const page = native
  ? (await browser.pages()).find((p) => p.url().startsWith('dsh-app://app/'))
  : await browser.newPage();
assert.ok(page);
const out = resolve(
  process.env.BH_SCREENSHOT_DIR || '.humanlayer/verify/resize-stability-2074',
  `${native ? 'native' : 'web'}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const samples = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const parent = '[data-dock-header="bh:channel-body"]';
const rail = (id) => `.bh-workspace-rail [data-pinned-panel="${id}"]`;
let start;
try {
  if (!native) {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE)).url, {
      waitUntil: 'domcontentloaded',
    });
  }
  await page.waitForSelector('.bh-workspace-rail');
  await pause(800);
  if (!(await page.$(parent))) await page.click(rail('bh:channel-body'));
  if (!(await page.$('[data-dock-header="bh:channels"]'))) await page.click(rail('bh:channels'));
  if (await page.$('[data-dock-header="activity-center"]'))
    await page.click(rail('activity-center'));
  for (const label of ['记忆文件', '记忆演化']) {
    const control = `${parent} button[aria-label="${label}"]`;
    await page.waitForSelector(control);
    if (await page.$eval(control, (n) => n.getAttribute('aria-pressed') !== 'true'))
      await page.click(control);
  }
  for (const id of ['memory-files', 'memory-evolution']) {
    await page.click(`[data-channel-subpanel="${id}"] [data-dock-header]`, { button: 'right' });
    await page.locator('::-p-aria(移到消息右侧)').click();
  }
  await pause(300);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('botharness.bot-mode-layout')),
  );
  start = await page.$$eval('.dv-sash.dv-enabled', (ns) =>
    ns.map((n) => n.getBoundingClientRect().toJSON()).find((r) => r.height > r.width),
  );
  assert.ok(start);
  const bounds = await page.$eval('.bh-dock > div', (n) => n.getBoundingClientRect().toJSON());
  const x = start.x + start.width / 2,
    y = Math.min(start.y + start.height / 2, 350);
  const targetXs = [
    bounds.left + 320,
    bounds.left + 430,
    bounds.left + 540,
    bounds.left + 850,
    bounds.left + 540,
    bounds.left + 430,
    bounds.left + 320,
    x,
  ];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const target of targetXs) {
    await page.mouse.move(target, y, { steps: 3 });
    await pause(100);
    const stationary = [];
    for (let i = 0; i < 5; i++) {
      stationary.push(
        await page.evaluate(() => ({
          sash: [...document.querySelectorAll('.dv-sash.dv-enabled')]
            .map((n) => n.getBoundingClientRect())
            .filter((r) => r.height > r.width)
            .map((r) => r.x + r.width / 2),
          splits: [...document.querySelectorAll('[data-workspace-split]')]
            .filter((n) => n.checkVisibility())
            .map((n) => ({
              id: n.dataset.workspaceSplit,

              axis: n.dataset.splitAxis,
              width: n.getBoundingClientRect().width,
            })),
        })),
      );
      await pause(40);
    }
    samples.push({ target, stationary });
    if ([1, 4, 8].includes(samples.length))
      await page.screenshot({ path: resolve(out, `drag-${samples.length}.png`) });
    for (const frame of stationary) {
      assert.ok(
        frame.sash.some((at) => Math.abs(at - target) <= 3),
        `divider snapped away from pointer ${target}: ${frame.sash}`,
      );
      for (const split of frame.splits)
        assert.equal(
          split.axis,
          samples[0].stationary[0].splits.find((prior) => prior.id === split.id).axis,
          `placement changed for ${split.id} at ${split.width}px`,
        );
    }
  }
  await page.mouse.up();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('botharness.bot-mode-layout')),
  );
  assert.deepEqual(after.channelSplits, before.channelSplits);
  assert.deepEqual(after.botWorkspaces, before.botWorkspaces);
  assert.deepEqual(after.channelWorkspaces, before.channelWorkspaces);
  assert.deepEqual(errors, []);
} catch (error) {
  samples.push({ failure: String(error) });
  await page.screenshot({ path: resolve(out, 'failure.png') });
  throw error;
} finally {
  await page.mouse.up().catch(() => {});
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ native, samples, errors }, null, 2));
  if (native) await browser.disconnect();
  else await browser.close();
  console.log(out);
}
