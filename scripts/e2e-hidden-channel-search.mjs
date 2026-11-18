import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
if (!origin || !home) throw new Error('Set BH_E2E_ORIGIN and BH_E2E_HOME');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  `/tmp/dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  'utf8',
).split(';')[0];

async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `hidden-search-${method}-${Math.random()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true) {
    throw new Error(`${method}: ${response.status} ${JSON.stringify(envelope.result?.error)}`);
  }
  return envelope.result.value;
}

let alpha;
let beta;
let originalHidden;
let browser;
let runError;
try {
  const nonce = Date.now();
  const alphaName = `AX 453 Alpha ${nonce}`;
  const betaName = `AX 453 Beta ${nonce}`;
  alpha = (await rpc('channelCreate', { name: alphaName, members: [] })).channel;
  beta = (await rpc('channelCreate', { name: betaName, members: [] })).channel;
  originalHidden = (await rpc('rosterGet')).hidden;
  await rpc('hiddenSet', { hidden: [...originalHidden, alpha.id, beta.id] });
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  await page.waitForSelector('.bh-root');

  const openManager = async () => {
    await page.click('.bh-header-actions .bh-icon-btn');
    await page.waitForSelector('[role="menu"]');
    const selected = await page.evaluate(() => {
      const item = [...document.querySelectorAll('[role="menu"] button')].find((button) =>
        ['Hidden channels and Bot DMs', '隐藏的频道与 Bot 私聊'].includes(
          button.textContent?.trim() ?? '',
        ),
      );
      item?.click();
      return item !== undefined;
    });
    assert.equal(selected, true, 'hidden-Channel menu action available');
    await page.waitForSelector('.bh-hidden-search');
  };
  const names = () =>
    page.$$eval('.bh-hidden-name', (nodes) => nodes.map((node) => node.textContent ?? ''));
  const replaceQuery = async (query) => {
    await page.click('.bh-hidden-search');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.type('.bh-hidden-search', query);
  };

  await openManager();
  assert((await names()).includes(alphaName));
  assert((await names()).includes(betaName));
  await replaceQuery('alpha');
  assert((await names()).includes(betaName), 'filter waits for debounce');
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.bh-hidden-name')].every((node) => node.textContent !== name),
    {},
    betaName,
  );
  assert((await names()).includes(alphaName));

  await replaceQuery('beta');
  await new Promise((resolve) => setTimeout(resolve, 80));
  await replaceQuery('alpha');
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert((await names()).includes(alphaName), 'replaced query cannot restore stale results');
  assert(!(await names()).includes(betaName));
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.bh-hidden-name')].some((node) => node.textContent === name),
    {},
    alphaName,
  );

  await replaceQuery('beta');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.bh-hidden-search', { hidden: true });
  await openManager();
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert((await names()).includes(alphaName), 'closed modal cancels its query');
  assert((await names()).includes(betaName), 'reopened modal starts unfiltered');
  assert.deepEqual(errors, []);
} catch (error) {
  runError = error instanceof Error ? error : new Error(String(error), { cause: error });
} finally {
  const cleanupErrors = [];
  try {
    await browser?.close();
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (originalHidden !== undefined) {
    try {
      await rpc('hiddenSet', { hidden: originalHidden });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  for (const channel of [beta, alpha]) {
    if (channel === undefined) continue;
    try {
      await rpc('channelGroupDelete', { channelId: channel.id });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      runError === undefined ? cleanupErrors : [runError, ...cleanupErrors],
      'Hidden-Channel regression cleanup failed',
    );
  }
}
if (runError !== undefined) throw runError;
const channelIds = new Set((await rpc('channels')).channels.map((channel) => channel.id));
assert(!channelIds.has(alpha?.id) && !channelIds.has(beta?.id), 'test channels were deleted');
console.log(JSON.stringify({ verdict: 'PASS', delayed: true, replaced: true, cancelled: true }));
