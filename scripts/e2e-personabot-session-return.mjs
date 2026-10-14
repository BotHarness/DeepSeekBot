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
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3219';
const shots = process.env.BH_SCREENSHOT_DIR ?? resolve(root, 'docs/assets/pr/312-session-return');
mkdirSync(shots, { recursive: true });
const botName = 'SessionsQA-1790430425608';
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
  await page.waitForFunction(
    (name) =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.includes(name),
      ),
    { timeout: 30000 },
    botName,
  );
  const openBot = async () => {
    await page.evaluate(
      (name) =>
        Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.includes(name))
          ?.click(),
      botName,
    );
    await page.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll('textarea')).some((field) =>
          field.getAttribute('placeholder')?.includes(name),
        ),
      { timeout: 20000 },
      botName,
    );
  };
  const openSessions = async () => {
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
    await page.waitForSelector('.bh-session-row', { timeout: 20000 });
  };
  await openBot();
  await openSessions();
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-session-row'))
      .find((row) => row.textContent?.includes('Orchestrator'))
      ?.click(),
  );
  try {
    await page.waitForSelector('.bh-session-return-action', { timeout: 20000 });
  } catch (error) {
    console.log('NATIVE PAGE', await page.evaluate(() => document.body.innerText.slice(0, 1500)));
    await page.screenshot({ path: resolve(shots, 'debug-native.png'), fullPage: true });
    throw error;
  }
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.bh-session-return-action', { timeout: 20000 });
  const orchestratorLabel = await page.$eval('.bh-session-return-action', (button) =>
    button.textContent?.trim(),
  );
  if (orchestratorLabel !== 'Back to ' + botName)
    throw new Error('Wrong Orchestrator owner label: ' + orchestratorLabel);
  if (!(await page.$('.bh-session-return-action .bh-persona-avatar')))
    throw new Error('Return action is missing the PersonaBot avatar');
  await page.screenshot({ path: resolve(shots, 'orchestrator-return.png'), fullPage: true });
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.screenshot({ path: resolve(shots, 'orchestrator-return-dark.png'), fullPage: true });
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  await page.click('.bh-session-return-action');
  await page.waitForFunction(
    (name) => {
      const action = document.querySelector('.bh-session-return-action');
      if (action?.textContent?.includes('failed') || action?.textContent?.includes('失败'))
        throw new Error('Return button reported failure: ' + action.textContent);
      return Array.from(document.querySelectorAll('textarea')).some(
        (field) =>
          field.getAttribute('placeholder')?.includes(name) &&
          field.getBoundingClientRect().width > 0,
      );
    },
    { timeout: 20000 },
    botName,
  );
  if (await page.$('.bh-session-return-action'))
    throw new Error('Orchestrator return action remained visible after opening Bot DM');
  await openSessions();
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-session-view button'))
      .find((button) => button.textContent?.trim() === 'All')
      ?.click(),
  );
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.bh-session-row')).some((row) =>
        row.textContent?.includes('Assignment'),
      ),
    { timeout: 20000 },
  );
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-session-row'))
      .find((row) => row.textContent?.includes('Assignment'))
      ?.click(),
  );
  await page.waitForSelector('.bh-session-return-action', { timeout: 20000 });
  const assignmentLabel = await page.$eval('.bh-session-return-action', (button) =>
    button.textContent?.trim(),
  );
  if (assignmentLabel !== 'Back to ' + botName)
    throw new Error('Wrong Assignment owner label: ' + assignmentLabel);
  await page.screenshot({ path: resolve(shots, 'assignment-return.png'), fullPage: true });
  await page.click('.bh-session-return-action');
  await page.waitForFunction(
    (name) =>
      Array.from(document.querySelectorAll('textarea')).some((field) =>
        field.getAttribute('placeholder')?.includes(name),
      ),
    { timeout: 20000 },
    botName,
  );
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'New Session')
      ?.click(),
  );
  await page.waitForFunction(() => document.body.innerText.includes('Into the Unknown'), {
    timeout: 20000,
  });
  await page.waitForSelector('[contenteditable="true"][data-composer-input="true"]', {
    timeout: 20000,
  });
  await page.type(
    '[contenteditable="true"][data-composer-input="true"]',
    'Please reply with one word: ready.',
  );
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.body.innerText.includes('Please reply with one word: ready.'),
    { timeout: 30000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if ((await page.$('.bh-session-return-action')) !== null)
    throw new Error('Unowned native Session showed a Bot return action');
  await page.screenshot({ path: resolve(shots, 'unowned-no-return.png'), fullPage: true });
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      botName,
      orchestratorLabel,
      assignmentLabel,
      unownedReturnAction: false,
      shots,
    }),
  );
} finally {
  await browser.close();
}
