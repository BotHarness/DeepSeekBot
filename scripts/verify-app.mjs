#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { diagnosticVerdict, readClientDiagnostics } from './dev-client-diagnostics.mjs';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const usage = `Usage: node scripts/verify-app.mjs <command> [--name <instance>] [options]

Drive an isolated DeepSeekBot instance the way a user does and keep the evidence.

Commands:
  launch [--port <n>] [--build]   Start an isolated DSH Host through dev-instance.mjs.
  doctor                          Check that the recorded instance is ours, alive and authenticated.
  observe                         Save Host health and browser-reported Client diagnostics as JSON.
  rpc <namespace/method> [json]   Call one authenticated /api method with JSON args.
  shot <label> [shot options]     Open the Web Client, act, then save a screenshot and ARIA snapshot.
  stop                            Stop the recorded Host and delete its temporary DSH_HOME.

Shot options:
  --bot-mode                Enter Bot mode before acting.
  --click <name>            Click the element with this accessible name (repeatable, in order).
  --click-text <text>       Click the last visible button, link or tab in page order whose text contains this.
  --right-click <name>      Right-click the element with this accessible name to open its context menu.
  --fill <name>=<text>      Type into the field with this accessible name (repeatable, in order).
  --hover <name>            Rest the pointer on the element with this accessible name (repeatable, in order).
  --press <key>             Press a key or chord in the focused element, for example Enter or Control+K
                            (repeatable, in order).
  --wait <name>             Wait until an element with this accessible name exists before the capture.
  --wait-text <text>        Wait until the page shows this text (for example a Bot reply), up to 180s.
  --theme light|dark        Color scheme (default light).
  --locale en|zh            Browser language (default en).
  --size <w>x<h>            Viewport (default 1440x900).
  --keep-overlays           Do not dismiss the preview notice, API key prompt or tutorial.

State lives in .humanlayer/verify/<name>/ (default name: default). instance.json there is the
dev-instance JSON, so scripts that read BH_E2E_INSTANCE can use it directly. Evidence goes to
.humanlayer/verify/<name>/evidence/ and survives stop.`;

export function parseVerifyArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    name: 'default',
    positional: [],
    actions: [],
    waits: [],
    waitTexts: [],
    theme: 'light',
    locale: 'en',
    width: 1440,
    height: 900,
    botMode: false,
    keepOverlays: false,
    build: false,
    port: undefined,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = () => {
      const next = rest[++index];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case '--name':
        options.name = value();
        if (!/^[a-z0-9][a-z0-9-]*$/u.test(options.name))
          throw new Error('--name must be lowercase letters, digits and dashes');
        break;
      case '--port':
        options.port = Number(value());
        if (!Number.isInteger(options.port)) throw new Error('--port must be an integer');
        break;
      case '--build':
        options.build = true;
        break;
      case '--bot-mode':
        options.botMode = true;
        break;
      case '--keep-overlays':
        options.keepOverlays = true;
        break;
      case '--click':
        options.actions.push({ kind: 'click', name: value() });
        break;
      case '--click-text':
        options.actions.push({ kind: 'click-text', name: value() });
        break;
      case '--right-click':
        options.actions.push({ kind: 'right-click', name: value() });
        break;
      case '--press':
        options.actions.push({ kind: 'press', name: value() });
        break;
      case '--hover':
        options.actions.push({ kind: 'hover', name: value() });
        break;
      case '--fill': {
        const pair = value();
        const split = pair.indexOf('=');
        if (split < 1) throw new Error('--fill needs <name>=<text>');
        options.actions.push({
          kind: 'fill',
          name: pair.slice(0, split),
          text: pair.slice(split + 1),
        });
        break;
      }
      case '--wait':
        options.waits.push(value());
        break;
      case '--wait-text':
        options.waitTexts.push(value());
        break;
      case '--theme':
        options.theme = value();
        if (!['light', 'dark'].includes(options.theme)) throw new Error('--theme is light or dark');
        break;
      case '--locale':
        options.locale = value();
        if (!['en', 'zh'].includes(options.locale)) throw new Error('--locale is en or zh');
        break;
      case '--size': {
        const match = /^(\d+)x(\d+)$/u.exec(value());
        if (match === null) throw new Error('--size needs <width>x<height>');
        options.width = Number(match[1]);
        options.height = Number(match[2]);
        break;
      }
      default:
        if (flag.startsWith('--')) throw new Error(`unknown option ${flag}`);
        options.positional.push(flag);
    }
  }
  return options;
}

export function verifyPaths(name, root = repoRoot) {
  const dir = join(root, '.humanlayer', 'verify', name);
  return {
    dir,
    instance: join(dir, 'instance.json'),
    evidence: join(dir, 'evidence'),
    home: join(tmpdir(), `bh-verify-${name}`),
  };
}

function cookieFor(home) {
  const jar = join(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`);
  if (!existsSync(jar)) throw new Error(`no login cookie at ${jar}; relaunch the instance`);
  return readFileSync(jar, 'utf8').split(';')[0];
}

function readInstance(paths) {
  if (!existsSync(paths.instance))
    throw new Error(`no instance recorded at ${paths.instance}; run launch first`);
  return JSON.parse(readFileSync(paths.instance, 'utf8'));
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

export async function rpc(instance, endpoint, args = {}) {
  const origin = new URL(instance.url).origin;
  const response = await fetch(`${origin}/api/${endpoint}`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: {
      'content-type': 'application/json',
      cookie: cookieFor(instance.home),
    },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `verify-${Date.now()}`,
      method: endpoint,
      payload: { args },
    }),
  });
  const envelope = await response.json().catch(() => undefined);
  if (response.status !== 200 || envelope?.result?.ok !== true) {
    const code = envelope?.result?.error?.code ?? 'invalid-response';
    throw new Error(`${endpoint} failed: HTTP ${response.status}, ${code}`);
  }
  return envelope.result.value;
}

async function launch(options, paths) {
  if (existsSync(paths.instance)) {
    const previous = readInstance(paths);
    if (alive(previous.pid))
      throw new Error(
        `instance ${options.name} is already running (pid ${previous.pid}); stop it first`,
      );
  }
  mkdirSync(paths.evidence, { recursive: true });
  const port = options.port ?? (await freePort());
  const args = ['scripts/dev-instance.mjs', '--home', paths.home, '--port', String(port), '--json'];
  if (options.build) args.push('--build');
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new Error(`dev-instance.mjs did not complete: ${result.error.message}`);
  const start = (result.stdout ?? '').indexOf('{');
  if (result.status !== 0 || start < 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error(`dev-instance.mjs failed with status ${result.status}`);
  }
  const instance = JSON.parse(result.stdout.slice(start));
  writeFileSync(paths.instance, `${JSON.stringify(instance, null, 2)}\n`, {
    mode: 0o600,
  });
  return {
    name: options.name,
    pid: instance.pid,
    origin: new URL(instance.url).origin,
    model: instance.secret,
    health: instance.health,
    instance: paths.instance,
    evidence: paths.evidence,
    log: instance.log,
  };
}

async function doctor(paths) {
  const instance = readInstance(paths);
  const expected = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).devDependencies[
    '@deepseek-ai/dsh'
  ];
  const checks = {
    pidAlive: alive(instance.pid),
    worktree: instance.worktree === repoRoot,
  };
  checks.dshVersion = JSON.parse(
    readFileSync(join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'),
  ).version;
  checks.dshVersionMatches = checks.dshVersion === expected;
  try {
    const bots = await rpc(instance, 'botharness/list');
    checks.authenticatedApi = true;
    checks.botCount = Array.isArray(bots) ? bots.length : (bots?.bots?.length ?? null);
  } catch (error) {
    checks.authenticatedApi = false;
    checks.apiError = error.message;
  }
  checks.model = instance.secret;
  checks.ok =
    checks.pidAlive && checks.worktree && checks.dshVersionMatches && checks.authenticatedApi;
  return checks;
}

export async function collectObservation({ health, diagnostics }) {
  const [hostResult, clientResult] = await Promise.allSettled([health(), diagnostics()]);
  const host =
    hostResult.status === 'fulfilled'
      ? hostResult.value
      : { ok: false, reason: 'health-check-unavailable' };
  const client =
    clientResult.status === 'fulfilled'
      ? { ...diagnosticVerdict(clientResult.value), report: clientResult.value }
      : { state: 'unavailable', exitCode: 2, reason: 'client-diagnostics-unavailable' };
  const exitCode = !host.ok ? 1 : client.exitCode;
  return {
    version: 1,
    observedAt: new Date().toISOString(),
    state: exitCode === 0 ? 'shell-observed' : exitCode === 1 ? 'failed' : 'incomplete',
    exitCode,
    host,
    client,
    verification: 'unverified: drive the feature, inspect visible evidence and canonical state',
  };
}

async function observe(paths) {
  const instance = readInstance(paths);
  const result = await collectObservation({
    health: () => doctor(paths),
    diagnostics: () => readClientDiagnostics(instance),
  });
  mkdirSync(paths.evidence, { recursive: true });
  const evidence = join(paths.evidence, `observe-${result.observedAt.replace(/[:.]/gu, '-')}.json`);
  writeFileSync(evidence, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  return { ...result, evidence };
}

function loadPuppeteer() {
  const store = join(repoRoot, 'node_modules', '.pnpm');
  const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
  if (entry === undefined) throw new Error('puppeteer is not installed; run pnpm install');
  return createRequire(join(store, entry, 'node_modules', '/'))('puppeteer');
}

const overlayButtons = [
  'Continue',
  '继续',
  'Configure later',
  '稍后配置',
  'Skip tutorial',
  '跳过教程',
];

async function dismissOverlays(page) {
  for (let round = 0; round < 4; round += 1) {
    const clicked = await page.evaluate((labels) => {
      const button = [...document.querySelectorAll('button')].find(
        (node) => labels.includes(node.textContent?.trim() ?? '') && node.offsetParent !== null,
      );
      button?.click();
      return button?.textContent?.trim() ?? null;
    }, overlayButtons);
    if (clicked === null) return;
    await new Promise((done) => setTimeout(done, 400));
  }
}

const aria = (name) => `::-p-aria(${JSON.stringify(name)})`;

function renderAria(node, depth = 0, lines = []) {
  if (node === null || node === undefined) return lines;
  const label = node.name ? ` ${JSON.stringify(node.name.slice(0, 120))}` : '';
  const state = ['checked', 'pressed', 'expanded', 'selected', 'disabled']
    .filter((key) => node[key] !== undefined && node[key] !== false)
    .map((key) => `${key}=${node[key]}`)
    .join(' ');
  if (node.role !== 'none' && (label || node.role !== 'generic'))
    lines.push(`${'  '.repeat(depth)}${node.role}${label}${state ? ` [${state}]` : ''}`);
  for (const child of node.children ?? []) renderAria(child, depth + 1, lines);
  return lines;
}

async function shot(options, paths) {
  const [label] = options.positional;
  if (!label || !/^[a-z0-9][a-z0-9-]*$/u.test(label))
    throw new Error('shot needs a label of lowercase letters, digits and dashes');
  const instance = readInstance(paths);
  if (!alive(instance.pid))
    throw new Error('recorded Host is not running; run doctor, then launch');
  mkdirSync(paths.evidence, { recursive: true });
  const lang = options.locale === 'zh' ? 'zh-CN' : 'en-US';
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 240_000,
    args: ['--no-sandbox', `--lang=${lang}`],
  });
  const consoleLines = [];
  const steps = [];
  let page;
  try {
    page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'accept-language': lang });
    await page.setViewport({
      width: options.width,
      height: options.height,
      deviceScaleFactor: 1,
    });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: options.theme }]);
    page.on('console', (message) => {
      if (['error', 'warn'].includes(message.type()))
        consoleLines.push(`${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleLines.push(`pageerror: ${error.message}`));
    await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
    await page.goto(instance.url, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((node) =>
          ['Settings', '设置'].includes(node.textContent?.trim() ?? ''),
        ),
      { timeout: 30_000 },
    );
    if (!options.keepOverlays) await dismissOverlays(page);
    if (options.botMode) {
      if ((await page.$('.bh-root.bh-main')) === null) await page.locator(aria('Bot mode')).click();
      await page.waitForSelector('.bh-root.bh-main', { timeout: 30_000 });
      steps.push('entered Bot mode');
      await new Promise((done) => setTimeout(done, 1500));
    }
    if (options.theme === 'dark')
      await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
    for (const action of options.actions) {
      if (!options.keepOverlays) await dismissOverlays(page);
      if (action.kind === 'press') {
        const keys = action.name.length > 1 ? action.name.split('+') : [action.name];
        const key = keys.pop();
        for (const modifier of keys) await page.keyboard.down(modifier);
        await page.keyboard.press(key);
        for (const modifier of keys.reverse()) await page.keyboard.up(modifier);
      } else if (action.kind === 'click-text') {
        const handle = await page.waitForFunction(
          (text) =>
            [
              ...document.querySelectorAll(
                'button, a, [role="button"], [role="tab"], [role="option"]',
              ),
            ]
              .filter((node) => node.offsetParent !== null && node.textContent?.includes(text))
              .at(-1),
          { timeout: 15_000 },
          action.name,
        );
        await handle.asElement().click();
      } else {
        const locator = page.locator(aria(action.name)).setTimeout(15_000);
        if (action.kind === 'click') await locator.click();
        else if (action.kind === 'hover') await locator.hover();
        else if (action.kind === 'right-click') await locator.click({ button: 'right' });
        else await locator.fill(action.text);
      }
      steps.push(`${action.kind} ${JSON.stringify(action.name)}`);
      await new Promise((done) => setTimeout(done, 500));
    }
    if (!options.keepOverlays) await dismissOverlays(page);
    for (const name of options.waits) {
      await page.waitForSelector(aria(name), { timeout: 30_000 });
      steps.push(`saw ${JSON.stringify(name)}`);
    }
    for (const text of options.waitTexts) {
      await page.waitForFunction(
        (text) => document.body.innerText.includes(text),
        { timeout: 180_000 },
        text,
      );
      steps.push(`saw text ${JSON.stringify(text)}`);
    }
    await new Promise((done) => setTimeout(done, 300));
    const png = join(paths.evidence, `${label}.png`);
    const tree = join(paths.evidence, `${label}.aria.txt`);
    const log = join(paths.evidence, `${label}.console.txt`);
    await page.screenshot({ path: png, waitForFonts: false });
    const snapshot = await page.accessibility.snapshot({
      interestingOnly: true,
    });
    writeFileSync(tree, `${renderAria(snapshot).join('\n')}\n`);
    writeFileSync(log, consoleLines.length ? `${consoleLines.join('\n')}\n` : '');
    return {
      label,
      steps,
      screenshot: png,
      aria: tree,
      console: log,
      consoleIssues: consoleLines.length,
    };
  } catch (error) {
    const failure = join(paths.evidence, `${label}.failure.png`);
    await page?.screenshot({ path: failure, waitForFonts: false }).catch(() => undefined);
    try {
      const snapshot = await page?.accessibility
        .snapshot({ interestingOnly: true })
        .catch(() => null);
      writeFileSync(
        join(paths.evidence, `${label}.failure.aria.txt`),
        `${renderAria(snapshot).join('\n')}\n`,
      );
      writeFileSync(join(paths.evidence, `${label}.console.txt`), consoleLines.join('\n'));
    } catch {}
    throw new Error(`${error.message} after [${steps.join('; ')}]; see ${failure}`);
  } finally {
    await browser.close();
  }
}

async function stop(paths) {
  const instance = readInstance(paths);
  if (alive(instance.pid)) process.kill(instance.pid, 'SIGTERM');
  const deadline = Date.now() + 15_000;
  while (alive(instance.pid) && Date.now() < deadline)
    await new Promise((done) => setTimeout(done, 200));
  if (alive(instance.pid)) throw new Error(`pid ${instance.pid} did not stop`);
  if (instance.home === paths.home && basename(paths.home).startsWith('bh-verify-'))
    rmSync(paths.home, { recursive: true, force: true });
  rmSync(paths.instance);
  return {
    stopped: instance.pid,
    evidence: paths.evidence,
    evidenceKept: existsSync(paths.evidence),
  };
}

async function main() {
  const options = parseVerifyArgs(process.argv.slice(2));
  const paths = verifyPaths(options.name);
  let result;
  switch (options.command) {
    case 'launch':
      result = await launch(options, paths);
      break;
    case 'doctor':
      result = await doctor(paths);
      break;
    case 'observe':
      result = await observe(paths);
      break;
    case 'rpc': {
      const [endpoint, json] = options.positional;
      if (!endpoint?.includes('/')) throw new Error('rpc needs <namespace/method>');
      result = await rpc(readInstance(paths), endpoint, json === undefined ? {} : JSON.parse(json));
      break;
    }
    case 'shot':
      result = await shot(options, paths);
      break;
    case 'stop':
      result = await stop(paths);
      break;
    default:
      console.log(usage);
      process.exit(options.command === undefined || options.command === '--help' ? 0 : 2);
  }
  console.log(JSON.stringify(result, null, 2));
  if (options.command === 'doctor' && !result.ok) process.exit(1);
  if (options.command === 'observe') process.exitCode = result.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`verify-app: ${error.message}`);
    process.exit(1);
  });
}
