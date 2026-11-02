import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

assert.ok(
  process.env.BH_DESKTOP_CDP && process.env.BH_DESKTOP_MAIN_CDP && process.env.BH_SCREENSHOT_DIR,
  'Set task-owned renderer/main debug endpoints and evidence directory',
);
const modules = resolve('node_modules/.pnpm');
const installed = readdirSync(modules).find((entry) => entry.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, installed, 'node_modules/'))('puppeteer');
const out = resolve(process.env.BH_SCREENSHOT_DIR, `channel-sessions-desktop-${Date.now()}`);
mkdirSync(out, { recursive: true });
console.log('Connecting native renderer');
const browser = await puppeteer.connect({
  browserURL: process.env.BH_DESKTOP_CDP,
  defaultViewport: null,
});
console.log('Connected native renderer');
const pages = (await browser.pages()).filter((page) => page.url().startsWith('dsh-app://app/'));
assert.equal(pages.length, 1, 'Use the single task product window');
const page = pages[0];
page.setDefaultTimeout(45000);
console.log('Resolved native page');
const results = [],
  errors = [];
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const rail = '.bh-workspace-rail';
const header = '[data-dock-header="sessions"]';
const child = '[data-channel-subpanel="sessions"]';
const parent = '[data-dock-header="bh:channel-body"]';
const toggle = `${parent} button[aria-label="会话"]`;
async function visible(expected = true) {
  await page.waitForFunction(
    (selector, expected) => !!document.querySelector(selector)?.checkVisibility() === expected,
    {},
    child,
    expected,
  );
}
async function key(keyCode, modifiers = []) {
  const [{ webSocketDebuggerUrl }] = await (
    await fetch(`${process.env.BH_DESKTOP_MAIN_CDP}/json/list`)
  ).json();
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.onopen = done;
    socket.onerror = reject;
  });
  try {
    await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(Error('Native input inspector timeout')), 10000);
      socket.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.id !== 1) return;
        clearTimeout(timeout);
        if (response.error || response.result.exceptionDetails)
          reject(Error(JSON.stringify(response)));
        else done();
      };
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `(async () => { const electron = process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/package.json')('electron'); const windows = electron.BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().startsWith('dsh-app://app/')); if (windows.length !== 1) throw Error('Expected task product window'); const w = windows[0]; electron.app.focus({steal:true}); w.focus(); w.webContents.focus(); await new Promise(resolve => setTimeout(resolve, 250)); if (!w.isFocused()) throw Error('Task Desktop must be foreground'); w.webContents.sendInputEvent({type:'keyDown',keyCode:${JSON.stringify(keyCode)},modifiers:${JSON.stringify(modifiers)}}); w.webContents.sendInputEvent({type:'keyUp',keyCode:${JSON.stringify(keyCode)},modifiers:${JSON.stringify(modifiers)}}); return true; })()`,
            returnByValue: true,
            awaitPromise: true,
          },
        }),
      );
    });
  } finally {
    socket.close();
  }
  await wait(350);
}
try {
  await key('Escape');
  await key('Escape');
  console.log('Focusing native page');
  await page.bringToFront();
  console.log('Focused native page');
  page.on('pageerror', (error) => errors.push(error.message));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.platform), 'darwin');
  await page.waitForSelector(rail);
  if (!(await page.$(parent))) await page.click(`${rail} [data-pinned-panel="bh:channel-body"]`);
  console.log('Waiting for Sessions control');
  await page.waitForSelector(toggle);
  const settings = `${rail} button[aria-label="Bot 设置"]`;
  const recorder = 'button[aria-label="修改“开关 会话 面板”的快捷键"]';
  console.log('Opening native settings');
  await page.click('[data-dock-header="bh:channel-body"]', { button: 'right' });
  await page.waitForSelector('[data-pointer-menu] [data-control-checked="true"]');
  await page.click('[data-pointer-menu] [data-control-checked="true"]');
  await visible(false);
  assert.equal(await page.$(toggle), null);
  await page.click('[data-dock-header="bh:channel-body"]', { button: 'right' });
  await page.waitForSelector('[data-pointer-menu] [data-control-checked="false"]');
  await page.click('[data-pointer-menu] [data-control-checked="false"]');
  await page.waitForSelector(toggle);
  await page.click(toggle);
  await visible();
  results.push({ headerContextSwitchVisibility: true });
  console.log('Settings click');
  await page.click(settings);
  console.log('Settings clicked');
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((node) => node.textContent.trim() === '键盘快捷键')
      ?.click(),
  );
  await page.$eval(
    recorder,
    (node) =>
      node.parentElement.querySelectorAll('button').length > 1 &&
      node.parentElement.querySelector('button:last-child').click(),
  );
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('7'),
    {},
    recorder,
  );
  await key('Escape');
  if (!(await page.$eval(child, (e) => e.checkVisibility()))) await page.click(toggle);
  await visible();
  await page.click(`${rail} [data-pinned-panel="bh:channel-body"]`);
  await key('7', ['meta', 'alt', 'shift']);
  await visible();
  assert.ok(await page.$(parent));
  await key('7', ['meta', 'alt', 'shift']);
  await visible(false);
  assert.ok(await page.$(parent));
  await key('7', ['meta', 'alt', 'shift']);
  await visible();
  console.log('Native default shortcut passed');
  results.push({ nativeDarwin: true, defaultNativeDispatch: true, parentRestored: true });
  const separator = '.bh-channel-session-divider';
  await page.focus(separator);
  await key('Left');
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('botharness.bot-mode-layout')),
  );
  assert.equal(state.version, 6);
  assert.equal(state.layout.panels.sessions, undefined);
  console.log('Settings click');
  await page.click(settings);
  console.log('Settings clicked');
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((node) => node.textContent.trim() === '键盘快捷键')
      ?.click(),
  );
  console.log('Record custom');
  await page.click(recorder);
  await page.waitForSelector('[data-shortcut-recorder]');
  console.log('Dispatch J');
  await key('J', ['meta', 'alt', 'shift']);
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('J'),
    {},
    recorder,
  );
  await key('Escape');
  console.log('Dispatch J');
  await key('J', ['meta', 'alt', 'shift']);
  await visible(false);
  console.log('Dispatch J');
  await key('J', ['meta', 'alt', 'shift']);
  await visible();
  console.log('Reload native');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(toggle);
  await visible();
  console.log('Dispatch J');
  await key('J', ['meta', 'alt', 'shift']);
  await visible(false);
  console.log('Dispatch J');
  await key('J', ['meta', 'alt', 'shift']);
  await visible();
  await page.hover(toggle);
  await wait(600);
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="tooltip"]')].some((e) => e.textContent.includes('J')),
    ),
  );
  console.log('Settings click');
  await page.click(settings);
  console.log('Settings clicked');
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((node) => node.textContent.trim() === '键盘快捷键')
      ?.click(),
  );
  await page.$eval(
    recorder,
    (node) =>
      node.parentElement.querySelectorAll('button').length > 1 &&
      node.parentElement.querySelector('button:last-child').click(),
  );
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('7'),
    {},
    recorder,
  );
  await key('Escape');
  results.push({
    nativeCustomDispatch: true,
    refresh: true,
    effectiveTooltip: true,
    defaultRestored: true,
  });
  const groupRow = await page.$('[data-dock-panel="bh:channels"] [data-channel-id]');
  assert.ok(groupRow);
  await page.locator('::-p-aria(test 暂无消息)').click();
  await visible();
  assert.equal(await page.$(`${rail} [data-pinned-panel="botharness-browser"]`), null);
  for (const id of ['botharness-computer', 'memory-files', 'memory-evolution', 'schedules'])
    assert.equal(await page.$(`${rail} [data-pinned-panel="${id}"]`), null);
  await page.waitForSelector(`${header} button[aria-label="会话视图选项"]`);
  await page.click(`${header} button[aria-label="会话视图选项"]`);
  await page.locator('::-p-aria(Bot · DeepSeek Bot)').click();
  await page.waitForSelector('[data-session-target]');
  for (const id of ['botharness-computer', 'memory-files', 'memory-evolution', 'schedules'])
    assert.equal(await page.$(`${rail} [data-pinned-panel="${id}"]`), null);
  await page.screenshot({ path: resolve(out, 'native-group.png') });
  await page.click(`${header} button[aria-label="会话视图选项"]`);
  await page.locator('::-p-aria(当前频道)').click();
  await visible();
  await wait(500);
  await page.screenshot({ path: resolve(out, 'native-final.png') });
  results.push({ groupScope: true, groupBotOnlyExcluded: true });
  await page.evaluate(() =>
    [...document.querySelectorAll('[data-dock-panel="bh:channels"] [data-channel-id]')]
      .find((n) => n.textContent.trim().startsWith('DeepSeek Bot'))
      ?.click(),
  );
  const botPanels = [
    ['memory-files', '记忆文件', '6'],
    ['memory-evolution', '记忆演化', 'E'],
    ['schedules', '定时任务', '9'],
    ['botharness-browser', '浏览器', 'B'],
    ['botharness-computer', '电脑', '0'],
  ];
  for (const [id, label, code] of botPanels) {
    const button = `${parent} button[aria-label="${label}"]`;
    const selector = `[data-channel-subpanel="${id}"]`;
    await page.waitForSelector(button);
    assert.equal(await page.$(`${rail} [data-pinned-panel="${id}"]`), null);
    if (!(await page.$eval(selector, (node) => node.checkVisibility()))) await page.click(button);
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.checkVisibility(),
      {},
      selector,
    );
    await page.click(`${rail} [data-pinned-panel="bh:channel-body"]`);
    await key(code, ['meta', 'alt', 'shift']);
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.checkVisibility(),
      {},
      selector,
    );
    await key(code, ['meta', 'alt', 'shift']);
    await page.waitForFunction(
      (selector) => !document.querySelector(selector)?.checkVisibility(),
      {},
      selector,
    );
    await key(code, ['meta', 'alt', 'shift']);
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.checkVisibility(),
      {},
      selector,
    );
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(rail);
  await page.evaluate(() =>
    [...document.querySelectorAll('[data-dock-panel="bh:channels"] [data-channel-id]')]
      .find((n) => n.textContent.trim().startsWith('DeepSeek Bot'))
      ?.click(),
  );
  for (const [id] of botPanels)
    await page.waitForFunction(
      (id) => document.querySelector(`[data-channel-subpanel="${id}"]`)?.checkVisibility(),
      {},
      id,
    );
  await page.waitForFunction(() =>
    document
      .querySelector('[data-dock-header="bh:channel-body"]')
      ?.textContent.includes('DeepSeek Bot'),
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[data-channel-subpanel="memory-files"] [data-path="MEMORY.md"]') !==
      null,
  );
  await wait(1000);
  await page.screenshot({ path: resolve(out, 'native-bot-panels.png') });
  results.push({ botSubpanelsNativeDispatch: true, botSubpanelsRefresh: true });

  assert.deepEqual(errors, []);
} catch (error) {
  results.push({ failure: String(error) });
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  if (!page.isClosed())
    writeFileSync(
      resolve(out, 'failure.txt'),
      await page.evaluate(() => document.body.innerText).catch(() => 'Renderer unavailable'),
    );
  throw error;
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.disconnect();
  console.log(out);
}
