import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer is unavailable in this workspace install');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
if (!token || !origin || !home) throw new Error('Set BH_E2E_TOKEN, BH_E2E_ORIGIN, and BH_E2E_HOME');
const screenshotDir = resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? join(root, 'docs/qa/issue-115'),
);
const existingSlug = process.argv
  .find((arg) => arg.startsWith('--existing='))
  ?.slice('--existing='.length);
const uiOnly = process.argv.includes('--ui-only');
mkdirSync(screenshotDir, { recursive: true });

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
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  const rpc = async (method, args = {}) => {
    const started = Date.now();
    const result = await page.evaluate(
      async (methodName, methodArgs) => {
        const response = await fetch(`/api/botharness/${methodName}`, {
          method: 'POST',
          signal: AbortSignal.timeout(300_000),
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `memory-recovery-${methodName}-${Date.now()}`,
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
    console.log(JSON.stringify({ step: method, durationMs: Date.now() - started }));
    return result;
  };

  await rpc('list');
  const name = existingSlug
    ? (await rpc('get', { slug: existingSlug })).bot?.displayName
    : `Memory Recovery QA ${Date.now()}`;
  if (!name) throw new Error('PersonaBot name is unavailable');
  const slug =
    existingSlug ??
    (await rpc('create', { displayName: name, roles: ['research'], workspaces: [] })).bot?.slug;
  if (!slug) throw new Error('PersonaBot creation returned no slug');
  const channelId = (await rpc('channelDm', { slug, displayName: name })).channel?.id;
  const memoryDir = (await rpc('get', { slug })).bot?.memoryDir;
  if (!channelId || !memoryDir) throw new Error('Memory QA Bot is incomplete');
  if (!resolve(memoryDir).startsWith(resolve(home) + sep)) {
    throw new Error('QA Memory repository escaped the isolated DSH home');
  }
  const git = (...args) =>
    execFileSync('git', args, { cwd: memoryDir, encoding: 'utf8', windowsHide: true }).trim();
  git('config', 'user.name', 'Recovery QA');
  git('config', 'user.email', 'recovery-qa@example.com');
  const marker = String(Date.now());
  const stagedText = `Staged Memory ${marker}\n`;
  const workingText = `Working Memory ${marker}\n`;
  const newText = `New Memory ${marker}\n`;
  const baseline = uiOnly
    ? undefined
    : (await rpc('memoryRecoveryHistory', { channelId })).checkpoints[0];
  if (!uiOnly && !baseline) throw new Error('Initial checkpoint was not created');
  let dirty;
  if (!uiOnly) writeFileSync(join(memoryDir, 'qa-restore.md'), stagedText);
  if (!uiOnly) {
    git('add', 'qa-restore.md');
    writeFileSync(join(memoryDir, 'qa-restore.md'), workingText);
    writeFileSync(join(memoryDir, 'qa-new.txt'), newText);
    dirty = (await rpc('memoryRecoveryHistory', { channelId })).checkpoints[0];
    if (!dirty || dirty.id === baseline.id) throw new Error('Dirty checkpoint was not created');
    git('reset', '--hard');
    git('clean', '-fd');
    const current = (await rpc('memoryRecoveryHistory', { channelId })).checkpoints[0];
    if (!current || current.id === dirty.id) throw new Error('Reset checkpoint was not created');
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  const dismissNativeDialog = () =>
    page.evaluate(() => {
      Array.from(document.querySelectorAll('button'))
        .find((button) =>
          ['Continue', '继续', 'Configure later', '稍后配置'].includes(
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
    await page.screenshot({ path: join(screenshotDir, 'memory-recovery-startup.png') });
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          url: location.href,
          text: document.body.innerText.slice(0, 2000),
          buttons: Array.from(document.querySelectorAll('button'))
            .map((button) => ({
              text: button.textContent?.trim().slice(0, 40),
              label: button.getAttribute('aria-label'),
            }))
            .slice(0, 30),
        })),
      ),
    );
    throw error;
  }
  if (!(await page.$('.bh-root'))) await page.click(botMode);
  await sleep(1500);
  await dismissNativeDialog();
  if (!(await page.$('.bh-root'))) await page.click(botMode);
  try {
    await page.waitForSelector('.bh-root', { timeout: 20_000 });
  } catch (error) {
    await page.screenshot({ path: join(screenshotDir, 'memory-recovery-diagnostic.png') });
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
    throw error;
  }
  await page.evaluate((botName) => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes(botName))
      ?.click();
  }, name);
  await sleep(1500);
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('[data-panel-head]')).find((button) =>
      /记忆演化|Memory evolution/u.test(button.textContent ?? ''),
    );
    if (heading?.getAttribute('aria-expanded') === 'false') heading.click();
  });
  try {
    await page.waitForSelector('.bh-memory-recovery', { timeout: 20_000 });
  } catch (error) {
    await page.screenshot({ path: join(screenshotDir, 'memory-recovery-navigation.png') });
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          text: document.body.innerText.slice(0, 3000),
          buttons: Array.from(document.querySelectorAll('.bh-root button'))
            .map((button) => ({
              text: button.textContent?.trim().slice(0, 80),
              label: button.getAttribute('aria-label'),
            }))
            .slice(0, 60),
        })),
      ),
    );
    throw error;
  }
  await page.click('.bh-memory-recovery > summary');
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('.bh-memory-recovery-row').length >= 3,
      { timeout: 60_000 },
    );
  } catch (error) {
    await page.screenshot({ path: join(screenshotDir, 'memory-recovery-list-timeout.png') });
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          text: document.querySelector('.bh-memory-recovery')?.textContent?.slice(0, 1500),
          rows: document.querySelectorAll('.bh-memory-recovery-row').length,
        })),
      ),
    );
    throw error;
  }
  const before = join(screenshotDir, 'memory-recovery-checkpoints.png');
  await page.screenshot({ path: before, fullPage: false });
  await page.evaluate((checkpointId) => {
    const row = checkpointId
      ? document.querySelector(`[data-checkpoint-id="${checkpointId}"]`)
      : document.querySelectorAll('.bh-memory-recovery-row')[1];
    row?.click();
  }, dirty?.id);
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-memory-recovery-selection button'))
      .find((button) => /恢复此检查点|Restore this checkpoint/u.test(button.textContent ?? ''))
      ?.click(),
  );
  const confirmationVisible = await page.evaluate(() =>
    /当前仓库会完整备份|current repository will be fully backed up/u.test(
      document.querySelector('.bh-memory-recovery-confirm')?.textContent ?? '',
    ),
  );
  if (!confirmationVisible) throw new Error('Restore confirmation did not appear');
  const confirmation = join(screenshotDir, 'memory-recovery-confirmation.png');
  await page.screenshot({ path: confirmation, fullPage: false });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-memory-recovery-confirm button'))
      .find((button) => /备份并恢复|Back up and restore/u.test(button.textContent ?? ''))
      ?.click(),
  );
  await page.waitForFunction(
    () => /已恢复|Restored/u.test(document.querySelector('.bh-memory-recovery')?.textContent ?? ''),
    { timeout: 30_000 },
  );
  if (
    !uiOnly &&
    (readFileSync(join(memoryDir, 'qa-restore.md'), 'utf8') !== workingText ||
      readFileSync(join(memoryDir, 'qa-new.txt'), 'utf8') !== newText ||
      !git('diff', '--cached', '--', 'qa-restore.md').includes(`+Staged Memory ${marker}`) ||
      !git('diff', '--', 'qa-restore.md').includes(`+Working Memory ${marker}`))
  ) {
    throw new Error('Restored staged and working Memory did not match');
  }
  const after = join(screenshotDir, 'memory-recovery-restored.png');
  await page.screenshot({ path: after, fullPage: false });
  if (pageErrors.length > 0) throw new Error(`Browser errors: ${pageErrors.join('; ')}`);
  console.log(
    JSON.stringify({
      result: 'pass',
      slug,
      channelId,
      baselineId: baseline?.id,
      before,
      confirmation,
      after,
    }),
  );
} finally {
  await browser.close();
}
