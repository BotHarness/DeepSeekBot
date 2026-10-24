import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const store = resolve(root, 'node_modules/.pnpm');
const pkg = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(store, pkg, 'node_modules/'))('puppeteer');
assert.ok(process.env.BH_E2E_INSTANCE, 'Set BH_E2E_INSTANCE to the task-owned instance.json');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const baseline = process.env.BH_TIMELINE_BASELINE === '1';
const out = resolve(
  process.env.BH_SCREENSHOT_DIR ?? '.humanlayer/tasks/2748',
  baseline ? 'before' : 'after',
);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = await browser.newPage();
const requests = [],
  consoleLines = [],
  errors = [],
  proofs = [];
let step = 'boot';
async function rpc(method, args = {}) {
  return page.evaluate(
    async (method, args) => {
      const response = await fetch(`/api/botharness/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: `botharness/${method}`,
          payload: { args },
        }),
      });
      const envelope = await response.json();
      if (!envelope.result?.ok) throw Error(`${method}: ${JSON.stringify(envelope.result)}`);
      return envelope.result.value;
    },
    method,
    args,
  );
}
async function capture(name) {
  step = name;
  await sleep(300);
  const geometry = await page.evaluate(() => {
    const body = document.querySelector('.bh-chat-body');
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const divider = rect('[data-unread-divider]');
    const viewport = rect('.bh-chat-body');
    return {
      viewport,
      divider,
      button: rect('.bh-timeline-new'),
      composer: rect('.bh-chat-pane .bh-composer'),
      scrollTop: body?.scrollTop,
      distance: body ? body.scrollHeight - body.scrollTop - body.clientHeight : null,
      ids: [...document.querySelectorAll('.bh-chat-body [data-message-id]')].map(
        (n) => n.dataset.messageId,
      ),
      text: document.querySelector('.bh-timeline-new')?.textContent,
    };
  });
  proofs.push({ name, geometry, requests: requests.length });
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  writeFileSync(
    resolve(out, `${name}.aria.json`),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  return geometry;
}
async function scroll(edge) {
  await page.$eval(
    '.bh-chat-body',
    (node, edge) => {
      node.scrollTop =
        edge === 'top'
          ? 0
          : edge === 'bottom'
            ? node.scrollHeight
            : Math.max(100, node.scrollTop - 350);
    },
    edge,
  );
  await sleep(650);
}
const count = (direction) => requests.filter((request) => request.direction === direction).length;
try {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warn'].includes(message.type()))
      consoleLines.push(`${message.type()}: ${message.text()}`);
  });
  page.on('request', (request) => {
    if (!request.url().includes('/api/botharness/channelTimeline')) return;
    const args = JSON.parse(request.postData() ?? '{}').payload?.args ?? {};
    requests.push(args);
  });
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  for (let index = 0; index < 6; index++) {
    for (const label of ['Continue', 'Configure later', 'Skip tutorial']) {
      const button = await page.$(`::-p-aria(${label})`);
      if (button && (await button.isVisible())) await button.click();
    }
    await sleep(150);
  }
  step = 'seed';
  const fixture = process.env.BH_TIMELINE_FIXTURE
    ? JSON.parse(readFileSync(process.env.BH_TIMELINE_FIXTURE, 'utf8'))
    : undefined;
  const bot = fixture
    ? undefined
    : (await rpc('create', { displayName: 'Timeline navigation QA' })).bot;
  const dm = (await rpc('channels')).channels.find((channel) =>
    fixture
      ? channel.id === fixture.channelId
      : channel.type === 'dm' && channel.botSlug === bot.slug,
  );
  assert.ok(dm);
  const ids = [];
  const send = async (body) => {
    const run = await rpc('botToolRun', {
      slug: dm.botSlug,
      tool: 'channel_send',
      args: { channel_id: dm.id, body },
    });
    assert.ok(run.result.messageId, JSON.stringify(run));
    return run.result.messageId;
  };
  if (fixture) ids.push(...fixture.messageIds);
  else
    for (let index = 0; index < 260; index++)
      ids.push(
        await send(
          `Timeline item ${String(index + 1).padStart(3, '0')} — history and unread navigation.\nSecond line keeps this page scrollable.`,
        ),
      );
  await rpc('channelMarkRead', { channelId: dm.id, messageId: ids[119] });
  const canonicalRead = await rpc('channelReadPosition', { channelId: dm.id });
  writeFileSync(
    resolve(out, 'canonical.json'),
    JSON.stringify({ channelId: dm.id, messageIds: ids, canonicalRead, unread: 140 }, null, 2),
  );
  await page.reload({ waitUntil: 'networkidle2' });
  for (const label of ['Continue', 'Configure later', 'Skip tutorial']) {
    const button = await page.$(`::-p-aria(${label})`);
    if (button && (await button.isVisible())) await button.click();
  }
  if (!(await page.$('.bh-workspace-rail'))) await page.locator('::-p-aria(Bot mode)').click();
  await page.waitForSelector('.bh-workspace-rail');
  const skip = await page
    .waitForSelector('::-p-aria(Skip)', { visible: true, timeout: 5000 })
    .catch(() => null);
  if (skip) {
    await skip.click();
    await sleep(500);
  }
  const messages = await page.$('.bh-workspace-rail button[aria-label="Messages"]');
  if (messages) await messages.click();
  const row = `[data-dock-panel="bh:channels"] button[data-channel-id="${dm.id}"]`;
  await page.waitForSelector(row);
  writeFileSync(
    resolve(out, 'navigation.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  console.log('fixture ready; opening channel');
  step = 'open-channel';
  const prior = requests.length;
  await page.locator(row).click();
  await page.waitForSelector('[data-unread-divider]');
  await sleep(700);
  const opened = await capture('unread');
  assert.ok(
    requests.slice(prior).some((r) => r.direction === 'around' && r.around === ids[119]),
    'opening uses canonical read anchor',
  );
  assert.ok(
    opened.divider.top >= opened.viewport.top && opened.divider.bottom <= opened.viewport.bottom,
    'divider visible on opening',
  );
  assert.ok(
    opened.ids.includes(ids[119]) && opened.ids.includes(ids[120]),
    'read and first unread loaded',
  );
  assert.ok(opened.ids.length < 100, 'opening is bounded, not 140 unread at once');
  let older = count('older');
  await scroll('top');
  await page.waitForFunction(
    (old) => document.querySelector('.bh-chat-body [data-message-id]')?.dataset.messageId !== old,
    {},
    opened.ids[0],
  );
  assert.equal(count('older') - older, 1, 'one older request on reaching top');
  const afterOlder = await capture('older');
  assert.ok(afterOlder.scrollTop > 80, 'prepend preserves reading anchor away from top');
  older = count('older');
  await sleep(1800);
  assert.equal(count('older'), older, 'no idle history loading loop');
  let newer = count('newer');
  await scroll('bottom');
  await sleep(500);
  assert.equal(count('newer') - newer, 1, 'one newer request on reaching bottom');
  newer = count('newer');
  await sleep(1800);
  assert.equal(count('newer'), newer, 'no idle newer loading loop');
  await capture('newer');
  for (
    let pageIndex = 0;
    pageIndex < 8 && !(await page.$(`[data-message-id="${ids[259]}"]`));
    pageIndex++
  )
    await scroll('bottom');
  await page.waitForSelector(`[data-message-id="${ids[259]}"]`);
  await scroll('bottom');
  await page.waitForFunction(() => !document.querySelector('.bh-timeline-new'));
  await scroll('middle');
  const history = await capture('history');
  if (baseline)
    assert.equal(history.button, undefined, 'baseline reproduces missing ordinary history button');
  else {
    assert.ok(history.button, 'ordinary history has return button');
    assert.equal(history.text, '', 'ordinary return is icon only');
    assert.ok(await page.$('.bh-timeline-new svg'), 'return icon is rendered');
    const paint = () =>
      page.$eval('.bh-timeline-new', (button) => {
        const style = getComputedStyle(button);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return {
          background: style.backgroundColor,
          color: style.color,
          opacity: style.opacity,
          alpha: context.getImageData(0, 0, 1, 1).data[3],
        };
      });
    const idle = await paint();
    assert.equal(idle.alpha, 255, 'idle surface is opaque');
    assert.equal(idle.opacity, '1');
    await page.hover('.bh-timeline-new');
    const hover = await paint();
    assert.equal(hover.alpha, 255, 'hover surface is opaque');
    assert.notEqual(hover.background, idle.background, 'hover changes background');
    assert.notEqual(hover.color, idle.color, 'hover changes icon colour');
    await capture('hover');
    await page.mouse.down();
    const pressed = await paint();
    assert.equal(pressed.alpha, 255, 'pressed surface is opaque');
    assert.notEqual(pressed.background, hover.background, 'press has distinct background');
    await capture('pressed');
    await page.mouse.move(history.viewport.left + 30, history.viewport.top + 30);
    await page.mouse.up();
    writeFileSync(
      resolve(out, 'button-paint.json'),
      JSON.stringify({ idle, hover, pressed }, null, 2),
    );

    assert.ok(history.button.bottom <= history.composer.top, 'button above composer');
    assert.ok(
      Math.abs(history.button.right - history.composer.right) <= 16,
      'button at composer right',
    );
    await page.locator('::-p-aria(Return to latest messages)').click();
    await page.waitForFunction(() => !document.querySelector('.bh-timeline-new'));
    await capture('bottom');
    await scroll('middle');
  }
  await send('New live message one');
  await send('New live message two');
  const lastLiveId = await send('New live message three');
  await page.waitForFunction(
    (baseline) =>
      baseline
        ? document.querySelector('.bh-timeline-new')?.textContent.includes('3 new messages')
        : document.querySelector('.bh-timeline-new-count')?.textContent === '3',
    {},
    baseline,
  );
  const live = await capture('live');
  assert.ok(live.distance > 80, 'live messages do not steal history scroll');
  if (!baseline) {
    await page.locator('::-p-aria(Return to latest messages)').click();
    await page.waitForFunction(() => !document.querySelector('.bh-timeline-new'));
    await page.locator('.bh-chat-pane .bh-composer-rich-input').fill('A multiline draft');
    for (const line of ['line two', 'line three', 'line four']) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
      await page.keyboard.type(line);
    }
    assert.ok(
      (
        await page.$eval('.bh-chat-pane .bh-composer-rich-input', (node) => node.innerText)
      ).includes('line four'),
    );
    const unchanged = await rpc('channelTimeline', { channelId: dm.id });
    assert.equal(unchanged.page.entries.at(-1).id, lastLiveId, 'draft must not submit a message');
    await scroll('middle');
    const multiline = await capture('multiline');
    assert.ok(multiline.button.bottom <= multiline.composer.top, 'multiline composer not covered');
    assert.ok(
      multiline.composer.height > live.composer.height,
      'composer actually grew for multiline draft',
    );
    await page.setViewport({ width: 900, height: 750 });
    await capture('narrow');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.waitForSelector('style[data-bh-appearance=light]');
    await capture('light');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.waitForSelector('style[data-bh-appearance=dark]');
    await capture('dark');
    const loaded = (await capture('final')).ids;
    assert.equal(new Set(loaded).size, loaded.length, 'no duplicate message rows');
    const indexes = loaded.map((id) => ids.indexOf(id)).filter((index) => index >= 0);
    assert.deepEqual(
      indexes,
      [...indexes].sort((a, b) => a - b),
    );
    await page.locator('::-p-aria(Return to latest messages)').click();
    await sleep(700);
    const read = await rpc('channelReadPosition', { channelId: dm.id });
    assert.equal(read.position.messageId, lastLiveId, 'read position reaches the newest message');
    await page.reload({ waitUntil: 'networkidle2' });
    await page.setViewport({ width: 1440, height: 900 });
    if (!(await page.$('.bh-workspace-rail'))) await page.locator('::-p-aria(Bot mode)').click();
    const skipAgain = await page
      .waitForSelector('::-p-aria(Skip)', { visible: true, timeout: 2000 })
      .catch(() => null);
    if (skipAgain) await skipAgain.click();
    await page.locator(row).click();
    await page.waitForSelector('.bh-chat-body [data-message-id]');
    await sleep(700);
    const reopened = await capture('read-reopen');
    assert.equal(reopened.divider, undefined, 'read conversation has no stale divider');
    assert.equal(reopened.button, undefined, 'read conversation opens at latest without button');
    assert.ok(reopened.distance <= 80, 'read conversation opens at bottom');
    const pagedBot = (await rpc('create', { displayName: 'Unread jump QA' })).bot;
    const paged = (await rpc('channels')).channels.find(
      (channel) => channel.type === 'dm' && channel.botSlug === pagedBot.slug,
    );
    assert.ok(paged);
    const pagedIds = [];
    for (let index = 0; index < 150; index++) {
      const run = await rpc('botToolRun', {
        slug: paged.botSlug,
        tool: 'channel_send',
        args: { channel_id: paged.id, body: `Unread jump item ${index + 1}` },
      });
      pagedIds.push(run.result.messageId);
    }
    await rpc('channelMarkRead', { channelId: paged.id, messageId: pagedIds[9] });
    await page.reload({ waitUntil: 'networkidle2' });
    if (!(await page.$('.bh-workspace-rail'))) await page.locator('::-p-aria(Bot mode)').click();
    await page
      .locator(`[data-dock-panel="bh:channels"] button[data-channel-id="${paged.id}"]`)
      .click();
    await page.waitForSelector('[data-unread-divider]');
    assert.equal(
      await page.$(`[data-message-id="${pagedIds[149]}"]`),
      null,
      'latest message is outside the opening page',
    );
    await capture('paged-before');
    const jumpRequests = requests.length;
    await page.locator('::-p-aria(Return to latest messages)').click();
    await page.waitForSelector(`[data-message-id="${pagedIds[149]}"]`);
    await page.waitForFunction(() => !document.querySelector('.bh-timeline-new'));
    const jumped = await capture('paged-latest');
    assert.ok(jumped.distance <= 80, 'paged jump reaches actual latest');
    assert.ok(
      requests
        .slice(jumpRequests)
        .some((request) => request.channelId === paged.id && request.direction === undefined),
      'paged jump uses the latest window',
    );
  }
  assert.deepEqual(errors, [], 'no page exceptions');
  writeFileSync(
    resolve(out, 'result.json'),
    JSON.stringify({ pass: true, baseline, requests, proofs, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      pass: true,
      baseline,
      requests: requests.length,
      steps: proofs.map((p) => p.name),
    }),
  );
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  writeFileSync(
    resolve(out, 'failure.json'),
    JSON.stringify({ step, error: String(error), requests, proofs, errors }, null, 2),
  );
  throw error;
} finally {
  writeFileSync(resolve(out, 'console.txt'), consoleLines.join('\n'));
  await browser.close();
}
