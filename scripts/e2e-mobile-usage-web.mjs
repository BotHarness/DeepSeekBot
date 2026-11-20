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
const paths = verifyPaths('mobile-usage-web');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-mobile-usage-'));
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
    rpcId: `mobile-usage-e2e-${Date.now()}`,
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

async function waitFor(check, label, timeout = 180_000) {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${label}`);
    await new Promise((done) => setTimeout(done, 1000));
  }
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
      shell: false,
      windowsHide: true,
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
    const idle = await call(hostOrigin, 'overviewUsage', { period: 'week' });
    checks.idleWeekIsZero = idle.totals.totalTokens === 0 && idle.days.length === 7;

    for (const displayName of ['Mika', 'Juno']) {
      const { bot } = await call(hostOrigin, 'create', { displayName, roles: ['research'] });
      const { channel } = await call(hostOrigin, 'channelDm', { slug: bot.slug, displayName });
      await call(hostOrigin, 'channelSend', {
        channelId: channel.id,
        messageId: `human-${crypto.randomUUID()}`,
        body: 'In one sentence, what can you help me with? Also save a note in your memory that I like short answers.',
      });
    }
    steps.push('created two PersonaBots and sent each a DM');
    await waitFor(async () => {
      const usage = await call(hostOrigin, 'overviewUsage', { period: 'week' });
      const activity = await call(hostOrigin, 'activitySnapshot', {});
      return (
        usage.bots.length === 2 && activity.bots.every((entry) => entry.state === 'idle') && usage
      );
    }, 'both Bots to answer and go idle');
    steps.push('both Bots answered with the model and went idle');
    const week = await call(hostOrigin, 'overviewUsage', { period: 'week' });
    const today = await call(hostOrigin, 'overviewUsage', { period: 'today' });

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
    const compact = (count) => {
      if (count < 1000) return String(count);
      const divisor = count < 999_950 ? 1000 : count < 999_950_000 ? 1_000_000 : 1_000_000_000;
      const suffix = divisor === 1000 ? 'K' : divisor === 1_000_000 ? 'M' : 'B';
      return `${Number((count / divisor).toFixed(1))}${suffix}`;
    };

    await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    await text('Or paste the pairing link');
    await page.type(
      'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
      link,
    );
    await page.locator('::-p-aria(Pair)').click();
    await text('Mika');
    steps.push('paired the app by pasting the link');

    await page.locator('::-p-aria(Settings)').click();
    const card = `Usage, ${compact(week.totals.totalTokens)} tokens in the last 7 days. Show details`;
    await page.waitForSelector(`[aria-label="${card}"]`, { timeout: 30_000 });
    checks.cardMatchesWebWeekTotal = true;
    checks.cardHasSevenDays = await page.$eval(
      `[aria-label="${card}"]`,
      (node, days) => days.every((day) => node.querySelector(`[aria-label*="${day}: "]`) !== null),
      week.days.map((day) => day.day),
    );
    await shot('1-settings-card');
    steps.push(`Settings shows "${card}"`);

    await page.locator(`::-p-aria(${card})`).click();
    await text('By kind');
    await text('Memory activity');
    await text('Juno');
    await shot('2-usage-week');
    steps.push('the card opens the Usage screen with the split, the Bots and Memory activity');

    const headline = (expected) =>
      page.waitForFunction(
        (expected) =>
          [...document.querySelectorAll('[role="heading"]')].some(
            (node) => node.textContent?.trim() === `${expected} tokens`,
          ),
        { timeout: 10_000 },
        expected,
      );
    const bar = (index) => ({
      click: async () => {
        await new Promise((done) => setTimeout(done, 400));
        const handle = await page.$(`[data-testid="day-bar-${week.days[index].day}"]`);
        const box = await handle.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      },
    });
    const busy = week.days.findLastIndex((row) => row.totalTokens > 0);
    const quiet = week.days.findIndex((row) => row.totalTokens === 0);
    await bar(quiet).click();
    await headline('0');
    await shot('2b-usage-day');
    await bar(busy).click();
    await headline(compact(week.days[busy].totalTokens));
    checks.tapShowsDay = true;
    await bar(busy).click();
    await headline(compact(week.totals.totalTokens));
    checks.tapAgainShowsWeek = true;
    steps.push('tapping a bar shows that day in the headline; tapping it again shows the week');

    await page.locator('::-p-aria(Today)').click();
    await text(`${compact(today.totals.totalTokens)}`);
    checks.todaySwitchRefetched = true;
    await shot('3-usage-today');
    steps.push('Today reads the Host again');

    await page.evaluate(() => {
      for (const node of document.querySelectorAll('div')) {
        if (node.scrollHeight > node.clientHeight + 20) node.scrollTop = node.scrollHeight;
      }
    });
    await shot('4-usage-memory');

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
