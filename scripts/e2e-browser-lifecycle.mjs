import { createRequire } from 'node:module';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectObservation, verifyPaths, rpc } from './verify-app.mjs';
import { readClientDiagnostics } from './dev-client-diagnostics.mjs';
import {
  behavior,
  redactBrowserEvidence,
  digest,
  browserProblems,
  coverageRow,
  markdownRow,
} from './browser-lifecycle-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Usage: node scripts/e2e-browser-lifecycle.mjs --name <verify-app-instance>');
const paths = verifyPaths(name, root);
const directory = resolve(paths.dir, 'browser-lifecycle', `attempt-${Date.now()}-${process.pid}`);
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
    'Default local Browser opens one deterministic fixture; panel, observation and direct tools agree on its tab; stop removes the tab; Access-off refusal remains distinct from stopped state.',
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
let instance, browser, page, fixtureProcess;
const fixture = {
  taskCreated: true,
  marker: 'AX Browser lifecycle 1976',
  title: 'AX Browser lifecycle 1976',
};
let stage = 'preconditions';
const errors = [];
const httpErrors = [];
const redact = (text) => redactBrowserEvidence(text, instance, root);
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
const authority = () => command(['browser-observation', run.botId]);
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
  fixtureProcess = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {createServer} from 'node:http'; const server=createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html><head><title>AX Browser lifecycle 1976</title></head><body style="font:28px sans-serif;padding:48px;background:white;color:black"><h1>AX Browser lifecycle 1976</h1><p>Deterministic local fixture: 37 blue boxes.</p></body></html>')});server.listen(0,'127.0.0.1',()=>console.log(server.address().port));`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const port = await new Promise((done, fail) => {
    const timeout = setTimeout(() => fail(new Error('fixture-start-timeout')), 10000);
    fixtureProcess.once('error', fail);
    fixtureProcess.stdout.once('data', (data) => {
      clearTimeout(timeout);
      done(Number(String(data).trim()));
    });
  });
  if (!Number.isInteger(port) || port < 1) throw new Error('fixture-port-invalid');
  fixture.url = `http://127.0.0.1:${port}/`;
  save('fixture.json', fixture);
  stage = 'create-PersonaBot';
  const created = command([
    'create',
    '--name',
    `AX Browser ${Date.now()}`,
    '--persona',
    'Disposable Browser lifecycle verification. No model or messages.',
  ]);
  run.botId = created.bot?.id;
  save('created.json', {
    bot: created.bot,
    dm: created.dm,
    steps: created.steps,
    outcome: created.outcome,
  });
  if (!run.botId) throw new Error('creation-outcome-unknown-do-not-retry');
  save('off.json', authority());
  save(
    'off-refusal.json',
    command(
      ['browser-tool', run.botId, 'browser_open', '--args-stdin'],
      { url: fixture.url },
      true,
    ),
  );
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
  await click('Browser');
  const observe = async (phase, text) => {
    const accessOff = ['off', 'disabled'].includes(phase);
    const selector = accessOff ? '.bh-browser-note' : '.bh-browser-body';
    await page.waitForSelector(
      `button[aria-label="${accessOff ? 'Enable' : 'Disable'} Browser Access"][aria-pressed="${!accessOff}"]`,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      (selector, expected) =>
        [...document.querySelectorAll(selector)].some(
          (el) => el.checkVisibility() && el.innerText.includes(expected),
        ),
      {},
      selector,
      text,
    );
    save(`visible-${phase}.json`, {
      ...(await page.$eval(selector, (el) => ({
        rendered: el.checkVisibility(),
        fullscreen: !!document.querySelector('[data-bh-remote-viewer-fullscreen]'),
        text: el.innerText,
      }))),
      accessLabel: await page.$eval('.bh-browser-access-power', (el) =>
        el.getAttribute('aria-label'),
      ),
      selectedChannels: await page.$$eval('.bh-selected[data-channel-id]', (nodes) => [
        ...new Set(
          nodes
            .filter((el) => el.checkVisibility())
            .map((el) => el.getAttribute('data-channel-id')),
        ),
      ]),
      viewers: await page.$$eval('.bh-browser-body iframe', (nodes) =>
        nodes.map((el) => ({
          src: el.getAttribute('src'),
          visible: el.checkVisibility(),
          status: el.contentDocument?.querySelector('#status')?.textContent ?? null,
          live: !!el.closest('[role="button"][aria-label="Open fullscreen"]'),
        })),
      ),
    });
    await capturePage(phase);
  };
  stage = 'observe-Access-off';
  await observe('off', "This PersonaBot's sessions may use the browser");
  stage = 'enable-Access';
  await click('Enable Browser Access');
  await page.waitForSelector('button[aria-label="Disable Browser Access"]', { timeout: 15000 });
  stage = 'start-Browser-from-panel';
  await click('Open Bot Browser');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.bh-browser-body')].some((el) =>
        el.innerText.includes('Running'),
      ),
    { timeout: 60000 },
  );
  await click('Leave fullscreen');
  await page.waitForFunction(() => !document.querySelector('[data-bh-remote-viewer-fullscreen]'));
  stage = 'navigate-local-fixture';
  save(
    'opened.json',
    command(['browser-tool', run.botId, 'browser_open', '--args-stdin'], { url: fixture.url }),
  );
  save(
    'running.json',
    command(['browser-observation', run.botId, '--out', resolve(directory, 'frame.jpg')]),
  );
  save('frame.jpg', readFileSync(resolve(directory, 'frame.jpg')));
  save(
    'direct-tabs.json',
    command(['browser-tool', run.botId, 'browser_tabs', '--args-stdin'], { action: 'list' }),
  );
  save('direct-read.json', command(['browser-tool', run.botId, 'browser_observe']));
  stage = 'observe-running-panel';
  await page.waitForSelector('.bh-browser-body [role="button"][aria-label="Open fullscreen"]', {
    timeout: 30000,
  });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('.bh-browser-body iframe')].some((el) => {
        const c = el.contentDocument?.querySelector('canvas');
        return c && c.width > 300 && c.height > 150;
      }),
    { timeout: 30000 },
  );
  await new Promise((done) => setTimeout(done, 1000));
  const viewerStatus = await page.$eval(
    '.bh-browser-body iframe',
    (el) => el.contentDocument?.querySelector('#status')?.textContent ?? '',
  );
  if (viewerStatus) throw new Error(`Browser-viewer-not-ready: ${viewerStatus}`);
  await observe('running', fixture.title);
  stage = 'stop-from-panel';
  await click('Stop');
  await observe('stopped', 'Stopped');
  save('stopped.json', authority());
  save(
    'stopped-refusal.json',
    command(['browser-tool', run.botId, 'browser_observe'], undefined, true),
  );
  save('after-stopped-read.json', authority());
  stage = 'disable-Access';
  await click('Disable Browser Access');
  await page.waitForSelector('button[aria-label="Enable Browser Access"]', { timeout: 15000 });
  save(
    'disabled-refusal.json',
    command(
      ['browser-tool', run.botId, 'browser_open', '--args-stdin'],
      { url: fixture.url },
      true,
    ),
  );
  save('disabled.json', authority());
  save('bot-final.json', {
    bot: (await rpc(instance, 'botharness/list')).bots.find((bot) => bot.slug === run.botId),
  });
  await observe('disabled', "This PersonaBot's sessions may use the browser");
  save('lifecycle.json', command(['computer-logs', '--plugin', 'browser', '--limit', '100']));
  run.status = 'pass';
  run.actual = `${run.botId}: one local fixture tab observed through panel and direct tools; panel stop cleared running/tab state; stopped read and Access-off open refused distinctly.`;
} catch (error) {
  run.status = stage === 'preconditions' ? 'blocked' : 'fail';
  run.reason = `${stage}: ${redact(error.message)}`;
  run.actual = run.reason;
  save('failure.json', { stage, reason: run.reason, botId: run.botId ?? null });
  if (run.botId && instance) {
    for (const [name, read] of [
      ['failure-browser.json', authority],
      [
        'failure-lifecycle.json',
        () => command(['computer-logs', '--plugin', 'browser', '--limit', '100']),
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
  if (run.botId && instance) {
    try {
      save('cleanup-browser.json', command(['browser-stop', run.botId]));
      save('cleanup-observation.json', authority());
    } catch (error) {
      run.status = 'fail';
      run.reason ??= 'Browser-cleanup-failed';
    }
  }
  fixtureProcess?.kill('SIGTERM');
  await browser?.close().catch(() => {
    run.status = 'fail';
    run.reason ??= 'browser-cleanup-failed';
  });
  if (run.status === 'pass') {
    try {
      const problems = browserProblems(run, (name) =>
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
