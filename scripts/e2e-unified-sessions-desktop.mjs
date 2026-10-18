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
const out = resolve(process.env.BH_SCREENSHOT_DIR, `sessions-desktop-${Date.now()}`);
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
const results = [],
  errors = [];
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const rail = '.bh-workspace-rail';
const header = '[data-dock-header="sessions"]';
const toggle = `${rail} [data-pinned-panel="sessions"]`;
async function settledSessions() {
  await page.bringToFront();
  await page.waitForSelector(header, { visible: true });
  await page.waitForFunction(() => {
    const body = document.querySelector('[data-sidebar-entry="sessions"]');
    return body && !body.querySelector('.bh-skeleton') && body.innerText.trim().length > 0;
  });
  await wait(800);
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
            expression: `(() => { const electron = process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/package.json')('electron'); const windows = electron.BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().startsWith('dsh-app://app/')); if (windows.length !== 1) throw Error('Expected task product window'); const w = windows[0]; electron.app.focus({steal:true}); w.focus(); w.webContents.focus(); w.webContents.sendInputEvent({type:'keyDown',keyCode:${JSON.stringify(keyCode)},modifiers:${JSON.stringify(modifiers)}}); w.webContents.sendInputEvent({type:'keyUp',keyCode:${JSON.stringify(keyCode)},modifiers:${JSON.stringify(modifiers)}}); return true; })()`,
            returnByValue: true,
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
  await page.bringToFront();
  page.on('pageerror', (error) => errors.push(error.message));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.platform), 'darwin');
  console.log('Waiting for native rail');
  await page.waitForSelector(toggle);
  if ((await page.$eval(toggle, (node) => node.getAttribute('aria-label'))).includes('J')) {
    await page.locator(`${rail} button[aria-label="Bot 设置"]`).click();
    await page.locator('::-p-aria(键盘快捷键)').click();
    await page.$eval('button[aria-label="修改“开关 会话 面板”的快捷键"]', (node) =>
      node.parentElement.querySelector('button:last-child').click(),
    );
    await key('Escape');
  }
  if (await page.$(`${toggle}[aria-pressed="false"]`)) await page.click(toggle);
  const peers = await page.evaluate(() => {
    window.__sessionNativePeers = [
      document.querySelector('.bh-composer-shell'),
      document.querySelector('[data-dock-panel="bh:channels"]'),
    ];
    return window.__sessionNativePeers.every(Boolean);
  });
  assert.ok(peers);
  console.log('Dispatch native 7');
  await key('7', ['meta', 'alt', 'shift']);
  await page.waitForFunction(
    (selector) => !document.querySelector(selector),
    { timeout: 10000 },
    header,
  );
  await key('7', ['meta', 'alt', 'shift']);
  await page.waitForSelector(header);
  assert.ok(
    await page.evaluate(() => window.__sessionNativePeers.every((node) => node.isConnected)),
  );
  results.push({ defaultNativeDispatch: true, otherPanelsStable: true });
  await page.click(`${rail} button[aria-label="Bot 设置"]`);
  await page.locator('::-p-aria(键盘快捷键)').click();
  const recorder = 'button[aria-label="修改“开关 会话 面板”的快捷键"]';
  await page.click(recorder);
  await wait(300);
  await key('J', ['meta', 'alt', 'shift']);
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('J'),
    {},
    recorder,
  );
  assert.equal(await page.$('button[aria-label="修改“开关 工作 面板”的快捷键"]'), null);
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute('aria-label')?.includes('J'),
    {},
    toggle,
  );
  await wait(500);
  await page.screenshot({ path: resolve(out, 'custom-shortcut.png') });
  await key('Escape');
  await key('J', ['meta', 'alt', 'shift']);
  await page.waitForFunction(
    (selector) => !document.querySelector(selector),
    { timeout: 10000 },
    header,
  );
  await key('J', ['meta', 'alt', 'shift']);
  await page.waitForSelector(header);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(toggle);
  assert.ok((await page.$eval(toggle, (node) => node.getAttribute('aria-label'))).includes('J'));
  await key('J', ['meta', 'alt', 'shift']);
  await page.waitForFunction(
    (selector) => !document.querySelector(selector),
    { timeout: 10000 },
    header,
  );
  await key('J', ['meta', 'alt', 'shift']);
  await page.waitForSelector(header);
  await page.click(`${rail} button[aria-label="Bot 设置"]`);
  await page.locator('::-p-aria(键盘快捷键)').click();
  await page.$eval(recorder, (node) =>
    node.parentElement.querySelector('button:last-child').click(),
  );
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('7'),
    {},
    recorder,
  );
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute('aria-label')?.includes('7'),
    {},
    toggle,
  );
  await key('Escape');
  results.push({ customNativeDispatch: true, reload: true, defaultRestored: true });
  await page.locator('::-p-aria(test 暂无消息)').click();
  await page.waitForSelector(`${header} button[aria-label="会话视图选项"]`);
  await page.locator(`${header} button[aria-label="会话视图选项"]`).click();
  await page.locator('::-p-aria(Bot · DeepSeek Bot)').click();
  await page.waitForSelector('[data-session-target]');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-session-target]');
  assert.ok(
    (await page.$eval('[data-session-target]', (node) => node.textContent)).includes(
      'DeepSeek Bot',
    ),
  );
  await settledSessions();
  assert.ok(
    await page.$eval(header, (node) => {
      const bounds = node.closest('.dv-groupview').getBoundingClientRect();
      const heading = node.querySelector('[data-panel-label]').getBoundingClientRect();
      const action = node
        .querySelector('button[aria-label="会话视图选项"]')
        ?.getBoundingClientRect();
      return (
        action &&
        action.right <= bounds.right &&
        action.left >= bounds.left &&
        heading.left >= bounds.left
      );
    }),
    'The view-options button remains inside the narrow panel header',
  );
  await page.screenshot({ path: resolve(out, 'group-bot-scope.png') });
  await page.waitForSelector(`${header} button[aria-label="会话视图选项"]`);
  await page.locator(`${header} button[aria-label="会话视图选项"]`).click();
  await page.locator('::-p-aria(当前频道)').click();
  assert.equal(await page.$('[data-session-target]'), null);
  await settledSessions();
  await page.screenshot({ path: resolve(out, 'group-channel-scope.png') });
  results.push({ groupScope: true, scopeRefresh: true, defaultLabelOmitted: true });
  assert.deepEqual(errors, []);
} catch (error) {
  results.push({ failure: String(error) });
  await page.screenshot({ path: resolve(out, 'failure.png') });
  writeFileSync(resolve(out, 'failure.txt'), await page.evaluate(() => document.body.innerText));
  throw error;
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.disconnect();
  console.log(out);
}
