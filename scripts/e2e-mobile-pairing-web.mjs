import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { createServer, request } from 'node:http';
import { createServer as createNetServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pnpmCommand } from './dev-package-manager.mjs';
import { verifyPaths } from './verify-app.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const skipExport = args.includes('--skip-export');
const keep = args.includes('--keep');
const dist = join(root, 'apps/mobile/dist-web');
const paths = verifyPaths('mobile-pairing-web');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-mobile-'));
const steps = [];
const checks = {};

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

const redact = (text) => String(text).replace(/\?token=[^\s"']+/gu, '?token=<redacted>');

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

function launch(port) {
  const result = spawnSync(
    process.execPath,
    ['scripts/dev-instance.mjs', '--home', home, '--port', String(port), '--json'],
    { cwd: root, encoding: 'utf8', timeout: 600_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const start = (result.stdout ?? '').indexOf('{');
  if (result.status !== 0 || start < 0)
    throw new Error(`dev-instance.mjs failed: ${redact(result.stderr ?? '').slice(-800)}`);
  const instance = JSON.parse(result.stdout.slice(start));
  if (instance.health?.ok !== true) throw new Error('isolated Host is not healthy');
  return instance;
}

async function stop(pid) {
  process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 100; i += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  process.kill(pid, 'SIGKILL');
}

function cookie() {
  const jar = join(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`);
  return readFileSync(jar, 'utf8').split(';')[0];
}

async function operator(hostOrigin, path, body) {
  const response = await fetch(`${hostOrigin}${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'content-type': 'application/json', cookie: cookie() },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => undefined);
  if (response.status !== 200) throw new Error(`${path} answered ${response.status}`);
  return value;
}

async function rpc(hostOrigin, method, rpcArgs = {}) {
  const envelope = await operator(hostOrigin, `/api/botharness/${method}`, {
    type: 'client-request',
    rpcId: `mobile-e2e-${Date.now()}`,
    method: `botharness/${method}`,
    payload: { args: rpcArgs },
  });
  if (envelope?.result?.ok !== true)
    throw new Error(`botharness/${method} failed: ${envelope?.result?.error?.code ?? 'invalid'}`);
  return envelope.result.value;
}

async function devices(hostOrigin) {
  const response = await fetch(`${hostOrigin}/api/botharness/devices`, {
    headers: { cookie: cookie() },
    signal: AbortSignal.timeout(30_000),
  });
  return (await response.json()).devices;
}

function phoneOrigin(state) {
  const forward = (req, res) => {
    if (req.headers.authorization?.startsWith('Device '))
      state.authorization = req.headers.authorization;
    const upstream = request(
      {
        host: '127.0.0.1',
        port: state.hostPort,
        method: req.method,
        path: req.url,
        headers: req.headers,
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  };
  const serveStatic = (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://phone').pathname);
    let file = normalize(join(dist, pathname));
    if (!file.startsWith(dist)) return res.writeHead(403).end();
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const html = `${file}.html`;
      file = existsSync(html) ? html : join(dist, 'index.html');
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  };
  const server = createServer((req, res) =>
    req.url.startsWith('/botharness-device/') ? forward(req, res) : serveStatic(req, res),
  );
  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/botharness-device/')) return socket.destroy();
    const upstream = connect(state.hostPort, '127.0.0.1', () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i];
        lines.push(`${name}: ${req.rawHeaders[i + 1]}`);
      }
      if (req.headers.authorization === undefined && state.authorization !== undefined)
        lines.push(`authorization: ${state.authorization}`);
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  return server;
}

function loadPuppeteer() {
  const store = join(root, 'node_modules', '.pnpm');
  const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
  if (entry === undefined) throw new Error('puppeteer is not installed; run pnpm install');
  return createRequire(join(store, entry, 'node_modules', '/'))('puppeteer');
}

async function main() {
  mkdirSync(paths.evidence, { recursive: true });

  if (!skipExport || !existsSync(join(dist, 'index.html'))) {
    const [exportCommand, exportArgs] = pnpmCommand([
      '--filter',
      '@botharness/mobile',
      'export:web',
    ]);
    const exported = spawnSync(exportCommand, exportArgs, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EXPO_OFFLINE: '1' },
      timeout: 600_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (exported.status !== 0) throw new Error(`export:web failed: ${exported.stderr.slice(-800)}`);
    steps.push('exported the app for web');
  }

  const hostPort = await freePort();
  let instance = launch(hostPort);
  const hostOrigin = `http://127.0.0.1:${hostPort}`;
  steps.push('launched an isolated Host');
  const state = { hostPort };
  const proxy = phoneOrigin(state);
  const proxyPort = await freePort();
  await new Promise((done) => proxy.listen(proxyPort, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${proxyPort}`;

  const browser = await loadPuppeteer().launch({ args: ['--no-sandbox'] });
  const console_ = [];
  let page;
  try {
    const displayName = `Phone QA ${Date.now()}`;
    await rpc(hostOrigin, 'create', { displayName, roles: ['research'] });
    steps.push('created a PersonaBot through the public API');

    const offer = await operator(hostOrigin, '/api/botharness/devices/offer', {
      origin: hostOrigin,
    });
    const encoded = new URL(offer.link).searchParams.get('p');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    payload.routes = [origin];
    const link = `deepseekbot://pair?p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    steps.push('asked the Host for a pairing offer, pointed at the phone origin');

    page = await browser.newPage();
    await page.emulate({
      viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    });
    page.on('console', (message) => console_.push(`${message.type()}: ${message.text()}`));
    page.on('pageerror', (error) => console_.push(`pageerror: ${error.message}`));
    const text = (value, timeout = 30_000) =>
      page.waitForFunction(
        (needle) => document.body.innerText.includes(needle),
        { timeout },
        value,
      );
    const shot = async (label) => {
      await page.screenshot({ path: join(paths.evidence, `${label}.png`) });
      const tree = await page.accessibility.snapshot();
      writeFileSync(join(paths.evidence, `${label}.aria.txt`), JSON.stringify(tree, null, 1));
    };

    await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    await text('Or paste the pairing link');
    await shot('1-pair-screen');
    steps.push('opened the app: it starts on the pairing screen');

    await page.type(
      'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
      link,
    );
    await page.locator('::-p-aria(Pair)').click();
    await text(displayName);
    await shot('2-roster-after-pairing');
    steps.push('pasted the link and tapped Pair: the Roster shows the PersonaBot');

    const credential = await page.evaluate(() => {
      const raw = sessionStorage.getItem('deepseekbot.hosts.v3');
      return raw === null ? null : (JSON.parse(raw).hosts?.[0]?.credential ?? null);
    });
    checks.credentialStored = typeof credential === 'string';
    const second = await fetch(`${origin}/botharness-device/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offer: payload.offer, deviceName: 'replay' }),
    });
    checks.offerSingleUse = second.status === 401;

    await stop(instance.pid);
    steps.push('stopped the Host');
    await text('Cannot reach your computer');
    instance = launch(hostPort);
    steps.push('started the Host again on the same home');
    await page.waitForFunction(
      (name) =>
        document.body.innerText.includes(name) &&
        !document.body.innerText.includes('Cannot reach your computer') &&
        !document.body.innerText.includes('Reconnecting'),
      { timeout: 60_000 },
      displayName,
    );
    checks.reconnectedWithoutPairing = !(await page.evaluate(() =>
      document.body.innerText.includes('Or paste the pairing link'),
    ));
    await shot('3-roster-after-restart');
    steps.push('the app reconnected by itself without pairing again');

    const listed = await devices(hostOrigin);
    checks.listedWithLastSeen = listed.length === 1 && typeof listed[0].lastSeenAt === 'string';
    const revoked = await operator(hostOrigin, '/api/botharness/devices/revoke', {
      deviceId: listed[0].id,
    });
    steps.push('revoked the phone from the Host');
    checks.revokeClosedStream = revoked.closedStreams >= 1;
    await text('Pair again');
    await shot('4-pair-again-after-revoke');
    steps.push('the app shows Pair again');

    const log = console_.join('\n');
    writeFileSync(
      join(paths.evidence, 'console.txt'),
      redact(credential ? log.replaceAll(credential, '<credential>') : log),
    );
    checks.credentialNotInConsole = credential !== null && !log.includes(credential);
    checks.noPageErrors = !log.includes('pageerror:');
    const hostLog = readFileSync(instance.log, 'utf8');
    checks.credentialNotInHostLog =
      credential !== null && !hostLog.includes(credential.split('.')[1]);
  } catch (error) {
    await page?.screenshot({ path: join(paths.evidence, 'failure.png') }).catch(() => {});
    writeFileSync(join(paths.evidence, 'failure.console.txt'), redact(console_.join('\n')));
    throw error;
  } finally {
    await browser.close();
    proxy.close();
    if (!keep) {
      await stop(instance.pid).catch(() => {});
      rmSync(home, { recursive: true, force: true });
    }
  }
  const pass = Object.values(checks).every(Boolean);
  process.stdout.write(
    `${JSON.stringify({ result: pass ? 'pass' : 'fail', checks, steps, evidence: paths.evidence }, null, 2)}\n`,
  );
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify({ result: 'fail', error: redact(error.message), steps, checks }, null, 2)}\n`,
  );
  process.exitCode = 1;
});
