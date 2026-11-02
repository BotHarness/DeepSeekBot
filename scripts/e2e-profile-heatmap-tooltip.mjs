import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
if (!origin || !home) throw new Error('Set BH_E2E_ORIGIN and BH_E2E_HOME');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.env.BH_E2E_DEPS_ROOT ?? resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer is unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  '/tmp/dsh-' + basename(home).replace(/[^a-zA-Z0-9-]/gu, '-') + '.cookies',
  'utf8',
).split(';')[0];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1520, height: 900 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'networkidle2' });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  const openSidebar = await page.$('button[aria-label="Open sidebar"]');
  if (openSidebar) await openSidebar.click();
  await page.waitForSelector('.bh-root [data-channel-id^="dm-"]');
  await page.evaluate(() => document.querySelector('.bh-root [data-channel-id^="dm-"]')?.click());
  await page.waitForSelector('.bh-channel-island');
  await page.waitForFunction(
    () => document.querySelector('.bh-channel-island')?.getAttribute('aria-haspopup') === 'menu',
  );

  async function measure(scope, which, interaction) {
    await page.evaluate(
      ({ scope, which, interaction }) => {
        const grid = document.querySelector(scope + ' .bh-profile-heat-grid');
        const cells = Array.from(grid.querySelectorAll('button.bh-profile-heat-cell'));
        const cell = which === 'first' ? cells[0] : cells.at(-1);
        if (interaction === 'focus') cell.focus();
        else cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      },
      { scope, which, interaction },
    );
    await page.waitForSelector(scope + ' .bh-profile-heat-tip');
    const result = await page.evaluate(
      ({ scope, which }) => {
        const grid = document.querySelector(scope + ' .bh-profile-heat-grid');
        const cells = Array.from(grid.querySelectorAll('button.bh-profile-heat-cell'));
        const cell = which === 'first' ? cells[0] : cells.at(-1);
        const tip = grid.querySelector('.bh-profile-heat-tip');
        const cellRect = cell.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        return {
          gridWidth: Math.round(grid.getBoundingClientRect().width),
          cellX: Math.round(cellRect.x + cellRect.width / 2),
          tipX: Math.round(tipRect.x + tipRect.width / 2),
          delta: Math.round(tipRect.x + tipRect.width / 2 - cellRect.x - cellRect.width / 2),
        };
      },
      { scope, which },
    );
    if (Math.abs(result.delta) > 25) {
      throw new Error(
        scope + ' ' + which + ' ' + interaction + ' tooltip drift: ' + JSON.stringify(result),
      );
    }
    return result;
  }

  await page.evaluate(() => document.querySelector('.bh-channel-island')?.click());
  await page.locator('::-p-aria(View profile)').click();
  await page.waitForSelector('.bh-profile-view .bh-profile-heat-grid');
  const fullHover = await measure('.bh-profile-view', 'last', 'hover');
  const fullFocus = await measure('.bh-profile-view', 'first', 'focus');
  if (process.env.BH_E2E_SCREENSHOT) {
    await measure('.bh-profile-view', 'last', 'hover');
    await page.screenshot({ path: process.env.BH_E2E_SCREENSHOT });
  }
  await page.setViewport({ width: 880, height: 900 });
  const narrowHover = await measure('.bh-profile-view', 'last', 'hover');
  console.log(JSON.stringify({ fullHover, fullFocus, narrowHover }));
} finally {
  await browser.close();
}
