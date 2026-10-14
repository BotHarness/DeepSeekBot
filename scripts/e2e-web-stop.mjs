import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rpc, verifyPaths } from './verify-app.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const label = args.includes('--before') ? 'before' : 'after';
const themes = args.includes('--light-only') ? ['light'] : ['light', 'dark'];
const paths = verifyPaths(process.env.BH_E2E_NAME ?? 'webstop');
const instancePath = process.env.BH_E2E_INSTANCE ?? paths.instance;
if (!existsSync(instancePath))
  throw new Error(`no instance at ${instancePath}; run verify-app launch`);
const instance = JSON.parse(readFileSync(instancePath, 'utf8'));
const out = join(paths.evidence, 'web-stop');
mkdirSync(out, { recursive: true });
const steps = [];
const checks = {};
const consoleLines = [];

function loadPuppeteer() {
  const store = join(root, 'node_modules', '.pnpm');
  const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
  if (entry === undefined) throw new Error('puppeteer is not installed; run pnpm install');
  return createRequire(join(store, entry, 'node_modules', '/'))('puppeteer');
}

const aria = (name) => `::-p-aria(${JSON.stringify(name)})`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const prompt = 'Send 1000 to 3000 as separate messages, one number per message.';

async function call(endpoint, payload) {
  return rpc(instance, endpoint, payload);
}

async function dismissOverlays(page) {
  const labels = ['Continue', 'Configure later', 'Skip tutorial'];
  for (let round = 0; round < 4; round += 1) {
    const clicked = await page.evaluate((names) => {
      const button = [...document.querySelectorAll('button')].find(
        (node) => names.includes(node.textContent?.trim() ?? '') && node.offsetParent !== null,
      );
      button?.click();
      return button !== undefined;
    }, labels);
    if (!clicked) return;
    await sleep(400);
  }
}

async function capture(page, name) {
  await page.addStyleTag({
    content: '[aria-label$="Window Companion"] { visibility: hidden !important; }',
  });
  const box = await page.$eval('.bh-composer-shell', (node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.screenshot({
    path: join(out, `${name}.png`),
    clip: {
      x: Math.max(0, box.x - 16),
      y: Math.max(0, box.y - 240),
      width: box.width + 32,
      height: box.height + 256,
    },
  });
  await page.evaluate(() =>
    document.querySelectorAll('style').forEach((node) => {
      if (node.textContent?.includes('Window Companion')) node.remove();
    }),
  );
  steps.push(`captured ${name}`);
}

let bot;
let channelId;
let stopName;

async function resolveBot() {
  for (let poll = 0; poll < 30 && bot === undefined; poll += 1) {
    const bots = await call('botharness/list', {});
    bot = (bots.bots ?? bots).find?.((item) => item.displayName === 'DeepSeek Bot');
    if (bot === undefined) await sleep(1000);
  }
  if (bot === undefined) throw new Error('DeepSeek Bot is missing');
  const dm = await call('botharness/channelDm', { slug: bot.slug, displayName: bot.displayName });
  channelId = dm.id ?? dm.channel?.id;
  stopName = `Stop ${bot.displayName}`;
}

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
try {
  for (const theme of themes) {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
    page.on('pageerror', (error) => consoleLines.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleLines.push(`error: ${message.text()}`);
    });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
    await page.goto(instance.url, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some(
          (node) => node.textContent?.trim() === 'Settings',
        ),
      { timeout: 30_000 },
    );
    await dismissOverlays(page);
    if ((await page.$('.bh-root.bh-main')) === null) await page.locator(aria('Bot mode')).click();
    await page.waitForSelector('.bh-root.bh-main', { timeout: 30_000 });
    if (theme === 'dark')
      await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
    await sleep(1500);
    await dismissOverlays(page);
    if (bot === undefined) await resolveBot();

    const composer = await page.waitForSelector(aria(`Message ${bot.displayName}`));
    await composer.click();
    await page.keyboard.type(prompt);
    await page.keyboard.press('Enter');
    steps.push(`${theme}: sent the counting task`);
    if (label === 'before') {
      for (let poll = 0; poll < 60; poll += 1) {
        const roster = await call('botharness/list', {});
        const state = (roster.bots ?? roster).find(
          (item) => item.slug === bot.slug,
        )?.aggregateState;
        if (state === 'working' || state === 'thinking') break;
        await sleep(1000);
      }
      await sleep(4000);
      checks[`${theme}NoStopBefore`] = (await page.$(aria(stopName))) === null;
      await capture(page, `${label}-working-${theme}`);
      await call('botharness/channelBotStop', { channelId, botSlug: bot.slug }).catch(
        () => undefined,
      );
      await page.close();
      continue;
    }
    await page.waitForSelector(aria(stopName), { timeout: 90_000 });
    await sleep(4000);
    steps.push(`${theme}: saw ${stopName}`);
    checks[`${theme}StopShown`] = true;
    await capture(page, `${label}-working-${theme}`);

    await composer.click();
    await page.keyboard.type('x');
    checks[`${theme}SendWhileTyping`] =
      (await page.$(aria('Send'))) !== null && (await page.$(aria(stopName))) === null;
    await page.keyboard.press('Backspace');
    await page.waitForSelector(aria(stopName), { timeout: 10_000 });

    for (let tab = 0; tab < 8; tab += 1) {
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      if (focused === `Stop DeepSeek Bot`) break;
      await page.keyboard.press('Tab');
    }
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    if (focused !== stopName) throw new Error(`could not focus ${stopName}; focused ${focused}`);
    await page.keyboard.press('Enter');
    steps.push(`${theme}: pressed ${stopName} from the keyboard`);
    await page.waitForFunction(
      (text) => document.body.innerText.includes(text),
      { timeout: 60_000 },
      `stopped ${bot.displayName}`,
    );
    await page.waitForSelector(aria('Send'), { timeout: 30_000 });
    checks[`${theme}StopLineShown`] = true;
    checks[`${theme}StopButtonGone`] = (await page.$(aria(stopName))) === null;
    await sleep(1500);
    await capture(page, `after-stopped-${theme}`);

    const timeline = await call('botharness/channelTimeline', { channelId });
    const entries = timeline.page.entries;
    const stopIndex = entries.findLastIndex((item) => item.turnStop !== undefined);
    checks[`${theme}TurnStopRecorded`] = stopIndex >= 0;
    const lastAtStop = entries.at(-1)?.id;
    await sleep(15_000);
    const later = await call('botharness/channelTimeline', { channelId });
    const laterEntries = later.page.entries;
    checks[`${theme}NoMessagesAfterStop`] = laterEntries.at(-1)?.id === lastAtStop;
    const roster = await call('botharness/list', {});
    checks[`${theme}BotIdle`] =
      (roster.bots ?? roster).find((item) => item.slug === bot.slug)?.aggregateState === 'idle';
    const again = await call('botharness/channelBotStop', { channelId, botSlug: bot.slug }).then(
      () => 'stopped',
      (error) => String(error.message ?? error),
    );
    checks[`${theme}SecondStopRefused`] =
      again.includes('not-working') || again.includes('not working');
    steps.push(`${theme}: second stop -> ${again.slice(0, 80)}`);
    await page.close();
  }
} finally {
  await browser.close();
}

checks.noPageErrors = !consoleLines.some((line) => line.startsWith('pageerror'));
const passed = Object.values(checks).every(Boolean);
const report = { label, passed, checks, steps, console: consoleLines, evidence: out };
writeFileSync(join(out, `${label}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
