import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
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
const shots = process.env.BH_E2E_SCREENSHOT_DIR ?? '/tmp/bh456-computer-viewer';
mkdirSync(shots, { recursive: true });

async function rpc(method, args) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `computer-${method}-${Math.random()}`,
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

async function status() {
  const response = await fetch(`${origin}/api/computer/status`, { headers: { cookie } });
  assert.equal(response.status, 200);
  return response.json();
}

async function waitRunning() {
  const deadline = Date.now() + 300_000;
  for (;;) {
    const current = await status();
    if (current.status?.state === 'running') return;
    if (Date.now() > deadline)
      throw new Error(`Computer start timed out: ${current.status?.state}`);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
}

const bot = (await rpc('create', { displayName: `Computer viewer QA ${Date.now()}` })).bot;
const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function openComputer(page, dark) {
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
  if (!(await page.$('.bh-root')))
    await page.evaluate((selector) => document.querySelector(selector)?.click(), botButton);
  await page.waitForSelector(`.bh-root [data-channel-id="${dm.id}"]`, { timeout: 20_000 });
  await page.evaluate(
    (id) => document.querySelector(`.bh-root [data-channel-id="${id}"]`)?.click(),
    dm.id,
  );
  await page.waitForSelector('.bh-composer-input', { timeout: 20_000 });
  await page.evaluate((enabled) => {
    if (enabled) document.body.setAttribute('data-ds-dark-theme', 'true');
    else document.body.removeAttribute('data-ds-dark-theme');
  }, dark);
  if (!(await page.$('[data-panel-head]')))
    await page.evaluate(() => document.querySelector('.bh-sidebar-toggle')?.click());
  await page.waitForSelector('[data-panel-head]', { timeout: 20_000 });
  await page.evaluate(() => {
    const toggle = document.querySelector('button[aria-label="Computer Access"]');
    if (toggle?.getAttribute('aria-checked') !== 'true') toggle?.click();
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label="Computer Access"]')
        ?.getAttribute('aria-checked') === 'true',
    { timeout: 15_000 },
  );
  await page.evaluate(() => {
    const section = [...document.querySelectorAll('[data-panel-head]')].find(
      (button) => button.textContent?.trim() === 'Computer',
    );
    if (section?.getAttribute('aria-expanded') !== 'true') section?.click();
  });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-panel-head]')].some(
        (button) =>
          button.textContent?.trim() === 'Computer' &&
          button.getAttribute('aria-expanded') === 'true',
      ),
    { timeout: 15_000 },
  );
}

async function waitLive(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('iframe[src="/botharness-computer/viewer/"]') !== null &&
      document.querySelector('div[role="button"][aria-label="Open fullscreen"]') !== null,
    { timeout: 90_000, polling: 500 },
  );
}

async function exerciseFullscreen(page, theme) {
  await waitLive(page);
  const frame = await page.$('iframe[src="/botharness-computer/viewer/"]');
  const before = await page.evaluate(() => document.body.style.overflow);
  await page.evaluate(() =>
    document.querySelector('div[role="button"][aria-label="Open fullscreen"]')?.click(),
  );
  await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert.equal(
    await page.evaluate(
      (node) => document.querySelector('iframe[src="/botharness-computer/viewer/"]') === node,
      frame,
    ),
    true,
  );
  await page.screenshot({ path: `${shots}/${theme}-fullscreen.png` });
  await page.evaluate(() =>
    document.querySelector('button[aria-label="Leave fullscreen"]')?.click(),
  );
  await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null, {
    timeout: 10_000,
  });
  await page.waitForFunction((overflow) => document.body.style.overflow === overflow, {}, before);
  assert.equal(
    await page.evaluate(
      (node) => document.querySelector('iframe[src="/botharness-computer/viewer/"]') === node,
      frame,
    ),
    true,
  );
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === 'Open fullscreen',
    { timeout: 5_000 },
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    'Open fullscreen',
  );
  await page.screenshot({ path: `${shots}/${theme}-docked.png` });
  return frame;
}

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let viewerDocuments = 0;
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/botharness-computer/viewer/' &&
      request.isNavigationRequest()
    ) {
      viewerDocuments += 1;
    }
  });
  await openComputer(page, false);
  if ((await status()).status?.state !== 'running') {
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Start')
        ?.click(),
    );
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some(
          (button) => button.textContent?.trim() === 'Authorize and start',
        ),
      { timeout: 10_000 },
    );
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === 'Authorize and start')
        ?.click(),
    );
    await waitRunning();
  }
  await waitLive(page);
  const initialViewerDocuments = viewerDocuments;
  const originalFrame = await exerciseFullscreen(page, 'light');
  assert.equal(
    viewerDocuments,
    initialViewerDocuments,
    'fullscreen must not open a second viewer stream',
  );

  await page.setRequestInterception(true);
  const blankViewer = (request) => {
    if (
      new URL(request.url()).pathname === '/botharness-computer/viewer/' &&
      request.isNavigationRequest()
    ) {
      void request.respond({
        status: 200,
        contentType: 'text/html',
        body: '<html><body></body></html>',
      });
    } else {
      void request.continue();
    }
  };
  page.on('request', blankViewer);
  const liveFrame = await originalFrame.contentFrame();
  if (liveFrame === null) throw new Error('Viewer frame unavailable');
  await liveFrame.evaluate(() => {
    window.setInterval(() => {
      const canvas = document.getElementById('videoCanvas');
      if (canvas !== null)
        Object.defineProperty(canvas, 'width', {
          configurable: true,
          get: () => 0,
          set: () => undefined,
        });
    }, 100);
  });
  await page.waitForFunction(
    (node) => document.querySelector('iframe[src="/botharness-computer/viewer/"]') !== node,
    { timeout: 20_000 },
    originalFrame,
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('span')].some(
        (span) => span.textContent?.trim() === 'No picture',
      ),
    { timeout: 90_000, polling: 500 },
  );
  await page.screenshot({ path: `${shots}/light-empty.png` });
  assert.equal(
    viewerDocuments - initialViewerDocuments,
    4,
    'loss remount and three bounded automatic reloads are expected',
  );
  await page.setRequestInterception(false);
  page.off('request', blankViewer);
  await page.evaluate(() =>
    [...document.querySelectorAll('span')]
      .find((span) => span.textContent?.trim() === 'No picture')
      ?.parentElement?.querySelector('button')
      ?.click(),
  );
  await waitLive(page);
  await page.screenshot({ path: `${shots}/light-recovered.png` });
  assert.deepEqual(errors, []);
  await page.close();

  const darkPage = await browser.newPage();
  const darkErrors = [];
  darkPage.on('pageerror', (error) => darkErrors.push(error.message));
  await openComputer(darkPage, true);
  await exerciseFullscreen(darkPage, 'dark');
  await darkPage.evaluate(() => document.querySelector('button[aria-label="Settings"]')?.click());
  await darkPage.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === 'Bot settings',
      ),
    { timeout: 10_000 },
  );
  await darkPage.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Bot settings')
      ?.click(),
  );
  await darkPage.waitForFunction(
    () =>
      ['Export to…', 'Import…'].every((label) =>
        [...document.querySelectorAll('button')].some(
          (button) => button.textContent?.trim() === label && !button.disabled,
        ),
      ),
    { timeout: 20_000 },
  );
  const controls = await darkPage.evaluate(() =>
    ['Export to…', 'Import…'].map((label) => {
      const button = [...document.querySelectorAll('button')].find(
        (candidate) => candidate.textContent?.trim() === label,
      );
      return { label, present: button !== undefined, enabled: button?.disabled === false };
    }),
  );
  assert.deepEqual(controls, [
    { label: 'Export to…', present: true, enabled: true },
    { label: 'Import…', present: true, enabled: true },
  ]);
  await darkPage.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Import…')
      ?.click(),
  );
  await darkPage.waitForFunction(
    () => document.body.textContent?.includes('Choose archive file…') === true,
    { timeout: 10_000 },
  );
  await darkPage.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Choose archive file…')
      ?.scrollIntoView({ block: 'center' }),
  );
  await darkPage.screenshot({ path: `${shots}/dark-settings-import.png` });
  assert.deepEqual(darkErrors, []);
  await darkPage.close();
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      themes: ['light', 'dark'],
      viewerDocuments,
      lossRemount: true,
      boundedEmpty: true,
      manualRecovery: true,
      settingsControls: true,
      screenshots: shots,
    }),
  );
} finally {
  await browser.close();
}
