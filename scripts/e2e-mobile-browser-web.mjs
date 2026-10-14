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

import { verifyPaths } from './verify-app.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const skipExport = args.includes('--skip-export');
const keep = args.includes('--keep');
const dist = join(root, 'apps/mobile/dist-web');
const paths = verifyPaths('mobile-browser-web');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-mobile-browser-'));
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
    rpcId: `mobile-browser-e2e-${Date.now()}`,
    method: `botharness/${method}`,
    payload: { args: rpcArgs },
  });
  return envelope?.result;
}

async function call(hostOrigin, method, rpcArgs = {}) {
  const result = await rpc(hostOrigin, method, rpcArgs);
  if (result?.ok !== true)
    throw new Error(`botharness/${method} failed: ${result?.error?.code ?? 'invalid'}`);
  return result.value;
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

function fixture() {
  return createServer((_, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(
      '<!doctype html><title>Phone viewer QA</title><body style="margin:0;font:40px sans-serif;background:#fde68a;color:#111"><button onclick="document.title=\'Tapped from the phone\'" style="display:block;width:100vw;height:100vh;font:48px sans-serif;background:#fde68a;border:0">The Bot Browser, seen from the phone. Tap anywhere.</button></body>',
    );
  });
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
    const exported = spawnSync('pnpm', ['--filter', '@botharness/mobile', 'export:web'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EXPO_OFFLINE: '1' },
      timeout: 600_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (exported.status !== 0) throw new Error(`export:web failed: ${exported.stderr.slice(-800)}`);
    steps.push('exported the app for web');
  }

  const site = fixture();
  await new Promise((done) => site.listen(0, '127.0.0.1', done));
  const siteUrl = `http://127.0.0.1:${site.address().port}/`;
  const hostPort = await freePort();
  const instance = launch(hostPort);
  const hostOrigin = `http://127.0.0.1:${hostPort}`;
  steps.push('launched an isolated Host');
  const state = { hostPort };
  const proxy = phoneOrigin(state);
  const proxyPort = await freePort();
  await new Promise((done) => proxy.listen(proxyPort, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${proxyPort}`;

  const browser = await loadPuppeteer().launch({
    args: ['--no-sandbox'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH === undefined
      ? {}
      : { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }),
  });
  const console_ = [];
  let page;
  try {
    const displayName = 'Mika';
    const { bot } = await call(hostOrigin, 'create', { displayName, roles: ['research'] });
    await call(hostOrigin, 'browserAccessSet', { slug: bot.slug, enabled: true });
    const opened = await operator(hostOrigin, '/api/browser/tool', {
      slug: bot.slug,
      tool: 'browser_open',
      args: { url: siteUrl },
    });
    if (opened?.ok !== true) throw new Error('browser_open failed');
    steps.push('created a PersonaBot with Browser Access and opened a page in its Browser');

    const offer = await operator(hostOrigin, '/api/botharness/devices/offer', {
      origin: hostOrigin,
    });
    const encoded = new URL(offer.link).searchParams.get('p');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    payload.routes = [origin];
    const link = `deepseekbot://pair?p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

    page = await browser.newPage();
    await page.emulate({
      viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    });
    page.on('console', (message) => console_.push(`${message.type()}: ${message.text()}`));
    page.on('pageerror', (error) => console_.push(`pageerror: ${error.message}`));
    const outside = [];
    page.on('request', (sent) => {
      const url = new URL(sent.url());
      if (url.origin === hostOrigin) outside.push(url.pathname);
    });
    const text = (value, timeout = 30_000) =>
      page.waitForFunction(
        (needle) => document.body.innerText.includes(needle),
        { timeout },
        value,
      );
    const shot = async (label) => {
      for (const scheme of ['light', 'dark']) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await new Promise((done) => setTimeout(done, 400));
        await page.screenshot({ path: join(paths.evidence, `${label}-${scheme}.png`) });
      }
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      const tree = await page.accessibility.snapshot();
      writeFileSync(join(paths.evidence, `${label}.aria.txt`), JSON.stringify(tree, null, 1));
    };
    const takeover = async () => {
      const response = await fetch(
        `${hostOrigin}/api/browser/observation?slug=${encodeURIComponent(bot.slug)}`,
        { headers: { cookie: cookie() }, signal: AbortSignal.timeout(10_000) },
      );
      return response.json();
    };
    const frameShown = () =>
      page.waitForFunction(
        () => [...document.images].some((image) => image.src.startsWith('data:image/')),
        { timeout: 30_000 },
      );

    await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    await text('Or paste the pairing link');
    await page.type(
      'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
      link,
    );
    await page.locator('::-p-aria(Pair)').click();
    await text(displayName);
    steps.push('paired the app by pasting the link');

    await page.goto(`${origin}/bot/${bot.slug}`, { waitUntil: 'networkidle0' });
    await page.locator('::-p-aria(Browser)').click();
    await text(`${displayName}'s Browser`);
    await frameShown();
    await text('The Bot is using the Browser');
    checks.liveFrame = true;
    await shot('1-live');
    steps.push("opened the Bot profile, tapped Browser, and the Bot's page shows live");

    await page.locator('::-p-aria(Pause Bot)').click();
    await page.waitForSelector('[aria-label="Resume"]', { timeout: 15_000 });
    checks.paused = (await takeover()).takeover === true;
    await frameShown();
    await shot('2-paused');
    steps.push('tapped Pause Bot: the Host reports the Human has the Browser');

    const stage = await page.$('[aria-label="Live view of the Bot Browser"]');
    const box = await stage.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page
      .waitForFunction(
        async (url) => (await (await fetch(url)).text()).includes('Tapped from the phone'),
        { timeout: 15_000, polling: 500 },
        `${origin}/botharness-device/api/browser/observation?slug=${encodeURIComponent(bot.slug)}`,
      )
      .catch(() => undefined);
    checks.tapReachedPage = JSON.stringify((await takeover()).tabs).includes(
      'Tapped from the phone',
    );
    steps.push('tapped the middle of the page: the button on the Bot page received the click');

    await page.locator('::-p-aria(Trackpad)').click();
    await new Promise((done) => setTimeout(done, 1500));
    await shot('3-trackpad');
    steps.push('switched to trackpad mode: a cursor appears on the page');

    await page.locator('::-p-aria(Resume)').click();
    await page.waitForSelector('[aria-label="Pause Bot"]', { timeout: 15_000 });
    checks.resumed = (await takeover()).takeover === false;
    steps.push('tapped Resume: the Bot has the Browser again');

    checks.nothingOutsideGateway = outside.length === 0;

    const listed = await (
      await fetch(`${hostOrigin}/api/botharness/devices`, {
        headers: { cookie: cookie() },
        signal: AbortSignal.timeout(30_000),
      })
    ).json();
    await operator(hostOrigin, '/api/botharness/devices/revoke', {
      deviceId: listed.devices[0].id,
    });
    await text("Your computer revoked this phone's access.", 30_000);
    checks.revokedStops = true;
    await shot('4-revoked');
    steps.push('revoked the phone on the computer: the Browser screen says so');

    const log = console_.join('\n');
    writeFileSync(join(paths.evidence, 'console.txt'), redact(log));
    checks.noPageErrors = !log.includes('pageerror:');
  } catch (error) {
    await page?.screenshot({ path: join(paths.evidence, 'failure.png') }).catch(() => {});
    writeFileSync(join(paths.evidence, 'failure.console.txt'), redact(console_.join('\n')));
    throw error;
  } finally {
    await browser.close();
    proxy.close();
    site.close();
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
