import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { syntheticGenuiDocument } from '../packages/core/test/fixtures/genui-document.ts';
import { syntheticGenuiDiagrams } from '../packages/core/test/fixtures/genui-diagrams.ts';
import { rpc } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    headless: { type: 'boolean', default: false },
    pele: { type: 'boolean', default: false },
  },
});
assert.ok(
  process.env.BH_E2E_INSTANCE,
  'Set BH_E2E_INSTANCE to this task’s isolated instance.json.',
);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const out = resolve(root, values.out ?? `.humanlayer/tasks/genui-3685/html-e2e/${runId}`);
mkdirSync(out, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root });
const manifest = {
  runId,
  scope:
    'Synthetic isolated HTML Web DM; not native, desktop shell, real-model or Human acceptance',
  sourceSha: git('rev-parse', 'HEAD').toString().trim(),
  sourceFiles: Object.fromEntries(
    [
      ...new Set(
        `${git('diff', '--name-only', 'HEAD')}\n${git('ls-files', '--others', '--exclude-standard')}`
          .trim()
          .split('\n'),
      ),
    ]
      .filter((path) => path && /\.(?:ts|tsx|mjs)$/u.test(path))
      .map((path) => [path, hash(readFileSync(join(root, path)))]),
  ),
  diffSha256: hash(git('diff', 'HEAD')),
  hostSha256: hash(readFileSync(join(root, 'packages/core/dist/index.mjs'))),
  clientSha256: hash(readFileSync(join(root, 'packages/client/lib/client.js'))),
  document: {
    ...structuredClone(syntheticGenuiDocument),
    snapshotId: `html-${runId}`,
    title: `Project explorer ${runId}`,
  },
  headed: !values.headless,
  captures: [],
  checks: [],
  errors: [],
};
const save = () => writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
const call = (method, args = {}) => rpc(instance, `botharness/${method}`, args);
const store = join(root, 'node_modules/.pnpm');
const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
assert.ok(entry, 'Install workspace dependencies first.');
const puppeteer = createRequire(join(store, entry, 'node_modules/'))('puppeteer');
const panel = `section[aria-label=${JSON.stringify(manifest.document.title)}]`;
let browser, page, bot, channelId, messageId;
save();

async function visibleButton(target, label, contains = false) {
  for (const button of await target.$$('button')) {
    const name = (
      await button.evaluate((node) => node.getAttribute('aria-label') ?? node.textContent)
    ).trim();
    if (
      (contains ? name.includes(label) && !name.startsWith('Open ') : name === label) &&
      (await button.boundingBox())
    )
      return button;
  }
  throw new Error(`Visible button unavailable: ${label}`);
}
async function dismiss(target) {
  for (let round = 0; round < 8; round++) {
    const overlay = await target.$('.driver-popover-close-btn');
    if (overlay && (await overlay.boundingBox())) {
      await overlay.click();
      continue;
    }
    let changed = false;
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
        const button = await visibleButton(target, label);
        if (await button.evaluate((node) => Boolean(node.closest('.bh-chat-body')))) continue;
        await button.click();
        changed = true;
        break;
      } catch {}
    }
    if (!changed) break;
  }
}
async function open(target) {
  await target.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'en-US' });
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get: () => ['en-US', 'en'],
    });
  });
  target.on('pageerror', (error) => {
    manifest.errors.push(String(error));
    save();
  });
  await target.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await target.goto(instance.url, { waitUntil: 'networkidle2' });
  await target.waitForFunction(
    () =>
      document.body.innerText.includes('Bot mode') || document.querySelector('.bh-root.bh-main'),
  );
  await dismiss(target);
  if (!(await target.$('.bh-root.bh-main'))) await target.locator('::-p-aria(Bot mode)').click();
  await target.waitForSelector('.bh-root.bh-main');
  await dismiss(target);
  await target.waitForFunction(
    (name) =>
      [...document.querySelectorAll('button')].some(
        (node) => node.textContent.includes(name) && node.getClientRects().length,
      ),
    {},
    bot.bot.displayName,
  );
  await (await visibleButton(target, bot.bot.displayName, true)).click();
  await target.waitForSelector('.bh-chat-body');
  await target.waitForFunction(() => !document.querySelector('.bh-skeleton-messages'));
}
async function frame(target = page) {
  await target.waitForSelector(`${panel} iframe`);
  const guardian = await (await target.$(`${panel} iframe`)).contentFrame();
  await target.waitForFunction(
    (selector) => !document.querySelector(selector)?.textContent.includes('Loading document'),
    {},
    panel,
  );
  const inner = guardian.childFrames()[0];
  assert.ok(inner, 'Isolated document frame must exist.');
  await inner.waitForSelector('#scene');
  await target.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('Private view saved'),
    {},
    panel,
  );
  return inner;
}
async function capture(name, target = page, selector = panel) {
  await dismiss(target);
  await target.bringToFront();
  const section = await target.$(selector);
  if (section) await section.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await new Promise((resolve) => setTimeout(resolve, 200));
  const path = join(out, `${name}.png`);
  await target.screenshot({ path });
  writeFileSync(
    join(out, `${name}.aria.json`),
    JSON.stringify(await target.accessibility.snapshot({ interestingOnly: true }), null, 2),
  );
  manifest.captures.push({
    name,
    file: `${name}.png`,
    sha256: hash(readFileSync(path)),
    viewport: target.viewport(),
    time: new Date().toISOString(),
    dark: await target.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')),
  });
  save();
}
async function saved(predicate) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const view = await call('channelGenuiView', { channelId, messageId });
    if (predicate(view.state.values)) return view;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Private state did not reach the expected canonical value.');
}
async function button(label, target = page) {
  await target.waitForFunction(
    (selector, name) =>
      [...document.querySelectorAll(`${selector} button`)].some(
        (node) =>
          node.textContent.trim() === name && !node.disabled && node.getClientRects().length > 0,
      ),
    {},
    panel,
    label,
  );
  const buttons = await target.$$(`${panel} button`);
  for (const element of buttons)
    if ((await element.evaluate((node) => node.textContent)).trim() === label) {
      await element.click();
      return;
    }
  throw new Error(`Document action unavailable: ${label}`);
}
async function filter(text, target = page) {
  const inner = await frame(target);
  await inner.$eval(
    '#filter',
    (node, value) => {
      node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
    },
    text,
  );
}

try {
  bot = await call('create', {
    displayName: `HTML QA ${runId}`,
    persona: 'Synthetic HTML GenUI QA. No real business data.',
    operationKey: randomUUID(),
  });
  channelId = bot.channelId ?? `dm-${bot.bot.slug}`;
  manifest.bot = { slug: bot.bot.slug, channelId };
  if (values.pele) {
    manifest.diagrams = [];
    const sections = [];
    for (const fixture of syntheticGenuiDiagrams) {
      let compiled;
      const timings = [];
      for (let pass = 0; pass < 5; pass++) {
        const start = performance.now();
        const output = execFileSync(
          process.execPath,
          [
            join(root, 'packages/deepseekbot/dist/deepseekbot.mjs'),
            'bot-tool',
            bot.bot.slug,
            'genui_diagram',
            '--args-stdin',
          ],
          {
            cwd: root,
            env: {
              ...process.env,
              DEEPSEEKBOT_HOST: new URL(instance.url).origin,
              DEEPSEEKBOT_HOST_TOKEN: new URL(instance.url).searchParams.get('token'),
            },
            input: JSON.stringify({ source: fixture.source, width: 728 }),
            encoding: 'utf8',
            timeout: 15_000,
          },
        );
        timings.push(Math.round(performance.now() - start));
        const reply = JSON.parse(output);
        assert.ok(reply.result, 'Direct Tool must return an explicit result.');
        const result = typeof reply.result === 'string' ? JSON.parse(reply.result) : reply.result;
        assert.equal(result.compiler, 'pele@1.13.0');
        assert.equal(hash(result.svg), result.svgSha256);
        if (compiled) assert.equal(result.svgSha256, compiled.svgSha256);
        compiled = result;
      }
      manifest.diagrams.push({ ...fixture, ...compiled, directCliMs: timings });
      sections.push(
        `<section data-scene="${fixture.id}" class="wide genui-surface"><h2>${fixture.title}</h2><figure>${compiled.svg}<figcaption>${fixture.caption}</figcaption></figure></section>`,
      );
      manifest.document.stateContract.fields.scene.options.push(fixture.id);
    }
    assert.ok(manifest.document.html.includes('<div class="genui-grid">'));
    manifest.document.html = manifest.document.html.replace(
      '<div class="genui-grid">',
      `<div class="genui-grid">${sections.join('')}`,
    );
    manifest.document.html = manifest.document.html.replace(
      '</select>\n  </div>',
      `${syntheticGenuiDiagrams.map((fixture) => `<option value="${fixture.id}">${fixture.title}</option>`).join('')}</select>\n  </div>`,
    );
    save();
  }
  const preview = await call('botToolRun', {
    slug: bot.bot.slug,
    tool: 'genui_preview',
    args: { genui_json: JSON.stringify(manifest.document), width: 900, theme: 'dark' },
  });
  manifest.preview = preview.result;
  save();
  browser = await puppeteer.launch({
    headless: values.headless,
    args: ['--no-sandbox', '--lang=en-US'],
    defaultViewport: { width: 1440, height: 1100 },
  });
  manifest.browser = { version: await browser.version(), pid: browser.process().pid };
  page = await browser.newPage();
  await open(page);
  await capture('00-before-publication');
  await (await visibleButton(page, bot.bot.displayName, true)).click();
  await page.waitForSelector('.bh-chat-body');
  const sent = await call('botToolRun', {
    slug: bot.bot.slug,
    tool: 'bot_send_message',
    args: {
      channel_id: channelId,
      body: 'Synthetic project comparison: explore charts, diagrams and table. Local controls do not perform business actions.',
      genui_json: JSON.stringify(manifest.document),
    },
  });
  assert.equal(sent.result.status, 'committed');
  messageId = sent.result.messageId;
  manifest.messageId = messageId;
  let inner = await frame();
  await capture('01-composed');
  for (const scene of [
    ...(values.pele ? syntheticGenuiDiagrams.map((fixture) => fixture.id) : []),
    'metrics',
    'comparison',
    'table',
    'bar',
    'line',
    'donut',
    'flow',
    'relations',
    'timeline',
  ]) {
    await inner.select('#scene', scene);
    await saved((state) => state.scene === scene);
    await capture(`scene-${scene}`);
  }
  await inner.select('#scene', 'table');
  const before = await call('channelMessages', { channelId, limit: 100 });
  await filter('Beta');
  await saved((state) => state.filter === 'Beta');
  assert.equal(await inner.$$eval('#rows tr', (rows) => rows.length), 1);
  await capture('02-filter');
  await filter('not-a-project');
  await inner.waitForFunction(() => !document.querySelector('#empty').hidden);
  await capture('03-no-matches');
  await filter('');
  await inner.select('#sort', 'ascending');
  assert.match(await inner.$eval('#rows tr', (node) => node.textContent), /Beta/);
  await capture('04-sort');
  await inner.click('input[aria-label="Select Alpha"]');
  await inner.click('#details');
  await saved((state) => state.selected === 'alpha' && state.details);
  await capture('05-selection-details');
  const after = await call('channelMessages', { channelId, limit: 100 });
  assert.deepEqual(
    after.messages.map((message) => message.id),
    before.messages.map((message) => message.id),
  );
  manifest.checks.push('Local exploration only saves private state; no Channel messages.');
  const context = await browser.createBrowserContext();
  const second = await context.newPage();
  await open(second);
  const secondFrame = await frame(second);
  await secondFrame.waitForFunction(() => window.genui.getState().selected === 'alpha');
  assert.equal(await secondFrame.$eval('#filter', (node) => node.value), '');
  assert.equal(
    await secondFrame.$eval('input[aria-label="Select Alpha"]', (node) => node.checked),
    true,
  );
  await capture('06-authorized-client-recovery', second);
  await filter('Alpha');
  await saved((state) => state.filter === 'Alpha');
  await filter('Beta', second);
  await second.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent.includes('Private view changed elsewhere'),
    {},
    panel,
  );
  await capture('07-cas-conflict', second);
  await button('Keep my draft', second);
  await second.waitForFunction(
    (selector) => document.querySelector(selector)?.textContent.includes('Save my view'),
    {},
    panel,
  );
  await button('Save my view', second);
  await saved((state) => state.filter === 'Beta');
  await capture('08-explicit-conflict-save', second);
  await context.close();
  await page.reload({ waitUntil: 'networkidle2' });
  inner = await frame();
  await inner.waitForFunction(() => window.genui.getState().filter === 'Beta');
  assert.equal(await inner.$eval('#filter', (node) => node.value), 'Beta');
  await capture('09-reopen');
  await button('Reset view');
  await saved((state) => state.filter === '' && state.selected === 'none');
  await capture('10-reset');
  await inner.select('#scene', 'table');
  await inner.click('input[aria-label="Select Alpha"]');
  await saved((state) => state.selected === 'alpha');
  await button('Continue');
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent.includes('Sent. Waiting for the Bot'),
    {},
    panel,
  );
  const submitted = (await call('channelMessages', { channelId, limit: 100 })).messages.find(
    (message) => message.genuiReply?.messageId === messageId,
  );
  assert.equal(submitted.author.kind, 'human');
  assert.equal(submitted.genuiReply.state.values.selected, 'alpha');
  manifest.submission = submitted;
  await capture('11-visible-human-continuation');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await capture('12-dark');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  await capture('13-light');
  await page.setViewport({ width: 800, height: 1100 });
  await capture('14-narrow-web-not-native');
  if (values.pele) {
    for (const theme of ['light', 'dark']) {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
      await page.evaluate(
        (dark) => document.body.toggleAttribute('data-ds-dark-theme', dark),
        theme === 'dark',
      );
      for (const width of [1440, 800]) {
        await page.setViewport({ width, height: 1100 });
        for (const fixture of syntheticGenuiDiagrams) {
          inner = await frame();
          await inner.select('#scene', fixture.id);
          await saved((state) => state.scene === fixture.id);
          const evidence = await inner.$eval(`[data-scene="${fixture.id}"]`, (node) => ({
            svgCount: node.querySelectorAll('svg.pele').length,
            border: getComputedStyle(node).borderTopWidth,
            series: getComputedStyle(node.querySelector('svg'))
              .getPropertyValue('--pele-series-1')
              .trim(),
            text: node.textContent,
            axes: [...node.querySelectorAll('.pele-axis')].map(
              (axis) => getComputedStyle(axis).stroke,
            ),
          }));
          assert.equal(evidence.svgCount, 1);
          assert.equal(evidence.border, '0px');
          assert.ok(evidence.series);
          if (fixture.id === 'pele-xychart') {
            assert.ok(evidence.axes.length > 0);
            assert.ok(
              evidence.axes.every(
                (stroke) => !['none', 'transparent', 'rgba(0, 0, 0, 0)'].includes(stroke),
              ),
            );
          }
          manifest.checks.push({ kind: 'pele-scene', scene: fixture.id, theme, width, evidence });
          await capture(`${fixture.id}-${theme}-${width}`);
        }
      }
    }
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  }
  await page.setViewport({ width: 1440, height: 1100 });
  const refreshed = {
    ...manifest.document,
    snapshotId: `refresh-${runId}`,
    title: `Refreshed ${runId}`,
    predecessorMessageId: messageId,
  };
  await button('Refresh document');
  const refreshedSend = await call('botToolRun', {
    slug: bot.bot.slug,
    tool: 'bot_send_message',
    args: {
      channel_id: channelId,
      body: 'Synthetic linked refreshed snapshot; original retained.',
      genui_json: JSON.stringify(refreshed),
    },
  });
  assert.equal(refreshedSend.result.status, 'committed');
  const messages = await call('channelMessages', { channelId, limit: 100 });
  assert.ok(messages.messages.some((message) => message.id === messageId));
  manifest.refresh = {
    messageId: refreshedSend.result.messageId,
    snapshotId: refreshed.snapshotId,
    predecessorMessageId: messageId,
  };
  const refreshedPanel = `section[aria-label=${JSON.stringify(refreshed.title)}]`;
  await page.waitForSelector(`${refreshedPanel} iframe`);
  await page.waitForFunction(
    (selector) => !document.querySelector(selector)?.textContent.includes('Loading document'),
    {},
    refreshedPanel,
  );
  await capture('15-linked-refresh', page, refreshedPanel);
  for (const [name, html] of [
    [
      'stateless',
      '<h2>Static visual explanation</h2><p>No registered private state. Reopening starts over.</p><svg viewBox="0 0 200 60" role="img" aria-label="Read, compare, decide"><text x="10" y="30" fill="var(--foreground)">Read → compare → decide</text></svg>',
    ],
    [
      'script-failure',
      '<h2>Invalid document</h2><script>throw new Error("Synthetic fixture failure")</script>',
    ],
    ['height-failure', '<div style="height:25001px">Synthetic over-limit document</div>'],
  ]) {
    const document = {
      version: 2,
      snapshotId: `${name}-${runId}`,
      observedAt: manifest.document.observedAt,
      title: `${name} ${runId}`,
      html,
    };
    const published = await call('botToolRun', {
      slug: bot.bot.slug,
      tool: 'bot_send_message',
      args: {
        channel_id: channelId,
        body: `Synthetic ${name}: this ordinary summary must remain readable.`,
        genui_json: JSON.stringify(document),
      },
    });
    assert.equal(published.result.status, 'committed');
    const selector = `section[aria-label=${JSON.stringify(document.title)}]`;
    await page.waitForSelector(selector);
    await page.waitForFunction(
      (selector) => !document.querySelector(selector)?.textContent.includes('Loading document'),
      {},
      selector,
    );
    if (name !== 'stateless')
      await page.waitForFunction(
        (selector) =>
          document.querySelector(selector)?.textContent.includes('The document could not run'),
        {},
        selector,
      );
    await capture(`16-${name}`, page, selector);
  }
  manifest.checks.push(
    'Explicit ordinary Human continuation and appended linked refresh retain canonical messages.',
  );
  manifest.expectedErrors = manifest.errors.filter((error) =>
    error.includes('Synthetic fixture failure'),
  );
  assert.deepEqual(
    manifest.errors.filter((error) => !error.includes('Synthetic fixture failure')),
    [],
  );
  manifest.status = 'passed';
} catch (error) {
  manifest.status = 'failed';
  manifest.failure = error.stack ?? String(error);
  if (page) await capture('failure').catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser?.close();
  manifest.browserClosed = true;
  save();
  console.log(JSON.stringify({ status: manifest.status, captures: manifest.captures.length, out }));
}
