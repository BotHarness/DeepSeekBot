import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectObservation, verifyPaths } from './verify-app.mjs';
import { readClientDiagnostics } from './dev-client-diagnostics.mjs';
import {
  behavior,
  digest,
  memoryProblems,
  coverageRow,
  markdownRow,
} from './memory-restore-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Usage: node scripts/e2e-memory-restore.mjs --name <verify-app-instance>');
const paths = verifyPaths(name, root);
const directory = resolve(paths.dir, 'memory-restore', `attempt-${Date.now()}-${process.pid}`);
mkdirSync(directory, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const run = {
  version: 1,
  behavior,
  commit: null,
  base: null,
  dirty: true,
  startedAt: new Date().toISOString(),
  status: 'blocked',
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    viewport: '1440x1100',
    locale: 'en-US',
    theme: 'dark',
  },
  expected:
    'Two owner-saved Memory versions; historical version one is readable, restoring it creates a descendant commit, and a stale expected-head restore is refused without changing content or HEAD; Web agrees.',
  evidence: {},
  actions: [],
};
const save = (name, value) => {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(
        `${JSON.stringify(value, (_key, item) => (typeof item === 'string' ? redact(item) : item), 2)}\n`,
      );
  writeFileSync(resolve(directory, name), bytes, { mode: 0o600 });
  run.evidence[name] = digest(bytes);
};
let instance, browser, page;
const fixture = {
  taskCreated: true,
  path: 'AX-1975.md',
  v1: 'AX Memory version one.\n',
  v2: 'AX Memory version two.\n',
};
let stage = 'preconditions';
const errors = [];
const redact = (text) => {
  let value = String(text);
  for (const secret of [
    instance?.url,
    instance && new URL(instance.url).origin,
    instance?.home,
    root,
    instance && new URL(instance.url).searchParams.get('token'),
  ].filter(Boolean))
    value = value.replaceAll(secret, '[redacted]');
  return value;
};
const command = (args, input, allowRefusal = false) => {
  const url = new URL(instance.url);
  const result = spawnSync(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', ...args, '--compact', '--timeout', '30'],
    {
      cwd: root,
      encoding: 'utf8',
      input:
        typeof input === 'string' ? input : input === undefined ? undefined : JSON.stringify(input),
      timeout: 40_000,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        DEEPSEEKBOT_HOST: url.origin,
        DEEPSEEKBOT_HOST_TOKEN: url.searchParams.get('token'),
      },
    },
  );
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error(`cli-${args[0]}-no-result`);
  }
  if (result.status !== 0 && !allowRefusal)
    throw new Error(`cli-${args[0]}-${value.error?.code ?? 'failed'}`);
  run.actions.push({ command: ['deepseekbot', ...args], at: new Date().toISOString() });
  return allowRefusal ? { exitCode: result.status, value } : value;
};
const authority = () => command(['memory-file', run.botId, '--path', fixture.path]);
const health = async () => {
  const result = spawnSync(process.execPath, ['scripts/verify-app.mjs', 'doctor', '--name', name], {
    cwd: root,
    encoding: 'utf8',
    timeout: 70_000,
  });
  try {
    const { model: _model, ...safe } = JSON.parse(result.stdout);
    return safe;
  } catch {
    return { ok: false, reason: 'doctor-unavailable' };
  }
};
const captureDiagnostics = async () => {
  const snapshot = await page
    ?.evaluate(() => window.__BOTHARNESS_CLIENT_DIAGNOSTICS__?.snapshot())
    .catch(() => undefined);
  const observation = await collectObservation({
    health,
    diagnostics: async () => {
      const report = await readClientDiagnostics(instance);
      return {
        ...report,
        attempts: report.attempts.filter((entry) => entry.attempt === snapshot?.attempt),
      };
    },
  });
  return { ...observation, page: snapshot ?? null };
};
const capturePage = async (phase = 'failure') => {
  if (!page) return;
  await Promise.allSettled([
    (async () =>
      save(`${phase}.png`, Buffer.from(await page.screenshot({ waitForFonts: false }))))(),
    (async () =>
      save(`${phase}.aria.json`, await page.accessibility.snapshot({ interestingOnly: false })))(),
    (async () => save(`${phase}.diagnostics.json`, await captureDiagnostics()))(),
    (async () => save('console.json', errors))(),
  ]);
};
const click = async (label) => {
  await page
    .locator(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`)
    .setTimeout(20_000)
    .click();
  run.actions.push({ click: label, at: new Date().toISOString() });
};
try {
  run.commit = git('rev-parse', 'HEAD');
  run.dirty = git('status', '--porcelain').length > 0;
  run.base = git('merge-base', 'origin/main', 'HEAD');
  instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
  const url = new URL(instance.url);
  if (
    instance.worktree !== root ||
    instance.home !== paths.home ||
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname)
  )
    throw new Error('not-this-worktree-isolated-Host');
  const doctor = await health();
  save('doctor.json', doctor);
  if (!doctor.ok) throw new Error('Host-unavailable');
  const identity = command(['release-info']);
  save('identity.json', identity);
  run.environment.dsh = doctor.dshVersion;
  if (
    identity.identity?.kind !== 'development' ||
    identity.identity.source?.revision !== run.commit ||
    identity.identity.source.dirty
  )
    throw new Error('Host-build-does-not-match-clean-source-commit');
  const pnpm = resolve(root, 'node_modules/.pnpm');
  const pkg = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
  if (!pkg) throw new Error('Puppeteer-unavailable');
  const puppeteer = createRequire(resolve(pnpm, pkg, 'node_modules/'))('puppeteer');
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--lang=en-US'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
  });
  run.environment.browser = await browser.version();
  save('fixture.json', fixture);
  stage = 'create-PersonaBot';
  const created = command([
    'create',
    '--name',
    `AX Memory ${Date.now()}`,
    '--persona',
    'Isolated Memory read and restore verification. No messages, models or schedules are used.',
  ]);
  run.botId = created.bot?.id;
  save('created.json', {
    bot: created.bot,
    dm: created.dm,
    steps: created.steps,
    outcome: created.outcome,
  });
  if (!run.botId) throw new Error('creation-outcome-unknown-do-not-retry');
  const initial = command(['memory-snapshot', run.botId]);
  save('initial.json', initial);
  save(
    'saved-v1.json',
    command(
      [
        'memory-save',
        run.botId,
        '--path',
        fixture.path,
        '--body-stdin',
        '--expected-head',
        initial.snapshot.head,
      ],
      fixture.v1,
    ),
  );
  const v1 = authority();
  save('v1.json', v1);
  save(
    'saved-v2.json',
    command(
      [
        'memory-save',
        run.botId,
        '--path',
        fixture.path,
        '--body-stdin',
        '--expected-head',
        v1.file.head,
      ],
      fixture.v2,
    ),
  );
  const before = authority();
  save('before.json', before);
  save('history.json', command(['memory-commit-diff', run.botId, '--sha', v1.file.head]));
  stage = 'open-Web-Client';
  page = await browser.newPage();
  page.on('pageerror', (error) =>
    errors.push({ source: 'pageerror', message: redact(error.message) }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error')
      errors.push({ source: 'console', message: redact(message.text()) });
  });
  const session = await page.createCDPSession();
  await session.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.setViewport({ width: 1440, height: 1100 });
  await page.goto(instance.url, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForSelector('button[aria-label="Bot mode"]', { timeout: 30_000 });
  const dismissOnboarding = async () => {
    for (let round = 0; round < 6; round++) {
      for (const label of ['Continue', 'Configure later', 'Skip tutorial']) {
        const handle = await page.$(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`);
        if (handle && (await handle.isVisible())) await handle.click();
      }
      await new Promise((done) => setTimeout(done, 250));
    }
  };
  await dismissOnboarding();
  stage = 'enter-Bot-mode';
  await click('Bot mode');
  await page.waitForSelector('.bh-mode-sidebar', { visible: true, timeout: 30_000 });
  await page.keyboard.press('Escape');
  const botName = created.bot.name;
  const selectBot = async () => {
    await dismissOnboarding();
    const tree = await page.accessibility.snapshot({ interestingOnly: false });
    const findBot = (node) => {
      if (node.role === 'button' && node.name.startsWith(`${botName}: `)) return node.name;
      for (const child of node.children ?? []) {
        const label = findBot(child);
        if (label) return label;
      }
    };
    const label = findBot(tree);
    if (!label) throw new Error('created-Bot-sidebar-entry-missing');
    await page
      .locator(`.bh-mode-sidebar button[data-channel-id="${created.dm.channelId}"]`)
      .setTimeout(20_000)
      .click();
    run.actions.push({
      click: label,
      channelId: created.dm.channelId,
      at: new Date().toISOString(),
    });
    await dismissOnboarding();
  };
  await selectBot();
  const openFile = async () => {
    for (const label of ['Close Sessions', 'Close Bot Inbox']) {
      const close = await page.$(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`);
      if (close && (await close.isVisible())) await click(label);
    }
    const file = await page.$('::-p-aria([name="AX-1975.md"][role="treeitem"])');
    if (!file || !(await file.isVisible())) await click('Memory files');
    await page.locator('::-p-aria([name="AX-1975.md"][role="treeitem"])').click();
    run.actions.push({ click: fixture.path, role: 'treeitem' });
  };
  const observe = async (phase, expected) => {
    await page.waitForFunction(
      (text) =>
        [...document.querySelectorAll('.bh-memory-commit-view')].some(
          (el) => el.checkVisibility() && el.innerText.includes(text),
        ),
      {},
      expected.trim(),
    );
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      );
    });
    save(`visible-${phase}.json`, {
      ...(await page.$eval('.bh-memory-commit-view', (el) => ({
        rendered: el.checkVisibility(),
        text: el.innerText,
      }))),
      selectedChannels: await page.$$eval('.bh-selected[data-channel-id]', (nodes) => [
        ...new Set(
          nodes
            .filter((el) => el.checkVisibility())
            .map((el) => el.getAttribute('data-channel-id')),
        ),
      ]),
    });
    await capturePage(phase);
  };
  stage = 'read-current-Web-Memory';
  await openFile();
  await observe('before', fixture.v2);
  stage = 'read-historical-Web-Memory';
  await click('Memory evolution');
  await page.waitForSelector(`.bh-memory-graph-row[title="${v1.file.head}"]`, { visible: true });
  await page.locator(`::-p-aria([name="${v1.file.head}"][role="listitem"])`).click();
  run.actions.push({ click: v1.file.head, role: 'listitem' });
  await observe('history', fixture.v1);
  stage = 'restore-through-Memory-owner';
  const restored = command([
    'memory-restore-commit',
    run.botId,
    '--sha',
    v1.file.head,
    '--expected-head',
    before.file.head,
  ]);
  save('restored.json', restored);
  save('after.json', authority());
  save('graph.json', command(['memory-graph', run.botId]));
  save('checkpoints.json', command(['memory-checkpoints', run.botId]));
  stage = 'observe-restored-Web-Memory';
  await page.reload({ waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForSelector('.bh-mode-sidebar', { visible: true });
  await selectBot();
  await openFile();
  await observe('after', fixture.v1);
  stage = 'reject-stale-expected-head';
  save(
    'refusal.json',
    command(
      [
        'memory-restore-commit',
        run.botId,
        '--sha',
        before.file.head,
        '--expected-head',
        before.file.head,
      ],
      undefined,
      true,
    ),
  );
  save('refused.json', authority());
  await page.reload({ waitUntil: 'networkidle2', timeout: 30_000 });
  run.actions.push({ reload: true, phase: 'refused' });
  await page.waitForSelector('.bh-mode-sidebar', { visible: true });
  await selectBot();
  await openFile();
  await observe('refused', fixture.v1);
  run.status = 'pass';
  run.actual = `${run.botId}: v1 ${v1.file.head}, v2 ${before.file.head}, restored ${restored.head}; old expected-head refused, current content/HEAD unchanged.`;
} catch (error) {
  run.status = stage === 'preconditions' ? 'blocked' : 'fail';
  run.reason = `${stage}: ${redact(error.message)}`;
  run.actual = run.reason;
  save('failure.json', { stage, reason: run.reason, botId: run.botId ?? null });
  await capturePage();
} finally {
  await browser?.close().catch(() => {
    run.status = 'fail';
    run.reason ??= 'browser-cleanup-failed';
  });
  if (run.status === 'pass') {
    try {
      const problems = memoryProblems(run, (name) =>
        JSON.parse(readFileSync(resolve(directory, name + '.json'), 'utf8')),
      );
      if (problems.length) throw new Error(problems.join('; '));
    } catch (error) {
      run.status = 'fail';
      run.reason = redact(error.message);
    }
  }
  run.finishedAt = new Date().toISOString();
  writeFileSync(resolve(directory, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, {
    mode: 0o600,
  });
  const row = coverageRow(directory, run.commit, run.dirty);
  writeFileSync(resolve(directory, 'coverage.md'), markdownRow(row), { mode: 0o600 });
  console.log(JSON.stringify({ ...row, directory }, null, 2));
  process.exitCode = row.status === 'pass' ? 0 : 1;
}
