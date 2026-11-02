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
  idleProblems,
  coverageRow,
  markdownRow,
} from './activity-idle-report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[process.argv.indexOf('--name') + 1];
if (!process.argv.includes('--name') || !/^[a-z0-9][a-z0-9-]*$/u.test(name ?? ''))
  throw new Error('Usage: node scripts/e2e-activity-idle.mjs --name <verify-app-instance>');
const paths = verifyPaths(name, root);
const directory = resolve(paths.dir, 'activity-idle', `attempt-${Date.now()}-${process.pid}`);
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
    'The created PersonaBot is visibly Idle with no sessions/actions; the same ID has idle activity and empty attention in the Host CLI.',
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
let captured = false;
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
  return value.slice(0, 2000);
};
const command = (args) => {
  const url = new URL(instance.url);
  const result = spawnSync(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', ...args, '--compact', '--timeout', '30'],
    {
      cwd: root,
      encoding: 'utf8',
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
  if (result.status !== 0) throw new Error(`cli-${args[0]}-${value.error?.code ?? 'failed'}`);
  run.actions.push({ command: ['deepseekbot', ...args], at: new Date().toISOString() });
  return value;
};
const authority = () => ({
  activity: command(['bot-activity', run.botId, '--limit', '20']),
  attention: command(['bot-attention', run.botId, '--limit', '20']),
  overview: command(['activity-overview']),
});
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
const capturePage = async () => {
  if (captured) return;
  captured = true;
  await Promise.allSettled([
    (async () => {
      if (page) save('activity.png', Buffer.from(await page.screenshot({ waitForFonts: false })));
    })(),
    (async () => {
      if (page) save('aria.json', await page.accessibility.snapshot({ interestingOnly: false }));
    })(),
    (async () => {
      save('diagnostics.json', await captureDiagnostics());
    })(),
    (async () => {
      save('console.json', errors);
    })(),
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
  stage = 'create-idle-PersonaBot';
  const created = command([
    'create',
    '--name',
    `AX idle ${Date.now()}`,
    '--persona',
    'Isolated Activity Center verification. No messages or schedules are submitted.',
  ]);
  run.botId = created.bot?.id;
  save('created.json', { bot: created.bot, steps: created.steps, outcome: created.outcome });
  if (!run.botId) throw new Error('creation-outcome-unknown-do-not-retry');
  const before = authority();
  save('before.json', before);
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
  for (let round = 0; round < 6; round++) {
    for (const label of ['Continue', 'Configure later', 'Skip tutorial']) {
      const handle = await page.$(`::-p-aria([name=${JSON.stringify(label)}][role="button"])`);
      if (handle && (await handle.isVisible())) await handle.click();
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  stage = 'enter-Bot-mode';
  await click('Bot mode');
  await page.waitForSelector('.bh-mode-sidebar', { visible: true, timeout: 30_000 });
  await page.keyboard.press('Escape');
  stage = 'open-Activity-Center';
  const card = '.bh-mode-sidebar [data-pinned-panel="activity-center"]';
  await page.waitForSelector(`${card}:not([aria-disabled])`, { timeout: 20_000 });
  const label = await page.$eval(card, (element) => element.getAttribute('aria-label'));
  if (await page.$eval(card, (element) => element.getAttribute('aria-pressed') !== 'true'))
    await click(label);
  await page.waitForSelector('.bh-overview', { visible: true, timeout: 20_000 });
  for (const title of ['Close Sessions', 'Close Bot Inbox']) {
    const button = await page.$(`::-p-aria([name=${JSON.stringify(title)}][role="button"])`);
    if (button && (await button.isVisible())) await click(title);
  }
  stage = 'show-idle-Bots';
  if (
    await page.$eval(
      'button[aria-label="Show idle Bots"]',
      (element) => element.getAttribute('aria-pressed') !== 'true',
    )
  )
    await click('Show idle Bots');
  await page.waitForFunction(
    (id) =>
      [...document.querySelectorAll('.bh-overview-bot')].some(
        (element) => element.getAttribute('data-bot-id') === id,
      ),
    { timeout: 20_000 },
    run.botId,
  );
  const cardSelector = `.bh-overview-bot[data-bot-id="${run.botId}"]`;
  await (await page.$(cardSelector)).scrollIntoView();
  await new Promise((done) => setTimeout(done, 500));
  const readVisible = () =>
    page.$eval(cardSelector, (element) => ({
      botId: element.getAttribute('data-bot-id'),
      name: element.querySelector('.bh-overview-bot-name')?.textContent?.trim(),
      state: element.querySelector('.bh-overview-bot-state')?.textContent?.trim(),
      hasActions: element.querySelector('.bh-overview-bot-actions') !== null,
      sessions: element.querySelectorAll('.bh-overview-session-state').length,
      rendered:
        element.checkVisibility() &&
        element.getBoundingClientRect().width > 0 &&
        element.getBoundingClientRect().height > 0 &&
        element.getBoundingClientRect().top >= 0 &&
        element.getBoundingClientRect().bottom <= innerHeight,
    }));
  const visible = await readVisible();
  save('visible-before.json', visible);
  stage = 'confirm-authoritative-state';
  const after = authority();
  save('after.json', after);
  await page.waitForFunction(
    () => window.__BOTHARNESS_CLIENT_DIAGNOSTICS__?.snapshot().state === 'shell-ready',
    { timeout: 15_000 },
  );
  await new Promise((done) => setTimeout(done, 1500));
  await capturePage();
  if (!(await page.$(`.bh-overview-bot[data-bot-id="${run.botId}"]`)))
    throw new Error('idle-card-disappeared-during-evidence-capture');
  const finalVisible = await readVisible();
  save('visible.json', finalVisible);
  const diagnostics = JSON.parse(readFileSync(resolve(directory, 'diagnostics.json'), 'utf8'));
  const problems = idleProblems({
    botId: run.botId,
    before,
    after,
    visible: finalVisible,
    diagnostics,
    console: errors,
  });
  if (problems.length) throw new Error(problems.join('; '));
  run.status = 'pass';
  run.actual = `${run.botId}: visible Idle, CLI idle, zero attention, sessions and actions.`;
} catch (error) {
  run.status = stage === 'preconditions' ? 'blocked' : 'fail';
  run.reason = `${stage}: ${redact(error.message)}`;
  run.actual = run.reason;
  save('failure.json', { stage, reason: run.reason, botId: run.botId ?? null });
  await capturePage();
} finally {
  await browser?.close().catch(() => {
    run.status = 'fail';
    run.reason = 'browser-cleanup-failed';
  });
  run.finishedAt = new Date().toISOString();
  writeFileSync(resolve(directory, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, {
    mode: 0o600,
  });
  const row = coverageRow(directory, run.commit, run.dirty);
  writeFileSync(resolve(directory, 'coverage.md'), markdownRow(row), { mode: 0o600 });
  console.log(JSON.stringify({ ...row, directory }, null, 2));
  process.exitCode = row.status === 'pass' ? 0 : 1;
}
