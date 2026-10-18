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
import { pnpmCommand } from './dev-package-manager.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const skipExport = args.includes('--skip-export');
const keep = args.includes('--keep');
const dist = join(root, 'apps/mobile/dist-web');
const paths = verifyPaths('mobile-routines-web');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-mobile-routines-'));
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
    rpcId: `mobile-routines-e2e-${Date.now()}`,
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
    if (exported.error !== undefined) throw exported.error;
    if (exported.status !== 0)
      throw new Error(`export:web failed: ${(exported.stderr ?? '').slice(-800)}`);
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
    const displayName = 'Mika';
    const { bot } = await call(hostOrigin, 'create', { displayName, roles: ['research'] });
    await call(hostOrigin, 'channelDm', { slug: bot.slug, displayName });
    const timeZone = 'Asia/Tokyo';
    const { schedule: digest } = await call(hostOrigin, 'scheduleCreate', {
      slug: bot.slug,
      input: {
        title: 'Morning digest',
        prompt: 'Summarize the new papers in my reading folder in five bullets.',
        trigger: { kind: 'daily', time: '09:00', timeZone },
      },
    });
    const { schedule: advanced } = await call(hostOrigin, 'scheduleCreate', {
      slug: bot.slug,
      input: {
        title: 'Weekly cleanup',
        prompt: 'Archive finished notes.',
        trigger: { kind: 'cron', expression: '0 18 * * 5', timeZone },
      },
    });
    steps.push('created a PersonaBot with a daily and a cron routine through the public API');

    const offer = await operator(hostOrigin, '/api/botharness/devices/offer', {
      origin: hostOrigin,
    });
    const encoded = new URL(offer.link).searchParams.get('p');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    payload.routes = [origin];
    const link = `deepseekbot://pair?p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

    page = await browser.newPage();
    const localeSession = await page.createCDPSession();
    await localeSession.send('Emulation.setLocaleOverride', { locale: 'en-US' });
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
    const settle = () => new Promise((done) => setTimeout(done, 400));
    const tap = async (label) => {
      const selector = `[aria-label="${label}"]`;
      await page.waitForSelector(selector, { visible: true, timeout: 30_000 });
      const handles = await page.$$(selector);
      let pressed = false;
      for (const handle of handles.reverse()) {
        if (!(await handle.isVisible())) continue;
        await handle.click();
        pressed = true;
        break;
      }
      if (!pressed) throw new Error(`No visible control: ${label}`);
      await settle();
    };
    const fill = async (label, value) => {
      const selector = `[aria-label="${label}"]`;
      await page.waitForSelector(selector, { timeout: 30_000 });
      const handles = await page.$$(selector);
      const field = handles.at(-1);
      await field.click();
      await field.evaluate((node) => node.select());
      await page.keyboard.press('Backspace');
      await field.type(value);
      await settle();
    };
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
    const list = async () => (await call(hostOrigin, 'scheduleList', { slug: bot.slug })).schedules;

    await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    await text('Or paste the pairing link');
    await page.type(
      'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
      link,
    );
    await page.locator('::-p-aria(Pair)').click();
    await text(displayName);
    steps.push('paired the app by pasting the link');

    await page.goto(`${origin}/dm/${bot.slug}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(
      (name) =>
        [...document.querySelectorAll('[aria-label]')].some((node) =>
          node.getAttribute('aria-label')?.startsWith(`${name},`),
        ),
      { timeout: 30_000 },
      displayName,
    );
    await page.evaluate(
      (name) =>
        [...document.querySelectorAll('[aria-label]')]
          .find((node) => node.getAttribute('aria-label')?.startsWith(`${name},`))
          ?.click(),
      displayName,
    );
    await text('Morning digest');
    await page.evaluate(() => {
      const target = [...document.querySelectorAll('[aria-label]')].find((node) =>
        node.getAttribute('aria-label')?.startsWith('New routine'),
      );
      target?.scrollIntoView({ block: 'end' });
    });
    await settle();
    await shot('1-profile-routines');
    steps.push('the profile lists both routines and a New routine row');

    await page.locator('[aria-label^="Morning digest, opens"]').click();
    await text('Recent runs');
    await text('Not run yet.');
    await shot('2-routine-detail');
    steps.push(
      'tapping the routine pushed its page inside the profile drawer with its trigger, next run and empty history',
    );

    await tap('Pause');
    await text('Resume');
    checks.pausedOnHost = (await list()).find((entry) => entry.id === digest.id)?.enabled === false;
    await shot('3-routine-paused');
    await tap('Resume');
    await text('Pause');
    checks.resumedOnHost = (await list()).find((entry) => entry.id === digest.id)?.enabled === true;
    steps.push('Pause and Resume changed the routine on the Host');

    await tap('Run now');
    await text('Started a run.');
    await text('Run now · ');
    const history = (await call(hostOrigin, 'scheduleHistory', { slug: bot.slug, id: digest.id }))
      .firings;
    checks.runNowInHistory = history.some((firing) => firing.trigger === 'manual');
    await shot('4-routine-ran');
    steps.push('Run now started a manual firing that shows in Recent runs and the Host history');

    await tap('Edit');
    await text('Next runs');
    await shot('5-routine-edit');
    await tap('Cancel');
    await text('Recent runs');

    await tap('Delete');
    await text('Delete “Morning digest”?');
    await shot('6-routine-delete-confirm');
    await tap('Delete');
    await page.waitForFunction(
      (slug) => new URL(location.href).pathname.replace(/\/$/u, '') === `/bot/${slug}`,
      { timeout: 30_000 },
      bot.slug,
    );
    await text('Weekly cleanup');
    checks.deletedOnHost = !(await list()).some((entry) => entry.id === digest.id);
    steps.push('Delete asked first, then removed the routine on the Host');

    await page.locator('[aria-label^="Weekly cleanup, opens"]').click();
    await settle();
    checks.advancedRouteMatchesHost = new URL(page.url()).pathname.endsWith(
      `/routine/${advanced.id}`,
    );
    if (!checks.advancedRouteMatchesHost)
      throw new Error('Routine route does not match the selected Host routine');
    await text('The phone cannot edit this schedule');
    await shot('7-routine-advanced');
    await page.goBack({ waitUntil: 'networkidle0' });
    await text('New routine');
    steps.push('a cron routine says the phone cannot edit it and offers the full client');

    await tap('New routine');
    await text('Next runs');
    await fill('Title', 'Evening review');
    await fill('Instruction', 'List what changed in my notes today.');
    await tap('Weekly');
    await tap('Sat');
    await tap('Sun');
    await fill('Time (HH:MM)', '18:30');
    await new Promise((done) => setTimeout(done, 1200));
    const trigger = {
      kind: 'weekly',
      time: '18:30',
      timeZone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    };
    const expected = (await call(hostOrigin, 'schedulePreview', { trigger })).occurrences.slice(
      0,
      5,
    );
    const expectedLabels = await page.evaluate(
      (occurrences) =>
        occurrences.map((at) =>
          new Date(at).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        ),
      expected,
    );
    const shown = await page.evaluate(() => document.body.innerText);
    checks.previewMatchesHost =
      expectedLabels.length > 0 && expectedLabels.every((label) => shown.includes(label));
    await shot('8-routine-new');
    await tap('Create');
    await page.waitForFunction(() => !document.body.innerText.includes('Next runs'), {
      timeout: 30_000,
    });
    await text('Evening review');
    const created = (await list()).find((entry) => entry.title === 'Evening review');
    checks.createdOnHost =
      created?.trigger.kind === 'weekly' &&
      created.trigger.time === '18:30' &&
      created.trigger.weekdays.join(',') === '1,2,3,4,5,6,7' &&
      created.prompt === 'List what changed in my notes today.';
    await shot('9-profile-after-create');
    steps.push('New routine created a weekly routine on the Host whose preview matched the Host');

    const log = console_.join('\n');
    writeFileSync(join(paths.evidence, 'console.txt'), redact(log));
    checks.noPageErrors = !log.includes('pageerror:');
  } catch (error) {
    await page?.screenshot({ path: join(paths.evidence, 'failure.png') }).catch(() => {});
    writeFileSync(
      join(paths.evidence, 'failure-route.json'),
      redact(JSON.stringify({ url: page?.url() })),
    );
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
