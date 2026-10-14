import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyPaths } from './verify-app.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const mobile = join(root, 'apps/mobile');
const flows = join(mobile, '.maestro/sim');
export const BUNDLE_ID = 'ai.botharness.deepseekbot.dev';
export const DEVICE_NAME = 'BotHarness e2e';
const buildCache = join(homedir(), 'Library/Caches/botharness/mobile-sim');

export function parseArgs(argv) {
  const options = { app: undefined, keep: false, approval: true, device: 'iPhone 16' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--keep') options.keep = true;
    else if (flag === '--no-approval') options.approval = false;
    else if (flag === '--app' || flag === '--device') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
      options[flag.slice(2)] = flag === '--app' ? resolve(value) : value;
      index += 1;
    } else throw new Error(`unknown flag ${flag}`);
  }
  return options;
}

export function pickSimulator(list, deviceName) {
  const runtime = (list.runtimes ?? [])
    .filter((entry) => entry.isAvailable && entry.platform === 'iOS')
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  if (runtime === undefined)
    throw new Error('no available iOS Simulator runtime; install one in Xcode');
  const type =
    (list.devicetypes ?? []).find((entry) => entry.name === deviceName) ??
    (runtime.supportedDeviceTypes ?? []).find((entry) => entry.productFamily === 'iPhone');
  if (type === undefined) throw new Error(`no ${deviceName} device type`);
  return { runtime: runtime.identifier, deviceType: type.identifier, runtimeName: runtime.name };
}

export function reusableDevice(list, { runtime, deviceType }) {
  return (list.devices?.[runtime] ?? []).find(
    (entry) =>
      entry.name === DEVICE_NAME &&
      entry.deviceTypeIdentifier === deviceType &&
      entry.isAvailable !== false,
  )?.udid;
}

export function derivedDataFolder(appPath) {
  const parts = appPath.split(sep);
  const index = parts.lastIndexOf('DerivedData');
  return index === -1 || index + 1 >= parts.length - 1
    ? undefined
    : parts.slice(0, index + 2).join(sep);
}

async function nativeFingerprint() {
  const expo = createRequire(join(mobile, 'package.json')).resolve('expo/package.json');
  const { createFingerprintAsync } = createRequire(expo)('@expo/fingerprint');
  return (await createFingerprintAsync(mobile)).hash;
}

function cachedApp(hash) {
  const folder = join(buildCache, hash);
  if (!existsSync(folder)) return undefined;
  const app = readdirSync(folder).find((name) => name.endsWith('.app'));
  return app === undefined ? undefined : join(folder, app);
}

function cacheBuild(hash, app) {
  rmSync(buildCache, { recursive: true, force: true });
  const target = join(buildCache, hash, basename(app));
  mkdirSync(dirname(target), { recursive: true });
  cpSync(app, target, { recursive: true, verbatimSymlinks: true });
  const derived = derivedDataFolder(app);
  if (derived !== undefined) rmSync(derived, { recursive: true, force: true });
  return target;
}

function compareVersions(a, b) {
  const left = String(a).split('.').map(Number);
  const right = String(b).split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function renamePairingLink(link, hostName) {
  const payload = JSON.parse(
    Buffer.from(new URL(link).searchParams.get('p') ?? '', 'base64url').toString('utf8'),
  );
  payload.host.name = hostName;
  return {
    hostId: payload.host.id,
    link: `deepseekbot://pair?p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`,
  };
}

export function pushPayload({ title, body, badge, data }) {
  return {
    'Simulator Target Bundle': BUNDLE_ID,
    aps: {
      ...(title === undefined ? {} : { alert: { title, body } }),
      ...(title === undefined ? {} : { sound: 'default' }),
      ...(badge === undefined ? {} : { badge }),
    },
    body: { v: 1, ...data },
  };
}

export function missingTools({ which, javaHome }) {
  const missing = [];
  if (!which('xcrun')) missing.push('Xcode command line tools (xcode-select --install)');
  if (!which('maestro'))
    missing.push('Maestro: curl -fsSL "https://get.maestro.mobile.dev" | bash');
  if (javaHome === undefined)
    missing.push('Java 17 or later for Maestro: brew install openjdk@21, then set JAVA_HOME');
  return missing;
}

function findMaestro() {
  const local = join(homedir(), '.maestro/bin/maestro');
  if (existsSync(local)) return local;
  const found = spawnSync('which', ['maestro'], { encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim() : undefined;
}

function findJavaHome() {
  for (const candidate of [
    process.env['JAVA_HOME'],
    '/opt/homebrew/opt/openjdk@21',
    '/opt/homebrew/opt/openjdk@17',
    '/opt/homebrew/opt/openjdk',
    '/usr/local/opt/openjdk@21',
  ]) {
    if (candidate !== undefined && existsSync(join(candidate, 'bin/java'))) return candidate;
  }
  const found = spawnSync('/usr/libexec/java_home', ['-v', '17+'], { encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim() : undefined;
}

async function freePort() {
  const server = createNetServer();
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const redact = (text) => String(text).replace(/\?token=[^\s"']+/gu, '?token=<redacted>');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')} failed: ${redact(`${result.stdout}${result.stderr}`).slice(-1200)}`,
    );
  return result.stdout;
}

class IsolatedHost {
  constructor(label, port) {
    this.label = label;
    this.port = port;
    this.home = mkdtempSync(join(tmpdir(), `bh-e2e-sim-${label}-`));
    this.origin = `http://127.0.0.1:${port}`;
  }

  launch() {
    const out = run(
      process.execPath,
      ['scripts/dev-instance.mjs', '--home', this.home, '--port', String(this.port), '--json'],
      { cwd: root, timeout: 900_000 },
    );
    this.instance = JSON.parse(out.slice(out.indexOf('{')));
    if (this.instance.health?.ok !== true) throw new Error(`Host ${this.label} is not healthy`);
  }

  cookie() {
    const jar = join(
      tmpdir(),
      `dsh-${basename(this.home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
    );
    return readFileSync(jar, 'utf8').split(';')[0];
  }

  async post(path, body) {
    const send = () =>
      fetch(`${this.origin}${path}`, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { 'content-type': 'application/json', cookie: this.cookie() },
        body: JSON.stringify(body),
      });
    const response = await send()
      .catch(send)
      .catch((error) => {
        throw new Error(`Host ${this.label} ${path}: ${String(error.cause ?? error)}`);
      });
    const value = await response.json().catch(() => undefined);
    if (response.status !== 200) throw new Error(`${path} answered ${response.status}`);
    return value;
  }

  async rpc(method, args = {}) {
    const envelope = await this.post(`/api/botharness/${method}`, {
      type: 'client-request',
      rpcId: `mobile-sim-${Date.now()}`,
      method: `botharness/${method}`,
      payload: { args },
    });
    if (envelope?.result?.ok !== true)
      throw new Error(`botharness/${method} failed: ${envelope?.result?.error?.code ?? 'invalid'}`);
    return envelope.result.value;
  }

  async offer() {
    return (await this.post('/api/botharness/devices/offer', { origin: this.origin })).link;
  }

  async stop() {
    const pid = this.instance?.pid;
    if (pid === undefined) return;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return;
    }
    for (let i = 0; i < 100; i += 1) {
      try {
        process.kill(pid, 0);
      } catch {
        return;
      }
      await sleep(100);
    }
    process.kill(pid, 'SIGKILL');
  }
}

async function until(read, what, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(2000);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.platform !== 'darwin') throw new Error('the iOS Simulator journey needs a Mac');
  const maestro = findMaestro();
  const javaHome = findJavaHome();
  const missing = missingTools({
    which: (tool) =>
      tool === 'maestro' ? maestro !== undefined : spawnSync('which', [tool]).status === 0,
    javaHome,
  });
  if (missing.length > 0) throw new Error(`missing tools:\n- ${missing.join('\n- ')}`);

  const paths = verifyPaths('mobile-sim');
  rmSync(paths.evidence, { recursive: true, force: true });
  mkdirSync(paths.evidence, { recursive: true });
  const steps = [];
  const checks = {};
  const cleanups = [];
  let udid;

  const shot = (label) =>
    run('xcrun', [
      'simctl',
      'io',
      udid,
      'screenshot',
      '--type=png',
      join(paths.evidence, `${label}.png`),
    ]);
  const flow = async (label, file, env = {}) => {
    const args = [
      '--device',
      udid,
      'test',
      '--platform',
      'ios',
      '--debug-output',
      join(paths.evidence, 'maestro', label),
    ];
    for (const [key, value] of Object.entries(env)) args.push('-e', `${key}=${value}`);
    args.push(join(flows, file));
    const child = spawn(maestro, args, {
      env: { ...process.env, JAVA_HOME: javaHome, MAESTRO_CLI_NO_ANALYTICS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => child.kill('SIGTERM'), 300_000);
    const status = await new Promise((done) => child.on('close', done));
    clearTimeout(timer);
    writeFileSync(join(paths.evidence, `${label}.maestro.txt`), output);
    shot(label);
    const ok = status === 0;
    checks[label] = ok;
    if (!ok)
      throw new Error(`Maestro flow ${file} failed; see ${label}.maestro.txt and ${label}.png`);
  };

  try {
    const sim = pickSimulator(
      JSON.parse(run('xcrun', ['simctl', 'list', '-j', 'runtimes', 'devicetypes'])),
      options.device,
    );
    const existing = reusableDevice(
      JSON.parse(run('xcrun', ['simctl', 'list', '-j', 'devices'])),
      sim,
    );
    if (existing === undefined) {
      udid = run('xcrun', ['simctl', 'create', DEVICE_NAME, sim.deviceType, sim.runtime]).trim();
    } else {
      udid = existing;
      spawnSync('xcrun', ['simctl', 'shutdown', udid]);
      run('xcrun', ['simctl', 'erase', udid]);
    }
    cleanups.push(() => {
      if (options.keep) return;
      spawnSync('xcrun', ['simctl', 'shutdown', udid]);
    });
    run('xcrun', ['simctl', 'boot', udid]);
    steps.push(
      `${existing === undefined ? 'created' : 'erased'} and booted ${DEVICE_NAME} on ${sim.runtimeName} (${udid})`,
    );

    const metroPort = await freePort();
    const metroLog = join(paths.evidence, 'metro.log');
    writeFileSync(metroLog, '');
    const metro = spawn('npx', ['expo', 'start', '--dev-client', '--port', String(metroPort)], {
      cwd: mobile,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    const appendMetro = (chunk) => writeFileSync(metroLog, chunk, { flag: 'a' });
    metro.stdout.on('data', appendMetro);
    metro.stderr.on('data', appendMetro);
    cleanups.push(() => {
      if (options.keep) return;
      try {
        process.kill(-metro.pid, 'SIGTERM');
      } catch {}
    });
    await until(
      async () => {
        const status = await fetch(`http://127.0.0.1:${metroPort}/status`)
          .then((response) => response.text())
          .catch(() => '');
        return status.includes('packager-status:running') ? true : undefined;
      },
      'Metro',
      180_000,
    );
    steps.push(`started Metro on port ${metroPort}`);

    const hash = options.app === undefined ? await nativeFingerprint() : undefined;
    const reuse = options.app ?? cachedApp(hash);
    if (reuse !== undefined) {
      run('xcrun', ['simctl', 'install', udid, reuse]);
      steps.push(`installed ${reuse} without building`);
    } else {
      rmSync(join(mobile, 'ios'), { recursive: true, force: true });
      const built = run('npx', ['expo', 'run:ios', '--device', udid, '--no-bundler'], {
        cwd: mobile,
        timeout: 3_600_000,
        env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', CI: '1' },
      });
      const app = /Installing (\S+\.app)/u.exec(built)?.[1];
      if (app === undefined) throw new Error('expo run:ios did not say which .app it installed');
      steps.push(`built the development build and cached it at ${cacheBuild(hash, app)}`);
    }

    const hosts = [
      new IsolatedHost('a', await freePort()),
      new IsolatedHost('b', await freePort()),
    ];
    for (const host of hosts) {
      cleanups.push(async () => {
        if (options.keep) return;
        await host.stop();
        rmSync(host.home, { recursive: true, force: true });
      });
      host.launch();
    }
    const [a, b] = hosts;
    a.name = 'Mac A';
    b.name = 'Mac B';
    a.bot = (await a.rpc('create', { displayName: 'Ada', roles: ['research'] })).bot;
    b.bot = (await b.rpc('create', { displayName: 'Bea', roles: ['research'] })).bot;
    steps.push('launched two isolated Hosts with PersonaBots Ada (Mac A) and Bea (Mac B)');

    const payloads = new Map();
    const trigger = createServer((req, res) => {
      const name = decodeURIComponent((req.url ?? '').replace(/^\/push\//u, ''));
      const payload = payloads.get(name);
      if (req.method !== 'POST' || payload === undefined) return res.writeHead(404).end();
      const file = join(paths.evidence, `${name}.apns`);
      writeFileSync(file, JSON.stringify(payload, null, 2));
      const pushed = spawnSync('xcrun', ['simctl', 'push', udid, BUNDLE_ID, file]);
      res.writeHead(pushed.status === 0 ? 200 : 500).end();
    });
    const triggerPort = await freePort();
    await new Promise((done) => trigger.listen(triggerPort, '127.0.0.1', done));
    cleanups.push(() => trigger.close());
    const open = (label, name, payload, expect) => {
      payloads.set(name, payload);
      return flow(label, 'open-notification.yaml', {
        TRIGGER: `http://127.0.0.1:${triggerPort}`,
        NAME: name,
        EXPECT: expect,
      });
    };

    await flow('1-open-dev-client', 'open-dev-client.yaml', {
      METRO_URL: encodeURIComponent(`http://127.0.0.1:${metroPort}`),
    });
    for (const [index, host] of hosts.entries()) {
      const pairing = renamePairingLink(await host.offer(), host.name);
      host.id = pairing.hostId;
      await flow(`2${'ab'[index]}-pair-${host.label}`, 'pair-deep-link.yaml', {
        LINK: pairing.link,
        HOST: host.name,
        BOT: host.bot.displayName,
      });
    }
    steps.push('paired with both Hosts by deep link');

    await flow('3-notifications-unavailable', 'notifications-screen.yaml', {
      EXPECT: 'This build of the app cannot receive notifications.',
    });
    steps.push(
      'Me → Notifications says this build cannot receive notifications (no EAS projectId)',
    );
    await flow('4a-switch-from-header', 'switch-computer.yaml', {
      FROM: b.name,
      TO: a.name,
      BOT: a.bot.displayName,
      OTHER_BOT: b.bot.displayName,
    });
    await flow('4b-switch-from-me', 'switch-computer-from-me.yaml', {
      FROM: a.name,
      TO: b.name,
      BOT: b.bot.displayName,
    });
    steps.push('switched computers from the Home header and from Me → Computers');

    if (options.approval) {
      const marker = join(tmpdir(), `bh-e2e-sim-${Date.now()}.txt`);
      cleanups.push(() => rmSync(marker, { force: true }));
      const since = new Date().toISOString();
      await a.rpc('channelSend', {
        channelId: `dm-${a.bot.slug}`,
        body: `Use your bash tool now to run exactly: echo approved > ${marker}`,
        messageId: `human-${crypto.randomUUID()}`,
      });
      const item = await until(async () => {
        const { items } = await a.rpc('humanAttention', { category: 'action' });
        const found = items.find(
          (entry) => entry.kind === 'tool-approval' && entry.createdAt > since,
        );
        if (found !== undefined) return found;
        const { page } = await a.rpc('channelTimeline', { channelId: `dm-${a.bot.slug}` });
        const failure = page.entries.find(
          (entry) => entry.sessionFailure !== undefined && entry.at > since,
        );
        if (failure !== undefined)
          throw new Error(
            `${a.bot.displayName}'s session failed (${failure.sessionFailure.code}: ${failure.sessionFailure.detail}); fix the model or rerun with --no-approval`,
          );
        return undefined;
      }, 'a Tool approval on Mac A (this step needs a working model; skip it with --no-approval)');
      await open(
        '5a-tap-approval-other-host',
        'approval',
        pushPayload({
          title: a.bot.displayName,
          body: `${a.bot.displayName} needs your approval`,
          badge: 1,
          data: {
            hostId: a.id,
            itemId: item.id,
            kind: item.kind,
            botSlug: item.botSlug,
            channelId: item.channelId,
            messageId: item.messageId,
          },
        }),
        `${a.bot.displayName} wants to run bash`,
      );
      await flow('5b-allow-once', 'tap.yaml', { TEXT: 'Allow once' });
      checks.approvalRan = await until(
        () =>
          existsSync(marker) && readFileSync(marker, 'utf8').trim() === 'approved'
            ? true
            : undefined,
        'the approved command to run',
        120_000,
      );
      steps.push(
        'tapped a real approval for Mac A while showing Mac B: it switched, opened it, and Allow once ran the command',
      );
    }

    await open(
      '6a-tap-test-other-host',
      'test',
      pushPayload({
        title: 'Test notification',
        body: `From ${b.name}`,
        data: { hostId: b.id, test: true },
      }),
      '(?i)needs my action|需要我处理',
    );
    await flow('6b-showing-mac-b', 'assert-host.yaml', { HOST: b.name });
    await open(
      '6c-tap-badge-only-other-host',
      'badge',
      pushPayload({
        title: a.name,
        body: 'Requests are waiting',
        badge: 1,
        data: { hostId: a.id },
      }),
      '(?i)needs my action|需要我处理',
    );
    await flow('6d-showing-mac-a', 'assert-host.yaml', { HOST: a.name });
    steps.push('test and badge-only notifications switched computers and opened Activity');
  } finally {
    for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => {});
  }

  const pass = Object.values(checks).every(Boolean);
  process.stdout.write(
    `${JSON.stringify({ result: pass ? 'pass' : 'fail', checks, steps, evidence: paths.evidence }, null, 2)}\n`,
  );
  if (!pass) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
