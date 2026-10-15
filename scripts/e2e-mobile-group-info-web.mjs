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
const paths = verifyPaths('mobile-group-info-web');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-mobile-group-info-'));
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
    rpcId: `mobile-group-info-e2e-${Date.now()}`,
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

  const hostPort = await freePort();
  const instance = launch(hostPort);
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
    const slugs = {};
    for (const displayName of ['Ada', 'Bo', 'Cy', 'Di']) {
      const { bot } = await call(hostOrigin, 'create', { displayName, roles: ['research'] });
      slugs[displayName] = bot.slug;
    }
    const { channel } = await call(hostOrigin, 'channelCreate', {
      name: 'Launch',
      members: [slugs.Ada, slugs.Bo],
    });
    await call(hostOrigin, 'channelGroupInvite', { channelId: channel.id, botSlug: slugs.Cy });
    steps.push(
      'created four PersonaBots, a group with Ada and Bo, and invited Cy from the desktop',
    );
    const group = async () =>
      (await call(hostOrigin, 'channels')).channels.find((entry) => entry.id === channel.id);
    const pendingInvites = async () =>
      ((await group())?.invitations ?? [])
        .filter((invite) => invite.status === 'pending')
        .map((invite) => invite.targetBotSlug)
        .sort();

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
    const label = (value, timeout = 30_000) =>
      page.waitForSelector(`[aria-label="${value}"]`, { timeout });
    const until = async (check, what) => {
      for (let i = 0; i < 100; i += 1) {
        if (await check()) return true;
        await new Promise((done) => setTimeout(done, 100));
      }
      throw new Error(`timed out waiting for ${what}`);
    };
    const shot = async (name) => {
      for (const scheme of ['light', 'dark']) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await new Promise((done) => setTimeout(done, 300));
        await page.screenshot({ path: join(paths.evidence, `${name}-${scheme}.png`) });
      }
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      const tree = await page.accessibility.snapshot();
      writeFileSync(join(paths.evidence, `${name}.aria.txt`), JSON.stringify(tree, null, 1));
    };

    await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    await text('Or paste the pairing link');
    await page.type(
      'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
      link,
    );
    await page.locator('::-p-aria(Pair)').click();
    await text('Launch');
    steps.push('paired the app by pasting the link');

    await page.locator('::-p-text(Launch)').click();
    await page.waitForSelector('[placeholder="Message #Launch"]', { timeout: 30_000 });
    await new Promise((done) => setTimeout(done, 600));
    await shot('0-group-chat');
    await page.waitForSelector('[aria-label$=" members"][aria-label^="Launch, "]');
    await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label$=" members"][aria-label^="Launch, "]')]
        .at(-1)
        .click(),
    );
    await label('Manage Bo');
    checks.infoListsMembersAndInvite = await page.evaluate(() =>
      ['Ada', 'Bo', 'Cy', 'Invite a PersonaBot'].every((name) =>
        document.body.innerText.includes(name),
      ),
    );
    await shot('1-group-info');
    steps.push('tapped the group title: the info page lists Ada, Bo and Cy (invited or joined)');

    await page.locator('::-p-aria(Invite a PersonaBot)').click();
    await label('Di');
    await shot('2-invite-sheet');
    await page.locator('::-p-aria(Di)').click();
    const reached = async () => {
      const current = await group();
      return (
        current?.members.includes(slugs.Di) ||
        (current?.invitations ?? []).some(
          (invite) => invite.targetBotSlug === slugs.Di && invite.status === 'pending',
        )
      );
    };
    await until(reached, 'the Di invitation on the Host');
    checks.invitedFromPhone = true;
    steps.push('invited Di from the phone: the Host holds the invitation (or Di accepted it)');

    if ((await pendingInvites()).length > 0) {
      const before = (await pendingInvites()).length;
      await page.waitForSelector('[aria-label="Cancel"]');
      await shot('2b-pending-invite');
      await page.evaluate(() => document.querySelectorAll('[aria-label="Cancel"]')[0].click());
      await until(
        async () => (await pendingInvites()).length === before - 1,
        'a cancelled invitation',
      );
      checks.cancelledFromPhone = true;
      steps.push('cancelled a pending invitation from the phone');
    } else
      steps.push('both invitations were accepted by the Bots at once, so none was left to cancel');

    await page.locator('::-p-aria(Rename group, Launch)').click();
    const field = await page.waitForSelector(
      'input[aria-label="Name"], textarea[aria-label="Name"]',
    );
    await new Promise((done) => setTimeout(done, 600));
    await field.click();
    await field.evaluate((node) => node.select());
    await page.keyboard.type('Launch crew');
    await shot('3-rename-sheet');
    await page.locator('::-p-aria(Save)').click();
    await until(async () => (await group())?.name === 'Launch crew', 'the new name on the Host');
    checks.renamedFromPhone = true;
    steps.push('renamed the group from the phone');

    const avatar = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      const gradient = context.createLinearGradient(0, 0, 256, 256);
      gradient.addColorStop(0, '#5b8def');
      gradient.addColorStop(1, '#a855f7');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 256);
      context.fillStyle = '#ffffff';
      context.font = 'bold 120px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('L', 128, 136);
      return canvas.toDataURL('image/png');
    });
    await call(hostOrigin, 'channelGroupAvatarSet', { channelId: channel.id, avatar });
    await label('Remove photo');
    await text('Launch crew');
    checks.photoShowsLive = true;
    await shot('4-renamed-with-photo');
    steps.push('set a photo from the desktop: the info page shows it with Remove photo');

    await page.locator('::-p-aria(Remove photo)').click();
    await until(async () => (await group())?.avatar === undefined, 'the photo removed on the Host');
    checks.photoRemovedFromPhone = true;
    steps.push('removed the photo from the phone');

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
