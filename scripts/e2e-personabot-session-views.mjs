import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3217';
const shots = process.env.BH_SCREENSHOT_DIR ?? resolve(root, 'docs/assets/pr/312-session-views');
mkdirSync(shots, { recursive: true });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));
  await page.goto(origin + '/?token=' + encodeURIComponent(token), {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page.click('button[aria-label="Bot mode"]');
  await page.waitForSelector('button[aria-label="New"]', { timeout: 20000 });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('SessionsQA-'),
      ),
    { timeout: 20000 },
  );
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('SessionsQA-'))
      ?.click(),
  );
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[data-panel-head]')).some((button) =>
        /Sessions|会话/.test(button.textContent ?? ''),
      ),
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('[data-panel-head]')).find((candidate) =>
      /Sessions|会话/.test(candidate.textContent ?? ''),
    );
    if (button?.getAttribute('aria-expanded') !== 'true') button?.click();
  });
  await page.waitForSelector('button[aria-label="Session view options"]', { timeout: 20000 });
  const openViewMenu = async () => {
    await page.click('button[aria-label="Session view options"]');
    await page.waitForSelector('div[role="menu"]', { timeout: 10000 });
  };
  const chooseOption = async (option) => {
    await openViewMenu();
    const selected = await page.evaluate((label) => {
      const button = Array.from(document.querySelectorAll('div[role="menu"] button')).find(
        (node) => node.textContent?.trim() === label,
      );
      button?.click();
      return button !== undefined;
    }, option);
    if (!selected) throw new Error('Missing Session option: ' + option);
  };
  const readSelectedOptions = async () => {
    await openViewMenu();
    const selected = await page.$$eval('div[role="menu"] button', (buttons) =>
      buttons
        .filter((button) => button.querySelector('svg'))
        .map((button) => button.textContent?.trim()),
    );
    await page.keyboard.press('Escape');
    return selected;
  };
  await chooseOption('All');
  await chooseOption('By workspace');
  await page.waitForFunction(() => document.querySelectorAll('[data-group-heading]').length >= 2, {
    timeout: 10000,
  });
  await page.evaluate(() => {
    for (const heading of document.querySelectorAll('[data-group-heading]')) {
      if (heading.getAttribute('aria-expanded') !== 'true') heading.click();
    }
  });
  await page.waitForFunction(() => document.querySelectorAll('.bh-session-row').length >= 2, {
    timeout: 10000,
  });
  console.log(
    'GROUPS',
    await page.$$eval('[data-group-heading]', (nodes) =>
      nodes.map((node) => ({
        name: node.textContent?.trim(),
        expanded: node.getAttribute('aria-expanded'),
      })),
    ),
  );
  console.log(
    'ROWS',
    await page.$$eval('.bh-session-row', (nodes) => nodes.map((node) => node.textContent)),
  );
  await page.screenshot({ path: resolve(shots, 'grouped-light.png'), fullPage: true });
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.screenshot({ path: resolve(shots, 'grouped-dark.png'), fullPage: true });
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));

  const heading = await page.$$('[data-group-heading]');
  if (heading.length < 2) throw new Error('Expected Memory and Assignment workspaces');
  await heading[1].click();
  await page.waitForFunction(() => document.querySelectorAll('.bh-session-row').length === 1, {
    timeout: 10000,
  });
  await page.screenshot({ path: resolve(shots, 'group-collapsed.png'), fullPage: true });

  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector('button[aria-label="Bot mode"]', { timeout: 20000 });
  await page.click('button[aria-label="Bot mode"]');
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('SessionsQA-'),
      ),
    { timeout: 20000 },
  );
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('SessionsQA-'))
      ?.click(),
  );
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[data-panel-head]')).some((button) =>
        /Sessions|会话/.test(button.textContent ?? ''),
      ),
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('[data-panel-head]')).find((candidate) =>
      /Sessions|会话/.test(candidate.textContent ?? ''),
    );
    if (button?.getAttribute('aria-expanded') !== 'true') button?.click();
  });
  await page.waitForSelector('button[aria-label="Session view options"]', { timeout: 20000 });
  const restoredChoices = await readSelectedOptions();
  const restored = await page.evaluate(() => ({
    collapsed: Array.from(document.querySelectorAll('[data-group-heading]')).map((heading) =>
      heading.getAttribute('aria-expanded'),
    ),
    rows: document.querySelectorAll('.bh-session-row').length,
  }));
  if (
    restoredChoices.join(',') !== 'All,By workspace' ||
    restored.collapsed.join(',') !== 'true,false' ||
    restored.rows !== 1
  )
    throw new Error(
      'View preference did not survive reload: ' + JSON.stringify({ restoredChoices, restored }),
    );
  console.log('RELOAD', JSON.stringify(restored));

  const otherName = 'SessionsViewOtherQA-' + Date.now();
  await page.click('button[aria-label="New"]');
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Create PersonaBot')
      ?.click(),
  );
  await page.waitForSelector('input[placeholder="e.g. Xiao Yan"]', { timeout: 10000 });
  await page.type('input[placeholder="e.g. Xiao Yan"]', otherName);
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Create')
      ?.click(),
  );
  await page.waitForSelector('input[placeholder="e.g. Xiao Yan"]', {
    hidden: true,
    timeout: 30000,
  });
  await page.waitForFunction(
    (botName) =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.includes(botName),
      ),
    { timeout: 20000 },
    otherName,
  );
  await page.evaluate(
    (botName) =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.includes(botName))
        ?.click(),
    otherName,
  );
  await page.waitForFunction(
    (botName) =>
      Array.from(document.querySelectorAll('textarea')).some((field) =>
        field.getAttribute('placeholder')?.includes(botName),
      ),
    { timeout: 20000 },
    otherName,
  );
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[data-panel-head]')).some((button) =>
        /Sessions|会话/.test(button.textContent ?? ''),
      ),
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('[data-panel-head]')).find((candidate) =>
      /Sessions|会话/.test(candidate.textContent ?? ''),
    );
    if (button?.getAttribute('aria-expanded') !== 'true') button?.click();
  });
  await page.waitForSelector('button[aria-label="Session view options"]', { timeout: 20000 });
  const other = await readSelectedOptions();
  if (other.join(',') !== 'Current,Flat') {
    throw new Error('New Bot inherited another Bot view: ' + JSON.stringify(other));
  }
  await page.screenshot({ path: resolve(shots, 'other-bot-default.png'), fullPage: true });

  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('SessionsQA-'))
      ?.click(),
  );
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[data-panel-head]')).some((button) =>
        /Sessions|会话/.test(button.textContent ?? ''),
      ),
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('[data-panel-head]')).find((candidate) =>
      /Sessions|会话/.test(candidate.textContent ?? ''),
    );
    if (button?.getAttribute('aria-expanded') !== 'true') button?.click();
  });
  await page.waitForSelector('button[aria-label="Session view options"]', { timeout: 20000 });
  const first = await readSelectedOptions();
  if (first.join(',') !== 'All,By workspace') {
    throw new Error('Original Bot lost its own view: ' + JSON.stringify(first));
  }
  console.log(JSON.stringify({ verdict: 'PASS', otherName, other, first, restored, shots }));
} finally {
  await browser.close();
}
