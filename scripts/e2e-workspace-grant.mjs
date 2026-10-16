import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { dirname, resolve, relative, isAbsolute, basename } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { collectObservation, verifyPaths } from './verify-app.mjs';
import { readClientDiagnostics } from './dev-client-diagnostics.mjs';
import {
  behavior,
  digest,
  grantProblems,
  coverageRow,
  markdownRow,
} from './workspace-grant-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Usage: node scripts/e2e-workspace-grant.mjs --name <verify-app-instance>');
const paths = verifyPaths(name, root);
const directory = resolve(paths.dir, 'workspace-grant', `attempt-${Date.now()}-${process.pid}`);
mkdirSync(directory, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const run = {
  version: 1,
  behavior,
  commit: git('rev-parse', 'HEAD'),
  base: git('merge-base', 'origin/main', 'HEAD'),
  dirty: git('status', '--porcelain').length > 0,
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
    'The same PersonaBot and temporary Workspace have no Grant, then an active Grant permitting direct attachment-import reads, then an explicitly revoked Grant refusing the same read; visible Web state agrees.',
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
let instance, browser, page, fixture;
const sample = 'AX #1974 temporary Workspace read fixture.\n';
let stage = 'preconditions';
const errors = [];
const redact = (text) => {
  let value = String(text);
  for (const secret of [
    instance?.url,
    instance && new URL(instance.url).origin,
    fixture,
    instance?.home,
    root,
    instance && new URL(instance.url).searchParams.get('token'),
  ].filter(Boolean))
    value = value.replaceAll(secret, '[redacted]');
  return value.slice(0, 2000);
};
const command = (args, input, allowRefusal = false) => {
  const url = new URL(instance.url);
  const result = spawnSync(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', ...args, '--compact', '--timeout', '30'],
    {
      cwd: root,
      encoding: 'utf8',
      input: input === undefined ? undefined : JSON.stringify(input),
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
const authority = () => command(['grants', run.botId]);
const readFixture = () =>
  command(
    ['bot-tool', run.botId, 'channel_attachment_import', '--args-stdin'],
    { file_path: resolve(fixture, 'README.md') },
    true,
  );
const contains = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};
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
  fixture = realpathSync(
    mkdtempSync(resolve(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'bh-ax1974-')),
  );
  writeFileSync(
    resolve(paths.dir, `${basename(directory)}-fixture-private.json`),
    JSON.stringify({ path: fixture, attempt: directory }),
    { flag: 'wx', mode: 0o600 },
  );
  const protectedRoots = [realpathSync(instance.home), realpathSync(homedir()), realpathSync(root)];
  if (
    protectedRoots.some((path) => contains(fixture, path)) ||
    contains(realpathSync(instance.home), fixture)
  )
    throw new Error('unsafe-fixture-root');
  writeFileSync(resolve(fixture, 'README.md'), sample, { flag: 'wx', mode: 0o600 });
  save('fixture.json', {
    path: fixture,
    files: ['README.md'],
    sample,
    bytes: Buffer.byteLength(sample),
    sha256: digest(sample),
    isolatedFromHost: true,
    notUserAncestor: true,
    taskCreated: true,
  });
  stage = 'create-PersonaBot';
  const created = command([
    'create',
    '--name',
    `AX Grant ${Date.now()}`,
    '--persona',
    'Isolated temporary Workspace Grant verification. No messages, models or schedules are used.',
  ]);
  run.botId = created.bot?.id;
  save('created.json', { bot: created.bot, steps: created.steps, outcome: created.outcome });
  if (!run.botId) throw new Error('creation-outcome-unknown-do-not-retry');
  save('before.json', authority());
  save('read-before.json', readFixture());
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
    await click(label);
    await dismissOnboarding();
    await page.waitForSelector('[aria-label^="Workspace Grants ·"]', { visible: true });
  };
  await selectBot();
  const openGrants = async () => {
    const label = await page.$eval('[aria-label^="Workspace Grants ·"]', (el) =>
      el.getAttribute('aria-label'),
    );
    if (!label.includes(botName)) throw new Error('wrong-Bot-workspace-entry');
    await click(label);
    await page.waitForSelector('.bh-workspace-grants', { visible: true });
    await page.waitForSelector('.bh-workspace-grants .bh-workspace-folder-toggle', {
      visible: true,
    });
    await page.evaluate(async () => {
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
  };
  const visible = async () =>
    page.$eval(
      '.bh-workspace-grants',
      (el, title) => ({
        rendered: el.checkVisibility(),
        hasWorkspace: [...el.querySelectorAll('.bh-workspace-folder-toggle')].some(
          (row) => row.checkVisibility() && row.textContent.includes(title),
        ),
        text: el.innerText,
      }),
      basename(fixture),
    );
  stage = 'open-Workspace-Grants';
  await openGrants();
  save('visible-before.json', await visible());
  await capturePage('before');
  stage = 'authorize-through-Web';
  await page.locator('::-p-text(Advanced: enter Host path)').click();
  run.actions.push({ click: 'Advanced: enter Host path' });
  await page.locator('::-p-aria([name="Workspace folder path"][role="textbox"])').fill(fixture);
  await click('Authorize workspace');
  await page.waitForSelector('.bh-workspace-grant-confirm', { visible: true });
  await page
    .locator('.bh-workspace-grant-confirm ::-p-aria([name="Authorize workspace"][role="button"])')
    .click();
  run.actions.push({ click: 'Authorize workspace', confirmation: true });
  await page.waitForFunction(
    (title) =>
      [...document.querySelectorAll('.bh-workspace-folder-toggle')].some(
        (el) => el.checkVisibility() && el.textContent.includes(title),
      ),
    {},
    basename(fixture),
  );
  const granted = authority();
  save('granted.json', granted);
  const grant = granted.grants?.find(
    (entry) => entry.workspacePath === fixture && !entry.revokedAt,
  );
  if (!grant) throw new Error('Grant-creation-outcome-unknown-do-not-retry');
  run.grantId = grant.id;
  run.workspaceId = grant.workspaceId;
  save('read-granted.json', readFixture());
  save('visible-granted.json', await visible());
  await capturePage('granted');
  stage = 'explicit-CLI-revocation';
  save(
    'unconfirmed-revoke.json',
    command(['grant-revoke', run.botId, '--grant', grant.id], undefined, true),
  );
  save('after-unconfirmed.json', authority());
  save('revoked.json', command(['grant-revoke', run.botId, '--grant', grant.id, '--confirm']));
  save('after.json', authority());
  save('read-after.json', readFixture());
  stage = 'observe-revoked-Web-state';
  await page.reload({ waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForSelector('.bh-mode-sidebar', { visible: true });
  await selectBot();
  await openGrants();
  save('visible-after.json', await visible());
  await capturePage('after');
  save('trace.json', command(['bot-trace', run.botId, '--session', 'direct']));
  run.status = 'pass';
  run.actual = `${run.botId}: Web Grant ${run.grantId} authorized then explicitly revoked; the same sample read/import succeeds only while active.`;
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
  if (fixture) {
    try {
      const entries = readdirSync(fixture);
      const unchanged =
        entries.length === 1 &&
        entries[0] === 'README.md' &&
        readFileSync(resolve(fixture, 'README.md'), 'utf8') === sample;
      if (unchanged) rmSync(fixture, { recursive: true });
      save('cleanup.json', { removed: unchanged, sampleUnchanged: unchanged, files: entries });
      if (!unchanged) {
        run.status = 'fail';
        run.reason ??= 'Unexpected fixture change; retained for inspection';
      }
    } catch (error) {
      save('cleanup.json', {
        removed: false,
        sampleUnchanged: false,
        reason: redact(error.message),
      });
      run.status = 'fail';
      run.reason ??= 'Fixture cleanup failed; inspect retained metadata';
    }
  }
  if (run.status === 'pass') {
    try {
      const problems = grantProblems(run, (name) =>
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
