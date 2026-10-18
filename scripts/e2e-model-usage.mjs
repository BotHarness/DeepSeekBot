import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const screenshot = process.env.BH_E2E_SCREENSHOT;
if (!origin || !home || !screenshot)
  throw new Error('Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_SCREENSHOT');
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `usage-${Date.now()}-${Math.random()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const result = await response.json();
  if (response.status !== 200 || result.result?.ok !== true)
    throw new Error(`${method}: ${response.status} ${JSON.stringify(result.result?.error)}`);
  return result.result.value;
}
const models = (await rpc('modelCatalog')).models;
const model = models.find((entry) => entry.efforts.some((effort) => effort.id === 'low'));
if (!model) throw new Error('No live low-effort model');
const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
const bot = (await rpc('create', { displayName: `Actual model usage QA ${Date.now()}` })).bot;
const channelId = `dm-${bot.slug}`;
await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
const preset = (
  await rpc('modelPresetCreate', {
    name: bot.displayName,
    orchestrator: route,
    assignmentDefault: route,
  })
).preset;
await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
await rpc('channelSend', {
  channelId,
  body: 'Call channel_send in this DM with exactly USAGE_ROUTE_CONFIRMED. Do not do anything else.',
});
let activity;
let confirmed = false;
for (let index = 0; index < 180; index += 1) {
  const messages = (await rpc('channelMessages', { channelId })).messages;
  const failed = messages.find((message) => message.sessionFailure);
  if (failed) throw new Error(`Real request failed: ${failed.sessionFailure.code}`);
  activity = await rpc('profileActivity', { channelId });
  if (
    messages.some(
      (message) => message.author?.kind === 'bot' && message.body.includes('USAGE_ROUTE_CONFIRMED'),
    ) &&
    activity.modelUsageRows?.some(
      (row) => row.provider === route.provider && row.model === route.model && row.totalTokens > 0,
    )
  ) {
    confirmed = true;
    break;
  }
  await new Promise((done) => setTimeout(done, 1000));
}
if (!confirmed) throw new Error('Real reply and observed usage were not confirmed before timeout');
const row = activity?.modelUsageRows?.find(
  (entry) => entry.provider === route.provider && entry.model === route.model,
);
if (!row || row.totalTokens <= 0 || row.purpose !== 'orchestrator')
  throw new Error('Exact observed usage did not reach Profile');
let session;
for (let attempt = 0; attempt < 30; attempt += 1) {
  const projections = readdirSync(resolve(home, 'storages/session_projcache/sessions'))
    .filter((file) => file.endsWith('.json'))
    .map(
      (file) =>
        JSON.parse(readFileSync(resolve(home, 'storages/session_projcache/sessions', file), 'utf8'))
          .record,
    );
  session = projections.find((record) =>
    record.identity?.cwd?.replaceAll('\\', '/').includes(`/bots/${bot.slug}/memory`),
  );
  if (session?.rows?.modelSelection?.val?.lastUsed) break;
  await new Promise((done) => setTimeout(done, 1000));
}
const actual = session?.rows?.modelSelection?.val?.lastUsed;
if (actual?.provider !== row.provider || actual?.model !== row.model)
  throw new Error('Profile route differs from actual DSH selection');
const native = session.rows.tokenUsage.val.totals;
for (const [key, source] of [
  ['inputTokens', 'uncachedInputTokens'],
  ['outputTokens', 'outputTokens'],
  ['cacheReadTokens', 'cacheReadTokens'],
  ['cacheWriteTokens', 'cacheWriteTokens'],
]) {
  if (row[key] !== null && row[key] !== native[source])
    throw new Error(`Profile ${key} differs from native reported usage`);
}
const unused = models.find((entry) => entry.model !== route.model);
if (unused)
  await rpc('modelPlanCustomize', {
    slug: bot.slug,
    orchestrator: { provider: unused.provider, model: unused.model },
  });
if (
  (await rpc('profileActivity', { channelId })).modelUsageRows.some(
    (entry) => entry.model === unused?.model,
  )
)
  throw new Error('An unused configured model appeared as observed usage');
const pnpm = resolve('node_modules/.pnpm');
const pdir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!pdir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
mkdirSync(dirname(screenshot), { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1050 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.setExtraHTTPHeaders({ cookie });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
      await page
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll('button')).some((button) =>
              ['Continue', '继续'].includes(button.textContent?.trim() ?? ''),
            ),
          { timeout: 3000 },
        )
        .catch(() => undefined);
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
          ?.click(),
      );
      if (!(await page.$('.bh-root')))
        await page.click('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-root') ||
          Array.from(document.querySelectorAll('button')).some((button) =>
            ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
          ),
      );
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((button) =>
            ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
          )
          ?.click(),
      );
      await page.waitForSelector(`.bh-root [data-channel-id="${channelId}"]`);
      break;
    } catch (failure) {
      if (attempt === 2) throw failure;
    }
  }
  await page.click(`.bh-root [data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-channel-island');
  await page.click('.bh-channel-island');
  await page.locator('::-p-aria(View profile)').click();
  await page.waitForSelector('.bh-profile-view');
  await page.waitForSelector('.bh-profile-view');
  await page.waitForFunction(
    (name) =>
      document.querySelector('.bh-profile-view .bh-model-usage')?.textContent?.includes(name),
    {},
    route.model,
  );
  const text = await page.$eval(
    '.bh-profile-view .bh-model-usage',
    (element) => element.textContent,
  );
  if (!text.includes(String(row.totalTokens).replace(/\B(?=(\d{3})+(?!\d))/gu, ',')))
    throw new Error('Profile total is not rendered');
  await page.evaluate(() =>
    document.querySelector('.bh-model-usage')?.scrollIntoView({ block: 'center' }),
  );
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  await page.screenshot({ path: screenshot });
  const measured = await page.$eval('.bh-profile-view', (element) => ({
    width: element.getBoundingClientRect().width,
    padding: getComputedStyle(element).paddingInline,
  }));
  const light = await page.$eval('.bh-model-usage', (element) => getComputedStyle(element).color);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  const dark = await page.$eval('.bh-model-usage', (element) => getComputedStyle(element).color);
  if (dark === light) throw new Error('Native theme did not change');
  await page.screenshot({ path: screenshot.replace(/\.png$/u, '-dark.png') });
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const refreshed = await rpc('profileActivity', { channelId });
  if (JSON.stringify(refreshed.modelUsageRows) !== JSON.stringify(activity.modelUsageRows))
    throw new Error('Refresh changed observed usage');
  console.log(
    JSON.stringify({
      ok: true,
      bot: { slug: bot.slug, displayName: bot.displayName },
      row,
      actual,
      unusedModel: unused?.model,
      measured,
      screenshot,
    }),
  );
} catch (error) {
  const page = (await browser.pages()).at(-1);
  if (page) {
    await page.screenshot({ path: screenshot.replace(/\.png$/u, '-failure.png') });
    console.error((await page.evaluate(() => document.body.innerText)).slice(-6000));
  }
  throw error;
} finally {
  await browser.close();
}
