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

async function rpc(method, args) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `client-interactions-${method}-${Math.random()}`,
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

const nonce = Date.now();
const bot = (await rpc('create', { displayName: `Client interactions ${nonce}` })).bot;
const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
const first = (await rpc('channelCreate', { name: `Client A ${nonce}`, members: [bot.slug] }))
  .channel;
const second = (await rpc('channelCreate', { name: `Client B ${nonce}`, members: [bot.slug] }))
  .channel;
const cachedBody = `cached-${nonce}`;
await rpc('channelSend', { channelId: first.id, body: cachedBody });
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  for (const dark of [false, true]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
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
    if (!(await page.$('.bh-root'))) await page.click(botButton);
    await page.waitForSelector('.bh-root');
    await page.evaluate((enabled) => {
      if (enabled) document.body.setAttribute('data-ds-dark-theme', 'true');
      else document.body.removeAttribute('data-ds-dark-theme');
    }, dark);

    const row = (id) => `.bh-root [data-channel-id="${id}"]`;
    const select = async (id) => {
      await page.waitForSelector(row(id), { timeout: 30000 });
      await page.evaluate(
        (channelId) => document.querySelector(`.bh-root [data-channel-id="${channelId}"]`)?.click(),
        id,
      );
      await page.waitForFunction(
        (channelId) =>
          document
            .querySelector(`.bh-root [data-channel-id="${channelId}"]`)
            ?.classList.contains('bh-selected'),
        { timeout: 10000 },
        id,
      );
    };

    await select(first.id);
    const editor = '.bh-composer-rich-input';
    await page.waitForSelector(editor, { timeout: 10000 });
    await page.waitForFunction(
      (body) =>
        [...document.querySelectorAll('.bh-bubble-wrap')].some((bubble) =>
          bubble.textContent?.includes(body),
        ),
      { timeout: 10000 },
      cachedBody,
    );
    const draft = `draft-${dark ? 'dark' : 'light'}-${nonce}`;
    await page.click(editor);
    await page.keyboard.type(draft);
    assert.equal(await page.$eval(editor, (element) => element.textContent), draft);
    await select(second.id);
    await page.waitForSelector(editor, { timeout: 10000 });
    await page.waitForFunction(
      () => document.querySelector('.bh-composer-rich-input')?.textContent === '',
      { timeout: 10000 },
    );
    await select(first.id);
    await page.waitForFunction(
      (body) =>
        [...document.querySelectorAll('.bh-bubble-wrap')].some((bubble) =>
          bubble.textContent?.includes(body),
        ),
      { timeout: 10000 },
      cachedBody,
    );
    assert.equal(await page.$('.bh-chat-body .bh-skeleton'), null);
    await page.waitForFunction(
      () => document.querySelector('.bh-composer-rich-input')?.textContent === '',
      { timeout: 10000 },
    );
    assert.equal(await page.$eval(editor, (element) => element.textContent), '');

    const sidebarToggle = '.bh-sidebar-toggle';
    await page.waitForSelector(sidebarToggle);
    if (
      (await page.$eval(sidebarToggle, (button) => button.getAttribute('aria-expanded'))) ===
      'false'
    ) {
      await page.click(sidebarToggle);
    }
    const entry = '[data-panel-head]';
    await page.waitForSelector(entry, { timeout: 10000 });
    const before = await page.$eval(entry, (button) => button.getAttribute('aria-expanded'));
    await page.click(entry);
    await page.waitForFunction(
      (previous) =>
        document.querySelector('[data-panel-head]')?.getAttribute('aria-expanded') !== previous,
      { timeout: 10000 },
      before,
    );
    await page.click(entry);
    await page.waitForFunction(
      (previous) =>
        document.querySelector('[data-panel-head]')?.getAttribute('aria-expanded') === previous,
      { timeout: 10000 },
      before,
    );

    await select(first.id);
    await page.evaluate(() => {
      const members = [...document.querySelectorAll('[data-sidebar-entry]')].find((section) =>
        ['Members', '成员'].includes(
          section.querySelector('[data-panel-label]')?.textContent ?? '',
        ),
      );
      const head = members?.querySelector('[data-panel-head]');
      if (head?.getAttribute('aria-expanded') === 'false') head.click();
    });
    await page.waitForSelector('.bh-member-menu-button');
    await page.click('button[aria-label="Invite member"], button[aria-label="邀请新群员"]');
    await page.waitForSelector('[data-group-invite]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-group-invite]', { hidden: true });
    await select(second.id);
    await select(first.id);
    assert.equal(await page.$('[data-group-invite]'), null);
    await page.waitForSelector('.bh-member-menu-button');
    await page.click('.bh-member-menu-button');
    await page.waitForSelector('[role="menu"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="menu"]', { hidden: true });
    await select(second.id);

    await select(dm.id);
    assert.equal(
      await page.$eval(row(dm.id), (element) => element.classList.contains('bh-selected')),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        verdict: 'PASS',
        theme: dark ? 'dark' : 'light',
        draftClearedOnSwitch: true,
        cachedMessageReturned: true,
        sidebarToggled: true,
        groupControlsReset: true,
        dmSelected: true,
        errors,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
