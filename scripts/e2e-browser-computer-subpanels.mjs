import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

assert.ok(
  process.env.BH_E2E_INSTANCE && process.env.BH_BROWSER_PROFILE && process.env.BH_LEGACY_LAYOUT,
);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE));
const old = readFileSync(process.env.BH_LEGACY_LAYOUT, 'utf8');
assert.equal(JSON.parse(old).version, 5);
const modules = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((x) => x.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const out = resolve('.humanlayer/verify/browser-computer-2069', `web-${Date.now()}`);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: process.env.BH_BROWSER_PROFILE,
  args: ['--no-sandbox', '--lang=zh-CN'],
});
const page = await browser.newPage();
const mutations = [];
page.on('request', (r) => {
  const body = r.postData() ?? '';
  if (
    /browserAccessSet|computerAccessSet/.test(body) ||
    /\/api\/(browser|computer)\/(start|stop|open)/.test(r.url())
  )
    mutations.push(r.url().split('?')[0]);
});
const errors = [],
  results = [];
page.on('pageerror', (e) => errors.push(e.message));
const parent = '[data-dock-header="bh:channel-body"]';
const ids = ['botharness-browser', 'botharness-computer'];
const labels = ['浏览器', '电脑'];
const codes = ['B', '0'];
const state = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('botharness.bot-mode-layout')));
const child = (id) => `[data-channel-subpanel="${id}"]`;
const toggle = (id) => `${parent} button[aria-label="${labels[ids.indexOf(id)]}"]`;
async function visible(id, value = true) {
  await page.waitForFunction(
    (selector, value) => !!document.querySelector(selector)?.checkVisibility() === value,
    {},
    child(id),
    value,
  );
}
async function key(code) {
  for (const mod of ['Meta', 'Alt', 'Shift']) await page.keyboard.down(mod);
  await page.keyboard.press(code);
  for (const mod of ['Shift', 'Alt', 'Meta']) await page.keyboard.up(mod);
}
async function select(name) {
  const row = await page.evaluate(
    (name) =>
      [...document.querySelectorAll('[data-dock-panel="bh:channels"] [data-channel-id]')]
        .find((n) => n.textContent.includes(name))
        ?.getAttribute('data-channel-id'),
    name,
  );
  assert.ok(row);
  await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${row}"]`);
  await page.waitForFunction(
    (name) =>
      document.querySelector('[data-dock-header="bh:channel-body"]')?.textContent.includes(name),
    {},
    name,
  );
  return row;
}
try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({ 'accept-language': 'zh-CN' });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 4; i++) {
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(
        (n) =>
          n.checkVisibility() &&
          ['继续', 'Continue', '稍后配置', 'Configure later', '跳过教程', 'Skip tutorial'].includes(
            n.textContent.trim(),
          ),
      );
      b?.click();
      return !!b;
    });
    if (!clicked) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!(await page.$(parent))) {
    await page.locator('::-p-aria(Bot 模式)').click();
  }
  await page.waitForSelector(parent);
  await select('Sessions QA Ada');
  await page.evaluate((raw) => localStorage.setItem('botharness.bot-mode-layout', raw), old);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(parent);
  const ada = await select('Sessions QA Ada');
  const migrated = await state();
  assert.equal(migrated.version, 6);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem('botharness.bot-mode-layout.before-bot-workspace-v6'),
    ),
    old,
  );
  for (const id of ids) {
    assert.equal(migrated.layout.panels[id], undefined);
    assert.equal(await page.$(`.bh-workspace-rail [data-pinned-panel="${id}"]`), null);
    await visible(id);
  }
  for (const id of ids) await page.waitForSelector(`${child(id)} [data-panel-empty]`);
  assert.deepEqual(migrated.botWorkspaces, JSON.parse(old).botWorkspaces);
  await page.screenshot({ path: resolve(out, 'migrated.png') });
  for (const [id, label] of [
    ['memory-files', '记忆文件'],
    ['memory-evolution', '记忆演化'],
    ['schedules', '定时任务'],
  ]) {
    if (await page.$eval(child(id), (n) => n.checkVisibility()))
      await page.click(`${parent} button[aria-label="${label}"]`);
  }
  await page.evaluate(() => {
    window.__botPanelNodes = [
      ...document.querySelectorAll(
        '[data-sidebar-entry="botharness-browser"], [data-sidebar-entry="botharness-computer"], [data-sidebar-entry="schedules"], .bh-message-content',
      ),
    ];
  });
  for (const id of ids) {
    await page.click(`${child(id)} [data-dock-header="${id}"]`, { button: 'right' });
    await page.locator('::-p-aria(移到消息下方)').click();
    await page.waitForFunction(
      (id) =>
        document.querySelector(`[data-workspace-split="${id}"]`)?.dataset.direction === 'below',
      {},
      id,
    );
    const divider = `[data-workspace-split="${id}"] > [role="separator"]`;
    await page.focus(divider);
    await page.keyboard.press('ArrowUp');
    assert.ok((await state()).botWorkspaces[ada][id].ratio >= 0.2);
  }
  assert.ok(await page.evaluate(() => window.__botPanelNodes.every((n) => n.isConnected)));
  const sessionPane = '[data-channel-subpanel="sessions"]';
  if (await page.$eval(sessionPane, (node) => node.checkVisibility()))
    await page.click(`${parent} button[aria-label="会话"]`);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-workspace-split="botharness-browser"]').getBoundingClientRect()
        .width >= 520,
  );
  await page.setDragInterception(true);
  const from = await page.$eval(`${child('botharness-browser')} [data-panel-label]`, (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const target = await page.$eval('[data-workspace-split="botharness-browser"]', (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.x + 8, y: r.y + r.height / 2 };
  });
  const drag = await page.mouse.drag(from, target);
  await page.mouse.dragEnter(target, drag);
  await page.mouse.dragOver(target, drag);
  await page.waitForSelector(
    '[data-workspace-split="botharness-browser"] > .bh-channel-drop-preview',
  );
  await page.screenshot({ path: resolve(out, 'drag.png') });
  await page.mouse.drop(target, drag);
  await page.mouse.up();
  await page.setDragInterception(false);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-workspace-split="botharness-browser"]')?.dataset.direction ===
      'left',
  );
  assert.ok(await page.evaluate(() => window.__botPanelNodes.every((n) => n.isConnected)));
  results.push({ pointerDragAndStableContent: true });
  const saved = (await state()).botWorkspaces[ada];
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(parent);
  await select('Sessions QA Ada');
  assert.deepEqual((await state()).botWorkspaces[ada], saved);
  results.push({ realV5Migration: true, stableContent: true, perPanelResizeAndRefresh: true });
  for (const [index, id] of ids.entries()) {
    await page.click('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]');
    await key(codes[index]);
    await visible(id);
    await key(codes[index]);
    await visible(id, false);
    await key(codes[index]);
    await visible(id);
  }
  await page.click(parent, { button: 'right' });
  await page.waitForSelector('[data-pointer-menu]');
  await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-pointer-menu] [role="menuitem"], [data-pointer-menu] button',
      ),
    ]
      .find((n) => n.textContent.includes('浏览器'))
      ?.click(),
  );
  await visible('botharness-browser', false);
  assert.equal(await page.$(toggle('botharness-browser')), null);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(parent);
  await select('Sessions QA Ada');
  assert.equal(await page.$(toggle('botharness-browser')), null);
  await page.focus(parent);
  await page.keyboard.down('Shift');
  await page.keyboard.press('F10');
  await page.keyboard.up('Shift');
  await page.waitForSelector('[data-pointer-menu]');
  await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-pointer-menu] [role="menuitem"], [data-pointer-menu] button',
      ),
    ]
      .find((n) => n.textContent.includes('浏览器'))
      ?.click(),
  );
  await page.waitForSelector(toggle('botharness-browser'));
  await page.click(toggle('botharness-browser'));
  await visible('botharness-browser');
  const bob = await select('Sessions QA Bob');
  for (const id of ids) {
    await visible(id);
    await page.click(toggle(id));
    await visible(id, false);
  }
  await select('Sessions QA Ada');
  for (const id of ids) await visible(id);
  await select('Sessions QA Group');
  for (const [index, id] of ids.entries()) {
    assert.equal(await page.$(toggle(id)), null);
    await key(codes[index]);
    await visible(id, false);
  }
  await select('Sessions QA Bob');
  for (const id of ids) await visible(id, false);
  await select('Sessions QA Ada');
  assert.notDeepEqual((await state()).botWorkspaces[bob], (await state()).botWorkspaces[ada]);
  results.push({
    defaultShortcutsRestoreParent: true,
    switchVisibilityPersistence: true,
    independentBots: true,
    groupExcluded: true,
  });
  await page.click('.bh-workspace-rail button[aria-label="Bot 设置"]');
  await page.locator('::-p-aria(键盘快捷键)').click();
  const recorder = 'button[aria-label="修改“开关 浏览器 面板”的快捷键"]';
  await page.click(recorder);
  await key('J');
  await page.waitForFunction(
    (s) => document.querySelector(s)?.textContent.includes('J'),
    {},
    recorder,
  );
  await page.keyboard.press('Escape');
  await key('J');
  await visible('botharness-browser', false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(parent);
  await select('Sessions QA Ada');
  await key('J');
  await visible('botharness-browser');
  await page.click('.bh-workspace-rail button[aria-label="Bot 设置"]');
  await page.locator('::-p-aria(键盘快捷键)').click();
  await page.$eval(recorder, (n) => n.parentElement.querySelector('button:last-child').click());
  await page.waitForFunction(
    (s) => document.querySelector(s)?.textContent.includes('B'),
    {},
    recorder,
  );
  await page.keyboard.press('Escape');
  results.push({ customShortcutAndRefresh: true, restoredDefault: true });
  for (const id of ['sessions']) {
    const button = await page.$(`${parent} button[aria-label="会话"]`);
    if (button && (await page.$eval(child(id), (n) => n.checkVisibility()))) await button.click();
  }
  await page.screenshot({ path: resolve(out, 'after.png') });
  await page.click(parent, { button: 'right' });
  await page.waitForSelector('[data-pointer-menu]');
  await page.screenshot({ path: resolve(out, 'menu.png') });
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  assert.deepEqual(mutations, []);
  results.push({ noAccessOrExecutionMutation: true });
} catch (error) {
  results.push({ failure: String(error) });
  await page.screenshot({ path: resolve(out, 'failure.png') });
  throw error;
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  console.log(out);
}
