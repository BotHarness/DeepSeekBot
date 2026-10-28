import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rpc } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const instanceFile = process.env.BH_E2E_INSTANCE;
assert.ok(instanceFile, "Set BH_E2E_INSTANCE to this worktree's isolated verification instance");
const instance = JSON.parse(readFileSync(instanceFile, 'utf8'));
assert.equal(resolve(instance.worktree), root);
const out = join(dirname(instanceFile), 'evidence', `diff-${Date.now()}`);
mkdirSync(out, { recursive: true });
const fixtureFile = join(dirname(instanceFile), 'diff-fixture.json');
let fixture;
if (existsSync(fixtureFile)) fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'));
else {
  const { bot, channelId } = await rpc(instance, 'botharness/create', {
    displayName: 'Memory Diff QA',
    persona: 'Synthetic rendering test fixture.',
  });
  const { target } = await rpc(instance, 'botharness/memoryFileTarget', {
    slug: bot.slug,
    path: '',
  });
  const memory = target.path;
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-C',
        memory,
        '-c',
        'user.name=Diff QA',
        '-c',
        'user.email=diff-qa@example.invalid',
        ...args,
      ],
      { encoding: 'utf8' },
    ).trim();
  mkdirSync(join(memory, 'research'), { recursive: true });
  const body = [
    'Title: 自动换行与行号对齐',
    '',
    '最近，我在阅读一份很长的中文研究记录。'.repeat(28),
    '',
    'URL: https://example.invalid/' + 'long-path-'.repeat(110),
    '',
    '  \tIndented code retains its whitespace.',
    '',
    'The final line.',
  ].join('\n');
  writeFileSync(join(memory, 'research/note.txt'), 'Old text\n');
  writeFileSync(join(memory, 'research/large.txt'), 'context\n'.repeat(10000) + 'old tail\n');
  git('add', '.');
  git('commit', '-m', 'Diff QA baseline');
  writeFileSync(join(memory, 'research/note.txt'), body);
  writeFileSync(join(memory, 'research/large.txt'), 'context\n'.repeat(10000) + 'new tail\n');
  git('add', '.');
  git('commit', '-m', 'Diff QA long lines');
  const sha = git('rev-parse', 'HEAD');
  writeFileSync(join(memory, 'research/draft.txt'), body);
  fixture = { slug: bot.slug, channelId, sha };
  writeFileSync(fixtureFile, JSON.stringify(fixture));
}
const working = await rpc(instance, 'botharness/memoryWorkingDiff', {
  channelId: fixture.channelId,
  path: 'research/draft.txt',
  kind: 'untracked',
});
assert.ok(working.diff.includes('https://example.invalid/'));
const committed = await rpc(instance, 'botharness/memoryGitCommitDiff', {
  channelId: fixture.channelId,
  sha: fixture.sha,
});
assert.ok(committed.diff.includes('new tail'));
const store = join(root, 'node_modules/.pnpm');
const installed = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
assert.ok(installed);
const puppeteer = createRequire(join(store, installed, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  protocolTimeout: 30000,
  args: ['--no-sandbox'],
});
const errors = [];
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some((node) =>
        /Bot 模式|Bot mode/.test(node.textContent ?? ''),
      ),
    { timeout: 30000 },
  );
  for (let i = 0; i < 8; i++) {
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(
        (node) =>
          [
            '继续',
            'Continue',
            '稍后配置',
            'Configure later',
            '跳过教程',
            'Skip tutorial',
            '跳过引导',
            'Skip guide',
          ].includes(node.textContent?.trim()) && node.getBoundingClientRect().height > 0,
      );
      button?.click();
      return Boolean(button);
    });
    if (!clicked) break;
    await new Promise((done) => setTimeout(done, 350));
  }
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((node) => /Bot 模式|Bot mode/.test(node.textContent ?? ''))
      ?.click(),
  );
  await page.waitForSelector('.bh-root.bh-main', { timeout: 30000 });
  await page.keyboard.press('Escape');
  const visibleRow = await page.waitForFunction(
    (channelId) =>
      [...document.querySelectorAll('[data-channel-id]')].find(
        (node) =>
          node.getAttribute('data-channel-id') === channelId &&
          node.getBoundingClientRect().height > 0,
      ),
    {},
    fixture.channelId,
  );
  await visibleRow.asElement().click();
  await page.waitForSelector(`.bh-selected[data-channel-id="${fixture.channelId}"]`, {
    timeout: 15000,
  });
  await page.locator('::-p-aria("消息 · ⌥ ⇧ ⌘ 2")').click();
  await new Promise((done) => setTimeout(done, 500));
  await page.locator('::-p-aria("记忆演化")').click();
  await page.waitForSelector('.bh-memory-working-list', { visible: true });
  const draftRow = await page.waitForFunction(() =>
    [...document.querySelectorAll('.bh-memory-working-list button')].find(
      (node) =>
        node.textContent?.includes('research/draft.txt') && node.getBoundingClientRect().height > 0,
    ),
  );
  await draftRow.asElement().click();
  await page.waitForSelector('.bh-memory-diff-table', { visible: true });
  const baseline = process.env.BH_DIFF_BASELINE === '1';
  if (baseline)
    assert.equal(
      await page.$('button[aria-label="自动换行"]'),
      null,
      'baseline must serve the unchanged Client',
    );
  const measurements = [];
  const measure = async (view, wrapped) => {
    const metrics = await page.$$eval('.bh-memory-diff-scroll', (nodes) =>
      nodes.map((scroll) => {
        const table = scroll.querySelector('table');
        const row = table.querySelector('tr:not(.bh-memory-diff-hunk):not(.bh-memory-diff-note)');
        const cells = [...row.children].map((cell) => ({
          left: cell.getBoundingClientRect().left - scroll.getBoundingClientRect().left,
          width: cell.getBoundingClientRect().width,
        }));
        return {
          width: scroll.clientWidth,
          overflow: scroll.scrollWidth - scroll.clientWidth,
          cells,
          wrap: table.dataset.wrap,
        };
      }),
    );
    measurements.push({ view, wrapped, metrics });
    for (const metric of metrics) {
      assert.ok(metric.cells[0].left <= 1, 'old line column must begin at the left edge');
      assert.ok(
        metric.cells[0].width < 100 && metric.cells[1].width < 100,
        'line-number columns must stay compact',
      );
      assert.ok(
        metric.cells[2].width < 40 && metric.cells[3].left < 180,
        'sign and text must stay beside line numbers',
      );
      if (wrapped) assert.ok(metric.overflow <= 1, 'wrapped diff must fit its pane');
    }
    if (!wrapped)
      assert.ok(
        metrics.some((metric) => metric.overflow > 100),
        'unwrapped long lines must scroll',
      );
  };
  const snapshot = async (label) => {
    await page.screenshot({ path: join(out, `${label}.png`), waitForFonts: false });
    writeFileSync(
      join(out, `${label}.aria.json`),
      JSON.stringify(await page.accessibility.snapshot({ interestingOnly: false }), null, 2),
    );
  };
  const checkView = async (view) => {
    for (const theme of ['dark', 'light']) {
      await page.evaluate(
        (dark) => document.body.toggleAttribute('data-ds-dark-theme', dark),
        theme === 'dark',
      );
      await page.setViewport({ width: 1440, height: 1000 });
      if (baseline) {
        await snapshot(`${view}-${theme}-before`);
        continue;
      }
      const toggle = 'button[aria-label="自动换行"]';
      assert.equal(await page.$eval(toggle, (node) => node.getAttribute('aria-pressed')), 'true');
      await measure(view + '-' + theme, true);
      await snapshot(`${view}-${theme}-wrap`);
      const content = await page.$$eval('.bh-memory-diff-content', (nodes) =>
        nodes.map((node) => node.textContent),
      );
      await page.click(toggle);
      assert.equal(await page.$eval(toggle, (node) => node.getAttribute('aria-pressed')), 'false');
      await measure(view + '-' + theme, false);
      await snapshot(`${view}-${theme}-nowrap`);
      assert.deepEqual(
        await page.$$eval('.bh-memory-diff-content', (nodes) =>
          nodes.map((node) => node.textContent),
        ),
        content,
      );
      await page.click(toggle);
      await page.setViewport({ width: 1100, height: 1000 });
      await measure(view + '-narrow-' + theme, true);
      await snapshot(`${view}-${theme}-narrow`);
    }
  };
  await checkView('working');
  await page.click(`.bh-memory-graph-row[title="${fixture.sha}"]`);
  await page.waitForFunction(() => document.querySelectorAll('.bh-memory-diff-table').length === 2);
  assert.ok(await page.$('td[aria-label="新行 10001"]'), 'large line numbers must remain visible');
  await checkView('commit');
  assert.deepEqual(errors, [], 'browser must not emit errors');
  writeFileSync(join(out, 'measurements.json'), JSON.stringify(measurements, null, 2));
  writeFileSync(
    join(out, 'canonical.json'),
    JSON.stringify(
      {
        sha: fixture.sha,
        workingPath: 'research/draft.txt',
        workingStatus: working.status,
        committedFiles: committed.files,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: true, baseline, evidence: out, checks: measurements.length }),
  );
} catch (error) {
  if (page) {
    await page.screenshot({ path: join(out, 'failure.png'), waitForFonts: false }).catch(() => {});
    writeFileSync(
      join(out, 'failure.aria.json'),
      JSON.stringify(await page.accessibility.snapshot({ interestingOnly: false }), null, 2),
    );
  }
  throw error;
} finally {
  writeFileSync(join(out, 'console.json'), JSON.stringify(errors, null, 2));
  await browser.close();
}
