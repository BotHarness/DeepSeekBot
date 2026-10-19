import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rpc } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const instanceFile = process.env.BH_E2E_INSTANCE;
assert.ok(instanceFile, 'BH_E2E_INSTANCE must name this task-owned isolated Host');
const instance = JSON.parse(readFileSync(resolve(instanceFile), 'utf8'));
assert.equal(resolve(instance.worktree), root);
const evidence = join(dirname(resolve(instanceFile)), 'evidence', `hover-time-${Date.now()}`);
mkdirSync(evidence, { recursive: true });
const store = resolve(root, 'node_modules/.pnpm');
const installed = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
assert.ok(installed, 'Install workspace dependencies first');
const puppeteer = createRequire(join(store, installed, 'node_modules/'))('puppeteer');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sourceCommit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain');
if (process.env.BH_E2E_REQUIRE_CLEAN === '1')
  assert.equal(dirty, '', 'record evidence from a clean worktree');
const dshVersion = JSON.parse(
  readFileSync(join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'),
).version;
const environment = {
  platform: process.platform,
  node: process.version,
  dshVersion,
  sourceCommit,
  dirty,
};
const runId = crypto.randomUUID().slice(0, 8);
const firstBody = `hover-time ${runId} one`;
const secondBody = `hover-time ${runId} two`;
const evidenceFile = join(evidence, 'result.json');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let channelId;
const steps = [];
const step = (name) => {
  steps.push(name);
  process.stdout.write(`${name}\n`);
};

async function waitForSecond(target) {
  for (;;) {
    const now = new Date();
    const seconds = now.getSeconds();
    const waitMs = ((target - seconds + 60) % 60) * 1000 - now.getMilliseconds();
    if (waitMs <= 0) return;
    await sleep(Math.min(waitMs, 1000));
  }
}

async function waitForBot() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await rpc(instance, 'botharness/list');
    if (result.bots.length > 0) return result.bots[0];
    await sleep(500);
  }
  throw new Error('default Bot did not appear');
}

const browser = await puppeteer.launch({
  headless: true,
  ...(process.env.PUPPETEER_EXECUTABLE_PATH
    ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
    : {}),
  protocolTimeout: 240_000,
  args: [
    '--no-sandbox',
    '--lang=en-US',
    '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
  ],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

async function dismiss() {
  for (let round = 0; round < 6; round += 1) {
    const clicked = await page.evaluate(() => {
      const labels = [
        'Continue',
        '继续',
        'Configure later',
        '稍后配置',
        'Continue later',
        'Skip tutorial',
        '跳过教程',
        'Get started',
        '开始使用',
      ];
      const button = [...document.querySelectorAll('button')].find(
        (node) => labels.includes(node.textContent?.trim() ?? '') && node.offsetParent !== null,
      );
      button?.click();
      return button?.textContent?.trim() ?? null;
    });
    if (clicked === null) return;
    await sleep(400);
  }
}

async function clickAria(prefixes, { ifUnpressed = false } = {}) {
  const target = await page.evaluate(
    ({ prefixes, ifUnpressed }) => {
      const named = [
        ...document.querySelectorAll(
          'button[aria-label], [role="button"][aria-label], a[aria-label]',
        ),
      ];
      const visible = (node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      };
      const labelled = named.find(
        (node) =>
          prefixes.some((prefix) => (node.getAttribute('aria-label') ?? '').startsWith(prefix)) &&
          visible(node),
      );
      const fallback = [...document.querySelectorAll('button, [role="button"], a')].find(
        (node) =>
          prefixes.some((prefix) => (node.textContent ?? '').trim().startsWith(prefix)) &&
          visible(node),
      );
      const button = labelled ?? fallback;
      if (!button) return null;
      if (ifUnpressed && button.getAttribute('aria-pressed') === 'true') return { skipped: true };
      button.setAttribute('data-bh-e2e-control', '');
      const box = button.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, clickable: hit !== null && (hit === button || button.contains(hit)) };
    },
    { prefixes, ifUnpressed },
  );
  if (!target || target.skipped === true) return false;
  if (target.clickable) await page.mouse.click(target.x, target.y);
  else await page.evaluate(() => document.querySelector('[data-bh-e2e-control]')?.click());
  await page.evaluate(() =>
    document.querySelector('[data-bh-e2e-control]')?.removeAttribute('data-bh-e2e-control'),
  );
  return true;
}

async function openConversation(mobile = false) {
  await dismiss();
  if ((await page.$('.bh-root.bh-main')) === null) {
    await page.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find(
          (node) =>
            ['Bot mode', 'Bot 模式'].includes(node.getAttribute('aria-label') ?? '') &&
            node.offsetParent !== null,
        )
        ?.click();
    });
    await page.waitForSelector('.bh-root.bh-main', { timeout: 30_000 });
    await sleep(1500);
  }
  await dismiss();
  if (!mobile) {
    await clickAria(['Close Home', '关闭 Home']);
    await sleep(600);
    await clickAria(['Messages ·', '消息 ·'], { ifUnpressed: true });
    await sleep(600);
  }
  const visible = await page.evaluate(
    (body) =>
      [...document.querySelectorAll('[data-message-id]')].some((node) =>
        node.textContent?.includes(body),
      ),
    secondBody,
  );
  if (!visible) {
    if (!channelId) throw new Error('conversation is not open and the Channel is unavailable');
    const row = await page.evaluate((id) => {
      const button = [...document.querySelectorAll(`[data-channel-id="${id}"]`)].find((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      if (!button) return null;
      button.setAttribute('data-bh-e2e-channel', '');
      const box = button.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, clickable: hit !== null && (hit === button || button.contains(hit)) };
    }, channelId);
    if (!row) throw new Error('channel row not found');
    if (row.clickable) await page.mouse.click(row.x, row.y);
    else await page.evaluate(() => document.querySelector('[data-bh-e2e-channel]')?.click());
    await page.evaluate(() =>
      document.querySelector('[data-bh-e2e-channel]')?.removeAttribute('data-bh-e2e-channel'),
    );
  }
  await page.waitForFunction(
    (body) =>
      [...document.querySelectorAll('[data-message-id]')].some((node) =>
        node.textContent?.includes(body),
      ),
    { timeout: 30_000 },
    secondBody,
  );
  await sleep(500);
  await moveAway();
}

function measure(firstId, secondId) {
  return page.evaluate(
    ({ firstId, secondId }) => {
      const rect = (node) => {
        const box = node?.getBoundingClientRect();
        return box
          ? {
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
              width: box.width,
              height: box.height,
            }
          : null;
      };
      const style = (node, name) => (node ? getComputedStyle(node)[name] : null);
      const info = (id) => {
        const wrap = document.querySelector(`[data-message-id="${id}"]`);
        const bubble = wrap?.querySelector('.bh-bubble');
        const side = wrap?.querySelector('.bh-bubble-side');
        const meta = wrap?.querySelector('.bh-bubble-meta');
        const time = meta?.querySelector('time');
        const chips = wrap?.querySelector('[data-message-reactions]');
        const toolbar = wrap?.querySelector('.bh-bubble-toolbar');
        const actions = [...(wrap?.querySelectorAll('.bh-bubble-actions button') ?? [])];
        return {
          wrap: rect(wrap),
          bubble: rect(bubble),
          sideDisplay: style(side, 'display'),
          meta: rect(meta),
          time: rect(time),
          timeText: time?.textContent ?? null,
          timeColor: style(time, 'color'),
          metaOpacity: style(meta, 'opacity'),
          metaDisplay: style(meta, 'display'),
          chips: rect(chips),
          toolbarOpacity: style(toolbar, 'opacity'),
          actions: actions.map((action) => {
            const box = action.getBoundingClientRect();
            const hit = document.elementFromPoint(
              box.left + box.width / 2,
              box.top + box.height / 2,
            );
            return {
              label: action.getAttribute('aria-label'),
              hit:
                hit === action || action.contains(hit)
                  ? 'self'
                  : (hit?.className?.toString().slice(0, 60) ?? null),
            };
          }),
        };
      };
      const wrap = document.querySelector(`[data-message-id="${secondId}"]`);
      const group = wrap?.closest('.bh-message-group');
      const avatar = group?.querySelector('.bh-message-group-avatar');
      const groupTime = group?.querySelector('.bh-bubble-time');
      return {
        hoverHover: matchMedia('(hover: hover)').matches,
        hoverNone: matchMedia('(hover: none)').matches,
        groupSize: group?.getAttribute('data-group-size') ?? null,
        avatar: rect(avatar),
        avatarOpacity: style(avatar, 'opacity'),
        groupTime: rect(groupTime),
        groupTimeText: groupTime?.textContent ?? null,
        groupTimeOpacity: style(groupTime, 'opacity'),
        first: info(firstId),
        second: info(secondId),
      };
    },
    { firstId, secondId },
  );
}

async function hover(id) {
  const target = await page.evaluate((id) => {
    const node = document.querySelector(`[data-message-id="${id}"] .bh-bubble`);
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + Math.min(box.height / 2, 18) };
  }, id);
  if (!target) throw new Error(`message ${id} is not visible`);
  await page.mouse.move(target.x, target.y);
  await sleep(300);
}

async function moveAway() {
  await page.mouse.move(2, 2);
  await sleep(250);
}

async function shot(name) {
  await page.screenshot({ path: join(evidence, `${name}.png`) });
}

async function expectedTimes(firstAt, secondAt) {
  return page.evaluate(
    ({ firstAt, secondAt }) => ({
      first: new Date(firstAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      second: new Date(secondAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }),
    { firstAt, secondAt },
  );
}

function close(rect, other, tolerance = 1) {
  return Math.abs(rect.bottom - other.bottom) <= tolerance;
}

let result;
try {
  step('open-client');
  await page.goto(instance.url, { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.waitForFunction(
    () => ['New Session', '新建会话'].some((text) => document.body.innerText.includes(text)),
    { timeout: 60_000 },
  );
  await dismiss();
  step('enter-bot-mode');
  if ((await page.$('.bh-root.bh-main')) === null) {
    await clickAria(['Bot mode', 'Bot 模式']);
    await page.waitForSelector('.bh-root.bh-main', { timeout: 30_000 });
  }
  await sleep(1500);
  const bot = await waitForBot();
  const dm = await rpc(instance, 'botharness/channelDm', {
    slug: bot.slug,
    displayName: bot.displayName,
  });
  channelId = dm.channel.id;
  step('seed-messages');
  await waitForSecond(55);
  await rpc(instance, 'botharness/botToolRun', {
    slug: bot.slug,
    tool: 'channel_send',
    args: { channel_id: dm.channel.id, body: firstBody },
  });
  await sleep(10_000);
  await rpc(instance, 'botharness/botToolRun', {
    slug: bot.slug,
    tool: 'channel_send',
    args: { channel_id: dm.channel.id, body: secondBody },
  });
  const timeline = await rpc(instance, 'botharness/channelMessages', {
    channelId: dm.channel.id,
  });
  const firstMessage = timeline.messages.find((message) => message.body === firstBody);
  const secondMessage = timeline.messages.find((message) => message.body === secondBody);
  assert.ok(
    firstMessage && secondMessage,
    'seeded messages are missing from the canonical timeline',
  );
  const gap = Date.parse(secondMessage.at) - Date.parse(firstMessage.at);
  assert.ok(gap > 0 && gap <= 15_000, `seeded messages are not in one group window (${gap}ms)`);
  step('open-conversation');
  await page.reload({ waitUntil: 'networkidle2', timeout: 60_000 });
  await openConversation();
  const initial = await measure(firstMessage.id, secondMessage.id);
  assert.equal(initial.hoverHover, true, 'desktop check does not report hover:hover');
  assert.equal(initial.groupSize, '2', 'the seeded messages did not form a two-message group');
  const expected = await expectedTimes(firstMessage.at, secondMessage.at);
  assert.notEqual(expected.first, expected.second, 'seeded messages landed in the same minute');
  assert.equal(initial.groupTimeText, expected.first);
  assert.equal(initial.groupTimeOpacity, '0');
  assert.equal(initial.second.timeText, expected.second);
  assert.equal(initial.first.timeText, null);
  assert.equal(initial.second.metaOpacity, '0');
  assert.equal(initial.avatarOpacity, '1');
  result = {
    environment,
    browserVersion: await browser.version(),
    runId,
    channelId: dm.channel.id,
    messageIds: { first: firstMessage.id, second: secondMessage.id },
    expected,
    initial,
    steps,
    evidence,
  };
  step('hover-first');
  await hover(firstMessage.id);
  const firstHover = await measure(firstMessage.id, secondMessage.id);
  assert.equal(firstHover.groupTimeOpacity, '1', 'first message time did not appear on hover');
  assert.equal(firstHover.first.timeText, null, 'first message gained its own hover time');
  assert.equal(firstHover.second.metaOpacity, '0', 'second message time leaked into first hover');
  assert.equal(firstHover.avatarOpacity, '1', 'first message hover hid the avatar');
  for (const key of ['left', 'top', 'width', 'height'])
    assert.ok(
      Math.abs(firstHover.groupTime[key] - initial.groupTime[key]) <= 0.5,
      `group time ${key} moved on hover`,
    );
  await shot('first-hover-light');
  step('hover-second');
  await moveAway();
  await hover(secondMessage.id);
  const secondHover = await measure(firstMessage.id, secondMessage.id);
  assert.equal(secondHover.second.timeText, expected.second);
  assert.equal(secondHover.second.metaOpacity, '1');
  assert.equal(secondHover.avatarOpacity, '0');
  assert.ok(
    secondHover.second.time.right <= secondHover.second.bubble.left + 1,
    'time is not left of the bubble',
  );
  assert.ok(secondHover.second.time.left >= 0, 'time is outside the viewport');
  for (const key of ['left', 'top', 'width', 'height'])
    assert.ok(
      Math.abs(secondHover.second.bubble[key] - initial.second.bubble[key]) <= 0.5,
      `bubble ${key} moved or resized on hover`,
    );
  assert.ok(
    close(secondHover.second.time, secondHover.second.bubble),
    'hover time is not on the bubble bottom',
  );
  assert.equal(secondHover.second.toolbarOpacity, '1');
  for (const action of secondHover.second.actions)
    assert.equal(action.hit, 'self', `action is covered: ${action.label}`);
  await shot('second-hover-light');
  step('move-away');
  await moveAway();
  const secondRest = await measure(firstMessage.id, secondMessage.id);
  assert.equal(secondRest.second.metaOpacity, '0', 'hover time stayed visible after moving away');
  assert.equal(secondRest.avatarOpacity, '1', 'avatar stayed hidden after moving away');
  for (const key of ['left', 'top', 'width', 'height'])
    assert.ok(
      Math.abs(secondRest.second.bubble[key] - initial.second.bubble[key]) <= 0.5,
      `bubble ${key} moved after moving away`,
    );
  result.secondRest = secondRest;
  step('add-reaction');
  await rpc(instance, 'botharness/channelReact', {
    channelId: dm.channel.id,
    messageId: secondMessage.id,
    emoji: '👍',
    active: true,
  });
  await page.reload({ waitUntil: 'networkidle2', timeout: 60_000 });
  await openConversation();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const chips = await page.evaluate(
      (id) => document.querySelector(`[data-message-id="${id}"] [data-message-reactions]`) !== null,
      secondMessage.id,
    );
    if (chips) break;
    await sleep(250);
  }
  await moveAway();
  await hover(secondMessage.id);
  const reactionHover = await measure(firstMessage.id, secondMessage.id);
  assert.ok(
    reactionHover.second.chips && reactionHover.second.chips.height > 0,
    'reaction chips are missing',
  );
  assert.ok(
    close(reactionHover.second.time, reactionHover.second.bubble),
    'time fell below the reaction chips',
  );
  assert.ok(reactionHover.second.time.right <= reactionHover.second.bubble.left + 1);
  assert.equal(reactionHover.second.metaOpacity, '1');
  assert.equal(reactionHover.avatarOpacity, '0');
  await shot('second-hover-reaction-light');
  result.reactionHover = reactionHover;
  step('selection-mode');
  const bubble = await page.evaluate((id) => {
    const node = document.querySelector(`[data-message-id="${id}"] .bh-bubble`);
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }, secondMessage.id);
  await page.mouse.click(bubble.x, bubble.y, { button: 'right' });
  await sleep(400);
  const select = await page.evaluate(() => {
    const item = [...document.querySelectorAll('[role="menuitem"], button')].find(
      (node) =>
        ['Select', '选择'].includes(node.textContent?.trim() ?? '') && node.offsetParent !== null,
    );
    if (!item) return null;
    const box = item.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  assert.ok(select, 'Select menu item is missing');
  await page.mouse.click(select.x, select.y);
  await page.waitForSelector('.bh-bubble-selecting', { timeout: 10_000 });
  await sleep(300);
  await hover(secondMessage.id);
  const selection = await measure(firstMessage.id, secondMessage.id);
  assert.equal(selection.second.sideDisplay, 'none', 'selection mode left the hover time visible');
  assert.equal(selection.avatarOpacity, '1', 'selection mode hid the avatar');
  assert.ok(selection.second.metaOpacity === '0' || selection.second.sideDisplay === 'none');
  await shot('selection-mode-light');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((node) => ['Cancel', '取消'].includes(node.textContent?.trim() ?? ''))
      ?.click();
  });
  await page
    .waitForFunction(() => document.querySelector('.bh-bubble-selecting') === null, {
      timeout: 10_000,
    })
    .catch(() => undefined);
  result.selection = selection;
  step('narrow-touch');
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await page.reload({ waitUntil: 'networkidle2', timeout: 60_000 });
  await openConversation(true);
  const touch = await measure(firstMessage.id, secondMessage.id);
  assert.equal(touch.hoverNone, true, 'narrow check does not report hover:none');
  assert.equal(touch.second.metaDisplay, 'none', 'hover time is visible without hover');
  assert.equal(touch.avatarOpacity, '1', 'narrow layout hides the avatar');
  assert.equal(touch.groupTimeOpacity, '1', 'group time is not visible without hover');
  await shot('narrow-touch');
  result.touch = touch;
  step('dark-theme');
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.reload({ waitUntil: 'networkidle2', timeout: 60_000 });
  await openConversation();
  await hover(secondMessage.id);
  const dark = await measure(firstMessage.id, secondMessage.id);
  assert.ok(close(dark.second.time, dark.second.bubble), 'dark time is not on the bubble bottom');
  assert.equal(dark.second.metaOpacity, '1');
  assert.equal(dark.avatarOpacity, '0');
  assert.ok(dark.second.chips && dark.second.chips.height > 0);
  await shot('second-hover-reaction-dark');
  result.dark = dark;
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  writeFileSync(evidenceFile, JSON.stringify(result, null, 2));
  process.stdout.write(`PASS ${evidence}\n`);
} catch (error) {
  await shot('failure').catch(() => undefined);
  writeFileSync(
    join(evidence, 'failure.json'),
    JSON.stringify({ environment, runId, steps, errors, message: error.message }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
