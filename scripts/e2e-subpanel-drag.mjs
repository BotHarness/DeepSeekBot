import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const packageDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, packageDir, 'node_modules/'))('puppeteer');
assert.ok(process.env.BH_E2E_INSTANCE, 'Set BH_E2E_INSTANCE to the isolated instance.json');
assert.ok(process.env.BH_BROWSER_PROFILE, 'Set BH_BROWSER_PROFILE to an empty browser dir');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), `subpanel-drag-${Date.now()}`);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: process.env.BH_BROWSER_PROFILE,
  args: ['--no-sandbox', '--lang=en-US'],
});
const page = await browser.newPage();
const errors = [];
let step = 'goto';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const order = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-subpanel-entry]')].map((node) =>
      node.getAttribute('data-subpanel-entry'),
    ),
  );
const savedOrder = () =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('botharness.bot-mode-layout-mode')).column.order,
  );
async function shot(name) {
  await sleep(250);
  await page.screenshot({ path: resolve(out, `${name}.png`), waitForFonts: false });
}
async function select(name) {
  await page.waitForSelector('[data-dock-panel="bh:channels"] [data-channel-id]', {
    timeout: 20000,
  });
  const row = await page.evaluate(
    (name) =>
      [...document.querySelectorAll('[data-dock-panel="bh:channels"] [data-channel-id]')]
        .find((node) => node.textContent.includes(name))
        ?.getAttribute('data-channel-id'),
    name,
  );
  assert.ok(row, `Channel row ${name} exists`);
  await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${row}"]`);
  await page.waitForFunction(
    (name) =>
      document.querySelector('[data-dock-header="bh:channel-body"]')?.textContent.includes(name),
    {},
    name,
  );
}
try {
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (button) =>
            ['Continue', 'Configure later', 'Skip tutorial', 'Skip'].includes(
              button.textContent.trim(),
            ) && button.offsetParent,
        )
        ?.click(),
    );
    await sleep(300);
  }
  step = 'bot-mode';
  if (!(await page.$('.bh-workspace-rail'))) {
    await page.locator('::-p-aria(Bot mode)').click();
    await page.waitForSelector('.bh-workspace-rail', { timeout: 20000 });
  }
  step = 'select-dm';
  await select('QA Ada');
  step = 'open-column';
  if (!(await page.$('[data-subpanel-entry="sessions"]'))) {
    await page.locator('::-p-aria(Subpanel column)').click();
    await page.waitForSelector('[data-subpanel-entry="sessions"]', { timeout: 20000 });
  }
  step = 'assert-default';
  assert.deepEqual(await order(), [
    'sessions',
    'memory-files',
    'memory-evolution',
    'schedules',
    'botharness-browser',
    'botharness-computer',
    'generated-files',
    'bot-inbox',
  ]);
  await shot('before');

  step = 'hover';
  const head = (id) => `[data-subpanel-entry="${id}"] [data-panel-head]`;
  await page.hover(head('sessions'));
  await shot('hover');
  step = 'drag';
  const fromEl = await page.$(head('sessions'));
  const targetEl = await page.$(head('memory-files'));
  const from = await fromEl.boundingBox();
  const target = await targetEl.boundingBox();
  assert.ok(from && target, 'drag endpoints are visible');
  const dropY = target.y + target.height - 6;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2 + ((dropY - (from.y + from.height / 2)) * i) / 12,
      { steps: 2 },
    );
    await sleep(30);
  }
  await shot('mid-drag');
  await page.mouse.up();
  step = 'assert-drop';
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('botharness.bot-mode-layout-mode')).column.order[0] ===
      'memory-files',
    { timeout: 10000 },
  );
  const after = await order();
  assert.equal(after[0], 'memory-files');
  assert.equal(after[1], 'sessions');
  assert.deepEqual(await savedOrder(), [
    'memory-files',
    'sessions',
    'memory-evolution',
    'schedules',
    'botharness-browser',
    'botharness-computer',
    'generated-files',
    'bot-inbox',
  ]);
  await shot('after');

  step = 'reload';

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bh-workspace-rail', { timeout: 20000 });
  await select('QA Ada');
  await page.waitForSelector('[data-subpanel-entry="sessions"]', { timeout: 20000 });
  assert.deepEqual(await order(), after);
  await shot('reloaded');

  step = 'group';

  await select('QA Group');
  await page.waitForSelector('[data-subpanel-entry="members"]', { timeout: 20000 });
  const group = await order();
  assert.ok(group.includes('sessions'), 'group keeps Sessions');
  assert.ok(group.includes('members'), 'group keeps Members');
  assert.ok(!group.includes('memory-files'), 'group excludes DM-only Memory files');
  assert.ok(!group.includes('schedules'), 'group excludes DM-only Schedules');
  await shot('group');

  writeFileSync(
    resolve(out, 'results.json'),
    JSON.stringify({ step: 'done', order: after, group, errors }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, out, order: after, group }));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), waitForFonts: false }).catch(() => {});
  writeFileSync(
    resolve(out, 'results.json'),
    JSON.stringify({ step, message: String(error), errors }, null, 2),
  );
  console.error(JSON.stringify({ ok: false, out, message: String(error) }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
