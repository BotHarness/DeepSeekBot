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
  const openBot = async () => {
    await page.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll('button')).some((button) =>
          button.textContent?.includes(name),
        ),
      { timeout: 30000 },
      botName,
    );
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
  const openNativeMenu = async (title) => {
    await page.waitForFunction(
      (name) => document.querySelector('button[aria-label="Session actions for ' + name + '"]'),
      { timeout: 20000 },
      title,
    );
    await page.evaluate(
      (name) =>
        document.querySelector('button[aria-label="Session actions for ' + name + '"]')?.click(),
      title,
    );
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[role="menuitem"]')).some((row) =>
          row.textContent?.includes('Back to Bot DM'),
        ),
      { timeout: 20000 },
    );
    const row = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('[role="menuitem"]')).find((item) =>
        item.textContent?.includes('Back to Bot DM'),
      );
      return {
        text: button?.textContent?.trim(),
        icon: button?.querySelector('.bh-bot-icon svg') !== null,
      };
    });
    if (row.text !== 'Back to Bot DM' || !row.icon)
      throw new Error('Native Bot return menu row is missing the expected label or icon');
  };
  const assertNativeAvatar = async (title, expected) => {
    await page.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll('[data-row-key^="session:"]')).some((row) =>
          row.textContent?.includes(name),
        ),
      { timeout: 20000 },
      title,
    );
    await page.waitForFunction(
      (name, hasOwner) =>
        Array.from(document.querySelectorAll('[data-row-key^="session:"]')).some(
          (row) =>
            row.textContent?.includes(name) &&
            row.querySelector(
              hasOwner
                ? '.bh-native-session-owner[role="img"]'
                : '[data-bh-native-session-owner="unowned"]',
            ),
        ),
      { timeout: 20000 },
      title,
      expected,
    );
    const actual = await page.evaluate(
      (name) =>
        Array.from(document.querySelectorAll('[data-row-key^="session:"]'))
          .find((row) => row.textContent?.includes(name))
          ?.querySelector('.bh-native-session-owner[role="img"]')
          ?.getAttribute('aria-label'),
      title,
    );
    if (expected && !actual?.includes(botName)) throw new Error('Owned Session avatar missing');
    if (!expected && actual) throw new Error('Unowned Session showed a Bot avatar');
  };
  const clickReturnMenu = async () => {
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="menuitem"]'))
        .find((button) => button.textContent?.includes('Back to Bot DM'))
        ?.click(),
    );
    await page.waitForFunction(
      (name) =>
        Array.from(document.querySelectorAll('textarea')).some(
          (field) =>
            field.getAttribute('placeholder')?.includes(name) &&
            field.getBoundingClientRect().width > 0,
        ),
      { timeout: 20000 },
      botName,
    );
  };

  await openBot();
  await openSessions();
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-session-row'))
      .find((row) => row.textContent?.includes('Orchestrator'))
      ?.click(),
  );
  await page.waitForSelector('.bh-session-return-action', { timeout: 20000 });
  await assertNativeAvatar('创建使用 DSH bash 的事项', true);
  await openNativeMenu('创建使用 DSH bash 的事项');
  await page.screenshot({ path: resolve(shots, 'orchestrator-return-menu.png'), fullPage: true });
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  await new Promise((resolve) => setTimeout(resolve, 350));
  await page.screenshot({
    path: resolve(shots, 'orchestrator-return-menu-dark.png'),
    fullPage: true,
  });
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  await clickReturnMenu();

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
  await assertNativeAvatar('Run pwd with DSH native bash', true);
  await openNativeMenu('Run pwd with DSH native bash');
  await page.screenshot({ path: resolve(shots, 'assignment-return-menu.png'), fullPage: true });
  await clickReturnMenu();

  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'New Session')
      ?.click(),
  );
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).some(
        (button) => button.getAttribute('aria-label') === 'Session actions for Ready',
      ),
    { timeout: 20000 },
  );
  await assertNativeAvatar('Ready', false);
  await page.evaluate(() =>
    document.querySelector('button[aria-label="Session actions for Ready"]')?.click(),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label="Session actions for Ready"]')
        ?.closest('[data-row-key^="session:"]')
        ?.querySelector('[data-bh-native-session-owner="unowned"]'),
    { timeout: 20000 },
  );
  const unownedHasReturn = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="menuitem"]')).some((row) =>
      row.textContent?.includes('Back to Bot DM'),
    ),
  );
  if (unownedHasReturn) throw new Error('Unowned native Session showed a Bot return menu row');
  await page.screenshot({ path: resolve(shots, 'unowned-no-return-menu.png'), fullPage: true });
  console.log(JSON.stringify({ verdict: 'PASS', botName, unownedHasReturn, shots }));
} finally {
  await browser.close();
}
