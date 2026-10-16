import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectObservation, verifyPaths, rpc } from './verify-app.mjs';
import { readClientDiagnostics } from './dev-client-diagnostics.mjs';
import {
  behavior,
  redactComputerEvidence,
  digest,
  computerProblems,
  coverageRow,
  markdownRow,
} from './computer-lifecycle-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Usage: node scripts/e2e-computer-lifecycle.mjs --name <verify-app-instance>');
const paths = verifyPaths(name, root);
const directory = resolve(paths.dir, 'computer-lifecycle', `attempt-${Date.now()}-${process.pid}`);
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
    'Task-owned Container Computer starts from its explicit panel authorization, shows the test desktop in both panel and CLI frame, then stops; a subsequent frame read refuses without restarting.',
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
let instance, browser, page, ownership;
let startAttempted = false;
let stage = 'preconditions';
const errors = [];
const httpErrors = [];
const redact = (text) => redactComputerEvidence(text, instance, root);
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
const authority = () => command(['computer-status']);
const docker = (args) => {
  const r = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`docker-${args[0]}: ${redact(r.stderr ?? '').slice(0, 200)}`);
  return r.stdout.trim();
};
const inspect = () => {
  const raw = JSON.parse(docker(['inspect', ownership.container]))[0];
  return {
    id: raw.Id,
    name: raw.Name,
    image: raw.Image,
    running: raw.State.Running,
    mounts: raw.Mounts.map((m) => ({ name: m.Name, destination: m.Destination })),
  };
};
const assertOwned = (value) => {
  if (
    value.target !== 'container' ||
    value.provider !== 'docker' ||
    value.status?.storage?.kind !== 'volume' ||
    value.status.storage.target !== ownership.volume
  )
    throw new Error('Refusing to act on an unexpected Computer target or volume');
};
const waitForState = async (expected) => {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const value = authority();
    assertOwned(value);
    if (value.status.state === expected) return value;
    if (value.status.state === 'failed') throw new Error(`Computer-failed: ${value.status.detail}`);
    await new Promise((done) => setTimeout(done, 1500));
  }
  throw new Error(`Computer-${expected}-timeout`);
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
    (async () => save('http-errors.json', httpErrors))(),
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
  ownership = JSON.parse(readFileSync(resolve(paths.dir, 'computer-ownership.json'), 'utf8'));
  if (
    ownership.name !== name ||
    ownership.container !== `botharness-${name}` ||
    !/^ax1977-[a-z0-9-]+$/u.test(name) ||
    ownership.volume !== `${ownership.container}-config` ||
    !ownership.taskCreated ||
    !ownership.initialContainerAbsent ||
    !ownership.initialVolumeAbsent
  )
    throw new Error(
      'Missing task-specific preparation/ownership; run prepare-computer-lifecycle with a fresh name',
    );
  save('ownership.json', ownership);
  const version = JSON.parse(docker(['version', '--format', '{{json .}}']));
  save('docker-version.json', version);
  if (!version.Server?.Version) throw new Error('Docker Engine unavailable');
  const initial = authority();
  save('initial.json', initial);
  assertOwned(initial);
  if (!initial.probe?.available || initial.status.state !== 'absent')
    throw new Error(
      'Expected available Engine and absent task-owned Container; use a fresh prepared name',
    );
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
  stage = 'create-PersonaBot';
  const created = command([
    'create',
    '--name',
    `AX Computer ${Date.now()}`,
    '--persona',
    'Disposable Container Computer verification. No model, messages or input.',
  ]);
  run.botId = created.bot?.id;
  save('created.json', {
    bot: created.bot,
    dm: created.dm,
    steps: created.steps,
    outcome: created.outcome,
  });
  if (!run.botId) throw new Error('creation-outcome-unknown-do-not-retry');
  stage = 'open-Web-Client';
  page = await browser.newPage();
  page.on('pageerror', (error) =>
    errors.push({ source: 'pageerror', stage, message: redact(error.message) }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error')
      errors.push({
        source: 'console',
        stage,
        url: redact(message.location().url ?? ''),
        message: redact(message.text()),
      });
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      httpErrors.push({ stage, status: response.status(), url: redact(response.url()) });
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
  for (const label of ['Close Sessions', 'Close Bot Inbox']) {
    const handle = await page.$(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`);
    if (handle && (await handle.isVisible())) await click(label);
  }
  await click('Computer');
  const panel = '[data-sidebar-entry="computer"]';
  const observe = async (phase) => {
    await page.waitForSelector(panel, { visible: true, timeout: 30000 });
    save(
      `visible-${phase}.json`,
      await page.$eval(panel, (el) => ({
        rendered: el.checkVisibility(),
        text: el.innerText,
        accessLabel: el.querySelector('.bh-computer-access-power')?.getAttribute('aria-label'),
        selectedChannels: [
          ...new Set(
            [...document.querySelectorAll('.bh-selected[data-channel-id]')]
              .filter((e) => e.checkVisibility())
              .map((e) => e.getAttribute('data-channel-id')),
          ),
        ],
        live: !!el.querySelector('[role="button"][aria-label="Open fullscreen"]'),
        viewers: [...el.querySelectorAll('iframe')].map((e) => ({
          src: e.getAttribute('src'),
          visible: e.checkVisibility(),
        })),
      })),
    );
    await capturePage(phase);
  };
  stage = 'observe-Access-off';
  await page.waitForSelector('button[aria-label="Enable Computer Access"]', { timeout: 15000 });
  await observe('off');
  stage = 'enable-Computer-Access';
  await click('Enable Computer Access');
  await page.waitForSelector('button[aria-label="Disable Computer Access"]', { timeout: 15000 });
  await click('Start');
  await page.waitForSelector('::-p-aria([name="Authorize and start"][role="button"])', {
    visible: true,
  });
  await observe('authorized');
  assertOwned(authority());
  stage = 'start-from-panel';
  startAttempted = true;
  await click('Authorize and start');
  save('running.json', await waitForState('running'));
  const container = inspect();
  if (
    container.name !== `/${ownership.container}` ||
    !container.running ||
    container.image !== ownership.imageId ||
    !container.mounts.some((m) => m.name === ownership.volume && m.destination === '/config')
  )
    throw new Error('Started container is not this task resource');
  save('container-running.json', container);
  stage = 'prepare-test-picture';
  docker([
    'exec',
    '-u',
    'abc',
    '-e',
    'DISPLAY=:1',
    ownership.container,
    'sh',
    '-c',
    'command -v xmessage',
  ]);
  const marker = `AX Container Computer 1977 — ${ownership.container}`;
  docker([
    'exec',
    '-d',
    '-u',
    'abc',
    '-e',
    'DISPLAY=:1',
    ownership.container,
    'xmessage',
    '-center',
    '-title',
    'AX Container Computer 1977',
    '-buttons',
    'OK',
    marker,
  ]);
  save('fixture.json', {
    marker,
    containerId: container.id,
    action: 'start an owned test window; no input injection',
  });
  stage = 'observe-real-frame';
  await page.waitForSelector(`${panel} [role="button"][aria-label="Open fullscreen"]`, {
    visible: true,
    timeout: 60000,
  });
  await new Promise((done) => setTimeout(done, 1500));
  save('frame.json', command(['computer-frame', '--out', resolve(directory, 'frame.jpg')]));
  save('frame.jpg', readFileSync(resolve(directory, 'frame.jpg')));
  await observe('running');
  stage = 'stop-from-panel';
  assertOwned(authority());
  if (inspect().id !== container.id) throw new Error('Computer identity changed before stop');
  await page.locator(`${panel} ::-p-aria([name="Stop"][role="button"])`).click();
  run.actions.push({ click: 'Stop', at: new Date().toISOString() });
  save('stopped.json', await waitForState('stopped'));
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.innerText.includes('Stopped'),
    { timeout: 15000 },
    panel,
  );
  await observe('stopped');
  save(
    'stopped-refusal.json',
    command(
      ['computer-frame', '--out', resolve(directory, 'unexpected-stopped-frame.jpg')],
      undefined,
      true,
    ),
  );
  save('after-stopped-read.json', authority());
  save('container-stopped.json', inspect());
  save('lifecycle.json', command(['computer-logs', '--plugin', 'computer', '--limit', '100']));
  save('computer-diagnostics.json', command(['computer-diagnostics']));
  run.status = 'pass';
  run.actual = `${ownership.container}: panel and CLI captured the task test window; explicit panel stop preserved the same stopped instance and subsequent frame refused.`;
} catch (error) {
  run.status = stage === 'preconditions' ? 'blocked' : 'fail';
  run.reason = `${stage}: ${redact(error.message)}`;
  run.actual = run.reason;
  save('failure.json', { stage, reason: run.reason, botId: run.botId ?? null });
  if (run.botId && instance) {
    for (const [name, read] of [
      ['failure-computer.json', authority],
      [
        'failure-lifecycle.json',
        () => command(['computer-logs', '--plugin', 'computer', '--limit', '100']),
      ],
    ]) {
      try {
        save(name, read());
      } catch (collectionError) {
        save(name, { collectionFailed: true, reason: redact(collectionError.message) });
      }
    }
  }
  await capturePage();
} finally {
  if (startAttempted && instance && ownership) {
    try {
      assertOwned(authority());
      save('cleanup-computer.json', command(['computer-stop']));
      save('cleanup-observation.json', authority());
    } catch (error) {
      run.status = 'fail';
      run.reason ??= 'Computer-cleanup-failed';
      save('cleanup-failure.json', { reason: redact(error.message) });
    }
  }
  await browser?.close().catch(() => {
    run.status = 'fail';
    run.reason ??= 'browser-cleanup-failed';
  });
  if (run.status === 'pass') {
    try {
      const problems = computerProblems(run, (name) =>
        JSON.parse(readFileSync(resolve(directory, name + '.json'), 'utf8')),
      );
      if (problems.length) throw new Error(problems.join('; '));
    } catch (error) {
      run.status = 'fail';
      run.reason = redact(error.message);
    }
  }
  if (run.status === 'fail' && !existsSync(resolve(directory, 'failure.json')))
    save('failure.json', {
      stage: 'cleanup-or-validation',
      reason: run.reason,
      botId: run.botId ?? null,
    });
  run.finishedAt = new Date().toISOString();
  writeFileSync(
    resolve(directory, 'run.json'),
    `${JSON.stringify(run, (_key, item) => (typeof item === 'string' ? redact(item) : item), 2)}\n`,
    {
      mode: 0o600,
    },
  );
  const row = coverageRow(directory, run.commit, run.dirty);
  writeFileSync(resolve(directory, 'coverage.md'), markdownRow(row), { mode: 0o600 });
  console.log(JSON.stringify({ ...row, directory }, null, 2));
  process.exitCode = row.status === 'pass' ? 0 : 1;
}
