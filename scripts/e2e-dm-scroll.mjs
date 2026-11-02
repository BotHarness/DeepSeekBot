import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.BH_E2E_ORIGIN,
  home = process.env.BH_E2E_HOME,
  evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(origin && home && evidence);
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}) {
  const endpoint = `botharness/${method}`;
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(`${origin}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `activity-${Math.random()}`,
          method: endpoint,
          payload: { args },
        }),
      });
      break;
    } catch (error) {
      if (
        !['list', 'channelMessages', 'modelCatalog', 'rosterGet'].includes(method) ||
        attempt === 2
      )
        throw error;
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, `${method}: ${JSON.stringify(result?.error)}`);
  return result.value;
}
const models = (await rpc('modelCatalog')).models;
const model = models.find(
  (e) => e.model.includes('flash') && e.efforts.some((x) => x.id === 'low'),
);
assert.ok(model);
const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
const bot = (await rpc('create', { displayName: `DM scroll QA ${Date.now()}` })).bot;
const channelId = `dm-${bot.slug}`;
const layout = process.env.BH_E2E_LAYOUT ?? 'row';
await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
const preset = (
  await rpc('modelPresetCreate', {
    name: bot.displayName,
    orchestrator: route,
    assignmentDefault: route,
  })
).preset;
await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
if (layout !== 'row') {
  const roster = await rpc('rosterGet');
  await rpc('pinsSet', { pins: [...roster.pins, channelId] });
}
const pnpm = resolve('node_modules/.pnpm'),
  pdir = readdirSync(pnpm).find((e) => e.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
mkdirSync(evidence, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 540 });
await page.setExtraHTTPHeaders({ cookie });
async function screenshot(name) {
  await page.addStyleTag({
    content:
      '.bh-tool-approval-card > .bh-note:nth-child(3){font-size:0}.bh-tool-approval-card > .bh-note:nth-child(3)::after{content:"[machine-local QA directory redacted]";font-size:12px}',
  });
  await page.screenshot({ path: resolve(evidence, name) });
}

async function measure() {
  return page.evaluate(() => {
    const body = document.querySelector('.bh-chat-body');
    const entries = [...body.querySelectorAll('[data-message-id]')];
    const last = entries.at(-1)?.getBoundingClientRect();
    const viewport = body.getBoundingClientRect();
    const footer = document.querySelector('.bh-composer-activity-status');
    return {
      scrollTop: body.scrollTop,
      messageIds: entries.map((entry) => entry.dataset.messageId),
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      bottomGap: body.scrollHeight - body.scrollTop - body.clientHeight,
      messageCount: entries.length,
      lastMessageBottom: last?.bottom,
      viewportBottom: viewport.bottom,
      footerHeight: footer?.getBoundingClientRect().height,
      lastVisible: last ? last.bottom <= viewport.bottom + 1 : null,
    };
  });
}
async function send(body) {
  await page.waitForSelector('.bh-chat-body');
  await page.locator('.bh-composer-shell .bh-composer-input').click();
  await page.keyboard.sendCharacter(body);
  await page.waitForFunction(
    () => !document.querySelector('.bh-composer-shell .bh-send-btn')?.disabled,
  );
  await page.locator('.bh-composer-shell .bh-send-btn').click();
}
let proof;
try {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll('button')).some((b) =>
              ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
            ),
          { timeout: 3000 },
        )
        .catch(() => undefined);
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
          ?.click(),
      );
      if (!(await page.$('.bh-root')))
        await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-root') ||
          Array.from(document.querySelectorAll('button')).some((b) =>
            ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''),
          ),
      );
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''))
          ?.click(),
      );
      await page.waitForSelector(`.bh-root [data-channel-id="${channelId}"]`);
      break;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  await page.click(`.bh-root [data-channel-id="${channelId}"]`);
  if (process.env.BH_E2E_THEME === 'light')
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  else if (process.env.BH_E2E_THEME === 'dark')
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  await page.waitForSelector('.bh-composer-shell');

  await send(
    'Scroll fixture. '.repeat(90) +
      'Use native write to create scroll-qa.txt in your Memory Repository with the text scroll verified. Read it using native read. Then reply in this DM using bot_send_message with the exact phrase "DM scroll confirmed". Do not delegate or use Shell.',
  );
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-composer-activity-status') &&
      document.querySelector('.bh-chat-body [data-message-id]'),
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => {
      const body = document.querySelector('.bh-chat-body');
      const last = [...(body?.querySelectorAll('[data-message-id]') ?? [])].at(-1);
      const footer = document.querySelector('.bh-composer-activity-status');
      return (
        body &&
        last &&
        footer &&
        footer.getBoundingClientRect().height >= 39 &&
        body.scrollHeight - body.scrollTop - body.clientHeight <= 3 &&
        last.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1
      );
    },
    { timeout: 10000 },
  );
  const footer = await measure();
  await screenshot('footer.png');
  const frames = await page.evaluate(() =>
    [...document.querySelectorAll('.bh-persona-avatar[data-active="true"]')].map((e) => ({
      content: getComputedStyle(e, '::before').content,
      borderWidth: getComputedStyle(e, '::before').borderTopWidth,
    })),
  );
  await page.evaluate(() => {
    document.querySelector('.bh-chat-body').scrollTop = 0;
  });
  await new Promise((done) => setTimeout(done, 200));
  const historyBefore = await measure();
  await send('Additional instruction: also include "history position confirmed" in your DM reply.');
  await page.waitForFunction(
    (count) =>
      [...document.querySelectorAll('.bh-chat-body [data-message-id]')].length > count &&
      [...document.querySelectorAll('.bh-chat-body [data-message-id]')].some((entry) =>
        entry.textContent?.includes(
          'Additional instruction: also include "history position confirmed" in your DM reply.',
        ),
      ),
    {},
    historyBefore.messageCount,
  );
  const historyAfter = await measure();
  await screenshot('history.png');
  for (let i = 0; i < 400; i++) {
    const messages = (await rpc('channelMessages', { channelId })).messages;
    if (messages.some((m) => m.author.kind === 'bot' && m.body.includes('DM scroll confirmed')))
      break;
    await new Promise((done) => setTimeout(done, 300));
  }
  const replies = (await rpc('channelMessages', { channelId })).messages.filter(
    (m) => m.author.kind === 'bot',
  );
  proof = {
    bot: { slug: bot.slug, displayName: bot.displayName },
    route,
    footer,
    frames,
    historyBefore,
    historyAfter,
    realReply: replies.some((m) => m.body.includes('DM scroll confirmed')),
  };
  writeFileSync(resolve(evidence, 'proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof));
  assert.ok(proof.realReply, 'Real model reply is missing');
  assert.ok(footer.footerHeight >= 39, 'Activity footer did not expand');
  assert.ok(
    footer.bottomGap <= 3 && footer.lastVisible,
    'New Human message is clipped after footer expansion',
  );
  assert.ok(
    historyBefore.scrollHeight > historyBefore.clientHeight + 80,
    'History fixture did not overflow',
  );
  assert.ok(
    Math.abs(historyAfter.scrollTop - historyBefore.scrollTop) <= 5,
    'Sending while reading history jumped the timeline',
  );
  assert.deepEqual(
    historyAfter.messageIds.slice(0, historyBefore.messageIds.length),
    historyBefore.messageIds,
    'Sending while reading history replaced the visible timeline window',
  );
  assert.ok(
    frames.length > 0 && frames.every((f) => f.content === 'none' && f.borderWidth === '0px'),
    'Redundant Avatar outer frame',
  );
} catch (error) {
  await screenshot('failure.png').catch(() => undefined);
  console.error(error);
  process.exitCode = 1;
} finally {
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise((done) => setTimeout(done, 5000)),
  ]);
  browser.process()?.kill();
}

process.exit(process.exitCode ?? 0);
