import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
assert.ok(process.env.BH_E2E_INSTANCE && process.env.BH_BROWSER_PROFILE);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const modules = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((x) => x.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const out = resolve('.humanlayer/verify/browser-computer-2069', `sizes-${Date.now()}`);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: process.env.BH_BROWSER_PROFILE,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [],
  results = [];
page.on('pageerror', (e) => errors.push(e.message));
const parent = '[data-dock-header="bh:channel-body"]';
const rail = (id) => `.bh-workspace-rail [data-pinned-panel="${id}"]`;
const state = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('botharness.bot-mode-layout')));
const settle = () => new Promise((r) => setTimeout(r, 300));
async function box(id) {
  return page.$eval(`[data-dock-header="${id}"]`, (n) =>
    n.closest('.dv-groupview').getBoundingClientRect().toJSON(),
  );
}
async function equalBox(id, expected, label) {
  await settle();
  const actual = await box(id);
  assert.ok(
    Math.abs(actual.width - expected.width) <= 2,
    `${label}: width ${actual.width} != ${expected.width}`,
  );
  assert.ok(
    Math.abs(actual.height - expected.height) <= 2,
    `${label}: height ${actual.height} != ${expected.height}`,
  );
}
async function cycle(id, expected) {
  await page.click(rail(id));
  await page.waitForSelector(`[data-dock-header="${id}"]`, { hidden: true });
  await page.click(rail(id));
  await page.waitForSelector(`[data-dock-header="${id}"]`);
  await equalBox(id, expected, `reopen ${id}`);
}
try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(parent);
  if (!(await page.$('[data-dock-header="bh:channels"]'))) await page.click(rail('bh:channels'));
  if (await page.$('[data-dock-header="activity-center"]'))
    await page.click(rail('activity-center'));

  const sash = await page.$eval('.dv-sash.dv-enabled', (n) => n.getBoundingClientRect().toJSON());
  await page.mouse.move(sash.x + sash.width / 2, sash.y + sash.height / 2);
  await page.mouse.down();
  await page.mouse.move(420, sash.y + sash.height / 2, { steps: 8 });
  await page.mouse.up();
  await settle();
  const channels = await box('bh:channels');
  const messages = await box('bh:channel-body');
  await page.screenshot({ path: resolve(out, 'resized.png') });
  await cycle('bh:channels', channels);
  await cycle('bh:channel-body', messages);
  await equalBox('bh:channels', channels, 'neighbor after Messages toggle');
  results.push({ globalReopen: true, channels, messages });
  await page.click(rail('bh:channels'));
  await page.click(rail('bh:channel-body'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(rail('bh:channels'));
  await page.click(rail('bh:channels'));
  await page.click(rail('bh:channel-body'));
  await equalBox('bh:channels', channels, 'both closed then restored');
  await equalBox('bh:channel-body', messages, 'both closed then restored');
  results.push({ multipleClosedRefresh: true });

  await page.click(rail('bh:channels'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(parent);
  await page.click(rail('bh:channels'));
  await equalBox('bh:channels', channels, 'reopen after hidden refresh');

  const bot = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-dock-panel="bh:channels"] [data-channel-id]')].find(
        (n) => n.textContent.includes('Sessions QA Ada'),
      )?.dataset.channelId,
  );
  assert.ok(bot);
  await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${bot}"]`);
  for (const [id, label] of [
    ['sessions', '会话'],
    ['memory-files', '记忆文件'],
    ['memory-evolution', '记忆演化'],
    ['schedules', '定时任务'],
    ['botharness-browser', '浏览器'],
    ['botharness-computer', '电脑'],
  ]) {
    const control = `${parent} button[aria-label="${label}"]`;
    const child = `[data-channel-subpanel="${id}"]`;
    if (!(await page.$(child))) await page.click(control);
    const path = await page.$eval(
      `[data-channel-leaf="${id}"]`,
      (n) => n.closest('.bh-channel-branch').parentElement.dataset.workspaceSplit,
    );
    const divider = `[data-workspace-split="${path}"] > [role="separator"]`;
    await page.focus(divider);
    const vertical = await page.$eval(
      divider,
      (n) => n.getAttribute('aria-orientation') === 'horizontal',
    );
    await page.keyboard.press(vertical ? 'ArrowUp' : 'ArrowLeft');
    await settle();
    const before = await state();
    const pref = before.channelSplits[bot];
    const fraction = await page.$eval(divider, (n) => Number(n.getAttribute('aria-valuenow')));
    await page.click(control);
    await page.click(control);
    await page.click(rail('bh:channel-body'));
    await page.click(rail('bh:channel-body'));
    await settle();
    const after = await state();
    assert.deepEqual(after.channelSplits[bot], pref);
    assert.equal(
      await page.$eval(divider, (n) => Number(n.getAttribute('aria-valuenow'))),
      fraction,
    );
    await equalBox('bh:channel-body', messages, `parent restored for ${id}`);
    results.push({ id, ratio: fraction / 100, childAndParentReopen: true });
    await page.click(control);
  }
  const saved = await state();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(parent);
  await settle();
  const loaded = await state();
  assert.deepEqual(loaded.channelSplits, saved.channelSplits);
  assert.deepEqual(loaded.botWorkspaces, saved.botWorkspaces);
  assert.deepEqual(loaded.channelWorkspaces, saved.channelWorkspaces);
  await equalBox('bh:channels', channels, 'final reload');
  await page.screenshot({ path: resolve(out, 'restored.png') });

  await page.click(rail('activity-center'));
  await page.waitForSelector('[data-dock-header="activity-center"]');
  const horizontal = await page.$$eval('.dv-sash.dv-enabled', (nodes) =>
    nodes.map((n) => n.getBoundingClientRect().toJSON()).find((r) => r.width > r.height),
  );
  assert.ok(horizontal, 'Activity creates a vertical split');
  await page.mouse.move(horizontal.x + horizontal.width / 2, horizontal.y + horizontal.height / 2);
  await page.mouse.down();
  await page.mouse.move(horizontal.x + horizontal.width / 2, 600, { steps: 8 });
  await page.mouse.up();
  await settle();
  const activity = await box('activity-center');
  await page.screenshot({ path: resolve(out, 'vertical-resized.png') });
  for (let i = 0; i < 3; i++) await cycle('activity-center', activity);
  await page.click(rail('activity-center'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(parent);
  await page.click(rail('activity-center'));
  await equalBox('activity-center', activity, 'vertical closed refresh');
  await page.screenshot({ path: resolve(out, 'vertical-restored.png') });
  results.push({ verticalReopenAndRefresh: true, activity });
  await page.click(rail('activity-center'));
  const remembered = (await state()).parked['activity-center'].size;
  await page.setViewport({ width: 1600, height: 1080 });
  await settle();
  const resizedGrid = await page.$eval('.bh-dock > div', (n) => n.getBoundingClientRect().toJSON());
  await page.click(rail('activity-center'));
  await equalBox(
    'activity-center',
    { width: remembered.width * resizedGrid.width, height: remembered.height * resizedGrid.height },
    'scale after viewport resize',
  );
  results.push({ closedViewportScaling: true });

  results.push({ refresh: true });
  assert.deepEqual(errors, []);
} catch (e) {
  results.push({ failure: String(e) });
  await page.screenshot({ path: resolve(out, 'failure.png') });
  throw e;
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  console.log(out);
}
