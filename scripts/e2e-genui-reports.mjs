import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { comparisonReport } from '../packages/core/test/fixtures/genui-report.ts';
import { rpc } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    bot: { type: 'string' },
    headless: { type: 'boolean', default: false },
    'with-model': { type: 'boolean', default: false },
  },
});
assert.ok(
  process.env.BH_E2E_INSTANCE,
  'Set BH_E2E_INSTANCE to this task’s isolated Host instance.json.',
);
assert.ok(
  !values['with-model'] || values.bot,
  '--with-model requires an explicitly configured --bot.',
);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const out = resolve(root, values.out ?? `.humanlayer/tasks/genui-3685/e2e-${runId}`);
mkdirSync(out, { recursive: true });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const manifest = {
  runId,
  scope: 'Synthetic Web DM catalog/interaction E2E, not installed native or Human acceptance',
  sourceSha: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'),
  diffSha256: digest(execFileSync('git', ['diff', 'HEAD'], { cwd: root })),
  lockSha256: digest(readFileSync(join(root, 'pnpm-lock.yaml'))),
  clientSha256: digest(readFileSync(join(root, 'packages/client/lib/client.js'))),
  hostSha256: digest(readFileSync(join(root, 'packages/core/dist/index.mjs'))),
  instance: { pid: instance.pid, origin: new URL(instance.url).origin },
  headed: !values.headless,
  modelRequested: values['with-model'],
  fixtures: [],
  captures: [],
  checks: [],
  errors: [],
};
const saveManifest = () =>
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
saveManifest();
const store = join(root, 'node_modules/.pnpm');
const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
assert.ok(entry, 'Install the pinned workspace dependencies first.');
const puppeteer = createRequire(join(store, entry, 'node_modules/'))('puppeteer');
let browser;
let page;
const call = (method, args = {}) => rpc(instance, `botharness/${method}`, args);
const aria = (label) => `::-p-aria(${JSON.stringify(label)})`;
const panel = (report) => `section[aria-label=${JSON.stringify(report.title)}]`;
const control = (report, selector) => `${panel(report)} ${selector}`;

async function clickReport(report, label, targetPage = page) {
  const selector = `${control(report, 'button')}, ${control(report, 'input')}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      for (const element of await targetPage.$$(selector)) {
        const name = await element.evaluate((node) =>
          (node.getAttribute('aria-label') ?? node.textContent).trim(),
        );
        if (name === label) {
          await element.click();
          return;
        }
      }
      throw new Error(`Report control not found: ${report.title} / ${label}`);
    } catch (error) {
      if (!String(error).includes('Node is detached from document') || attempt === 2) throw error;
    }
  }
}

async function visibleButton(targetPage, label, contains = false) {
  for (const button of await targetPage.$$('button')) {
    const text = (
      await button.evaluate((element) => element.getAttribute('aria-label') ?? element.textContent)
    ).trim();
    if (
      (contains ? text.includes(label) && !text.startsWith('Open ') : text === label) &&
      (await button.boundingBox())
    )
      return button;
  }
  throw new Error(`Visible button not found: ${label}`);
}
async function dismiss(targetPage) {
  for (let round = 0; round < 8; round++) {
    const overlay = await targetPage.$('.driver-popover-close-btn');
    if (overlay && (await overlay.boundingBox())) {
      await overlay.click();
      continue;
    }
    let clicked = false;
    for (const label of [
      'Continue',
      '继续',
      'Skip tutorial',
      '跳过教程',
      'Configure later',
      '稍后配置',
      'Skip',
      '跳过',
      'Don’t show again',
    ]) {
      try {
        await (await visibleButton(targetPage, label)).click();
        clicked = true;
        break;
      } catch {}
    }
    if (!clicked) break;
  }
}
async function openClient(targetPage, botName) {
  await targetPage.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'en-US' });
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['en-US', 'en'],
    });
  });
  await targetPage.goto(instance.url, { waitUntil: 'networkidle2' });
  await targetPage.waitForFunction(
    () =>
      document.body.innerText.includes('Bot mode') || document.querySelector('.bh-root.bh-main'),
  );
  await dismiss(targetPage);
  if (!(await targetPage.$('.bh-root.bh-main'))) await targetPage.locator(aria('Bot mode')).click();
  await targetPage.waitForSelector('.bh-root.bh-main');
  await dismiss(targetPage);
  await targetPage.waitForFunction(
    (name) =>
      [...document.querySelectorAll('button')].some(
        (element) =>
          (element.getAttribute('aria-label') ?? element.textContent).includes(name) &&
          !(element.getAttribute('aria-label') ?? element.textContent).trim().startsWith('Open ') &&
          element.getClientRects().length > 0,
      ),
    {},
    botName,
  );
  await (await visibleButton(targetPage, botName, true)).click();
  await targetPage.waitForSelector('.bh-chat-body');
  await targetPage.waitForFunction(() => !document.querySelector('.bh-skeleton-messages'));
  if ((await call('channelMessages', { channelId, limit: 1 })).messages.length > 0)
    await targetPage.waitForSelector('.bh-chat-body [data-message-id]');
}

async function showLatest(report) {
  await page.waitForSelector('.bh-chat-body');
  await page.waitForFunction(() => !document.querySelector('.bh-skeleton-messages'));
  for (const button of await page.$$('button')) {
    const name = await button.evaluate(
      (element) => element.getAttribute('aria-label') ?? element.textContent,
    );
    if (/Return to latest messages|Jump to latest/.test(name) && (await button.boundingBox())) {
      await button.click();
      break;
    }
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.$eval('.bh-chat-body', (element) => {
      element.scrollTop = element.scrollHeight;
    });
    if (await page.$(panel(report))) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await page.waitForSelector(panel(report));
  await (
    await page.$(panel(report))
  ).evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await ready(report);
}
async function capture(name, targetPage = page, details = {}) {
  await targetPage.bringToFront();
  const path = join(out, `${name}.png`);
  await targetPage.screenshot({ path });
  writeFileSync(
    join(out, `${name}.buttons.json`),
    JSON.stringify(
      await targetPage.evaluate(() =>
        [...document.querySelectorAll('button')].map((element) => ({
          name: (element.getAttribute('aria-label') ?? element.textContent).trim().slice(0, 180),
          data: { ...element.dataset },
          className: element.className,
          visible: element.getClientRects().length > 0,
        })),
      ),
      null,
      2,
    ),
  );
  writeFileSync(
    join(out, `${name}.aria.json`),
    JSON.stringify(await targetPage.accessibility.snapshot({ interestingOnly: true }), null, 2),
  );
  manifest.captures.push({
    name,
    file: path,
    sha256: digest(readFileSync(path)),
    capturedAt: new Date().toISOString(),
    presentation: await targetPage.evaluate(() => ({
      locale: navigator.language,
      darkTheme: document.body.hasAttribute('data-ds-dark-theme'),
      devicePixelRatio,
    })),
    viewport: targetPage.viewport(),
    ...details,
  });
  saveManifest();
}
async function ready(report, targetPage = page) {
  await targetPage.waitForSelector(panel(report));
  await targetPage.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('Private view saved'),
    {},
    panel(report),
  );
}
async function editFilter(report, text, targetPage = page) {
  const input = await targetPage.$(control(report, 'input[aria-label="Filter report"]'));
  assert.ok(input);
  await input.click();
  await input.evaluate((element) => element.select());
  await targetPage.keyboard.press('Backspace');
  await targetPage.waitForFunction(
    (selector) => document.querySelector(selector)?.value === '',
    {},
    control(report, 'input[aria-label="Filter report"]'),
  );
  if (text) await input.type(text, { delay: 25 });
  await targetPage.waitForFunction(
    (selector, expected) => document.querySelector(selector)?.value === expected,
    {},
    control(report, 'input[aria-label="Filter report"]'),
    text,
  );
}
async function waitSaved(report, predicate = () => true) {
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('Private view saved'),
    {},
    panel(report),
  );
  const deadline = Date.now() + 15_000;
  do {
    const view = await call('channelGenuiView', {
      channelId,
      messageId: reportIds.get(report.snapshotId),
    });
    if (predicate(view.state)) return view;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.fail('Host view must match the visible edit within 15 seconds.');
}
const reportIds = new Map();
let channelId;
async function publish(
  report,
  body = `Synthetic GenUI E2E: ${report.title}. Not real business data.`,
) {
  const result = await call('botToolRun', {
    slug: botSlug,
    tool: 'bot_send_message',
    args: { channel_id: channelId, body, genui_json: JSON.stringify(report) },
  });
  assert.equal(result.result.status, 'committed');
  reportIds.set(report.snapshotId, result.result.messageId);
  manifest.fixtures.push({ report, body, messageId: result.result.messageId });
  saveManifest();
  await showLatest(report);
}
let botSlug;
try {
  const bot = values.bot
    ? await call('get', { slug: values.bot })
    : await call('create', {
        displayName: `GenUI E2E ${runId}`,
        persona:
          'Synthetic GenUI QA only. Publish concise visible follow-up using bot_send_message.',
        operationKey: `genui-e2e-${randomUUID()}`,
      });
  botSlug = bot.bot.slug;
  channelId = bot.channelId ?? `dm-${botSlug}`;
  manifest.bot = { slug: botSlug, name: bot.bot.displayName, channelId };
  browser = await puppeteer.launch({
    headless: values.headless,
    args: ['--no-sandbox', '--lang=en-US'],
    defaultViewport: { width: 1440, height: 1000 },
  });
  manifest.browser = {
    pid: browser.process().pid,
    version: await browser.version(),
    cleanup: 'browser.close in finally; external Host belongs to caller',
  };
  saveManifest();
  page = await browser.newPage();
  page.on('pageerror', (error) => manifest.errors.push(String(error)));
  await openClient(page, bot.bot.displayName);
  await capture('00-entry-before-publication', page, {
    meaning:
      'Candidate entry point before this run’s report publication, not a base-build comparison',
  });

  const composed = {
    ...structuredClone(comparisonReport),
    snapshotId: `composed-${runId}`,
    title: `Synthetic composition ${runId}`,
  };
  await publish(composed);
  await capture('01-composed-table');
  const beforeExplore = await call('channelMessages', { channelId, limit: 100 });
  await editFilter(composed, 'Beta');
  await page.waitForFunction(
    (selector) => document.querySelectorAll(selector).length === 1,
    {},
    control(composed, 'tbody tr'),
  );
  await capture('02-filtered');
  await editFilter(composed, 'not-a-real-option');
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('No matching items'),
    {},
    panel(composed),
  );
  await capture('03-filter-empty');
  await editFilter(composed, '');
  await clickReport(composed, 'Score');
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('Beta'),
    {},
    control(composed, 'tbody tr'),
  );
  assert.match(
    await page.$eval(control(composed, 'tbody tr'), (element) => element.textContent),
    /Beta/,
  );
  await capture('04-numeric-sort');
  await clickReport(composed, 'Select Alpha');
  await clickReport(composed, 'Select Beta');
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.checked,
    {},
    control(composed, 'input[aria-label="Select Beta"]'),
  );
  const details = await page.$(control(composed, 'tbody button'));
  await details.click();
  await capture('05-details-selection');
  await clickReport(composed, 'Chart');
  await page.waitForSelector(control(composed, 'ul li'));
  await capture('06-chart-data-equivalence');
  const view = await waitSaved(
    composed,
    (state) => state.selectedIds.length === 2 && state.view === 'chart',
  );
  assert.deepEqual(
    (await call('channelMessages', { channelId, limit: 100 })).messages.map(
      (message) => message.id,
    ),
    beforeExplore.messages.map((message) => message.id),
  );
  manifest.checks.push(
    'Local exploration creates no Channel messages and persists only a bounded private view.',
  );

  const secondContext = await browser.createBrowserContext();
  const second = await secondContext.newPage();
  second.on('pageerror', (error) => manifest.errors.push(String(error)));
  await openClient(second, bot.bot.displayName);
  await ready(composed, second);
  assert.equal(
    await second.$eval(
      control(composed, 'input[aria-label="Select Alpha"]'),
      (element) => element.checked,
    ),
    true,
  );
  await capture('07-second-authorized-client-recovery', second, { version: view.version });
  await editFilter(composed, 'Alpha');
  await waitSaved(composed, (state) => state.filter === 'Alpha');
  await editFilter(composed, 'Beta', second);
  await second.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent.includes('Private view changed elsewhere'),
    {},
    panel(composed),
  );
  await capture('08-cas-conflict-retains-draft', second);
  await clickReport(composed, 'Keep my draft', second);
  await second.waitForFunction(
    (selector) =>
      [...document.querySelectorAll(selector)].some((node) =>
        node.textContent.includes('Save my view'),
      ),
    {},
    control(composed, 'button'),
  );
  await clickReport(composed, 'Save my view', second);
  await ready(composed, second);
  await capture('09-explicit-conflict-resolution', second);
  await clickReport(composed, 'Reset view');
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent.includes('Private view changed elsewhere'),
    {},
    panel(composed),
  );
  await clickReport(composed, 'Load saved view');
  await ready(composed);
  await clickReport(composed, 'Reset view');
  await waitSaved(composed, (state) => state.filter === '' && state.selectedIds.length === 0);
  await capture('10-reset-view');
  await secondContext.close();

  await clickReport(composed, 'Select Alpha');
  await waitSaved(composed, (state) => state.selectedIds.includes('alpha'));
  await clickReport(composed, 'Continue with selection');
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent.includes('Sent. Waiting for the Bot'),
    {},
    panel(composed),
  );
  await capture('11-visible-human-submission');
  const submitted = (await call('channelMessages', { channelId, limit: 100 })).messages.find(
    (message) => message.genuiReply?.messageId === reportIds.get(composed.snapshotId),
  );
  assert.equal(submitted?.author.kind, 'human');
  assert.deepEqual(submitted.genuiReply.selectedIds, ['alpha']);
  manifest.submission = {
    messageId: submitted.id,
    sourceEventId: submitted.sourceEventId,
    genuiReply: submitted.genuiReply,
  };
  if (values['with-model']) {
    await page.waitForFunction(
      async ({ target, after, slug }) => {
        const endpoint = 'botharness/channelMessages';
        const response = await fetch(`/api/${endpoint}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'genui-e2e-observe',
            method: endpoint,
            payload: { args: { channelId: target, limit: 100 } },
          }),
        });
        const result = await response.json();
        return result.result?.value?.messages?.some(
          (message) =>
            message.author.kind === 'bot' && message.author.slug === slug && message.at > after,
        );
      },
      { timeout: 180_000, polling: 1000 },
      { target: channelId, after: submitted.at, slug: botSlug },
    );
    manifest.modelFollowup = (await call('channelMessages', { channelId, limit: 100 })).messages
      .filter((message) => message.author.kind === 'bot' && message.at > submitted.at)
      .map((message) => ({ id: message.id, sourceEventId: message.sourceEventId, at: message.at }));
    manifest.modelTrace = await call('botToolTrace', { slug: botSlug, turns: 1 });
    await capture('12-real-model-visible-followup');
    manifest.checks.push(
      'A real configured model explicitly published a follow-up after the ordinary Human submission.',
    );
  }
  await clickReport(composed, 'Refresh report');
  await page.waitForFunction(
    async ({ target, reportMessageId }) => {
      const endpoint = 'botharness/channelMessages';
      const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'genui-e2e-refresh-observe',
          method: endpoint,
          payload: { args: { channelId: target, limit: 100 } },
        }),
      });
      const result = await response.json();
      return result.result?.value?.messages?.some(
        (message) =>
          message.genuiReply?.messageId === reportMessageId &&
          message.genuiReply.intent === 'refresh',
      );
    },
    { polling: 100 },
    { target: channelId, reportMessageId: reportIds.get(composed.snapshotId) },
  );
  const refreshed = {
    ...composed,
    snapshotId: `refreshed-${runId}`,
    title: `Synthetic refreshed ${runId}`,
    predecessorMessageId: reportIds.get(composed.snapshotId),
  };
  await publish(refreshed);
  await capture('13-linked-new-snapshot');

  const empty = {
    ...structuredClone(comparisonReport),
    snapshotId: `empty-${runId}`,
    title: `Synthetic empty ${runId}`,
    rows: [],
    elements: [
      { kind: 'metric', label: 'Options', value: 0 },
      ...comparisonReport.elements.slice(1),
    ],
  };
  await publish(empty);
  await capture('14-empty-data');
  const signed = {
    ...structuredClone(comparisonReport),
    snapshotId: `signed-${runId}`,
    title: `Synthetic signed ${runId}`,
    rows: [
      { id: 'negative', values: { name: 'Negative', score: -5 } },
      { id: 'zero', values: { name: 'Zero', score: 0 } },
      { id: 'positive', values: { name: 'Positive', score: 8 } },
      { id: 'decimal', values: { name: 'Decimal', score: 3.25 } },
    ],
  };
  await publish(signed);
  await clickReport(signed, 'Chart');
  await page.waitForSelector(control(signed, 'ul li'));
  await capture('15-signed-zero-decimal-chart');

  const metrics = {
    ...structuredClone(comparisonReport),
    snapshotId: `metrics-${runId}`,
    title: `Synthetic metrics ${runId}`,
    rows: [],
    elements: [
      { kind: 'metric', label: 'Numeric', value: 42 },
      { kind: 'metric', label: 'Text', value: 'Synthetic <script>not executable</script>' },
      { kind: 'metric', label: 'Zero', value: 0 },
    ],
  };
  await publish(metrics);
  assert.equal(await page.$(control(metrics, 'table')), null);
  await capture('16-metric-only-escaped-text');

  const tableOnly = {
    ...structuredClone(comparisonReport),
    snapshotId: `table-only-${runId}`,
    title: `Synthetic table only ${runId}`,
    elements: [{ kind: 'table', columnIds: ['name', 'score'] }],
  };
  await publish(tableOnly);
  assert.equal(await page.$(control(tableOnly, 'dl div')), null);
  await capture('16a-table-only');
  const keyboardCheckbox = await page.$(control(tableOnly, 'input[aria-label="Select Alpha"]'));
  await keyboardCheckbox.focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.checked,
    {},
    control(tableOnly, 'input[aria-label="Select Alpha"]'),
  );
  await waitSaved(tableOnly, (state) => state.selectedIds.includes('alpha'));
  await capture('16b-keyboard-selection');

  const chartOnly = {
    ...structuredClone(comparisonReport),
    snapshotId: `chart-only-${runId}`,
    title: `Synthetic chart only ${runId}`,
    elements: [{ kind: 'bar-chart', labelColumnId: 'name', valueColumnId: 'score' }],
  };
  await publish(chartOnly);
  await clickReport(chartOnly, 'Chart');
  await page.waitForSelector(control(chartOnly, 'ul li'));
  assert.ok(
    await page.$(control(chartOnly, 'table')),
    'Chart-only report retains equivalent data.',
  );
  await capture('16c-chart-only-equivalent-table');

  const wide = {
    ...structuredClone(comparisonReport),
    snapshotId: `wide-${runId}`,
    title: `Synthetic bounded wide ${runId}`,
    columns: [
      ...comparisonReport.columns,
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `extra-${index}`,
        label: `Extra ${index + 1}`,
        kind: 'text',
      })),
    ],
    rows: Array.from({ length: 100 }, (_, index) => ({
      id: `row-${index}`,
      values: {
        name: `Item ${index} — Synthetic 中日 English`,
        score: 100 - index,
        ...Object.fromEntries(
          Array.from({ length: 6 }, (_, column) => [
            `extra-${column}`,
            `Synthetic value ${index}/${column}`,
          ]),
        ),
      },
      details: index === 0 ? 'Synthetic long detail. '.repeat(40) : `Synthetic detail ${index}.`,
    })),
    elements: [
      { kind: 'metric', label: 'Options', value: 100 },
      {
        kind: 'table',
        columnIds: ['name', 'score', ...Array.from({ length: 6 }, (_, index) => `extra-${index}`)],
      },
      { kind: 'bar-chart', labelColumnId: 'name', valueColumnId: 'score' },
    ],
  };
  await publish(wide);
  for (let index = 0; index < 20; index++)
    await clickReport(wide, `Select Item ${index} — Synthetic 中日 English`);
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.disabled,
    {},
    control(wide, 'input[aria-label="Select Item 20 — Synthetic 中日 English"]'),
  );
  assert.equal(
    await page.$eval(
      control(wide, 'input[aria-label="Select Item 20 — Synthetic 中日 English"]'),
      (element) => element.disabled,
    ),
    true,
  );
  assert.equal(await page.$$eval(control(wide, 'thead button'), (nodes) => nodes.length), 8);
  assert.equal(await page.$$eval(control(wide, 'tbody tr'), (nodes) => nodes.length), 100);
  await waitSaved(wide, (state) => state.selectedIds.length === 20);
  await (
    await page.$(panel(wide))
  ).evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await capture('17-wide-100-rows-8-columns-selection-cap');
  await page.setViewport({ width: 800, height: 1100 });
  await openClient(page, bot.bot.displayName);
  await showLatest(wide);
  assert.equal(await page.$$eval(control(wide, 'input:checked'), (nodes) => nodes.length), 20);
  await capture('18-narrow-web-table', page, {
    environment: 'Narrow Web viewport, not native mobile',
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await openClient(page, bot.bot.displayName);
  await showLatest(wide);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  await publish({
    ...metrics,
    snapshotId: `light-metrics-${runId}`,
    title: `Synthetic light metrics ${runId}`,
  });
  await capture('19-light-metric-only');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  const darkChart = {
    ...signed,
    snapshotId: `dark-signed-${runId}`,
    title: `Synthetic dark chart ${runId}`,
  };
  await publish(darkChart);
  await clickReport(darkChart, 'Chart');
  await page.waitForSelector(control(darkChart, 'ul li'));
  await capture('20-dark-chart');
  assert.equal(manifest.errors.length, 0, 'No uncaught page errors.');
  manifest.status = 'passed';
} catch (error) {
  manifest.status = 'failed';
  manifest.failure = String(error.stack ?? error);
  if (page) {
    try {
      await capture('failure');
    } catch {}
  }
  throw error;
} finally {
  if (browser) await browser.close();
  manifest.cleanup = { browserClosed: true, externalHostRetained: true };
  saveManifest();
  console.log(
    JSON.stringify(
      {
        status: manifest.status,
        out,
        captures: manifest.captures.length,
        failure: manifest.failure,
      },
      null,
      2,
    ),
  );
}
