import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rpc } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modules = resolve(root, 'node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
assert.ok(process.env.BH_E2E_INSTANCE, 'Set BH_E2E_INSTANCE to the task-owned instance.json');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(
  process.env.BH_SCREENSHOT_DIR ?? dirname(process.env.BH_E2E_INSTANCE),
  `mode-exit-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = await browser.newPage();
const locale = process.env.BH_E2E_LOCALE ?? 'en';
const theme = process.env.BH_E2E_THEME ?? 'light';
const errors = [];
const logs = [];
const results = [];
const rail = '.bh-workspace-rail';
let step = 'login';
let chinese = false;
const label = (en, zh) => (chinese ? zh : en);
const click = (name) => page.locator(`::-p-aria(${name}[role="button"])`).click();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (['warn', 'error'].includes(message.type())) logs.push(`${message.type()}: ${message.text()}`);
});
async function dismissNotices() {
  for (let pass = 0; pass < 4; pass++) {
    for (const name of [
      'Continue',
      '继续',
      'Configure later',
      '稍后配置',
      'Skip tutorial',
      '跳过教程',
    ]) {
      const button = await page.$(`::-p-aria(${name}[role="button"])`);
      if (button && (await button.boundingBox())) await button.click();
      await button?.dispose();
    }
    await sleep(100);
  }
}
async function capture(name) {
  await page.mouse.move(1400, 30);
  await sleep(350);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  const ax = await (await page.createCDPSession()).send('Accessibility.getFullAXTree');
  writeFileSync(resolve(out, `${name}.aria.json`), JSON.stringify(ax, null, 2));
  const observed = await page.evaluate(() => ({
    state: window.__BOTHARNESS_CLIENT_DIAGNOSTICS__?.snapshot().state,
    rail: !!document.querySelector('.bh-workspace-rail'),
    nativeSidebar:
      !!document.querySelector('[data-slot="sidebar"]') &&
      !document.querySelector('[data-bh-workspace-frame]'),
    lastView: JSON.parse(localStorage.getItem('botharness/last-view.v1')),
  }));
  assert.equal(observed.state, 'shell-ready');
  results.push({ name, ...observed });
}
async function enter() {
  await click(label('Bot mode', 'Bot 模式'));
  await page.waitForSelector(rail);
  await dismissNotices();
}
async function exitBottom(key) {
  const name = label('Back to Harness', '返回 Harness');
  const button = await page.$(`::-p-aria(${name}[role="button"])`);
  assert.ok(
    button && (await button.boundingBox()),
    'a visible Back to Harness button is available without hover',
  );
  if (key) {
    await button.focus();
    await page.keyboard.press(key);
  } else await button.click();
  await page.waitForSelector('[data-bh-workspace-frame]', { hidden: true });
  await page.waitForSelector(`::-p-aria(${label('Bot mode', 'Bot 模式')}[role="button"])`);
}
try {
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: locale === 'zh' ? 'zh-CN,zh' : 'en-US,en',
  });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await dismissNotices();
  chinese = await page.evaluate(
    () =>
      !!document.querySelector('button[aria-label="Bot 模式"], button[aria-label="退出 Bot 模式"]'),
  );
  if (!(await page.$(rail))) await enter();
  await dismissNotices();
  await page.waitForSelector(`${rail} button`);
  await page.waitForSelector('[data-dock-panel="bh:channels"] [data-channel-id]');
  await page.waitForFunction(
    () => !document.body.innerText.includes('Loading available models...'),
  );
  await capture('before-interaction');
  const canonical = await rpc(instance, 'botharness/list');
  const geometry = () =>
    page.$$eval('[data-dock-panel], .bh-workspace-rail', (nodes) =>
      nodes
        .map((node) => ({
          id: node.getAttribute('data-dock-panel') ?? 'rail',
          box: node.getBoundingClientRect().toJSON(),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );

  step = 'bottom-return';
  const placement = await page.$eval(rail, (node) => {
    const buttons = [...node.querySelectorAll(':scope > button')];
    return buttons.map((button) => ({
      label: button.getAttribute('aria-label'),
      box: button.getBoundingClientRect().toJSON(),
    }));
  });
  const bottomName = label('Back to Harness', '返回 Harness');
  assert.equal(
    placement.at(-1)?.label,
    bottomName,
    'return follows settings at the bottom of the rail',
  );
  assert.equal(placement.at(-2)?.label, label('Bot settings', 'Bot 设置'));
  await click(label('Move control rail', '移动控制列'));
  await page.locator(`::-p-aria(${label('Move to right edge', '移至最右')})`).click();
  await sleep(300);
  const layout = await geometry();
  await capture('rail-moved');
  const draftName = label('What can I help you with?', '有什么可以帮你？');
  const draftField = `::-p-aria(${draftName}[role="textbox"])`;
  const draftChecked = !!(await page.$(draftField));
  if (draftChecked) await page.locator(draftField).fill('Unsent navigation check');
  await exitBottom();
  await capture('ordinary-harness');
  await page.reload({ waitUntil: 'networkidle2' });
  await dismissNotices();
  assert.equal(await page.$(rail), null, 'manual exit survives reload');
  await capture('ordinary-after-reload');
  await enter();
  const restored = await geometry();
  assert.deepEqual(
    restored.map((panel) => panel.id),
    layout.map((panel) => panel.id),
  );
  for (let index = 0; index < layout.length; index++) {
    for (const axis of ['x', 'y', 'width', 'height']) {
      assert.ok(
        Math.abs(layout[index].box[axis] - restored[index].box[axis]) <= 2,
        `exit preserves ${layout[index].id} ${axis} within native pixel rounding`,
      );
    }
  }
  assert.deepEqual(
    await rpc(instance, 'botharness/list'),
    canonical,
    'exit changes no PersonaBot facts',
  );
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector(rail);
  await dismissNotices();
  if (draftChecked) {
    await page.waitForSelector(draftField);
    assert.equal(await page.$eval(draftField, (node) => node.value), 'Unsent navigation check');
    await page.locator(draftField).fill('');
  }
  await capture('restored-bot-mode');
  step = 'keyboard-return';
  for (const key of ['Enter', 'Space']) {
    await exitBottom(key);
    await enter();
  }
  step = 'top-logo-return';
  await page.click(`${rail} button[aria-label="${label('Exit Bot mode', '退出 Bot 模式')}"]`);
  await page.waitForSelector('[data-bh-workspace-frame]', { hidden: true });
  await enter();
  step = 'short-window';
  await page.setViewport({ width: 1440, height: 360 });
  await sleep(250);
  const box = await page.$eval(`button[aria-label="${bottomName}"]`, (node) =>
    node.getBoundingClientRect().toJSON(),
  );
  assert.ok(box.top >= 0 && box.bottom <= 360, 'bottom exit stays in the viewport');
  await capture('short-window');
  await page.setViewport({ width: 900, height: 800 });
  await page.waitForSelector(rail, { hidden: true });
  assert.equal(
    await page.$(`button[aria-label="${bottomName}"]`),
    null,
    'narrow fallback has no extra return control',
  );
  await page.setViewport({ width: 1440, height: 900 });
  await page.waitForSelector(rail);
  await capture('wide-again');
  await click(label('Move control rail', '移动控制列'));
  await page.locator(`::-p-aria(${label('Move to left edge', '移至最左')})`).click();
  await capture('rail-left-again');
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: 'BOT MODE EXIT PASS',
      evidence: out,
      locale: chinese ? 'zh' : 'en',
      theme,
      draftChecked,
      results: results.length,
    }),
  );
} catch (error) {
  await capture('failure').catch(() => {});
  writeFileSync(
    resolve(out, 'failure.json'),
    JSON.stringify({ step, error: error.message }, null, 2),
  );
  throw error;
} finally {
  writeFileSync(
    resolve(out, 'results.json'),
    JSON.stringify({ step, results, errors, logs }, null, 2),
  );
  await browser.close();
}
