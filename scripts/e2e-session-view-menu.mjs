import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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
const shots = process.env.BH_SCREENSHOT_DIR ?? '/tmp/bh312-menu-shots';
mkdirSync(shots, { recursive: true });
const name = process.env.BH_E2E_BOT_NAME ?? 'SessionMenuQA-' + Date.now();

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  const menuSelector =
    'button[aria-label="Session view options"], button[aria-label="会话视图选项"]';
  const clickMenu = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.waitForSelector(menuSelector);
      await page.evaluate((selector) => {
        if (document.querySelector('div[role="menu"]') !== null) return;
        const button = [...document.querySelectorAll(selector)].find(
          (candidate) =>
            candidate instanceof HTMLButtonElement && candidate.getClientRects().length > 0,
        );
        button?.click();
      }, menuSelector);
      try {
        await page.waitForSelector('div[role="menu"]', { timeout: 2500 });
        return;
      } catch {
        if (attempt === 2) throw new Error('Session view menu did not remain open');
      }
    }
  };
  const screenshot = async (filename) => {
    const session = await page.target().createCDPSession();
    try {
      const result = await session.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(resolve(shots, filename), Buffer.from(result.data, 'base64'));
    } finally {
      await session.detach();
    }
  };
  await page.goto(origin + '/?token=' + encodeURIComponent(token), {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page
    .waitForSelector('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]', {
      timeout: 20000,
    })
    .catch(async (error) => {
      await screenshot('00-startup-failure.png');
      console.log(
        'INITIAL PAGE',
        await page.evaluate(() => ({
          url: location.origin + location.pathname,
          text: document.body.innerText.slice(0, 1500),
          buttons: Array.from(document.querySelectorAll('button'))
            .slice(0, 30)
            .map((button) => ({
              label: button.getAttribute('aria-label'),
              text: button.textContent?.trim(),
            })),
        })),
      );
      throw error;
    });
  await page.click('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
  if (process.env.BH_E2E_BOT_NAME !== undefined) {
    await page.waitForFunction(
      (botName) =>
        Array.from(document.querySelectorAll('button')).some((button) =>
          button.textContent?.includes(botName),
        ),
      { timeout: 20000 },
      name,
    );
    await page.evaluate(
      (botName) =>
        Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.includes(botName))
          ?.click(),
      name,
    );
  } else {
    try {
      await page.waitForSelector('button[aria-label="New"]', { timeout: 15000 });
    } catch (error) {
      await screenshot('00-initial-state.png');
      console.log(
        'INITIAL PAGE',
        await page.evaluate(() => ({
          url: location.origin + location.pathname,
          text: document.body.innerText.slice(0, 1500),
          buttons: Array.from(document.querySelectorAll('button'))
            .slice(0, 30)
            .map((button) => ({
              label: button.getAttribute('aria-label'),
              text: button.textContent?.trim(),
            })),
        })),
      );
      throw error;
    }
    await page.click('button[aria-label="New"]');
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Create PersonaBot')
        ?.click(),
    );
    await page.waitForSelector('input[placeholder="e.g. Xiao Yan"]');
    await page.type('input[placeholder="e.g. Xiao Yan"]', name);
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Create')
        ?.click(),
    );
  }
  await page.waitForFunction(
    (botName) =>
      document.querySelector('.bh-channel-island')?.textContent?.includes(botName) === true &&
      document.querySelector('.bh-composer-input') !== null,
    { timeout: 20000 },
    name,
  );
  await page.waitForSelector(menuSelector);
  const heading = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-panel-head]'))
      .find((button) => /Sessions|会话/u.test(button.textContent ?? ''))
      ?.getAttribute('aria-expanded'),
  );
  if (heading !== 'true') {
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-panel-head]'))
        .find((button) => /Sessions|会话/u.test(button.textContent ?? ''))
        ?.click(),
    );
  }
  if ((await page.$('.bh-session-controls')) !== null) {
    throw new Error('Old segmented controls remain');
  }
  await clickMenu();
  await page.waitForSelector('div[role="menu"]');
  const menuText = await page.$eval('div[role="menu"]', (menu) => menu.textContent ?? '');
  for (const labels of [
    ['Session view', '会话范围'],
    ['Current', '当前'],
    ['All', '全部'],
    ['Layout', '排列方式'],
    ['Flat', '平铺'],
    ['By workspace', '按工作区'],
  ]) {
    if (!labels.some((label) => menuText.includes(label)))
      throw new Error('Missing menu item: ' + labels.join(' / '));
  }
  const expandedAfterMenu = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-panel-head]'))
      .find((button) => /Sessions|会话/u.test(button.textContent ?? ''))
      ?.getAttribute('aria-expanded'),
  );
  if (expandedAfterMenu !== 'true') throw new Error('Menu click collapsed Sessions');
  await page
    .waitForFunction(
      () => !document.body.innerText.includes('Unable to create default workspace'),
      {
        timeout: 10000,
      },
    )
    .catch(() => undefined);
  await screenshot('01-session-menu.png');
  if ((await page.$('div[role="menu"]')) === null) {
    await clickMenu();
    await page.waitForSelector('div[role="menu"]');
  }

  const select = async (labels) => {
    const clicked = await page.evaluate((choices) => {
      const button = Array.from(document.querySelectorAll('div[role="menu"] button')).find((item) =>
        choices.includes(item.textContent?.trim() ?? ''),
      );
      button?.click();
      return button !== undefined;
    }, labels);
    if (!clicked) throw new Error('Could not click menu item: ' + labels.join(' / '));
  };
  await select(['All', '全部']);
  await clickMenu();
  await page.waitForSelector('div[role="menu"]');
  await select(['By workspace', '按工作区']);
  const chosen = await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('botharness/session-views.v1') ?? '{}');
    return Object.values(records).find((record) => record?.scope === 'all') ?? null;
  });
  if (chosen?.layout !== 'workspace') throw new Error('Menu changes did not persist');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
  if ((await page.$('.bh-root')) === null) {
    await page.evaluate(() =>
      document
        .querySelector('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]')
        ?.click(),
    );
    await page.waitForSelector('.bh-root');
  }
  if ((await page.$(menuSelector)) === null) {
    await page.waitForFunction(
      (botName) =>
        Array.from(document.querySelectorAll('button')).some((button) =>
          button.textContent?.includes(botName),
        ),
      { timeout: 15000 },
      name,
    );
    await page.evaluate(
      (botName) =>
        Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.includes(botName))
          ?.click(),
      name,
    );
  }
  await page.waitForSelector(menuSelector);
  await clickMenu();
  await page.waitForSelector('div[role="menu"]');
  const checks = await page.$$eval('div[role="menu"] button', (buttons) =>
    buttons
      .filter((button) => button.querySelector('svg'))
      .map((button) => button.textContent?.trim()),
  );
  if (
    !checks.some((value) => ['All', '全部'].includes(value)) ||
    !checks.some((value) => ['By workspace', '按工作区'].includes(value))
  ) {
    throw new Error('Stored menu choices not reflected after reload: ' + JSON.stringify(checks));
  }
  await page
    .waitForFunction(
      () => !document.body.innerText.includes('Unable to create default workspace'),
      {
        timeout: 10000,
      },
    )
    .catch(() => undefined);
  await screenshot('02-session-menu-after-reload.png');
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  await screenshot('03-session-menu-dark.png');
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-panel-head]'))
      .find((button) => /Sessions|会话/u.test(button.textContent ?? ''))
      ?.click(),
  );
  const collapsed = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-panel-head]'))
      .find((button) => /Sessions|会话/u.test(button.textContent ?? ''))
      ?.getAttribute('aria-expanded'),
  );
  if (collapsed !== 'false') throw new Error('Sessions heading did not collapse');
  if ((await page.$('div[role="menu"]')) === null) {
    await clickMenu();
  }
  await page.waitForSelector('div[role="menu"]');
  await select(['Current', '当前']);
  const collapsedChoice = await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('botharness/session-views.v1') ?? '{}');
    return Object.values(records).find((record) => record?.layout === 'workspace')?.scope;
  });
  if (collapsedChoice !== 'current')
    throw new Error('Collapsed Sessions menu did not update scope');
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-panel-head]'))
      .find((button) => /Sessions|会话/u.test(button.textContent ?? ''))
      ?.click(),
  );
  console.log(JSON.stringify({ name, chosen, checks, shots }, null, 2));
} finally {
  await browser.close();
}
