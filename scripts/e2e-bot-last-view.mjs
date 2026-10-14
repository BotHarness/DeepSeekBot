import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (puppeteerDir === undefined) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (token === undefined) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3220';
const shots = process.env.BH_SCREENSHOT_DIR ?? '/tmp/bh340-last-view-shots';
mkdirSync(shots, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, { waitUntil: 'networkidle2' });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  await page.evaluate(() => {
    localStorage.removeItem('botharness/last-view.v1');
    localStorage.setItem('botharness/start-in-bot-mode.v1', 'true');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(botButton);
  await new Promise((wait) => setTimeout(wait, 600));
  if (await page.$('.bh-root')) throw new Error('Old startup switch reopened Bot mode');
  await page.screenshot({ path: resolve(shots, '01-native-first-visit.png') });

  await page.click(botButton);
  await page.waitForSelector('.bh-root [data-channel-id]', { timeout: 20000 });
  const channelId = await page.$eval('.bh-root [data-channel-id]', (row) =>
    row.getAttribute('data-channel-id'),
  );
  if (channelId === null) throw new Error('No Channel id');
  await page.click(`.bh-root [data-channel-id="${channelId}"]`);
  const selected = (id) =>
    Array.from(document.querySelectorAll('.bh-root [data-channel-id]')).some(
      (row) => row.getAttribute('data-channel-id') === id && row.classList.contains('bh-selected'),
    );
  await page.waitForFunction(selected, {}, channelId);
  const botView = await page.evaluate(() => localStorage.getItem('botharness/last-view.v1'));
  const saved = botView === null ? undefined : JSON.parse(botView);
  if (saved?.mode !== 'bot' || saved.selection === undefined) {
    throw new Error(`Selected Bot DM or Channel was not saved: ${botView}`);
  }
  await page.screenshot({ path: resolve(shots, '02-selected-channel.png') });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(selected, { timeout: 20000 }, channelId);
  await new Promise((wait) => setTimeout(wait, 1000));
  await page.waitForFunction(() => !document.body.innerText.includes('Loading messages...'), {
    timeout: 20000,
  });
  const restored = await page.evaluate(() => localStorage.getItem('botharness/last-view.v1'));
  if (
    restored === null ||
    JSON.stringify(JSON.parse(restored).selection) !== JSON.stringify(saved.selection)
  ) {
    throw new Error(`Wrong conversation restored: ${restored}`);
  }
  await page.screenshot({ path: resolve(shots, '03-restored-channel.png') });
  await page.click(
    'button[aria-label="Exit Bot mode"], button[aria-label="退出 Bot 模式"], ' + botButton,
  );
  await page.waitForFunction(() => document.querySelector('.bh-root') === null);
  const nativeView = await page.evaluate(() => localStorage.getItem('botharness/last-view.v1'));
  if (nativeView === null || JSON.parse(nativeView).mode !== 'dsh') {
    throw new Error(`Native mode was not saved: ${nativeView}`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(botButton);
  await new Promise((wait) => setTimeout(wait, 600));
  if (await page.$('.bh-root')) throw new Error('Bot mode reopened after native exit');
  await page.screenshot({ path: resolve(shots, '04-restored-native.png') });
  console.log('LAST MODE AND CHANNEL RESTORE PASS');
} finally {
  await browser.close();
}
