import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

assert.ok(
  process.env.BH_E2E_INSTANCE && process.env.BH_SESSION_SCENE && process.env.BH_BROWSER_PROFILE,
  'Set the task-owned instance, existing real Assignment scene and browser profile (prepared by the old UI)',
);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const scene = JSON.parse(readFileSync(process.env.BH_SESSION_SCENE, 'utf8'));
const modules = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((x) => x.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), `channel-sessions-${Date.now()}`);
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: process.env.BH_BROWSER_PROFILE,
  args: ['--no-sandbox'],
  ignoreDefaultArgs: ['--hide-scrollbars'],
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
const follows = [];
cdp.on('Network.webSocketFrameSent', ({ response }) => {
  try {
    const frame = JSON.parse(response.payloadData);
    if (frame.type === 'open' && frame.endpoint === 'session/follow')
      follows.push(frame.payload.args.request.address.sessionId);
  } catch {}
});
const errors = [],
  results = [];
page.on('pageerror', (error) => errors.push(error.message));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const child = '[data-channel-subpanel="sessions"]';
const parent = '[data-dock-header="bh:channel-body"]';
const entry = '[data-sidebar-entry="sessions"]';
const stored = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('botharness.bot-mode-layout')));
const screenshot = (name) => page.screenshot({ path: resolve(out, `${name}.png`) });
async function key(code = '7') {
  await page.keyboard.down('Meta');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press(code);
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Meta');
  await pause(200);
}
async function visible(expected = true) {
  await page.waitForFunction(
    (selector, expected) => !!document.querySelector(selector)?.checkVisibility() === expected,
    {},
    child,
    expected,
  );
}
async function enter() {
  await page.waitForSelector('.bh-workspace-rail, .bh-panel-glyph');
  if (!(await page.$('.bh-workspace-rail'))) await page.click('.bh-panel-glyph');
  await page.waitForSelector('.bh-workspace-rail');
}
try {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  if (process.env.BH_LEGACY_LAYOUT) {
    const original = readFileSync(process.env.BH_LEGACY_LAYOUT, 'utf8');
    assert.equal(JSON.parse(original).version, 3, 'Replay an actual old-UI saved layout');
    await page.evaluate((raw) => localStorage.setItem('botharness.bot-mode-layout', raw), original);
    await page.reload({ waitUntil: 'networkidle2' });
  }
  await enter();
  if (!(await page.$('.bh-workspace-rail button[aria-label="Bot 设置"]'))) {
    await page.click('.bh-workspace-rail button[aria-label="Bot settings"]');
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((node) => node.textContent.trim() === 'Appearance')
        ?.click(),
    );
    await page.click('button[aria-label="Interface language"]');
    await page.locator('::-p-aria(中文)').click();
    await page.waitForSelector('.bh-workspace-rail button[aria-label="Bot 设置"]');
    await page.keyboard.press('Escape');
  }
  await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${scene.channel.id}"]`);
  if (!(await page.$(parent)))
    await page.click('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]');
  if (!(await page.$eval(child, (e) => e.checkVisibility()))) await key();
  await visible();
  assert.equal(await page.$(`${parent} button[aria-label="频道子面板"]`), null);
  await page.click(parent, { button: 'right' });
  await page.waitForSelector('[data-pointer-menu] [data-control-checked="true"]');
  await screenshot('header-controls');
  await page.click('[data-pointer-menu] [data-control-checked="true"]');
  await visible(false);
  assert.equal(await page.$(`${parent} button[aria-label="会话"]`), null);
  assert.equal((await stored()).channelWorkspaces[scene.channel.id].hiddenControl, true);
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector(parent);
  assert.equal(await page.$(`${parent} button[aria-label="会话"]`), null);
  await page.focus(parent);
  await page.keyboard.down('Shift');
  await page.keyboard.press('F10');
  await page.keyboard.up('Shift');
  await page.waitForSelector('[data-pointer-menu] [data-control-checked="false"]');
  await page.click('[data-pointer-menu] [data-control-checked="false"]');
  await page.waitForSelector(`${parent} button[aria-label="会话"]`);
  await page.click(`${parent} button[aria-label="会话"]`);
  await visible();
  results.push('header context menu hides child and switch, persists, keyboard recovers switch');
  const initial = await stored();
  assert.equal(initial.version, 6);
  assert.equal(initial.layout.panels.sessions, undefined);
  assert.equal(await page.$('.bh-workspace-rail [data-pinned-panel="sessions"]'), null);
  const backup = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('botharness.bot-mode-layout.before-channel-workspace-v4')),
  );
  assert.equal(backup.version, 3);
  assert.ok(backup.layout.panels.sessions, 'Migration starts from an actual old-UI open panel');
  await page.waitForSelector(`${entry} .bh-group-work-row`);
  await screenshot('after-upgrade');
  await page.screenshot({
    path: resolve(out, 'after-header.png'),
    clip: { x: 0, y: 0, width: 1440, height: 120 },
  });
  results.push({ realV3Upgrade: true, nestedSessions: true, originalBackup: true });
  await page.evaluate(() => {
    window.__workspacePeers = [
      document.querySelector('.bh-composer-shell'),
      document.querySelector('[data-dock-panel="bh:channels"]'),
      document.querySelector('[data-sidebar-entry="sessions"]'),
    ];
  });
  const divider = `${child} ~ never, .bh-channel-session-divider`;
  await page.focus(divider);
  const beforeResize = initial.channelWorkspaces?.[scene.channel.id] ?? initial.sessionSeed;
  const axis = await page.$eval('[data-channel-workspace]', (node) => node.dataset.splitAxis);
  const leading = ['left', 'above'].includes(beforeResize.direction);
  const resizeKey =
    axis === 'vertical'
      ? leading
        ? 'ArrowDown'
        : 'ArrowUp'
      : leading
        ? 'ArrowRight'
        : 'ArrowLeft';
  await page.keyboard.press(resizeKey);
  await page.keyboard.press(resizeKey);
  const groupState = (await stored()).channelWorkspaces[scene.channel.id];
  assert.ok(Math.abs(groupState.ratio - Math.min(0.8, beforeResize.ratio + 0.04)) < 0.000001);
  for (const [side, zh, en] of [
    ['left', '移到消息左侧', 'Move left of Messages'],
    ['above', '移到消息上方', 'Move above Messages'],
    ['below', '移到消息下方', 'Move below Messages'],
    ['right', '移到消息右侧', 'Move right of Messages'],
  ]) {
    await page.click(`${child} [data-dock-header="sessions"]`, { button: 'right' });
    await page.waitForSelector('[data-pointer-menu]');
    await page.evaluate(
      (zh, en) =>
        [
          ...document.querySelectorAll(
            '[data-pointer-menu] [role="menuitem"], [data-pointer-menu] button',
          ),
        ]
          .find((e) => e.textContent.trim() === zh || e.textContent.trim() === en)
          ?.click(),
      zh,
      en,
    );
    await page.waitForFunction(
      (side) => document.querySelector('[data-channel-workspace]')?.dataset.direction === side,
      {},
      side,
    );
    const geometry = await page.evaluate(() => {
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      };
      return {
        message: box(document.querySelector('.bh-channel-message-host')),
        session: box(document.querySelector('[data-channel-subpanel="sessions"]')),
      };
    });
    if (side === 'left') assert.ok(geometry.session.right <= geometry.message.x + 1);
    if (side === 'right') assert.ok(geometry.message.right <= geometry.session.x + 1);
    if (side === 'above') assert.ok(geometry.session.bottom <= geometry.message.y + 1);
    if (side === 'below') assert.ok(geometry.message.bottom <= geometry.session.y + 1);
  }
  assert.ok(
    await page.evaluate(() => window.__workspacePeers.every((e) => e.isConnected)),
    'Reorder and resize retain content',
  );
  await screenshot('after-rearrange');
  results.push({ fourSides: true, keyboardResize: true, stableContent: true });
  await page.setDragInterception(true);
  const from = await page.$eval(`${child} [data-panel-label]`, (node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const target = await page.$eval('[data-channel-workspace]', (node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x + 8, y: r.y + r.height / 2 };
  });
  const drag = await page.mouse.drag(from, target);
  await page.mouse.dragEnter(target, drag);
  await page.mouse.dragOver(target, drag);
  await page.waitForSelector('.bh-channel-drop-preview[data-drop-side="left"]');
  await screenshot('drag-indicator');
  await page.mouse.drop(target, drag);
  await page.mouse.up();
  await page.setDragInterception(false);
  await page.waitForFunction(
    () => document.querySelector('[data-channel-workspace]')?.dataset.direction === 'left',
  );
  assert.ok(await page.evaluate(() => window.__workspacePeers.every((e) => e.isConnected)));
  results.push({ realPointerDrag: true, dropIndicator: true });
  groupState.direction = 'left';

  await page.reload({ waitUntil: 'networkidle2' });
  await enter();
  await visible();
  assert.deepEqual((await stored()).channelWorkspaces[scene.channel.id], groupState);
  await page.click('.bh-workspace-rail [data-pinned-panel="bh:channel-body"]');
  assert.equal(await page.$(parent), null);
  await key();
  await visible();
  assert.ok(await page.$(parent));
  await key();
  await visible(false);
  assert.ok(await page.$(parent));
  await key();
  await visible();
  results.push({ refresh: true, parentRestore: true, defaultThreeStateShortcut: true });
  const dmId = await page.evaluate(
    (slug) =>
      [...document.querySelectorAll('[data-dock-panel="bh:channels"] [data-channel-id]')].find(
        (e) => e.dataset.channelId !== slug,
      )?.dataset.channelId,
    scene.channel.id,
  );
  assert.ok(dmId);
  await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${dmId}"]`);
  if (!(await page.$eval(child, (e) => e.checkVisibility()))) await key();
  await visible();
  await key();
  await visible(false);
  await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${scene.channel.id}"]`);
  await visible();
  assert.equal(await page.$('.bh-workspace-rail [data-pinned-panel="botharness-browser"]'), null);
  for (const id of ['botharness-computer', 'memory-files', 'memory-evolution', 'schedules'])
    assert.equal(await page.$(`.bh-workspace-rail [data-pinned-panel="${id}"]`), null);
  await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${dmId}"]`);
  await visible(false);
  await page.reload({ waitUntil: 'networkidle2' });
  await enter();
  await visible(false);
  results.push({ perChannelVisibility: true, groupBotOnlyExcluded: true });
  await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${scene.channel.id}"]`);
  await visible();
  const canonical = await page.evaluate(async (id) => {
    const response = await fetch('/api/botharness/channelAssignments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: crypto.randomUUID(),
        method: 'botharness/channelAssignments',
        payload: { args: { channelId: id } },
      }),
    });
    return (await response.json()).result;
  }, scene.channel.id);
  assert.ok(canonical.ok && canonical.value.assignments.length);
  results.push({ realAssignments: canonical.value.assignments.map((a) => a.sessionId) });
  const scope = `${child} button[aria-label="会话视图选项"]`;
  await page.click(scope);
  await page.locator(`::-p-aria(Bot · ${scene.bot.displayName})`).click();
  await page.waitForSelector('[data-session-target]');
  assert.equal(await page.$('.bh-workspace-rail [data-pinned-panel="botharness-browser"]'), null);
  await page.click(scope);
  await page.locator('::-p-aria(当前频道)').click();
  await page.waitForSelector(`${entry} .bh-group-work-row`);
  const assignment = canonical.value.assignments[0];
  await page.click(`${entry} [data-flip-key="${assignment.sessionId}"] .bh-group-work-row`);
  await page.waitForFunction(() => !document.querySelector('.bh-workspace-rail'));
  await page.waitForFunction(() => document.body.innerText.includes('SESSION_SCOPE_QA_DONE'));
  await pause(300);
  assert.ok(
    follows.includes(assignment.sessionId),
    'The Client follows the canonical Assignment, including a reused stream',
  );
  results.push({
    sameAssignmentNavigation: true,
    nativeReportVisible: true,
    explicitBotScope: true,
  });
  await enter();
  await visible();

  const settings = '.bh-workspace-rail button[aria-label="Bot 设置"]';
  const recorder = 'button[aria-label="修改“开关 会话 面板”的快捷键"]';
  await page.click(settings);
  await page.locator('::-p-aria(键盘快捷键)').click();
  await page.click(recorder);
  await pause(200);
  await key('J');
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('J'),
    {},
    recorder,
  );
  await page.keyboard.press('Escape');
  await key('J');
  await visible(false);
  await key('J');
  await visible();
  await page.reload({ waitUntil: 'networkidle2' });
  await enter();
  await visible();
  await key('J');
  await visible(false);
  await key('J');
  await visible();
  await page.hover(`${parent} button[aria-label="会话"]`);
  await pause(600);
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="tooltip"]')].some((e) => e.textContent.includes('J')),
    ),
  );
  await page.click(settings);
  await page.locator('::-p-aria(键盘快捷键)').click();
  await page.$eval(recorder, (node) =>
    node.parentElement.querySelector('button:last-child').click(),
  );
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('7'),
    {},
    recorder,
  );
  await page.keyboard.press('Escape');
  results.push({
    customShortcut: true,
    customRefresh: true,
    effectiveTooltip: true,
    defaultRestored: true,
  });
  await page.click(`[data-dock-panel="bh:channels"] [data-channel-id="${dmId}"]`);
  if (!(await page.$eval(child, (e) => e.checkVisibility()))) await key();
  await visible();
  await pause(500);
  await screenshot('final');
  assert.deepEqual(errors, []);
} catch (error) {
  results.push({ failure: String(error) });
  await screenshot('failure');
  writeFileSync(resolve(out, 'failure.txt'), await page.evaluate(() => document.body.innerText));
  throw error;
} finally {
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  console.log(out);
}
