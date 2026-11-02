import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const screenshot = process.env.BH_E2E_SCREENSHOT;
const phase = process.env.BH_E2E_PHASE ?? 'verify';
if (!origin || !home || !screenshot)
  throw new Error('Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_SCREENSHOT');
const baselinePath = resolve(home, 'retained-usage-qa.json');
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}) {
  const endpoint = `botharness/${method}`;
  const response = await fetch(`${origin}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `retained-${Date.now()}-${Math.random()}`,
      method: endpoint,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  assert.equal(response.status, 200);
  assert.equal(envelope.result?.ok, true, `${method}: ${JSON.stringify(envelope.result?.error)}`);
  return envelope.result.value;
}
function sourceFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory()
      ? sourceFiles(child)
      : entry.name === 'session.v4.jsonl.zstd'
        ? [child]
        : [];
  });
}
let baseline;
if (phase === 'baseline') {
  const slug = process.env.BH_E2E_BOT_SLUG;
  if (!slug) throw new Error('Baseline requires BH_E2E_BOT_SLUG from the real execution fixture');
  const bot = (await rpc('get', { slug })).bot;
  const activity = await rpc('profileActivity', { channelId: `dm-${slug}` });
  assert.ok(activity.modelUsageRows.every((row) => row.totalTokens > 0));
  assert.equal(new Set(activity.modelUsageRows.map((row) => row.purpose)).size, 3);
  const database = new DatabaseSync(resolve(home, 'botharness/botharness.db'), { readOnly: true });
  let owned;
  try {
    owned = new Set(
      database
        .prepare('SELECT session_id FROM session_ownership WHERE bot_slug = ?')
        .all(slug)
        .map((row) => row.session_id),
    );
  } finally {
    database.close();
  }
  const files = sourceFiles(resolve(home, 'sessions')).filter((file) => {
    const header = JSON.parse(
      zstdDecompressSync(readFileSync(file)).toString('utf8').split('\n')[0],
    );
    return owned.has(header.id);
  });
  assert.equal(files.length, owned.size);
  baseline = { bot: { slug, displayName: bot.displayName }, rows: activity.modelUsageRows, files };
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
} else baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const channelId = `dm-${baseline.bot.slug}`;
if (phase === 'archive') await rpc('pause', { slug: baseline.bot.slug });
if (phase === 'unarchive') await rpc('resume', { slug: baseline.bot.slug });
const activity = await rpc('profileActivity', { channelId });
assert.deepEqual(
  activity.modelUsageRows,
  baseline.rows,
  'Retained public usage changed after source loss, restart, replay or archive',
);
const missingSourceLogs = baseline.files.filter((file) => !existsSync(file)).length;
if (phase === 'missing') assert.equal(missingSourceLogs, baseline.files.length);
if (phase === 'restored') assert.equal(missingSourceLogs, 0);
const pnpm = resolve('node_modules/.pnpm');
const pdir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
mkdirSync(dirname(screenshot), { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1180 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  if (!(await page.$('.bh-root')))
    await page.click('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-root') ||
      [...document.querySelectorAll('button')].some((button) =>
        ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
      ),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page.waitForSelector(`.bh-root [data-channel-id="${channelId}"]`);
  await page.click(`.bh-root [data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-channel-island');
  await page.click('.bh-channel-island');
  await page.locator('::-p-aria(View profile)').click();
  await page.waitForSelector('.bh-profile-view');
  await page.waitForSelector('.bh-model-usage');
  await page.waitForFunction(
    (model) => document.querySelector('.bh-model-usage')?.textContent?.includes(model),
    {},
    baseline.rows[0].model,
  );
  await page.$eval('.bh-model-usage', (element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: screenshot });
  const bot = (await rpc('get', { slug: baseline.bot.slug })).bot;
  console.log(
    JSON.stringify({
      ok: true,
      phase,
      bot: baseline.bot,
      paused: bot.paused === true,
      missingSourceLogs,
      sourceLogCount: baseline.files.length,
      rows: activity.modelUsageRows,
      totalTokens: activity.modelUsageRows.reduce((sum, row) => sum + row.totalTokens, 0),
      screenshot,
    }),
  );
} finally {
  await browser.close();
}
