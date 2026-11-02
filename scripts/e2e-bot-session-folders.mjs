import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rpc } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const instanceFile = process.env.BH_E2E_INSTANCE;
assert.ok(instanceFile, "BH_E2E_INSTANCE must name this task's verified isolated Host");
let instance = JSON.parse(readFileSync(instanceFile, 'utf8'));
assert.equal(resolve(instance.worktree), root);
const directory = join(dirname(instanceFile), 'evidence', `folders-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const store = join(root, 'node_modules/.pnpm');
const installed = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
assert.ok(installed, 'Install workspace dependencies first');
const puppeteer = createRequire(join(store, installed, 'node_modules/'))('puppeteer');
const events = [];
const step = (phase) => {
  events.push({ phase });
  process.stdout.write(`${phase}\n`);
};
const health = await rpc(instance, 'botharness/botSessionIds');
const group = health.groups.find((item) => item.sessionIds.length >= 2);
assert.ok(group, 'Seed a real Orchestrator and Assignment through the Bot DM first');
const owned = await rpc(instance, 'botharness/sessions', { slug: group.botSlug });
assert.ok(owned.sessions.some((item) => item.role === 'orchestrator'));
assert.ok(owned.sessions.some((item) => item.role === 'assignment'));
const cwdBefore = owned.sessions.map(({ sessionId, cwdReference }) => ({
  sessionId,
  cwdReference,
}));
writeFileSync(join(directory, 'ownership-before.json'), JSON.stringify(cwdBefore, null, 2));
step('launch-browser');
const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  protocolTimeout: 60_000,
  args: ['--no-sandbox', '--lang=en-US', '--disable-gpu'],
});
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
  page.on('pageerror', (error) => events.push({ error: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') events.push({ console: message.text() });
  });
  step('login');
  await page.goto(instance.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.goto(instance.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('button[aria-label="Bot mode"], button[aria-label="Exit Bot mode"]', {
    timeout: 60_000,
  });
  for (let round = 0; round < 4; round++) {
    const dismissed = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(
        (item) =>
          ['Continue', '继续', 'Configure later', '稍后配置', 'Skip tutorial', '跳过教程'].includes(
            item.textContent?.trim(),
          ) && item.offsetParent !== null,
      );
      button?.click();
      return Boolean(button);
    });
    if (!dismissed) break;
    await new Promise((done) => setTimeout(done, 400));
  }
  if (await page.$('button[aria-label="Exit Bot mode"]'))
    await page.click('button[aria-label="Exit Bot mode"]');
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  step('group-visible');
  const rootFolder = '[data-bot-folder-root]';
  const rootHeader = `${rootFolder} > div > [data-panel-head]`;
  await page.waitForSelector(rootFolder, { visible: true, timeout: 60_000 });
  if (await page.$(`${rootFolder}[aria-expanded="false"]`)) await page.click(rootHeader);
  assert.equal(
    await page.$eval(`${rootHeader} [data-panel-label]`, (node) => node.textContent),
    'DeepSeekBot',
  );
  assert.ok(await page.$(`${rootHeader} .bh-bot-icon`));
  assert.equal(await page.$(`${rootHeader} [data-panel-chevron]`), null);
  const folder = `[data-bot-folder="${group.botSlug}"]`;
  const folderHeader = `${folder} [data-panel-head]`;
  await page.waitForSelector(folder, { visible: true, timeout: 60_000 });
  assert.ok(await page.$(`${folderHeader} .bh-persona-avatar`));
  assert.equal(await page.$(`${folderHeader} [data-panel-chevron]`), null);
  if (await page.$(`${folder}[aria-expanded="false"]`)) await page.click(folderHeader);
  await page.waitForFunction(
    (selector) => document.querySelectorAll(`${selector} [data-bot-folder-session]`).length >= 2,
    { timeout: 20_000 },
    folder,
  );
  const rendered = await page.$$eval(`${folder} [data-bot-folder-session]`, (rows) =>
    rows.map((row) => row.dataset.botFolderSession),
  );
  assert.deepEqual([...rendered].sort(), [...group.sessionIds].sort());
  const duplicates = await page.$$eval('[data-row-key^="session:"]', (rows) =>
    rows.filter((row) => row.getClientRects().length > 0).map((row) => row.dataset.rowKey),
  );
  assert.ok(group.sessionIds.every((id) => !duplicates.includes(`session:${id}`)));
  await page.screenshot({ path: join(directory, 'expanded-light.png'), waitForFonts: false });
  step('fold');
  await page.click(folderHeader);
  await page.waitForSelector(`${folder}[aria-expanded="false"]`);
  await page.screenshot({ path: join(directory, 'collapsed-light.png'), waitForFonts: false });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`${folder}[aria-expanded="false"]`, { timeout: 60_000 });
  step('reload-preserves-collapse');
  await page.click(rootHeader);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`${rootFolder}[aria-expanded="false"]`, { timeout: 60_000 });
  assert.equal(await page.$(folder), null);
  await page.click(rootHeader);
  await page.waitForSelector(`${folder}[aria-expanded="false"]`);
  step('nested-collapse-preserved');
  if (process.env.BH_E2E_RESTART === '1') {
    step('restart-owned-host');
    process.kill(instance.pid);
    const restarted = execFileSync(
      process.execPath,
      [
        'scripts/dev-instance.mjs',
        '--home',
        instance.home,
        '--port',
        String(new URL(instance.url).port),
        '--json',
      ],
      { cwd: root, encoding: 'utf8', timeout: 180_000, windowsHide: true },
    );
    instance = JSON.parse(restarted);
    writeFileSync(instanceFile, restarted);
    await page.goto(instance.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.goto(instance.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector(`${folder}[aria-expanded="false"]`, { timeout: 60_000 });
    step('host-restart-preserves-group-and-collapse');
  }
  await page.click(folderHeader);
  const target = group.sessionIds.find(
    (id) => owned.sessions.find((item) => item.sessionId === id)?.role === 'assignment',
  );
  assert.ok(target);
  await page.click(`${folder} [data-bot-folder-session="${target}"]`);
  await page.waitForSelector(
    `${folder} [data-bot-folder-session="${target}"][aria-selected="true"]`,
    { timeout: 30_000 },
  );
  await page.waitForSelector('.bh-session-return-action', { timeout: 30_000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Loading history...'), {
    timeout: 30_000,
  });
  step('native-session-opened');
  await page.screenshot({ path: join(directory, 'opened-light.png'), waitForFonts: false });
  await page.click(folderHeader);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-panel-chevron]')].every(
      (node) => node.getAnimations().length === 0,
    ),
  );
  await page.screenshot({
    path: join(directory, 'bot-collapsed-with-session.png'),
    waitForFonts: false,
  });
  await page.click(rootHeader);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-panel-chevron]')].every(
      (node) => node.getAnimations().length === 0,
    ),
  );
  await page.screenshot({
    path: join(directory, 'section-collapsed-with-session.png'),
    waitForFonts: false,
  });
  await page.click(rootHeader);
  await page.click(folderHeader);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-panel-chevron]')].every(
      (node) => node.getAnimations().length === 0,
    ),
  );
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await page.screenshot({ path: join(directory, 'expanded-dark.png'), waitForFonts: false });
  const after = await rpc(instance, 'botharness/sessions', { slug: group.botSlug });
  assert.deepEqual(
    after.sessions.map(({ sessionId, cwdReference }) => ({ sessionId, cwdReference })),
    cwdBefore,
  );
  assert.ok(
    !events.some((item) => item.error),
    'Read page-errors.json before accepting the journey',
  );
  step('PASS');
} catch (error) {
  await page
    ?.screenshot({ path: join(directory, 'failure.png'), waitForFonts: false })
    .catch(() => {});
  if (page)
    writeFileSync(
      join(directory, 'failure.txt'),
      await page.evaluate(() => document.body.innerText).catch(() => 'unavailable'),
    );
  throw error;
} finally {
  writeFileSync(join(directory, 'page-errors.json'), JSON.stringify(events, null, 2));
  const cleanup = setTimeout(() => browser.process()?.kill(), 15_000);
  try {
    await browser.close();
  } finally {
    clearTimeout(cleanup);
  }
  process.stdout.write(`Evidence: ${directory}\n`);
}
