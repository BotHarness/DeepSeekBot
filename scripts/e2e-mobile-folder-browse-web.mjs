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
import { homedir, tmpdir } from 'node:os';
import { basename, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyPaths } from './verify-app.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const skipExport = args.includes('--skip-export');
const keep = args.includes('--keep');
const dist = join(root, 'apps/mobile/dist-web');
const paths = verifyPaths('mobile-folder-browse-web');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-mobile-folders-'));
const fixture = join(homedir(), 'bh-folder-browse-qa');
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
    rpcId: `mobile-folders-e2e-${Date.now()}`,
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
    if (state.systemChooser && req.url === '/botharness-device/api/directoryPicker/list') {
      state.chooserRefusals += 1;
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const { rpcId } = JSON.parse(body || '{}');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            type: 'server-response',
            rpcId,
            result: {
              ok: false,
              error: { code: 'directory-picker/unavailable', message: 'system folder dialog' },
            },
          }),
        );
      });
      return;
    }
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
  rmSync(fixture, { recursive: true, force: true });
  for (const name of ['site', 'notes', '.cache'])
    mkdirSync(join(fixture, name), { recursive: true });
  writeFileSync(join(fixture, 'README.md'), 'files are never listed');

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

  const hostPort = await freePort();
  const instance = launch(hostPort);
  const hostOrigin = `http://127.0.0.1:${hostPort}`;
  steps.push('launched an isolated Host');
  const native = await operator(hostOrigin, '/api/directoryPicker/list', {
    type: 'client-request',
    rpcId: 'folders-native',
    method: 'directoryPicker/list',
    payload: { args: {} },
  });
  steps.push(
    `DSH directoryPicker/list on this Host: ${native?.result?.ok === true ? 'lists folders' : native?.result?.error?.code}`,
  );
  const state = { hostPort, systemChooser: true, chooserRefusals: 0 };
  const proxy = phoneOrigin(state);
  const proxyPort = await freePort();
  await new Promise((done) => proxy.listen(proxyPort, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${proxyPort}`;

  const browser = await loadPuppeteer().launch({ args: ['--no-sandbox', '--lang=en-US'] });
  const console_ = [];
  let page;
  try {
    const displayName = 'Nova';
    const { bot } = await call(hostOrigin, 'create', { displayName, roles: ['research'] });
    const { channel } = await call(hostOrigin, 'channelDm', { slug: bot.slug, displayName });
    await call(hostOrigin, 'channelSend', {
      channelId: channel.id,
      messageId: `human-${crypto.randomUUID()}`,
      body: `QA: call request_workspace_grant once, asking for read/write access to a folder so you can sort today's to-dos. Do not name a path. Then end this turn and wait for the folder card.`,
    });
    const deadline = Date.now() + 240_000;
    let request;
    while (request === undefined && Date.now() < deadline) {
      const timeline = await call(hostOrigin, 'channelTimeline', {
        channelId: channel.id,
        limit: 100,
      });
      request = timeline.page.entries.find((message) => message.grantRequest !== undefined);
      if (request === undefined) await new Promise((done) => setTimeout(done, 1500));
    }
    if (request === undefined) throw new Error('the Bot did not ask for a folder');
    steps.push(
      'a real deepseek-v4.1-flash turn asked for a folder through request_workspace_grant',
    );

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

    await page.goto(`${origin}/pair`, { waitUntil: 'networkidle0' });
    await text('Or paste the pairing link');
    await page.type(
      'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
      link,
    );
    await page.locator('::-p-aria(Pair)').click();
    await text(displayName);
    steps.push('paired the app by pasting the link');

    await page.locator(`::-p-text(${displayName})`).click();
    await text('Choose folder', 60_000);
    await page.locator('::-p-aria(Choose folder)').click();
    await text('Other places');
    checks.noTypedPathFallback = !(await page.evaluate(() =>
      document.body.innerText.includes('cannot list its folders'),
    ));
    checks.chooserRefused = state.chooserRefusals > 0;
    checks.homeListed = await page.evaluate(() =>
      document.body.innerText.includes('bh-folder-browse-qa'),
    );
    await shot('1-browse-home');
    steps.push('the folder sheet listed the computer home through BotHarness, not a typed path');

    await page.locator('::-p-text(bh-folder-browse-qa)').click();
    await text('notes');
    const listed = await page.evaluate(() => document.body.innerText);
    checks.foldersOnly = listed.includes('site') && !listed.includes('README.md');
    checks.hiddenSkipped = !listed.includes('.cache');
    await shot('2-browse-folder');
    steps.push('opened a folder: subfolders only, no files and no hidden folders');

    await page.locator('::-p-aria(Authorize this folder)').click();
    await text('Allow read/write');
    await shot('3-confirm');
    await page.locator('::-p-aria(Allow read/write)').click();
    const grantDeadline = Date.now() + 30_000;
    let granted = false;
    while (!granted && Date.now() < grantDeadline) {
      const { grants } = await call(hostOrigin, 'grants', { slug: bot.slug });
      granted = grants.some((grant) => grant.workspacePath === fixture && grant.orchestratorWrite);
      if (!granted) await new Promise((done) => setTimeout(done, 500));
    }
    checks.grantedChosenFolder = granted;
    steps.push('confirmed; the Host granted read/write on the chosen folder');

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
    rmSync(fixture, { recursive: true, force: true });
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
