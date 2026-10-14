import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer is unavailable in this workspace install');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
const origin = process.env.BH_E2E_ORIGIN;
if (!token || !origin) throw new Error('Set BH_E2E_TOKEN and BH_E2E_ORIGIN');
const screenshot = resolve(process.argv[2] ?? join(root, 'docs/qa/memory-inbox.png'));
const existingSlug = process.argv
  .find((arg) => arg.startsWith('--existing='))
  ?.slice('--existing='.length);
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  const rpc = (method, args = {}) =>
    page.evaluate(
      async (methodName, methodArgs) => {
        const response = await fetch(`/api/botharness/${methodName}`, {
          method: 'POST',
          signal: AbortSignal.timeout(30_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `memory-qa-${methodName}-${Date.now()}`,
            method: `botharness/${methodName}`,
            payload: { args: methodArgs },
          }),
        });
        const envelope = await response.json();
        if (response.status !== 200 || envelope.result?.ok !== true) {
          throw new Error(
            `${methodName}: HTTP ${response.status} ${JSON.stringify(envelope.result?.error)}`,
          );
        }
        return envelope.result.value;
      },
      method,
      args,
    );
  await rpc('list');
  const name = existingSlug
    ? (await rpc('get', { slug: existingSlug })).bot?.displayName
    : `Memory Inbox QA ${Date.now()}`;
  if (!name) throw new Error('PersonaBot name is unavailable');
  const slug =
    existingSlug ??
    (await rpc('create', { displayName: name, roles: ['research'], workspaces: [] })).bot?.slug;
  if (!slug) throw new Error('PersonaBot creation returned no slug');
  const channel = (await rpc('channelDm', { slug, displayName: name })).channel;
  if (!channel?.id) throw new Error('PersonaBot DM was not created');
  if (!existingSlug) {
    const memoryDir = (await rpc('get', { slug })).bot?.memoryDir;
    if (!memoryDir) throw new Error('Memory Repository path is unavailable');
    await rpc('channelSend', {
      channelId: channel.id,
      body: 'Establish Memory observation baseline.',
    });
    await sleep(4000);
    const changedPath = join(memoryDir, 'qa-memory-change.md');
    writeFileSync(changedPath, '# Memory Inbox QA\n\nEdited in an external tool.\n');
    await rpc('channelSend', { channelId: channel.id, body: 'Please check your Memory Inbox.' });
  }
  let event;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    event = (await rpc('botAttention', { slug })).items.find(
      (item) => item.reason === 'memory-change' && item.summary.includes('qa-memory-change.md'),
    );
    if (event) break;
    await sleep(1000);
  }
  if (!event) throw new Error('Live Memory change did not enter Bot Inbox');

  if (!existingSlug) await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('button')).some((button) =>
          ['Continue', '继续'].includes(button.textContent?.trim() ?? ''),
        ),
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  const dismissNativeDialog = () =>
    page.evaluate(() => {
      Array.from(document.querySelectorAll('button'))
        .find((button) =>
          ['Configure later', '稍后配置', 'Continue', '继续'].includes(
            button.textContent?.trim() ?? '',
          ),
        )
        ?.click();
    });
  await dismissNativeDialog();
  const botMode = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  try {
    await page.waitForSelector(botMode, { timeout: 20_000 });
  } catch (error) {
    const diagnostic = resolve(dirname(screenshot), 'memory-inbox-page-diagnostic.png');
    mkdirSync(dirname(diagnostic), { recursive: true });
    await page.screenshot({ path: diagnostic, fullPage: false });
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          text: document.body.innerText.slice(0, 1000),
          buttons: Array.from(document.querySelectorAll('button'))
            .map((button) => ({
              text: button.textContent?.trim().slice(0, 40),
              label: button.getAttribute('aria-label'),
            }))
            .slice(0, 20),
        })),
      ),
    );
    console.error(JSON.stringify({ pageErrors }));
    throw error;
  }
  if (!(await page.$('.bh-root'))) await page.click(botMode);
  await sleep(1500);
  await dismissNativeDialog();
  if (!(await page.$('.bh-root'))) await page.click(botMode);
  try {
    await page.waitForSelector('.bh-root', { timeout: 20_000 });
  } catch (error) {
    mkdirSync(dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: false });
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          text: document.body.innerText.slice(0, 800),
          buttons: Array.from(document.querySelectorAll('button'))
            .map((button) => ({
              text: button.textContent?.trim().slice(0, 40),
              label: button.getAttribute('aria-label'),
            }))
            .slice(0, 20),
        })),
      ),
    );
    throw error;
  }
  await page.evaluate((botName) => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes(botName))
      ?.click();
  }, name);
  await sleep(1500);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('[data-panel-head]'))
      .find((button) => /Bot 收件箱|Bot Inbox/u.test(button.textContent ?? ''))
      ?.click();
  });
  await sleep(1000);
  const visible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-inbox-item-info .bh-inbox-item-summary')).some(
      (node) => node.textContent?.includes('qa-memory-change.md'),
    ),
  );
  mkdirSync(dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: false });
  if (!visible) {
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          summaries: Array.from(document.querySelectorAll('summary')).map(
            (node) => node.textContent,
          ),
          text: document.body.innerText.slice(-1800),
        })),
      ),
    );
    throw new Error('Memory Inbox event is durable but not visible in the open Bot sidebar');
  }
  console.log(
    JSON.stringify({
      result: 'pass',
      slug,
      channelId: channel.id,
      eventState: event.state,
      visible,
      screenshot,
    }),
  );
} finally {
  await browser.close();
}
