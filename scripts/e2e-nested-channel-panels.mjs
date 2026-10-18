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
page.setDefaultTimeout(30000);
const out = resolve(
  process.env.BH_SCREENSHOT_DIR || '.humanlayer/verify/nested-panels-2076',
  `${native ? 'native' : 'web'}-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const samples = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const parent = '[data-dock-header="bh:channel-body"]';
const rail = (id) => `.bh-workspace-rail [data-pinned-panel="${id}"]`;

const state = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('botharness.bot-mode-layout')));
const box = (id) =>
  page.$eval(`[data-channel-leaf="${id}"]`, (n) => n.getBoundingClientRect().toJSON());
async function clickControl(label, open) {
  const selector = `${parent} button[aria-label="${label}"]`;
  if ((await page.$eval(selector, (n) => n.getAttribute('aria-pressed') === 'true')) !== open)
    await page.click(selector);
  await pause(150);
}
async function nativeKey(keyCode, modifiers) {
  const [{ webSocketDebuggerUrl }] = await (
    await fetch(process.env.BH_DESKTOP_MAIN_CDP + '/json/list')
  ).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  try {
    await new Promise((r, j) => {
      ws.onmessage = (event) => {
        const m = JSON.parse(event.data);
        if (m.id === 1) {
          if (m.error || m.result.exceptionDetails) j(Error(JSON.stringify(m)));
          else r();
        }
      };
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `(()=>{const electron=process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json')('electron');const w=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('dsh-app://app/'));electron.app.focus({steal:true});w.focus();w.webContents.focus();w.webContents.sendInputEvent({type:'keyDown',keyCode:${JSON.stringify(keyCode)},modifiers:${JSON.stringify(modifiers)}});w.webContents.sendInputEvent({type:'keyUp',keyCode:${JSON.stringify(keyCode)},modifiers:${JSON.stringify(modifiers)}});})()`,
            returnByValue: true,
          },
        }),
      );
    });
  } finally {
    ws.close();
  }
}
try {
  if (!native) {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE)).url, {
      waitUntil: 'domcontentloaded',
    });
  }
  await page.waitForSelector('.bh-workspace-rail');
  await pause(1000);
  if (!(await page.$(parent))) await page.click(rail('bh:channel-body'));
  if (await page.$('[data-dock-header="activity-center"]'))
    await page.click(rail('activity-center'));
  for (const label of ['会话', '定时任务', '浏览器控制', '电脑控制']) {
    if (await page.$(`${parent} button[aria-label="${label}"]`)) await clickControl(label, false);
  }
  for (const label of ['记忆文件', '记忆演化']) await clickControl(label, true);
  assert.equal((await state()).version, 7);
  const backup = await page.evaluate(() =>
    localStorage.getItem('botharness.bot-mode-layout.before-channel-splits-v7'),
  );
  assert.ok(backup && JSON.parse(backup).version <= 6);
  const channel = await page.$eval('.bh-channel-workspace-root', (n) => n.dataset.channelWorkspace);
  assert.ok(channel);
  for (const id of ['memory-files', 'memory-evolution']) {
    await page.click(`[data-channel-subpanel="${id}"] [data-dock-header]`, { button: 'right' });
    await page.locator('::-p-aria(移到消息右侧)').click();
  }
  await pause(300);
  const content = await page.$('[data-channel-subpanel="memory-files"]');
  const message = await page.$('[data-channel-leaf="messages"] .bh-message-content');
  const from = await page.$eval(
    '[data-channel-subpanel="memory-evolution"] .bh-channel-session-header',
    (n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x + 12, y: r.y + r.height / 2 };
    },
  );
  const rect = await box('memory-files');
  const target = { x: rect.x + rect.width / 2, y: rect.bottom - 12 };
  await page.setDragInterception(true);
  const drag = await page.mouse.drag(from, target);
  await page.mouse.dragEnter(target, drag);
  await page.mouse.dragOver(target, drag);
  await pause(200);
  await page.waitForSelector('[data-channel-leaf="memory-files"] [data-drop-side="below"]');
  await page.screenshot({ path: resolve(out, 'drop-target.png') });
  await page.mouse.drop(target, drag);
  await page.mouse.up();
  await page.setDragInterception(false);
  await pause(300);
  const files = await box('memory-files'),
    evolution = await box('memory-evolution');
  assert.ok(Math.abs(files.x - evolution.x) < 2 && Math.abs(files.width - evolution.width) < 2);
  assert.ok(evolution.y >= files.bottom && evolution.y - files.bottom < 20);
  assert.equal(await content.evaluate((n) => n.isConnected), true);
  assert.equal(await message.evaluate((n) => n.isConnected), true);
  const vertical = await page.$$eval(
    '.bh-channel-workspace[data-split-axis="vertical"]',
    (nodes) => {
      const n = nodes.find(
        (n) =>
          n.querySelector('[data-channel-leaf="memory-files"]') &&
          n.querySelector('[data-channel-leaf="memory-evolution"]'),
      );
      const sash = n.querySelector(':scope > [role="separator"]'),
        r = sash.getBoundingClientRect(),
        b = n.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, target: b.y + b.height * 0.64 };
    },
  );
  await page.mouse.move(vertical.x, vertical.y);
  await page.mouse.down();
  await page.mouse.move(vertical.x, vertical.target, { steps: 6 });
  await page.mouse.up();
  await pause(200);
  const saved = (await state()).channelSplits[channel];
  const original = await box('memory-files');
  for (const label of ['记忆文件', '记忆演化']) {
    await clickControl(label, false);
    await clickControl(label, true);
  }
  assert.deepEqual((await state()).channelSplits[channel], saved);
  assert.ok(Math.abs((await box('memory-files')).height - original.height) < 2);
  await page.screenshot({ path: resolve(out, 'nested.png') });
  await page.click(rail('bh:channel-body'));
  await pause(200);
  if (native) await nativeKey('E', ['meta', 'alt', 'shift']);
  else {
    for (const key of ['Meta', 'Alt', 'Shift']) await page.keyboard.down(key);
    await page.keyboard.press('KeyE');
    for (const key of ['Shift', 'Alt', 'Meta']) await page.keyboard.up(key);
  }
  await page.waitForSelector('[data-channel-subpanel="memory-evolution"]');
  assert.deepEqual((await state()).channelSplits[channel], saved);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bh-workspace-rail');
  await pause(1000);
  const row = `[data-dock-panel="bh:channels"] [data-channel-id="${channel}"]`;
  if (await page.$(row)) await page.click(row);
  await page.waitForSelector('[data-channel-subpanel="memory-evolution"]');
  assert.deepEqual((await state()).channelSplits[channel], saved);
  if (!native) {
    const group = await page.$eval(
      '[data-dock-panel="bh:channels"]',
      (n) =>
        [...n.querySelectorAll('[data-channel-id]')].find((row) =>
          row.innerText.includes('Sessions QA Group'),
        )?.dataset.channelId,
    );
    assert.ok(group);
    await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${group}"]`);
    await pause(300);
    assert.equal(await page.$('[data-channel-subpanel="memory-files"]'), null);
    assert.equal(await page.$(`${parent} button[aria-label="记忆文件"]`), null);
    await page.click(row);
    await page.waitForSelector('[data-channel-subpanel="memory-files"]');
    assert.deepEqual((await state()).channelSplits[channel], saved);
  }
  const outer = await page.$$eval('.dv-sash.dv-enabled', (ns) =>
    ns.map((n) => n.getBoundingClientRect().toJSON()).find((r) => r.height > r.width),
  );
  const start = { x: outer.x + outer.width / 2, y: Math.min(outer.y + outer.height / 2, 350) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(850, start.y, { steps: 8 });
  await pause(300);
  const headers = await page.$$eval('[data-channel-subpanel] .bh-channel-session-header', (ns) =>
    ns.map((n) => {
      const r = n.getBoundingClientRect(),
        label = n.querySelector('[data-panel-label]');
      return {
        width: r.width,
        labelWhiteSpace: getComputedStyle(label).whiteSpace,
        labelHeight: label.getBoundingClientRect().height,
        buttons: [...n.querySelectorAll('[data-dock-actions] button')].map((b) => {
          const q = b.getBoundingClientRect();
          return {
            inside: q.left >= r.left && q.right <= r.right + 1,
            clickable:
              document
                .elementFromPoint(q.x + q.width / 2, q.y + q.height / 2)
                ?.closest('button') === b,
            height: q.height,
          };
        }),
        tabs: [...n.querySelectorAll('[role="tab"]')].map((b) => getComputedStyle(b).whiteSpace),
      };
    }),
  );
  for (const header of headers) {
    assert.equal(header.labelWhiteSpace, 'nowrap');
    for (const button of header.buttons) {
      assert.ok(button.inside);
      assert.ok(button.clickable);
    }
    for (const tab of header.tabs) assert.equal(tab, 'nowrap');
  }
  assert.deepEqual((await state()).channelSplits[channel], saved);
  const narrowFiles = await box('memory-files'),
    narrowEvolution = await box('memory-evolution');
  assert.ok(
    Math.abs(narrowFiles.x - narrowEvolution.x) < 2 && narrowEvolution.y >= narrowFiles.bottom,
  );
  await page.screenshot({ path: resolve(out, 'narrow.png') });
  await page.mouse.move(start.x, start.y, { steps: 8 });
  await page.mouse.up();
  samples.push({
    channel,
    files,
    evolution,
    headers,
    tree: saved,
    mounted: true,
    shortcut: true,
    refreshed: true,
  });
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
