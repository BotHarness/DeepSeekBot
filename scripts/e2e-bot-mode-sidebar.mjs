import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (puppeteerDir === undefined) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
if (process.env.BH_E2E_INSTANCE === undefined) throw new Error('Set BH_E2E_INSTANCE');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const evidenceRoot =
  process.env.BH_SCREENSHOT_DIR ?? resolve(dirname(process.env.BH_E2E_INSTANCE), 'e2e');
const shots = resolve(evidenceRoot, `attempt-${Date.now()}-${process.pid}`);
mkdirSync(shots, { recursive: true });

const overlayButtons = ['Continue', 'Configure later', 'Skip tutorial'];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--lang=en-US'],
  ...(process.env.PUPPETEER_EXECUTABLE_PATH === undefined
    ? {}
    : { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }),
});
let page;
const pageErrors = [];
let observationStep = 'opening-page';
try {
  page = await browser.newPage();
  const observations = [];
  const observeShell = async (step) => {
    observationStep = step;
    await page.waitForFunction(
      () => window.__BOTHARNESS_CLIENT_DIAGNOSTICS__?.snapshot().state === 'shell-ready',
      { timeout: 15_000 },
    );
    const snapshot = await page.evaluate(() => window.__BOTHARNESS_CLIENT_DIAGNOSTICS__.snapshot());
    observations.push({ step, ...snapshot });
    writeFileSync(
      resolve(shots, 'client-observations.json'),
      JSON.stringify(observations, null, 2),
    );
  };
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const session = await page.createCDPSession();
  await session.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.waitForSelector('button[aria-label="Bot mode"], .bh-mode-sidebar', {
    timeout: 30_000,
  });
  for (let round = 0; round < 6; round += 1) {
    await page.evaluate((labels) => {
      [...document.querySelectorAll('button')]
        .find((node) => labels.includes(node.textContent?.trim() ?? '') && node.offsetParent)
        ?.click();
    }, overlayButtons);
    await sleep(300);
  }

  await observeShell('before-bot-mode');
  if ((await page.$('.bh-mode-sidebar')) === null)
    await page.click('button[aria-label="Bot mode"]');
  await page.waitForSelector('.bh-mode-sidebar', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.bh-root.bh-main [data-message-id]', {
    visible: true,
    timeout: 30_000,
  });
  const column = await page.evaluate(() => ({
    width: document.querySelector('.bh-mode-sidebar')?.getBoundingClientRect().width ?? 0,
    nativeRows: document.querySelectorAll('button[aria-label="Bot mode"]').length,
    exit: document.querySelector('button[aria-label="Exit Bot mode"]') !== null,
  }));
  if (column.width < 263 || column.nativeRows !== 0 || !column.exit)
    throw new Error(`Bot mode sidebar did not take over the column: ${JSON.stringify(column)}`);
  await observeShell('bot-mode');
  await page.screenshot({ waitForFonts: false, path: resolve(shots, '01-bot-mode-sidebar.png') });

  await page.waitForSelector('.bh-mode-sidebar [data-channel-id]', { timeout: 30_000 });
  const channelId = await page.$eval('.bh-mode-sidebar [data-channel-id]', (row) =>
    row.getAttribute('data-channel-id'),
  );
  await page.click(`.bh-mode-sidebar [data-channel-id="${channelId}"]`);
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`.bh-mode-sidebar [data-channel-id="${id}"]`)
        ?.classList.contains('bh-selected') === true,
    { timeout: 20_000 },
    channelId,
  );
  await page.waitForSelector('[data-bh-tour="composer"]', { timeout: 20_000 });

  const card = '.bh-mode-sidebar [data-pinned-panel="activity-center"]';
  await page.waitForSelector(`${card}:not([aria-disabled])`, { timeout: 20_000 });
  if ((await page.$(`${card}[aria-pressed="true"]`)) !== null) {
    await page.click(card);
    await page.waitForSelector(`${card}[aria-pressed="false"]`, { timeout: 10_000 });
  }
  await page.click(card);
  await page.waitForFunction(
    (selector) =>
      document.querySelector(`${selector}[aria-pressed="true"]`) !== null &&
      document.querySelector(
        '.bh-dock [data-dock-panel="activity-center"] .bh-activity-center-panel',
      ) !== null &&
      document.querySelector('.bh-dock [data-bh-tour="composer"]') !== null,
    { timeout: 20_000 },
    card,
  );
  await observeShell('activity-center');
  await page.screenshot({
    waitForFonts: false,
    path: resolve(shots, '02-activity-center-panel.png'),
  });
  await page.click(card);
  await page.waitForFunction(
    (selector) =>
      document.querySelector(`${selector}[aria-pressed="false"]`) !== null &&
      document.querySelector('.bh-dock [data-dock-panel="activity-center"]') === null,
    { timeout: 10_000 },
    card,
  );

  await page.click('button[aria-label="Collapse sidebar"]');
  await page.waitForSelector('.bh-mode-sidebar[data-collapsed="true"]', { timeout: 10_000 });
  await observeShell('collapsed-sidebar');
  await page.screenshot({ waitForFonts: false, path: resolve(shots, '03-bot-mode-rail.png') });
  await page.click('button[aria-label="Open sidebar"]');
  await page.waitForFunction(
    () => document.querySelector('.bh-mode-sidebar:not([data-collapsed])') !== null,
    { timeout: 10_000 },
  );

  await page.click('button[aria-label="Exit Bot mode"]');
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-mode-sidebar') === null &&
      document.querySelector('.bh-root.bh-main') === null &&
      document.querySelector('button[aria-label="Bot mode"]') !== null,
    { timeout: 20_000 },
  );
  const native = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((node) => node.textContent?.trim() ?? ''),
  );
  for (const label of ['New Session', 'Plugins', 'Settings'])
    if (!native.some((text) => text.includes(label)))
      throw new Error(`Native App Sidebar is missing ${label} after exit`);
  await observeShell('after-exit');
  await sleep(300);
  await page.screenshot({ waitForFonts: false, path: resolve(shots, '04-native-after-exit.png') });
  if (pageErrors.length > 0) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
  console.log('BOT MODE SIDEBAR PASS');
  console.log(JSON.stringify({ evidence: shots }));
} catch (error) {
  await Promise.allSettled([
    (async () => {
      const snapshot = await page?.evaluate(() =>
        window.__BOTHARNESS_CLIENT_DIAGNOSTICS__?.snapshot(),
      );
      writeFileSync(
        resolve(shots, 'failure-observation.json'),
        JSON.stringify({ step: observationStep, snapshot: snapshot ?? null }, null, 2),
      );
    })(),
    (async () => {
      await page?.screenshot({ waitForFonts: false, path: resolve(shots, 'failure.png') });
    })(),
    (async () => {
      const tree = await page?.accessibility.snapshot();
      writeFileSync(resolve(shots, 'failure-aria.json'), JSON.stringify(tree ?? null, null, 2));
    })(),
    (async () => {
      writeFileSync(resolve(shots, 'page-errors.json'), JSON.stringify(pageErrors, null, 2));
    })(),
  ]);
  throw error;
} finally {
  await browser.close();
}
