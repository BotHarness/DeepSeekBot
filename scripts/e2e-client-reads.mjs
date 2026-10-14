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
      rpcId: `client-reads-${method}-${crypto.randomUUID()}`,
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

const names = ['Agent DX reads A', 'Agent DX reads B'];
const existing = (await rpc('list', {})).bots;
const bots = [];
for (const name of names) {
  const bot =
    existing.find((item) => item.displayName === name) ??
    (await rpc('create', { displayName: name })).bot;
  bots.push(bot);
}
const dms = await Promise.all(
  bots.map(async (bot) => (await rpc('channelDm', { slug: bot.slug })).channel),
);
const marker = `AX-read-${Date.now()}`;
const filePath = 'ax-read-454.md';
for (let index = 0; index < bots.length; index += 1) {
  const snapshot = (await rpc('memorySnapshot', { channelId: dms[index].id })).snapshot;
  assert.ok(snapshot.head);
  await rpc('memorySave', {
    channelId: dms[index].id,
    path: filePath,
    body: `${marker}-${index}`,
    expectedHead: snapshot.head,
    editId: crypto.randomUUID(),
  });
}
const group = (
  await rpc('channelCreate', {
    name: `AX reads group ${Date.now()}`,
    members: bots.map((bot) => bot.slug),
  })
).channel;
let browser;
let failure;
try {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
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
  const botMode = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botMode);
  if (!(await page.$('.bh-root'))) await page.click(botMode);
  await page.waitForSelector('.bh-root');

  const select = async (channelId) => {
    const row = `.bh-root [data-channel-id="${channelId}"]`;
    await page.waitForSelector(row, { timeout: 30000 });
    await page.$eval(row, (element) => element.click());
    await page.waitForFunction(
      (id) =>
        document.querySelector(`[data-channel-id="${id}"]`)?.classList.contains('bh-selected'),
      { timeout: 15000 },
      channelId,
    );
  };
  const expand = async (english, chinese) => {
    const toggle = await page.$('.bh-sidebar-toggle');
    if (
      toggle &&
      (await toggle.evaluate((button) => button.getAttribute('aria-expanded'))) === 'false'
    ) {
      await toggle.click();
    }
    await page.waitForFunction(
      (labels) =>
        [...document.querySelectorAll('[data-panel-label]')].some((element) =>
          labels.includes(element.textContent?.trim() ?? ''),
        ),
      { timeout: 15000 },
      [english, chinese],
    );
    await page.evaluate(
      (labels) => {
        const section = [...document.querySelectorAll('[data-sidebar-entry]')].find((element) =>
          labels.includes(element.querySelector('[data-panel-label]')?.textContent?.trim() ?? ''),
        );
        const button = section?.querySelector('[data-panel-head]');
        if (button?.getAttribute('aria-expanded') === 'false') button.click();
      },
      [english, chinese],
    );
  };
  const openMemory = async (index) => {
    await select(dms[index].id);
    await expand('Memory files', '记忆文件');
    await page.waitForSelector(`[role="treeitem"][data-path="${filePath}"]`, { timeout: 15000 });
    await page.click(`[role="treeitem"][data-path="${filePath}"]`);
    await page.waitForFunction(
      (text) => document.querySelector('.bh-memory-commit-code')?.textContent?.includes(text),
      { timeout: 15000 },
      `${marker}-${index}`,
    );
    assert.ok(
      !(await page.$eval('.bh-memory-commit-code', (element) => element.textContent)).includes(
        `${marker}-${1 - index}`,
      ),
    );
  };

  await openMemory(0);
  await select(group.id);
  await expand('Members', '成员');
  await page.waitForSelector('.bh-member-menu-button', { timeout: 15000 });
  await openMemory(1);
  await expand('Sessions', '会话');
  await page.waitForSelector('[data-sessions]', { timeout: 15000 });
  await expand('Workspace Grants', '工作区授权');
  await page.waitForSelector('.bh-workspace-grants', { timeout: 15000 }).catch(async (error) => {
    console.error(
      JSON.stringify({
        entries: await page.$$eval('[data-sidebar-entry]', (sections) =>
          sections.map((section) => ({
            label: section.querySelector('[data-panel-label]')?.textContent?.trim(),
            expanded: section.querySelector('[data-panel-head]')?.getAttribute('aria-expanded'),
            hasBody: section.querySelector('[data-sidebar-entry-body]') !== null,
            childClasses: [
              ...(section.querySelector('[data-sidebar-entry-body]')?.children ?? []),
            ].map((element) => element.className),
          })),
        ),
        errors,
      }),
    );
    throw error;
  });
  await openMemory(0);
  await expand('Workspace Grants', '工作区授权');
  await expand('Sessions', '会话');
  await page.waitForSelector('.bh-workspace-grants', { timeout: 15000 });
  await page.waitForSelector('[data-sessions]', { timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      dmSwitch: true,
      channelSwitch: true,
      memoryCurrent: true,
      sessionsMounted: true,
      grantsMounted: true,
      errors,
    }),
  );
} catch (error) {
  failure = error;
} finally {
  try {
    await browser?.close();
  } catch (error) {
    console.error('browser close failed', error);
    failure ??= error;
  }
  try {
    await rpc('channelGroupDelete', { channelId: group.id });
  } catch (error) {
    console.error('group cleanup failed', error);
    failure ??= error;
  }
}
if (failure) throw failure;
