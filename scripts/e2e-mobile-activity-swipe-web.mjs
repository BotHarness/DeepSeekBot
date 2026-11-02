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
import { DatabaseSync } from 'node:sqlite';
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
const paths = verifyPaths('mobile-activity-swipe-web');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-mobile-activity-swipe-'));
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
    rpcId: `mobile-activity-swipe-e2e-${Date.now()}`,
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
  const wait = async (check, what, tries = 1200) => {
    for (let i = 0; i < tries; i += 1) {
      const value = await check();
      if (value) return value;
      await new Promise((done) => setTimeout(done, 250));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  try {
    const { bot: ada } = await call(hostOrigin, 'create', {
      displayName: 'Ada',
      persona:
        'Follow verification instructions exactly. Use group_join_request for the selected Group when asked; do not modify files or settings.',
    });
    const { bot: bo } = await call(hostOrigin, 'create', { displayName: 'Bo' });
    const { bot: cy } = await call(hostOrigin, 'create', { displayName: 'Cy' });
    const { channel: group } = await call(hostOrigin, 'channelCreate', {
      name: 'Launch',
      members: [cy.slug],
    });
    const since = new Date().toISOString();
    await call(hostOrigin, 'channelSend', {
      channelId: `dm-${bo.slug}`,
      body: 'Reply with one short sentence: the weekly report is ready. Do not use any tools.',
      messageId: `human-${crypto.randomUUID()}`,
    });
    const reference = `#${group.name}`;
    await call(hostOrigin, 'channelSend', {
      channelId: `dm-${ada.slug}`,
      body: `${reference}\nCall group_join_request for this selected Group now, then send REQUESTED in this DM. Do not ask any questions or run other tools.`,
      channelRefs: [{ channelId: group.id, label: group.name, start: 0, end: reference.length }],
      messageId: `human-${crypto.randomUUID()}`,
    });
    const failed = async (slug) => {
      const { page: timeline } = await call(hostOrigin, 'channelTimeline', {
        channelId: `dm-${slug}`,
      });
      const failure = timeline.entries.find(
        (entry) => entry.sessionFailure !== undefined && entry.at > since,
      );
      if (failure !== undefined)
        throw new Error(
          `the model turn failed (${failure.sessionFailure.code}: ${failure.sessionFailure.detail})`,
        );
    };
    const approval = await wait(async () => {
      const { items } = await call(hostOrigin, 'humanAttention', { category: 'action' });
      await failed(ada.slug);
      return items.find((entry) => entry.kind === 'group-join-request');
    }, 'a real group join request from Ada');
    const unread = await wait(async () => {
      const { items } = await call(hostOrigin, 'humanAttention', { category: 'unread' });
      await failed(bo.slug);
      return items.find((entry) => entry.botSlug === bo.slug);
    }, "Bo's real reply as other unread");
    steps.push('a real model turn left a group join request from Ada and an unread reply from Bo');

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
    const shot = async (name) => {
      for (const scheme of ['light', 'dark']) {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
        await new Promise((done) => setTimeout(done, 400));
        await page.screenshot({ path: join(paths.evidence, `${name}-${scheme}.png`) });
      }
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    };
    const visible = (selector) =>
      page.waitForFunction(
        (css) =>
          [...document.querySelectorAll(css)].some(
            (node) => node.getBoundingClientRect().width > 0,
          ),
        { timeout: 30_000 },
        selector,
      );
    const box = async (selector) =>
      page.evaluate((css) => {
        const node = [...document.querySelectorAll(css)].find(
          (entry) => entry.getBoundingClientRect().width > 0,
        );
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }, selector);
    const drag = async (selector, distance) => {
      const rect = await box(selector);
      const y = rect.y + Math.min(rect.height / 2, 28);
      const x = rect.x + rect.width - 24;
      await page.touchscreen.touchStart(x, y);
      for (let i = 1; i <= 12; i += 1) {
        await page.touchscreen.touchMove(x - (distance * i) / 12, y);
        await new Promise((done) => setTimeout(done, 16));
      }
      await page.touchscreen.touchEnd();
      await new Promise((done) => setTimeout(done, 700));
    };
    const clickTestId = (id) =>
      page.evaluate((value) => {
        const node = [...document.querySelectorAll(`[data-testid="${value}"]`)].find(
          (entry) => entry.getBoundingClientRect().width > 0,
        );
        node.click();
      }, id);

    await page.goto(`${origin}/pair`, { waitUntil: 'networkidle0' });
    await text('Or paste the pairing link');
    await page.type(
      'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
      link,
    );
    await page.locator('::-p-aria(Pair)').click();
    await text('Ada');
    steps.push('paired the app by pasting the link');

    await page.locator('::-p-aria(Activity)').click();
    const approvalRow = `[data-testid="inbox-swipe-${approval.id}"]`;
    await visible(approvalRow);
    await shot('1-needs-you');
    await drag(approvalRow, 150);
    await visible('[data-testid="swipe-action-snooze-tomorrow"]');
    checks.needsYouOffersNoClear = await page.evaluate(
      () =>
        ![...document.querySelectorAll('[data-testid="swipe-action-clear"]')].some(
          (node) => node.getBoundingClientRect().width > 0,
        ),
    );
    await shot('2-needs-you-revealed');
    steps.push('swiped the join request left: Tomorrow and Later… show, Clear does not');
    await clickTestId('swipe-action-snooze-tomorrow');
    await visible('[data-testid="undo-bar"]');
    checks.snoozedOnHost = await wait(async () => {
      const { items } = await call(hostOrigin, 'humanAttention', {
        category: 'action',
        snoozed: true,
      });
      return items.some((entry) => entry.id === approval.id);
    }, 'the snooze on the Host');
    await shot('3-snoozed-undo');
    await clickTestId('undo-bar-undo');
    checks.unsnoozedByUndo = await wait(async () => {
      const { items } = await call(hostOrigin, 'humanAttention', { category: 'action' });
      return items.some((entry) => entry.id === approval.id);
    }, 'Undo bringing the request back');
    steps.push('Tomorrow snoozed it on the Host; Undo brought it back');

    await page.locator('::-p-aria(Other unread)').click();
    const unreadRow = `[data-testid="inbox-swipe-${unread.id}"]`;
    await visible(unreadRow);
    await drag(unreadRow, 120);
    await visible('[data-testid="swipe-action-clear"]');
    await shot('4-unread-revealed');
    await drag(unreadRow, 340);
    await visible('[data-testid="undo-bar"]');
    checks.clearedOnHost = await wait(async () => {
      const { items, dismissed } = await call(hostOrigin, 'humanAttention', {
        category: 'unread',
        dismissed: true,
      });
      return dismissed === true && items.some((entry) => entry.id === unread.id);
    }, 'the dismissal on the Host');
    await shot('5-cleared-undo');
    steps.push('swiped the unread reply through: it left and the Host lists it as dismissed');

    await page.locator('::-p-aria(Filter and sort)').click();
    await page.locator('::-p-aria([name="Cleared"][role="radio"])').click();
    await page.locator('::-p-aria([name="Close"][role="button"])').click();
    await new Promise((done) => setTimeout(done, 800));
    await visible(unreadRow);
    await shot('6-cleared-filter');
    await drag(unreadRow, 340);
    checks.restoredFromFilter = await wait(async () => {
      const { items } = await call(hostOrigin, 'humanAttention', { category: 'unread' });
      return items.some((entry) => entry.id === unread.id);
    }, 'Restore from the Cleared filter');
    steps.push('Filters → Cleared listed it; swiping Restore put it back on the Host');

    const database = new DatabaseSync(join(home, 'botharness', 'botharness.db'));
    try {
      database
        .prepare(
          `UPDATE inbox_admissions SET attempt_state = 'needs-repair', last_error = 'e2e: interrupted after acting'
            WHERE source_event_id = (SELECT e.source_event_id FROM source_events e
              WHERE e.channel_id = ? AND e.source_kind = 'human-message' ORDER BY e.created_at LIMIT 1)`,
        )
        .run(`dm-${bo.slug}`);
    } finally {
      database.close();
    }
    const repair = await wait(async () => {
      const { items } = await call(hostOrigin, 'humanAttention', { category: 'action' });
      return items.find((entry) => entry.kind === 'bot-message-needs-repair');
    }, 'the interrupted message in Needs you');
    steps.push("marked Bo's handled DM message as interrupted in the Host database");

    await page.locator('::-p-aria(Filter and sort)').click();
    await page.locator('::-p-aria([name="Needs you"][role="radio"])').click();
    await page.locator('::-p-aria([name="Close"][role="button"])').click();
    await new Promise((done) => setTimeout(done, 1500));
    const repairRow = `[data-testid="inbox-swipe-${repair.id}"]`;
    await visible(repairRow);
    await page.evaluate((id) => {
      const scope = [...document.querySelectorAll(`[data-testid="inbox-swipe-${id}"]`)].find(
        (entry) => entry.getBoundingClientRect().width > 0,
      );
      scope.querySelector('[role="button"]').click();
    }, repair.id);
    await text('Bo stopped partway through your message');
    await shot('7-repair-detail');
    await page.locator('::-p-aria([name="Open conversation"][role="button"])').click();
    checks.repairOpensConversation = await wait(
      async () => page.url().includes(`/dm/${bo.slug}`),
      'the DM to open',
    );
    await page.goBack();
    await page.goBack();
    await visible(repairRow);
    await drag(repairRow, 150);
    await visible('[data-testid="swipe-action-clear"]');
    checks.repairOffersClear = await page.evaluate((id) => {
      const scope = [...document.querySelectorAll(`[data-testid="inbox-swipe-${id}"]`)].find(
        (entry) => entry.getBoundingClientRect().width > 0,
      );
      return (
        scope.querySelector('[data-testid="swipe-action-clear"]') !== null &&
        scope.querySelector('[data-testid="swipe-action-snooze-tomorrow"]') === null
      );
    }, repair.id);
    await shot('8-repair-revealed');
    await clickTestId('swipe-action-clear');
    checks.repairClearedOnHost = await wait(async () => {
      const { items } = await call(hostOrigin, 'humanAttention', {
        category: 'action',
        dismissed: true,
      });
      return items.some((entry) => entry.id === repair.id);
    }, 'the interrupted message dismissed on the Host');
    steps.push(
      'the interrupted message explains itself, opens its DM, and its revealed Clear dismisses it on the Host',
    );

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
