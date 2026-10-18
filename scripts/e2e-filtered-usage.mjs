import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const slug = process.env.BH_E2E_BOT_SLUG;
const evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(
  origin && home && slug && evidence,
  'Set isolated origin/home, real fixture Bot slug and evidence path',
);
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
      rpcId: `filter-${Math.random()}`,
      method: endpoint,
      payload: { args },
    }),
  });
  const result = (await response.json()).result;
  assert.equal(response.status, 200);
  assert.equal(result?.ok, true, `${method}: ${JSON.stringify(result?.error)}`);
  return result.value;
}
const channelId = `dm-${slug}`;
const bot = (await rpc('get', { slug })).bot;
const activity = await rpc('profileActivity', { channelId });
assert.equal(
  new Set(activity.modelUsageRows.map((row) => row.purpose)).size,
  3,
  'Requires a real Orchestrator / Assignment / child fixture',
);
assert.ok(new Set(activity.modelUsageRows.map((row) => row.model)).size > 1);
const shift = (day, offset) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const today = activity.today;
const week = { start: shift(today, -6), end: today };
const expectedTotal = (rows) =>
  rows.some((row) => row.totalTokens === null)
    ? null
    : rows.reduce((sum, row) => sum + row.totalTokens, 0);
const complete = activity.modelUsageRows.find(
  (row) => row.totalTokens !== null && row.totalTokens > 0,
);
assert.ok(complete);
const packets = [];
for (const filter of [
  week,
  { ...week, model: complete.model },
  { ...week, provider: complete.provider },
  ...['orchestrator', 'assignment', 'subagent'].map((purpose) => ({ ...week, purpose })),
]) {
  const packet = await rpc('profileUsage', { channelId, filter });
  const expected = activity.modelUsageRows.filter(
    (row) =>
      row.day >= filter.start &&
      row.day <= filter.end &&
      (!filter.model || row.model === filter.model) &&
      (!filter.provider || row.provider === filter.provider) &&
      (!filter.purpose || row.purpose === filter.purpose),
  );
  assert.deepEqual(
    [...packet.rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    [...expected].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
  assert.equal(packet.periodTotal, expectedTotal(expected));
  assert.equal(packet.allTimeTotal, expectedTotal(expected));
  assert.equal(packet.freshness, 'ready');
  packets.push(packet);
}
const modelPacket = packets[1];
assert.ok(modelPacket.allTimeTotal > 0);
const yesterday = shift(today, -1);
const empty = await rpc('profileUsage', {
  channelId,
  filter: { start: yesterday, end: yesterday, model: complete.model },
});
assert.equal(empty.periodTotal, 0);
assert.equal(empty.periodRecords, 0);
assert.equal(empty.allTimeTotal, modelPacket.allTimeTotal);
packets.push(empty);
const pnpm = resolve('node_modules/.pnpm');
const pdir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
mkdirSync(evidence, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
let page;
try {
  page = await browser.newPage();
  page.on('pageerror', (error) => process.stderr.write(`Browser error: ${error.message}\n`));
  await page.setViewport({ width: 1500, height: 1180 });
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
  const scope = '.bh-model-usage';
  await page.waitForSelector(scope);
  const idle = () =>
    page.waitForFunction(
      () => document.querySelector('.bh-model-usage')?.getAttribute('aria-busy') === 'false',
    );
  await idle();
  const text = () => page.$eval(scope, (node) => node.textContent);
  assert.ok((await text()).includes(complete.model));
  assert.equal(await page.$eval(`${scope} select`, (node) => node.value), '7');
  assert.equal(await page.$eval(`${scope} details`, (node) => node.open), false);
  async function capture(name) {
    await page.$eval(scope, (node) => {
      node.scrollIntoView({ block: 'start' });
      let ancestor = node.parentElement;
      while (ancestor) {
        if (
          ancestor.scrollHeight > ancestor.clientHeight &&
          ['auto', 'scroll'].includes(getComputedStyle(ancestor).overflowY)
        ) {
          ancestor.scrollTop = Math.max(0, ancestor.scrollTop - 100);
          break;
        }
        ancestor = ancestor.parentElement;
      }
    });
    await page.screenshot({ path: resolve(evidence, name) });
  }
  await capture('week-all-models.png');
  const routeSelect = `${scope} .bh-model-usage-header:nth-of-type(2) select`;
  await page.select(routeSelect, complete.model);
  await idle();
  assert.ok((await text()).includes(modelPacket.periodTotal.toLocaleString()));
  await capture('filtered-model.png');
  await page.select(`${scope} select`, 'custom');
  const dates = await page.$$(`${scope} input[type="date"]`);
  for (const input of dates)
    await input.evaluate((node, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, yesterday);
  await idle();
  assert.ok((await text()).includes(modelPacket.allTimeTotal.toLocaleString()));
  assert.equal(await page.$('.bh-usage-model-label'), null);
  await capture('empty-period-retained-total.png');
  await page.select(`${scope} select`, '7');
  await page.click(`${scope} [data-group="provider"]`);
  await idle();
  await page.select(routeSelect, complete.provider);
  await idle();
  await page.$eval(`${scope} details`, (node) => {
    node.open = true;
    node.dispatchEvent(new Event('toggle'));
  });
  await page.waitForSelector(`${scope} details select`);
  await page.select(`${scope} details select`, 'subagent');
  await idle();
  const child = packets.find((packet) => packet.filter.purpose === 'subagent');
  assert.ok((await text()).includes(child.periodTotal.toLocaleString()));
  await capture('provider-subagent-filter.png');
  await page.select(`${scope} details select`, '');
  await idle();
  await page.$eval(`${scope} details`, (node) => {
    node.open = false;
    node.dispatchEvent(new Event('toggle'));
  });
  await page.click(`${scope} [data-group="model"]`);
  await idle();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'));
  await capture('week-dark.png');
  const geometry = await page.$eval('.bh-model-usage', (node) => {
    const view = node.closest('.bh-profile-card');
    const a = node.getBoundingClientRect();
    const b = view.getBoundingClientRect();
    return {
      cardWidth: b.width,
      usageWidth: a.width,
      insetLeft: a.left - b.left,
      insetRight: b.right - a.right,
    };
  });
  writeFileSync(
    resolve(evidence, 'results.json'),
    JSON.stringify(
      {
        ok: true,
        bot: { slug, displayName: bot.displayName },
        realReplies: {
          orchestrator: 'USAGE_ROLES_CONFIRMED',
          assignment: 'USAGE_ASSIGNMENT_REAL',
          child: 'USAGE_CHILD_REAL',
        },
        packets,
        geometry,
        unknownUsage: activity.modelUsageRows
          .filter((row) => row.totalTokens === null)
          .map((row) => ({ model: row.model, purpose: row.purpose })),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      ok: true,
      bot: { slug, displayName: bot.displayName },
      knownModel: complete.model,
      knownModelTotal: modelPacket.allTimeTotal,
      emptyPeriodTotal: empty.periodTotal,
      retainedTotal: empty.allTimeTotal,
      subagentTotal: child.periodTotal,
      unknownUsage: activity.modelUsageRows.some((row) => row.totalTokens === null),
      geometry,
    }),
  );
} catch (error) {
  await page?.screenshot({ path: resolve(evidence, 'failure.png') });
  throw error;
} finally {
  await browser.close();
}
