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
const paths = verifyPaths('mobile-im-pairing-web');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-im-'));
const control = join(home, 'qa-im-control');
const steps = [];
const checks = {};
const timings = {};

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
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      windowsHide: true,
    },
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

function installFixture() {
  const profiles = join(home, 'profiles');
  const profile = readdirSync(profiles).find((name) =>
    existsSync(join(profiles, name, 'cordis.patch.yml')),
  );
  if (profile === undefined) throw new Error('no profile patch file in the isolated home');
  const fixture = join(root, 'scripts/fixtures/phone-im-pairing.mjs');
  writeFileSync(
    join(profiles, profile, 'cordis.patch.yml'),
    [
      '- insert:',
      '    - id: qa-phone-im-pairing',
      `      name: ${JSON.stringify(fixture)}`,
      '      config:',
      `        directory: ${JSON.stringify(control)}`,
      '',
    ].join('\n'),
  );
}

let commandId = 0;
async function fixture(command) {
  const id = ++commandId;
  const response = join(control, 'response.json');
  writeFileSync(join(control, 'command.json'), JSON.stringify({ ...command, id }));
  for (let i = 0; i < 200; i += 1) {
    if (existsSync(response)) {
      const value = JSON.parse(readFileSync(response, 'utf8'));
      if (value.id === id) {
        if (!value.ok) throw new Error(`fixture ${command.action}: ${value.error}`);
        return value.value;
      }
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`fixture ${command.action} did not answer`);
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
    rpcId: `mobile-im-e2e-${Date.now()}`,
    method: `botharness/${method}`,
    payload: { args: rpcArgs },
  });
  if (envelope?.result?.ok !== true)
    throw new Error(
      `botharness/${method} failed: ${envelope?.result?.error?.code ?? 'invalid'} ${envelope?.result?.error?.message ?? ''}`,
    );
  return envelope.result.value;
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
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
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
  const console_ = [];
  let instance;
  let proxy;
  let browser;
  let page;
  try {
    mkdirSync(control, { recursive: true });
    if (!skipExport || !existsSync(join(dist, 'index.html'))) {
      const exported = spawnSync('pnpm', ['--filter', '@botharness/mobile', 'export:web'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, EXPO_OFFLINE: '1', BOTHARNESS_MOBILE_WEB_PREVIEW: '1' },
        timeout: 600_000,
        maxBuffer: 16 * 1024 * 1024,
        shell: false,
        windowsHide: true,
      });
      if (exported.status !== 0)
        throw new Error(`export:web failed: ${exported.stderr.slice(-800)}`);
      steps.push('exported the app for web');
    }

    const hostPort = await freePort();
    instance = launch(hostPort);
    installFixture();
    await stop(instance.pid);
    instance = launch(hostPort);
    const hostOrigin = `http://127.0.0.1:${hostPort}`;
    steps.push('launched an isolated Host with a synthetic IM app (no real IM network)');
    const state = { hostPort };
    proxy = phoneOrigin(state);
    const proxyPort = await freePort();
    await new Promise((done) => proxy.listen(proxyPort, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${proxyPort}`;

    browser = await loadPuppeteer().launch({ args: ['--no-sandbox'] });
    const displayName = 'Phone IM QA';
    const created = await rpc(hostOrigin, 'create', { displayName, roles: ['research'] });
    const slug = created?.slug ?? created?.bot?.slug;
    if (typeof slug !== 'string') throw new Error('create returned no slug');
    await rpc(hostOrigin, 'senderAccess', {
      slug,
      input: { kind: 'policy', restricted: true, expectedRevision: 0 },
    });
    for (const [name, behavior] of [
      ['Friend', 'Chat casually. No approvals.'],
      ['Teammate', 'Help with project work.'],
    ])
      await rpc(hostOrigin, 'senderAccess', {
        slug,
        input: { kind: 'create-role', name, behavior },
      });
    const roleSnapshot = await rpc(hostOrigin, 'messagingSnapshot', { slug, mode: 'saved' });
    const roleId = (name) => roleSnapshot.roles.find((role) => role.name === name)?.id;
    checks.rolesCreated =
      typeof roleId('Friend') === 'string' && typeof roleId('Teammate') === 'string';
    steps.push('created a Bot, restricted who it answers, and gave it two Roles');

    const offer = await operator(hostOrigin, '/api/botharness/devices/offer', {
      origin: hostOrigin,
    });
    const encoded = new URL(offer.link).searchParams.get('p');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    payload.routes = [origin];
    const link = `deepseekbot://pair?p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

    page = await browser.newPage();
    await (await page.createCDPSession()).send('Emulation.setLocaleOverride', { locale: 'en-US' });
    await page.emulate({
      viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
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
        await new Promise((done) => setTimeout(done, 300));
        await page.screenshot({ path: join(paths.evidence, `${label}-${scheme}.png`) });
      }
      await page.emulateMediaFeatures([]);
    };
    const tap = (testId) => page.locator(`[data-testid="${testId}"]`).click();
    const go = async (path) => {
      await page.evaluate((target) => {
        window.history.pushState({}, '', target);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, path);
    };

    await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    await text('Or paste a link');
    await page.type(
      'input[placeholder^="Pairing link"], textarea[placeholder^="Pairing link"]',
      link,
    );
    await page.locator('::-p-aria(Connect)').click();
    await text('Fingerprints match');
    await page.locator('::-p-aria(Fingerprints match)').click();
    await text('Approve on your computer');
    let approved = false;
    for (let attempt = 0; attempt < 60 && !approved; attempt += 1) {
      const response = await fetch(`${hostOrigin}/api/botharness/devices/requests`, {
        headers: { cookie: cookie() },
        signal: AbortSignal.timeout(10_000),
      });
      const pending = (await response.json().catch(() => ({}))).pendingKeys ?? [];
      const request = pending.find((entry) => entry.approved === false);
      if (request !== undefined) {
        await operator(hostOrigin, '/api/botharness/devices/approve-key', {
          receipt: request.receipt,
          publicKey: request.publicKey,
          confirm: true,
        });
        approved = true;
      } else await new Promise((done) => setTimeout(done, 500));
    }
    if (!approved) throw new Error('The Host never saw the phone key');
    await page.waitForSelector('[data-testid="host-look-save"]', { timeout: 60_000 });
    await tap('host-look-save');
    await text(displayName, 60_000);
    steps.push('paired the phone with the Host');

    await page.locator('::-p-aria(Settings)').click();
    await page.waitForSelector('[data-testid="settings-im-apps"]', { timeout: 30_000 });
    await shot('1-settings-row');
    await tap('settings-im-apps');
    await text('Phone QA app');
    await text('Not bound');
    await shot('2-im-apps-unbound');
    steps.push('Settings → IM apps lists the synthetic app as not bound');

    await tap('im-app-phone-qa-7001');
    await page.waitForSelector(`[data-testid="im-app-bot-${slug}"]`, { timeout: 30_000 });
    let started = Date.now();
    await tap(`im-app-bot-${slug}`);
    await page.waitForSelector('[data-testid="im-app-unbind"]', { timeout: 30_000 });
    timings.bindTapToBound = Date.now() - started;
    await shot('3-im-app-bound');
    const apps = await rpc(hostOrigin, 'messagingApps');
    const bound = apps.apps.find((app) => app.ref === 'phone-qa-7001');
    checks.appBoundOnHost = bound?.boundBotSlug === slug;
    steps.push('tapped the Bot: the app is bound on the Host and the page shows Unbind');

    await page.goBack();
    await text(displayName);
    checks.listShowsBoundBotWithoutReload = await page.evaluate(
      (name) =>
        document.body.innerText.includes(name) && !document.body.innerText.includes('Not bound'),
      displayName,
    );
    await shot('4-im-apps-bound');

    await fixture({
      action: 'dm',
      actorId: 'ou_ada',
      actorName: 'Ada Lovelace',
      text: 'Hi, can we talk?',
    });
    await fixture({ action: 'dm', actorId: 'ou_grace', actorName: 'Grace Hopper', text: 'Hello' });
    const before = await rpc(hostOrigin, 'messagingSnapshot', { slug, mode: 'saved' });
    const pendingOnHost = before.pairings.filter((item) => item.status === 'pending');
    checks.pairingRequestsCreated = pendingOnHost.length === 2;
    steps.push('two people messaged the synthetic IM app; the Host holds two pairing requests');
    const ada = pendingOnHost.find((item) => item.actorId === 'ou_ada');

    await go(`/bot/${slug}/external`);
    await text('Ada Lovelace');
    await text('Grace Hopper');
    await shot('6-external-contacts-pending');
    steps.push('Bot → External contacts lists both people under Waiting for you');

    await tap(`pairing-${ada.id}`);
    await page.waitForSelector(`[data-testid="pairing-role-${roleId('Teammate')}"]`);
    await tap(`pairing-role-${roleId('Teammate')}`);
    await shot('7-pairing-request');
    started = Date.now();
    await tap('pairing-approve');
    await page.waitForFunction(() => !document.querySelector('[data-testid="pairing-approve"]'), {
      timeout: 30_000,
    });
    await text('Paired people');
    await page.waitForFunction(() => document.body.innerText.includes('Teammate'), {
      timeout: 30_000,
    });
    timings.approveTapToListed = Date.now() - started;
    await shot('8-external-contacts-approved');
    const afterApprove = await rpc(hostOrigin, 'messagingSnapshot', { slug, mode: 'saved' });
    const adaOnHost = afterApprove.pairings.find((item) => item.id === ada.id);
    checks.approvedWithChosenRole =
      adaOnHost?.status === 'approved' && adaOnHost.roleId === roleId('Teammate');
    steps.push(
      'opened Ada, chose Teammate and tapped Approve: the Host has Ada approved as Teammate',
    );

    await tap(`pairing-${ada.id}`);
    await page.waitForSelector(`[data-testid="pairing-role-${roleId('Friend')}"]`);
    started = Date.now();
    await tap(`pairing-role-${roleId('Friend')}`);
    for (let i = 0; i < 100; i += 1) {
      const now = await rpc(hostOrigin, 'messagingSnapshot', { slug, mode: 'saved' });
      if (now.pairings.find((item) => item.id === ada.id)?.roleId === roleId('Friend')) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    timings.roleTapToSaved = Date.now() - started;
    const afterRole = await rpc(hostOrigin, 'messagingSnapshot', { slug, mode: 'saved' });
    checks.roleChanged =
      afterRole.pairings.find((item) => item.id === ada.id)?.roleId === roleId('Friend');
    await shot('9-role-changed');
    steps.push('changed Ada from Teammate to Friend on the phone: the Host saved the new Role');

    await page.goBack();
    const grace = pendingOnHost.find((item) => item.actorId === 'ou_grace');
    await tap(`pairing-${grace.id}`);
    await page.waitForSelector('[data-testid="pairing-reject"]');
    await tap('pairing-reject');
    await page.waitForFunction(() => document.body.innerText.includes('Earlier requests'), {
      timeout: 30_000,
    });
    const afterReject = await rpc(hostOrigin, 'messagingSnapshot', { slug, mode: 'saved' });
    checks.rejected =
      afterReject.pairings.find((item) => item.id === grace.id)?.status === 'rejected';
    await shot('10-after-reject');
    steps.push('rejected Grace: she moves to Earlier requests and the Host shows her rejected');

    await page.emulateMediaFeatures([]);
    const log = console_.join('\n');
    writeFileSync(join(paths.evidence, 'console.txt'), redact(log));
    checks.noPageErrors = !log.includes('pageerror:');
  } catch (error) {
    await page?.screenshot({ path: join(paths.evidence, 'failure.png') }).catch(() => {});
    writeFileSync(join(paths.evidence, 'failure.console.txt'), redact(console_.join('\n')));
    throw error;
  } finally {
    await browser?.close().catch(() => {});
    proxy?.close();
    if (!keep) {
      if (instance !== undefined) await stop(instance.pid).catch(() => {});
      rmSync(home, { recursive: true, force: true });
    }
  }
  const pass = Object.values(checks).every(Boolean);
  process.stdout.write(
    `${JSON.stringify({ result: pass ? 'pass' : 'fail', checks, timings, steps, evidence: paths.evidence }, null, 2)}\n`,
  );
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify({ result: 'fail', error: redact(error.message), steps, checks }, null, 2)}\n`,
  );
  process.exitCode = 1;
});
