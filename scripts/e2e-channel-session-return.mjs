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
const shots = process.env.BH_E2E_SCREENSHOT_DIR ?? '/tmp/bh455-session-return';
mkdirSync(shots, { recursive: true });

async function rpc(method, args) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `session-return-${method}-${Math.random()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true)
    throw new Error(`${method}: ${response.status} ${JSON.stringify(envelope.result?.error)}`);
  return envelope.result.value;
}

const name = `Return QA ${Date.now()}`;
const bot = (await rpc('create', { displayName: name })).bot;
const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
await rpc('channelSend', { channelId: dm.id, body: 'Please reply with one word: ready.' });
let sessions = [];
for (let attempt = 0; attempt < 40; attempt += 1) {
  sessions = (await rpc('sessions', { slug: bot.slug })).sessions;
  if (sessions.some((session) => session.role === 'orchestrator')) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(
  sessions.some((session) => session.role === 'orchestrator'),
  'Missing owned Session',
);

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root')))
    await page.evaluate((selector) => document.querySelector(selector)?.click(), botButton);
  await page.waitForSelector('.bh-root');
  await page.waitForSelector(`.bh-root [data-channel-id="${dm.id}"]`, { timeout: 20000 });
  await page.evaluate(
    (id) => document.querySelector(`.bh-root [data-channel-id="${id}"]`)?.click(),
    dm.id,
  );
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`.bh-root [data-channel-id="${id}"]`)
        ?.classList.contains('bh-selected'),
    { timeout: 20000 },
    dm.id,
  );
  await page.waitForSelector('.bh-composer-input', { timeout: 20000 });
  if (!(await page.$('[data-panel-head]'))) {
    await page.evaluate(() => document.querySelector('.bh-sidebar-toggle')?.click());
  }
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-panel-head]')].some((button) =>
        /Sessions|会话/u.test(button.textContent ?? ''),
      ),
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-panel-head]')].find((candidate) =>
      /Sessions|会话/u.test(candidate.textContent ?? ''),
    );
    if (button?.getAttribute('aria-expanded') !== 'true') button?.click();
  });
  await page.waitForSelector('.bh-session-row:not(:disabled)', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('.bh-session-row:not(:disabled)')?.click());
  await page.waitForSelector('.bh-session-return-action', { timeout: 20000 });
  const label = await page.$eval('.bh-session-return-action', (button) =>
    button.textContent?.trim(),
  );
  assert.ok(label?.includes(name), `Wrong Session return owner: ${label}`);
  await page.screenshot({ path: resolve(shots, '01-native-session.png') });
  await page.evaluate(() => document.querySelector('.bh-session-return-action')?.click());
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`.bh-root [data-channel-id="${id}"]`)
        ?.classList.contains('bh-selected') &&
      document.querySelector('.bh-composer-input') !== null,
    { timeout: 20000 },
    dm.id,
  );
  await page.screenshot({ path: resolve(shots, '02-returned-dm.png') });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      owner: name,
      sessionId: sessions[0]?.sessionId,
      returnAction: true,
      returnedDm: true,
      errors,
      shots,
    }),
  );
} finally {
  await browser.close();
}
