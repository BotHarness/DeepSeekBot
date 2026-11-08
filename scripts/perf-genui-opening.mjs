import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { syntheticGenuiDocument } from '../packages/core/test/fixtures/genui-document.ts';
import { rpc } from './verify-app.mjs';
import { stopGenuiQaBot } from './genui-qa-cleanup.mjs';
import { checkBudget, readBudget } from './perf-budget.mjs';
import { observeGenuiOpening, summarizeGenuiOpening } from './perf-genui-opening-observer.mjs';
import { openTimelineConversation } from './perf-timeline-navigation.mjs';
import {
  assertNativeViewportUnchanged,
  calibrateNativeViewport,
  readNativeViewport,
} from './foreground-timeline-scroll.mjs';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: '.humanlayer/perf/genui-opening' },
    headless: { type: 'boolean', default: false },
    budget: { type: 'string', default: 'scripts/perf-budgets/genui-opening.json' },
    help: { type: 'boolean', default: false },
  },
});
if (values.help) {
  console.log(
    'BH_E2E_INSTANCE=<instance.json> node scripts/perf-genui-opening.mjs [--out <new-directory>] [--headless] [--budget <file>]\nThree model-free plain/rich DM pairs; fresh browser per opening. Headless is CI diagnostic evidence, not foreground acceptance. The caller owns Host cleanup.',
  );
  process.exit(0);
}
assert.ok(process.env.BH_E2E_INSTANCE, 'Set BH_E2E_INSTANCE to a task-owned live Host.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(values.out);
assert.ok(
  !existsSync(join(out, 'manifest.json')),
  'Use a new evidence directory; previous failures must not be overwritten.',
);
mkdirSync(out, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root });
const budgetPath = resolve(values.budget);
const budget = readBudget(budgetPath);
const runId = randomUUID();
const privateUrl = new URL(instance.url);
const redact = (error) => {
  let text = String(error).replaceAll(instance.url, '[private Host URL]');
  for (const value of [privateUrl.searchParams.get('token'), privateUrl.hash.slice(1)]) {
    if (value) text = text.replaceAll(value, '[redacted]');
  }
  return text;
};
const manifest = {
  runId,
  startedAt: new Date().toISOString(),
  scope:
    'Fresh-browser unvisited synthetic DM openings; no model, physical paint, desktop shell, native or Human acceptance',
  headed: !values.headless,
  sourceSha: git('rev-parse', 'HEAD').toString().trim(),
  diffSha256: hash(git('diff', 'HEAD')),
  sourceFiles: Object.fromEntries(
    [
      ...new Set(
        `${git('diff', '--name-only', 'HEAD')}\n${git('ls-files', '--others', '--exclude-standard')}`
          .trim()
          .split('\n'),
      ),
    ]
      .filter((path) => path && /\.(?:mjs|ts|tsx|json|yml)$/u.test(path))
      .map((path) => [path, hash(readFileSync(join(root, path)))]),
  ),
  hostSha256: hash(readFileSync(join(root, 'packages/core/dist/index.mjs'))),
  clientSha256: hash(readFileSync(join(root, 'packages/client/lib/client.js'))),
  fixtureSha256: hash(readFileSync(join(root, 'packages/core/test/fixtures/genui-document.ts'))),
  budgetSha256: hash(readFileSync(budgetPath)),
  budget,
  bots: [],
  publications: [],
  openings: [],
  browsers: [],
  cleanup: [],
  cleanupFailures: [],
  pageErrors: [],
};
const save = () =>
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
save();
const call = (method, args = {}) => rpc(instance, `botharness/${method}`, args);
let puppeteer;
let referenceViewport;

async function createBot(name) {
  const created = await call('create', {
    displayName: `Opening ${name} ${runId.slice(0, 8)}`,
    persona: 'Synthetic GenUI opening QA only. No business data. Do not initiate work.',
    operationKey: randomUUID(),
  });
  const bot = { slug: created.bot.slug, channelId: created.channelId ?? `dm-${created.bot.slug}` };
  manifest.bots.push(bot);
  save();
  return bot;
}

async function dismiss(page) {
  for (let round = 0; round < 8; round++) {
    const tutorial = await page.$('.driver-popover-close-btn');
    if (tutorial && (await tutorial.isVisible())) {
      await tutorial.click();
      continue;
    }
    let clicked = false;
    for (const button of await page.$$('button')) {
      const label = await button.evaluate((node) =>
        node.closest('.bh-chat-body')
          ? ''
          : (node.getAttribute('aria-label') ?? node.textContent).trim(),
      );
      if (
        [
          'Continue',
          '继续',
          'Skip tutorial',
          '跳过教程',
          'Configure later',
          '稍后配置',
          'Skip',
          '跳过',
          'Don’t show again',
        ].includes(label) &&
        (await button.isVisible())
      ) {
        await button.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
  }
}

async function measure(target, parking) {
  let browser;
  let page;
  let browserRecord;
  let primaryFailure;
  try {
    browser = await puppeteer.launch({
      headless: values.headless,
      defaultViewport: values.headless ? { width: 1440, height: 900 } : null,
      args: ['--no-sandbox', '--lang=en-US'],
    });
    browserRecord = {
      pair: target.pair,
      arm: target.arm,
      pid: browser.process().pid,
      version: await browser.version(),
      closed: false,
    };
    manifest.browsers.push(browserRecord);
    save();
    page = await browser.newPage();
    page.on('pageerror', (error) => {
      manifest.pageErrors.push(redact(error));
      save();
    });
    if (!values.headless) browserRecord.startupNativeViewport = await calibrateNativeViewport(page);
    await page.evaluateOnNewDocument((messageId) => {
      Object.defineProperty(navigator, 'language', { configurable: true, get: () => 'en-US' });
      Object.defineProperty(navigator, 'languages', {
        configurable: true,
        get: () => ['en-US', 'en'],
      });
      const selector = `[data-message-id=${JSON.stringify(messageId)}]`;
      const state = { previsited: false };
      const inspect = (node) => {
        if (node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector)))
          state.previsited = true;
      };
      const observer = new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) inspect(node);
      });
      observer.observe(document, { childList: true, subtree: true });
      window.__bhGenuiVisit = {
        state,
        stop: () => {
          for (const record of observer.takeRecords())
            for (const node of record.addedNodes) inspect(node);
          observer.disconnect();
          state.previsited ||= Boolean(document.querySelector(selector));
          return state.previsited;
        },
      };
    }, target.messageId);
    browserRecord.phase = 'login-navigation';
    save();
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
    await page.goto(instance.url, { waitUntil: 'networkidle2' });
    browserRecord.phase = 'shell-ready';
    save();
    await page.waitForFunction(
      () =>
        document.body.innerText.includes('Bot mode') ||
        document.querySelector('.bh-root.bh-main, [data-workspace-dock]'),
    );
    await page.bringToFront();
    await dismiss(page);
    browserRecord.phase = 'parking';
    save();
    await openTimelineConversation(page, parking.channelId, () => dismiss(page));
    const nativeViewport = values.headless ? undefined : await readNativeViewport(page);
    const viewport =
      nativeViewport ??
      (await page.evaluate(() => ({ innerWidth, innerHeight, devicePixelRatio })));
    if (referenceViewport)
      assert.deepEqual(viewport, referenceViewport, 'All six opening viewports must match.');
    referenceViewport ??= viewport;
    const previsited = await page.evaluate(() => window.__bhGenuiVisit.stop());
    assert.equal(
      previsited,
      false,
      'Target rendered before measurement; retain this failed run, do not reuse it.',
    );
    browserRecord.phase = 'measured-opening';
    save();
    const observation = await observeGenuiOpening(
      page,
      { ...target, rich: target.arm === 'rich', continueLabel: 'Continue', previsited },
      () => openTimelineConversation(page, target.channelId, () => dismiss(page)),
    );
    const row = { ...target, ...observation, nativeViewport };
    manifest.openings.push(row);
    save();
    if (target.arm === 'rich') {
      const frameElement = await page.$(
        `[data-message-id=${JSON.stringify(target.messageId)}] section[aria-label] iframe`,
      );
      const guardian = await frameElement.contentFrame();
      const inner = guardian.childFrames()[0];
      assert.ok(inner, 'Nested document frame must exist.');
      await inner.waitForSelector('#scene');
      assert.ok(await inner.$eval('body', (node) => node.innerText.includes('Project')));
      row.innerDocumentVerified = true;
    }
    if (!values.headless) {
      row.nativeViewportAtEnd = await readNativeViewport(page);
      assertNativeViewportUnchanged(nativeViewport, row.nativeViewportAtEnd);
    }
    save();
  } catch (error) {
    primaryFailure = error;
    if (browserRecord) browserRecord.failure = redact(error.stack ?? error);
    if (page && !page.isClosed()) {
      try {
        browserRecord.failureObservation = await page.evaluate(() => ({
          title: document.title,
          text: document.body.innerText.slice(-4000),
          visible: document.visibilityState,
          focused: document.hasFocus(),
        }));
      } catch (captureError) {
        browserRecord.observationFailure = redact(captureError);
      }
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
        assert.notEqual(browser.process().exitCode, null, 'Owned browser process must exit.');
        browserRecord.closed = true;
      } catch (error) {
        manifest.cleanupFailures.push(redact(error));
        primaryFailure ??= error;
      } finally {
        save();
      }
    }
  }
  if (primaryFailure) throw primaryFailure;
}

try {
  const store = join(root, 'node_modules/.pnpm');
  const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
  assert.ok(entry, 'Install workspace dependencies first.');
  puppeteer = createRequire(join(store, entry, 'node_modules/'))('puppeteer');
  const onboarding = await call('onboarding', { action: 'skip' });
  assert.equal(
    onboarding.tutorial,
    'skipped',
    'Normalize onboarding through its Host owner before measuring either arm.',
  );
  manifest.onboarding = { action: 'skip', tutorial: onboarding.tutorial };
  save();
  const parking = await createBot('parking');
  await stopGenuiQaBot(call, parking);
  for (let pair = 1; pair <= 3; pair++) {
    const document = {
      ...structuredClone(syntheticGenuiDocument),
      snapshotId: `opening-${runId}-${pair}`,
      title: `Project explorer ${pair}`,
    };
    const serialized = JSON.stringify(document);
    for (const arm of ['plain', 'rich']) {
      const bot = await createBot(`${pair} ${arm}`);
      const target = { pair, arm, ...bot };
      manifest.publications.push(target);
      save();
      if (arm === 'rich') {
        target.documentSha256 = hash(serialized);
        target.documentBytes = Buffer.byteLength(serialized);
        const before = performance.now();
        const preview = await call('botToolRun', {
          slug: bot.slug,
          tool: 'genui_preview',
          args: { genui_json: serialized, width: 900, theme: 'light' },
        });
        target.previewMs = performance.now() - before;
        target.previewDocumentId = preview.result?.documentId;
        target.previewPolicyVersion = preview.result?.policyVersion;
        target.previewDiagnostics = preview.result?.diagnostics;
        target.previewExact = hash(serialized) === target.documentSha256;
        save();
        assert.ok(target.previewDocumentId, 'Preview must succeed before publication.');
        assert.deepEqual(target.previewDiagnostics, []);
      }
      const before = performance.now();
      const sent = await call('botToolRun', {
        slug: bot.slug,
        tool: 'bot_send_message',
        args: {
          channel_id: bot.channelId,
          body: 'Synthetic project comparison. Review the projects and their current metrics.',
          ...(arm === 'rich' ? { genui_json: serialized } : {}),
        },
      });
      target.publicationMs = performance.now() - before;
      save();
      assert.equal(sent.result.status, 'committed');
      target.messageId = sent.result.messageId;
      const timeline = await call('channelMessages', { channelId: bot.channelId, limit: 10 });
      const canonical = timeline.messages.find((message) => message.id === target.messageId);
      assert.ok(canonical, 'Read back the explicitly committed canonical message.');
      assert.deepEqual(canonical.genui, arm === 'rich' ? document : undefined);
      target.canonical = true;
      save();
      await stopGenuiQaBot(call, bot);
      await measure(target, parking);
    }
  }
  manifest.status = 'measured';
} catch (error) {
  manifest.status = 'failed';
  manifest.failure = redact(error);
  if (error.cleanupFailure) manifest.cleanupFailures.push(redact(error.cleanupFailure));
  process.exitCode = 1;
} finally {
  for (const bot of manifest.bots) {
    try {
      manifest.cleanup.push({ slug: bot.slug, ...(await stopGenuiQaBot(call, bot)) });
    } catch (error) {
      manifest.cleanupFailures.push(redact(error));
    }
    save();
  }
  manifest.finishedAt = new Date().toISOString();
  manifest.summary = summarizeGenuiOpening(manifest);
  manifest.budgetResult = checkBudget(manifest.summary, budget, { strictTiming: true });
  if (!manifest.budgetResult.pass || manifest.status === 'failed') process.exitCode = 1;
  manifest.status = process.exitCode ? 'failed' : 'passed';
  save();
  writeFileSync(
    join(out, 'summary.json'),
    `${JSON.stringify({ ...manifest.summary, budget: manifest.budgetResult }, null, 2)}\n`,
  );
}
console.log(
  JSON.stringify({ status: manifest.status, ...manifest.summary, budget: manifest.budgetResult }),
);
