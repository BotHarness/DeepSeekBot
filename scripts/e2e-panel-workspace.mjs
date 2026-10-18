import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const packageDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, packageDir, 'node_modules/'))('puppeteer');
if (!process.env.BH_E2E_INSTANCE)
  throw new Error('Set BH_E2E_INSTANCE to this task’s isolated instance.json');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const desktop = process.env.BH_DESKTOP_CDP;
const out = resolve(
  process.env.BH_SCREENSHOT_DIR ?? dirname(process.env.BH_E2E_INSTANCE),
  `workspace-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const browser = desktop
  ? await puppeteer.connect({ browserURL: desktop, defaultViewport: null })
  : await puppeteer.launch({
      headless: true,
      ignoreDefaultArgs: ['--hide-scrollbars'],
      args: ['--no-sandbox', '--lang=en-US'],
    });
const page = desktop ? (await browser.pages())[0] : await browser.newPage();
const errors = [],
  results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let chinese = false;
const labels = {
  'Bot mode': 'Bot 模式',
  'Exit Bot mode': '退出 Bot 模式',
  'Move control rail': '移动控制列',
  'Move to right edge': '移至最右',
  'Move before column 3': '移至第 3 列前',
  Appearance: '界面设置',
  'Search settings': '搜索设置',
  'Bot settings': 'Bot 设置',
  'Panel spacing': '面板间距',
};
const labelFor = (label) => (chinese ? (labels[label] ?? label) : label);
const click = (label) =>
  label === 'Exit Bot mode'
    ? page.click(`.bh-workspace-rail button[aria-label="${labelFor(label)}"]`)
    : page.locator(`::-p-aria(${labelFor(label)})`).click();
const storage = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('botharness.bot-mode-layout')));
const channels = '[data-dock-panel="bh:channels"]';
const rail = '.bh-workspace-rail';
let step = 'login';
async function sidebarShortcut() {
  if (desktop) {
    assert.ok(
      process.env.BH_DESKTOP_MAIN_CDP,
      'Set BH_DESKTOP_MAIN_CDP to the task Electron inspector',
    );
    const [{ webSocketDebuggerUrl }] = await (
      await fetch(`${process.env.BH_DESKTOP_MAIN_CDP}/json/list`)
    ).json();
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    try {
      await new Promise((resolve, reject) => {
        socket.onmessage = (event) => {
          const response = JSON.parse(event.data);
          if (response.id !== 1) return;
          if (response.error || response.result.exceptionDetails)
            reject(new Error(JSON.stringify(response)));
          else resolve(response);
        };
        socket.send(
          JSON.stringify({
            id: 1,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
          const electron = process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/package.json')('electron');
          const windows = electron.BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().startsWith('dsh-app://app/'));
          if (windows.length !== 1) throw new Error('Expected one task product window');
          const w = windows[0]; electron.app.focus({ steal: true }); w.focus(); w.webContents.focus();
          w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'B', modifiers: ['meta'] });
          w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'B', modifiers: ['meta'] });
          return true;
        })()`,
              returnByValue: true,
            },
          }),
        );
      });
    } finally {
      socket.close();
    }
    return;
  }
  await page.keyboard.down('Meta');
  await page.keyboard.down('Alt');
  await page.keyboard.press('b');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Meta');
}
async function proof(name) {
  step = name;
  await sleep(250);
  const geometry = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    return {
      main: rect('[data-bh-workspace-main]') ?? rect('[data-slot="main"]'),
      rail: rect('.bh-workspace-rail'),
      channels: rect('[data-dock-panel="bh:channels"]'),
      dock: rect('.bh-dock-theme'),
      viewport: innerWidth,
      platform: document.documentElement.dataset.platform,
      state: window.__BOTHARNESS_CLIENT_DIAGNOSTICS__?.snapshot().state,
    };
  });
  if (!desktop) assert.equal(geometry.state, 'shell-ready');
  if (geometry.rail) {
    assert.ok(Math.abs(geometry.rail.height - geometry.dock.height) < 2, 'rail stays full height');
    assert.equal(geometry.main.x, 0, 'native sidebar reserves no width');
    assert.equal(geometry.main.width, geometry.viewport, 'main spans available width');
    if (desktop) {
      assert.equal(geometry.platform, 'darwin');
      assert.ok(geometry.rail.y < 20, 'top space is used instead of a blank title strip');
    }
  }
  results.push({ step, geometry, layout: await storage() });
  await page.screenshot({ path: resolve(out, `${name}.png`), waitForFonts: false });
  writeFileSync(resolve(out, 'results.json'), JSON.stringify(results, null, 2));
}
try {
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  if (!desktop) await page.setViewport({ width: 1440, height: 900 });
  if (!desktop) {
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
    await page.goto(instance.url, { waitUntil: 'networkidle2' });
  }
  chinese = await page.evaluate(
    () =>
      document.body.innerText.includes('Bot 模式') ||
      !!document.querySelector('button[aria-label="退出 Bot 模式"]'),
  );
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (button) =>
            [
              'Continue',
              'Configure later',
              'Skip tutorial',
              '继续',
              '稍后配置',
              '跳过教程',
            ].includes(button.textContent.trim()) && button.offsetParent,
        )
        ?.click(),
    );
    await sleep(300);
  }
  await page.evaluate(() => localStorage.removeItem('botharness.bot-mode-layout'));
  if (await page.$(rail)) await click('Exit Bot mode');
  const before = await page.$eval(
    '[data-slot="sidebar"]',
    (node) => node.getBoundingClientRect().width,
  );
  await click('Bot mode');
  await page.waitForSelector(rail, { timeout: 20000 });
  await page.waitForSelector(`${channels} [data-channel-id]`, { timeout: 20000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-message-id]', { timeout: 20000 });
  await proof('01-default');
  step = 'scrollbar-activity';
  await sleep(1100);
  const scrollGeometry = await page.$eval('.bh-chat-body', (node) => {
    const box = node.getBoundingClientRect();
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      right: box.right,
      width: node.clientWidth,
      delta: node.scrollTop > 0 ? -25 : 25,
    };
  });
  const thumbOpacity = () =>
    page.$eval('.bh-chat-body', (node) =>
      Number(getComputedStyle(node).getPropertyValue('--bh-panel-scrollbar-opacity')),
    );
  assert.equal(await thumbOpacity(), 0);
  await page.evaluate(() => {
    window.__scrollbarMessageNode = document.querySelector('.bh-chat-body');
  });
  await page.mouse.move(scrollGeometry.x, scrollGeometry.y);
  await page.mouse.wheel({ deltaY: scrollGeometry.delta });
  await page.waitForFunction(
    () =>
      Number(
        getComputedStyle(document.querySelector('.bh-chat-body')).getPropertyValue(
          '--bh-panel-scrollbar-opacity',
        ),
      ) === 1,
  );
  assert.equal(
    await page.$eval('.bh-workspace-controls', (node) =>
      Number(getComputedStyle(node).getPropertyValue('--bh-panel-scrollbar-opacity')),
    ),
    0,
  );
  const reducedMotion = await page.evaluate(
    () => document.documentElement.dataset.botharnessMotion === 'reduce',
  );
  if (!reducedMotion) {
    await page.waitForFunction(() => {
      const opacity = Number(
        getComputedStyle(document.querySelector('.bh-chat-body')).getPropertyValue(
          '--bh-panel-scrollbar-opacity',
        ),
      );
      return opacity > 0 && opacity < 1;
    });
    await page.mouse.wheel({ deltaY: -scrollGeometry.delta });
    await page.waitForFunction(
      () =>
        Number(
          getComputedStyle(document.querySelector('.bh-chat-body')).getPropertyValue(
            '--bh-panel-scrollbar-opacity',
          ),
        ) === 1,
    );
  }
  await page.waitForFunction(
    () =>
      Number(
        getComputedStyle(document.querySelector('.bh-chat-body')).getPropertyValue(
          '--bh-panel-scrollbar-opacity',
        ),
      ) === 0,
  );
  await page.mouse.move(scrollGeometry.right - 2, scrollGeometry.y);
  await sleep(100);
  assert.equal(await thumbOpacity(), 0);
  assert.equal(await page.$eval('.bh-chat-body', (node) => node.clientWidth), scrollGeometry.width);
  assert.ok(
    await page.evaluate(
      () => window.__scrollbarMessageNode === document.querySelector('.bh-chat-body'),
    ),
  );
  await proof('01a-scrollbars-idle');
  step = 'pointer-menu-position';
  const pointerPositions = [];
  for (const zoom of [1, 1.25]) {
    await page.evaluate((value) => {
      document.body.style.zoom = String(value);
    }, zoom);
    await sleep(200);
    for (const selector of [
      '[data-dock-header="bh:channels"]',
      `${channels} .bh-contact[data-channel-id]`,
    ]) {
      const point = await page.$eval(selector, (node) => {
        const box = node.getBoundingClientRect();
        return { x: box.left + 60, y: box.top + 15 };
      });
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.waitForSelector('[data-pointer-menu] [role="menu"]');
      await sleep(100);
      const box = await page.$eval('[data-pointer-menu] [role="menu"]', (node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      });
      assert.ok(
        Math.abs(box.x - point.x) <= 1,
        `pointer menu x: ${JSON.stringify({ zoom, point, box })}`,
      );
      assert.ok(
        Math.abs(box.y - point.y) <= 1,
        `pointer menu y: ${JSON.stringify({ zoom, point, box })}`,
      );
      pointerPositions.push({ zoom, selector, point, box });
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-pointer-menu]', { hidden: true });
    }
    await page.$eval('[data-dock-header="bh:channels"]', (node) =>
      node.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: innerWidth - 2,
          clientY: innerHeight - 2,
        }),
      ),
    );
    await page.waitForSelector('[data-pointer-menu] [role="menu"]');
    const edges = await page.$eval('[data-pointer-menu] [role="menu"]', (node) => {
      const r = node.getBoundingClientRect();
      return { right: r.right <= innerWidth, bottom: r.bottom <= innerHeight };
    });
    assert.deepEqual(edges, { right: true, bottom: true });
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => {
    document.body.style.zoom = '';
  });
  writeFileSync(
    resolve(out, 'pointer-menu-positions.json'),
    JSON.stringify(pointerPositions, null, 2),
  );
  await proof('01b-pointer-menus');
  step = 'all-panel-header-menus';
  const headerMenuResults = [];
  const panelSwitches = await page.$$eval(`${rail} [data-pinned-panel]`, (nodes) =>
    nodes.map((node) => ({
      id: node.dataset.pinnedPanel,
      open: node.getAttribute('aria-pressed') === 'true',
    })),
  );
  for (const { id, open } of panelSwitches) {
    const toggle = `${rail} [data-pinned-panel="${id}"]`;
    const header = `[data-dock-header="${id}"]`;
    if (!open) await page.click(toggle);
    await page.waitForSelector(header, { visible: true });
    const otherPanels = await page.evaluate((current) => {
      window.__headerMenuPeers = [...document.querySelectorAll('[data-dock-header]')].filter(
        (node) => node.dataset.dockHeader !== current,
      );
      return window.__headerMenuPeers.map((node) => node.dataset.dockHeader).sort();
    }, id);
    await page.$eval(header, (node) => {
      node.addEventListener(
        'contextmenu',
        (event) => {
          window.__headerContextPoint = { x: event.clientX, y: event.clientY };
        },
        { once: true },
      );
    });
    await page.locator(header).click({ button: 'right' });
    const point = await page.evaluate(() => window.__headerContextPoint);
    await page.waitForSelector('[data-pointer-menu] [role="menu"]');
    const box = await page.$eval('[data-pointer-menu] [role="menu"]', (node) => {
      const rect = node.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: innerWidth,
        height: innerHeight,
        label: node.textContent,
      };
    });
    assert.ok(
      Math.abs(box.x - point.x) <= 1 && Math.abs(box.y - point.y) <= 1,
      `Panel header pointer: ${JSON.stringify({ id, point, box })}`,
    );
    assert.ok(box.right <= box.width && box.bottom <= box.height);
    assert.equal(
      await page.$$eval('[data-pointer-menu] [role="menuitem"]', (nodes) => nodes.length),
      1,
    );
    headerMenuResults.push({ id, point, box });
    await page.screenshot({ path: resolve(out, `header-menu-${id.replaceAll(':', '-')}.png`) });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-pointer-menu]', { hidden: true });
    assert.equal(
      await page.$eval(header, (node) => node === document.activeElement),
      true,
      'Escape restores header focus',
    );
    if (id === 'bh:channel-body') {
      await page.locator(header).click({ button: 'right' });
      await page.waitForSelector('[data-pointer-menu] [role="menu"]');
      await page.click('.bh-dock-body [role="textbox"]');
      await page.waitForSelector('[data-pointer-menu]', { hidden: true });
      assert.ok(
        await page.$eval(
          '.bh-dock-body [role="textbox"]',
          (node) => node === document.activeElement,
        ),
        'Outside click keeps composer focus',
      );
    }
    await page.focus(header);
    await page.keyboard.down('Shift');
    await page.keyboard.press('F10');
    await page.keyboard.up('Shift');
    await page.waitForSelector('[data-pointer-menu] [role="menu"]');
    const keyboardPosition = await page.$eval(header, (node) => {
      const anchor = node.getBoundingClientRect();
      const menu = document
        .querySelector('[data-pointer-menu] [role="menu"]')
        .getBoundingClientRect();
      return { dx: menu.left - anchor.left, dy: menu.top - anchor.bottom };
    });
    assert.ok(
      Math.abs(keyboardPosition.dx) <= 1 && Math.abs(keyboardPosition.dy) <= 1,
      `Panel header keyboard: ${JSON.stringify({ id, keyboardPosition })}`,
    );
    await page.click('[data-pointer-menu] [role="menuitem"]');
    await page.waitForSelector(header, { hidden: true });
    await page.waitForSelector('[data-pointer-menu]', { hidden: true });
    assert.equal(await page.$eval(toggle, (node) => node.getAttribute('aria-pressed')), 'false');
    assert.deepEqual(
      await page.$$eval('[data-dock-header]', (nodes) =>
        nodes.map((node) => node.dataset.dockHeader).sort(),
      ),
      otherPanels,
      'Close only removes the selected Panel',
    );
    assert.ok(
      await page.evaluate(() => window.__headerMenuPeers.every((node) => node.isConnected)),
      'Other Panel headers stay mounted',
    );
    assert.ok((await storage()).parked[id], `Closed Panel ${id} keeps its layout position`);
    if (open) {
      await page.click(toggle);
      await page.waitForSelector(header, { visible: true });
    }
  }
  writeFileSync(
    resolve(out, 'all-panel-header-menus.json'),
    JSON.stringify(headerMenuResults, null, 2),
  );
  await proof('01c-all-panel-header-menus');
  step = 'channel-search-alignment';
  await page.click('[data-dock-header="bh:channels"] .bh-search-btn');
  await sleep(250);
  const searchAlignment = await page.evaluate(() => {
    const search = document.querySelector('[data-dock-header="bh:channels"] .bh-search-open');
    const row = document.querySelector('[data-dock-panel="bh:channels"] [data-channel-id]');
    const bounds = search.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    let clipped = false;
    for (let parent = search.parentElement; parent; parent = parent.parentElement) {
      if (['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) {
        const box = parent.getBoundingClientRect();
        clipped ||= bounds.left < box.left - 1 || bounds.right > box.right + 1;
      }
    }
    const header = search.closest('[data-dock-header]');
    const leadingClearance = parseFloat(getComputedStyle(header).paddingLeft);
    return {
      left: bounds.left - rowBounds.left,
      right: bounds.right - rowBounds.right,
      leadingClearance,
      clipped,
    };
  });
  assert.ok(
    Math.abs(searchAlignment.left - searchAlignment.leadingClearance) < 1,
    'search aligns with the Channel row left edge, preserving native window-control clearance',
  );
  assert.ok(Math.abs(searchAlignment.right) < 1, 'search aligns with the Channel row right edge');
  assert.equal(searchAlignment.clipped, false, 'search border stays inside clipping ancestors');
  results.push({ step, searchAlignment });
  await proof('01b-search');
  await page.focus('[data-dock-header="bh:channels"] input');
  await page.keyboard.press('Escape');

  step = 'header-profile-details';
  assert.equal(await page.$('.bh-topbar .bh-channel-island'), null, 'no floating profile chip');
  await page
    .locator(
      `[data-dock-header="bh:channel-body"] button[aria-label="${chinese ? '查看资料' : 'View profile'}"]`,
    )
    .click();
  await page.waitForSelector('.bh-profile-view');
  assert.equal(await page.$('.bh-profile-popover'), null, 'profile opens without a popover');
  assert.equal(
    await page.$('.bh-profile-card-head .bh-profile-pin'),
    null,
    'profile cards have no pin controls',
  );
  assert.equal(await page.$('.bh-topbar .bh-companion-pin'), null, 'header has no pin shortcut');
  await proof('01c-profile-details');
  await page.click('.bh-profile-back');
  await page.waitForSelector('[data-message-id]');

  step = 'channel-switch-stability';
  await page.click('.bh-workspace-rail [data-pinned-panel="activity-center"]');
  const stablePanels = await page.$$(
    '.bh-workspace-rail, [data-dock-panel="bh:channels"], [data-dock-panel="activity-center"]',
  );
  const shortcutRows = await page.$$eval(`${channels} [data-channel-id]`, (nodes) =>
    nodes.map((node) => ({
      id: node.dataset.channelId,
      shortcut: node.getAttribute('aria-keyshortcuts'),
    })),
  );
  const originalChannel = await page.$eval(
    `${channels} .bh-selected[data-channel-id]`,
    (node) => node.dataset.channelId,
  );
  const targets = shortcutRows.filter((row) => row.shortcut?.match(/Alt\+[12]$/));
  assert.equal(targets.length, 2, 'QA profile needs two Channels with Alt+1/2 shortcuts');
  for (const target of [...targets, ...targets]) {
    await page.keyboard.down('Alt');
    await page.keyboard.press(`Digit${target.shortcut.at(-1)}`);
    await page.keyboard.up('Alt');
    await page.waitForFunction(
      (id) =>
        document.querySelector('[data-dock-panel="bh:channels"] .bh-selected[data-channel-id]')
          ?.dataset.channelId === id,
      {},
      target.id,
    );
    for (const panel of stablePanels)
      assert.ok(
        await panel.evaluate((node) => node.isConnected),
        'unrelated Panel remains mounted during Channel shortcuts',
      );
  }
  await page.click(`${channels} [data-channel-id="${originalChannel}"]`);
  for (const panel of stablePanels)
    assert.ok(
      await panel.evaluate((node) => node.isConnected),
      'mouse Channel navigation also preserves unrelated Panels',
    );
  await proof('01d-channel-switch-stability');
  await page.click('.bh-workspace-rail [data-pinned-panel="activity-center"]');
  await page.waitForSelector('[data-message-id]');

  const liveMessage = await page.$('[data-message-id]');
  const liveRoster = await page.$(`${channels} [data-channel-id]`);
  const assertLive = async () => {
    assert.ok(
      await liveMessage.evaluate((node) => node.isConnected),
      'message content stays mounted',
    );
    assert.ok(await liveRoster.evaluate((node) => node.isConnected), 'roster stays mounted');
  };
  const switchOrder = () =>
    page.$$eval('.bh-workspace-rail [data-pinned-panel]', (nodes) =>
      nodes.map((node) => node.dataset.pinnedPanel),
    );
  const orderBefore = await switchOrder();
  await page.setDragInterception(true);
  const buttonRect = async (id, fraction = 0.25) =>
    page.$eval(
      `.bh-workspace-rail [data-pinned-panel="${id}"]`,
      (node, fraction) => {
        const r = node.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height * fraction };
      },
      fraction,
    );
  const reorderFrom = await buttonRect(orderBefore[2]);
  const reorderTo = await buttonRect(orderBefore[0]);
  const reorderDrag = await page.mouse.drag(reorderFrom, reorderTo);
  await page.mouse.dragEnter(reorderTo, reorderDrag);
  await page.mouse.dragOver(reorderTo, reorderDrag);
  await page.waitForSelector('[data-panel-order-indicator="before"]');
  assert.equal(
    await page.$eval(
      `.bh-workspace-rail [data-pinned-panel="${orderBefore[2]}"]`,
      (node) => node.dataset.dragging,
    ),
    'true',
  );
  await proof('01a-switch-insertion');
  await page.mouse.drop(reorderTo, reorderDrag);
  await page.mouse.up();
  await page.waitForFunction(
    (id) =>
      document.querySelector('.bh-workspace-rail [data-pinned-panel]')?.dataset.pinnedPanel === id,
    {},
    orderBefore[2],
  );
  await assertLive();
  assert.equal(await page.$$eval('[data-panel-order-indicator]', (nodes) => nodes.length), 0);
  const lastSwitch = orderBefore.at(-1);
  const bottom = await buttonRect(lastSwitch, 0.9);
  const endDrag = await page.mouse.drag(await buttonRect(orderBefore[2]), bottom);
  await page.mouse.dragEnter(bottom, endDrag);
  await page.mouse.dragOver(bottom, endDrag);
  await page.waitForSelector('[data-panel-order-indicator="after"]');
  await page.mouse.drop(bottom, endDrag);
  await page.mouse.up();
  assert.equal((await switchOrder()).at(-1), orderBefore[2], 'drop below last switch appends');
  assert.equal(await page.$$eval('[data-panel-order-indicator]', (nodes) => nodes.length), 0);
  const afterDrop = await switchOrder();
  const cancelTarget = await buttonRect(afterDrop[0]);
  const cancelled = await page.mouse.drag(await buttonRect(afterDrop[2]), cancelTarget);
  await page.mouse.dragEnter(cancelTarget, cancelled);
  await page.mouse.dragOver(cancelTarget, cancelled);
  await page.waitForSelector('[data-panel-order-indicator]');
  const outside = { x: cancelTarget.x + 200, y: cancelTarget.y };
  await page.mouse.dragOver(outside, cancelled);
  assert.equal(await page.$$eval('[data-panel-order-indicator]', (nodes) => nodes.length), 0);
  const dragSession = await page.createCDPSession();
  await dragSession.send('Input.dispatchDragEvent', {
    type: 'dragCancel',
    ...outside,
    data: cancelled,
  });
  await dragSession.detach();
  await page.mouse.up();
  await page.waitForSelector('[data-dragging="true"]', { hidden: true });
  assert.deepEqual(await switchOrder(), afterDrop, 'cancel leaves order unchanged');
  await page.setDragInterception(false);
  await page.focus(`.bh-workspace-rail [data-pinned-panel="${afterDrop[1]}"]`);
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.up('Alt');
  assert.equal((await switchOrder())[0], afterDrop[1], 'keyboard reorder remains available');
  await assertLive();
  const reordered = await switchOrder();
  await proof('01b-switch-order');
  assert.equal((await storage()).version, 6);
  assert.equal((await storage()).gap, 4);
  assert.equal(
    await page.$eval(
      '.bh-workspace-rail [data-open="true"]',
      (node) => getComputedStyle(node).borderTopColor,
    ),
    'rgba(0, 0, 0, 0)',
  );
  step = 'shortcut';
  await sidebarShortcut();
  await page.waitForSelector(channels, { hidden: true, timeout: 5000 });
  await proof('02-shortcut-closed-channels');
  await sidebarShortcut();
  await page.waitForSelector(channels, { timeout: 5000 });
  await click('Move control rail');
  await click('Move to right edge');
  assert.ok(
    await liveMessage.evaluate((node) => node.isConnected),
    'rail movement preserves message content',
  );
  await proof('03-right');
  const right = results.at(-1).geometry;
  assert.ok(right.rail.right > right.viewport - 20);
  await click('Move control rail');
  await click('Move before column 3');
  assert.ok(
    await liveMessage.evaluate((node) => node.isConnected),
    'second rail movement preserves content',
  );
  await proof('04-middle');
  assert.ok(
    results.at(-1).geometry.rail.x > 200 &&
      results.at(-1).geometry.rail.right < right.viewport - 100,
  );
  if (!desktop) {
    step = 'drag-channels';
    await page.setDragInterception(true);
    const from = await page.$eval('[data-dock-header="bh:channels"]', (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x + 110, y: r.y + r.height / 2 };
    });
    const to = await page.$eval('.bh-dock-body', (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.right - 20, y: r.y + r.height / 2 };
    });
    const drag = await page.mouse.drag(from, to);
    await page.mouse.dragEnter(to, drag);
    await page.mouse.dragOver(to, drag);
    await page.mouse.drop(to, drag);
    await page.mouse.up();
    await page.setDragInterception(false);
    assert.ok(
      await liveMessage.evaluate((node) => node.isConnected),
      'panel movement preserves content',
    );
    await proof('04b-drag-channels');
  }
  await page.click(
    '.bh-workspace-rail button[aria-label="' + (chinese ? 'Bot 设置' : 'Bot settings') + '"]',
  );
  await page.type(
    `input[aria-label="${labelFor('Search settings')}"]`,
    chinese ? '间距' : 'spacing',
  );
  await page.click('.bh-settings-search-results button');
  await page.waitForSelector('[data-settings-highlight]');
  assert.equal(
    await page.$eval('[data-settings-content]', (node) => node.dataset.settingsContent),
    'appearance',
  );
  await page.locator(`input[aria-label="${labelFor('Panel spacing')}"]`).click();
  for (const gap of [0, 16, 12]) {
    await page.keyboard.press('Home');
    for (let i = 0; i < gap; i++) await page.keyboard.press('ArrowRight');
    await sleep(200);
    assert.equal((await storage()).gap, gap);
    await proof(`05-gap-${gap}`);
  }
  await page.keyboard.press('Escape');
  assert.equal((await storage()).gap, 12);
  await proof('05-spacing');
  step = 'close-reopen-channels';
  await page.click('.bh-workspace-rail [data-pinned-panel="bh:channels"]');
  assert.ok((await storage()).parked['bh:channels']);
  await page.click('.bh-workspace-rail [data-pinned-panel="bh:channels"]');
  await page.waitForSelector(channels);
  await page.click('.bh-workspace-rail [data-pinned-panel="activity-center"]');
  await page.waitForSelector('[data-dock-panel="activity-center"]');
  await proof('06-activity');
  const persisted = await storage();
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector(rail);
  await page.waitForSelector('[data-message-id]', { timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelector('.bh-workspace-rail')?.getBoundingClientRect().y < 20,
  );
  await proof('07-refresh');
  assert.deepEqual(await switchOrder(), reordered, 'switch order survives refresh');
  await page.click('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]');
  await page.waitForSelector('.bh-dock-body', { hidden: true });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector(rail);
  assert.equal(await page.$('.bh-dock-body'), null, 'closed Messages stays closed after refresh');
  step = 'profile-reopens-messages';
  const profileRow = await page.$(`${channels} .bh-contact[data-channel-id]`);
  const expectedProfileName = await profileRow.$eval('.bh-name', (node) => node.textContent);
  await profileRow.click({ button: 'right' });
  await page.locator(`::-p-aria(${chinese ? '查看资料' : 'View profile'})`).click();
  await page.waitForSelector('.bh-dock-body .bh-profile-view');
  assert.equal(
    await page.$eval('.bh-profile-view-name', (node) => node.textContent),
    expectedProfileName,
  );
  assert.equal(
    await page.$eval('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]', (node) =>
      node.getAttribute('aria-pressed'),
    ),
    'true',
  );
  await proof('07b-profile-reopens-messages');
  await page.click('.bh-profile-back');
  await page.waitForSelector('[data-message-id]');
  if (!desktop) {
    const ratio = () =>
      page.$eval(
        '[data-dock-panel="bh:channels"]',
        (node) => node.getBoundingClientRect().width / (innerWidth - 56),
      );
    const initialRatio = await ratio();
    await page.setViewport({ width: 1800, height: 1000 });
    await sleep(300);
    assert.ok(
      Math.abs((await ratio()) - initialRatio) < 0.04,
      'panel width remains proportional on resize',
    );
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector(channels);
    assert.ok(
      Math.abs((await ratio()) - initialRatio) < 0.04,
      'proportion survives refresh at resized width',
    );
    await page.setViewport({ width: 1440, height: 900 });
    await proof('07c-proportions');
  }
  assert.equal((await storage()).gap, 12);
  assert.deepEqual(
    Object.keys((await storage()).layout.panels).sort(),
    Object.keys(persisted.layout.panels).sort(),
  );
  if (!desktop) {
    await page.setViewport({ width: 900, height: 800 });
    await page.waitForSelector('[data-bh-workspace-frame]', { hidden: true });
    await proof('08-narrow');
    await page.setViewport({ width: 1440, height: 900 });
    await page.waitForSelector(rail);
    await proof('09-wide-again');
  }
  await click('Exit Bot mode');
  await page.waitForSelector('[data-bh-workspace-frame]', { hidden: true });
  await proof('10-exit');
  const after = await page.$eval(
    '[data-slot="sidebar"]',
    (node) => node.getBoundingClientRect().width,
  );
  assert.equal(after, before, 'native sidebar collapse state and width restored');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'WORKSPACE PASS', desktop: !!desktop, evidence: out }));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), waitForFonts: false }).catch(() => {});
  writeFileSync(
    resolve(out, 'failure.txt'),
    JSON.stringify(
      {
        step,
        error: String(error),
        text: await page.evaluate(() => document.body.innerText).catch(() => ''),
        observation: await page
          .evaluate(() => window.__BOTHARNESS_CLIENT_DIAGNOSTICS__?.snapshot())
          .catch(() => undefined),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  writeFileSync(resolve(out, 'page-errors.json'), JSON.stringify(errors, null, 2));
  if (desktop) browser.disconnect();
  else await browser.close();
}
