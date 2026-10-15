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
const paths = verifyPaths('mobile-reactions-web');
const home = mkdtempSync(join(tmpdir(), 'bh-e2e-mobile-reactions-'));
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
    rpcId: `mobile-reactions-e2e-${Date.now()}`,
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
    const displayName = 'Ada';
    const { bot } = await call(hostOrigin, 'create', { displayName, roles: ['research'] });
    const { channel } = await call(hostOrigin, 'channelDm', { slug: bot.slug, displayName });
    steps.push('created a PersonaBot and its DM through the public API');

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
    const stored = async (messageId) => {
      const { page: timeline } = await call(hostOrigin, 'channelTimeline', {
        channelId: channel.id,
        limit: 50,
      });
      return timeline.entries.find((message) => message.id === messageId)?.reactions ?? [];
    };
    const longPress = async (needle) => {
      const handle = await page.waitForFunction(
        (value) =>
          [...document.querySelectorAll('[aria-describedby], [tabindex], div')]
            .filter((node) => node.innerText?.trim().startsWith(value))
            .at(-1),
        {},
        needle,
      );
      const pressable = await handle.evaluateHandle((node) => node.closest('[tabindex]') ?? node);
      const box = await pressable.asElement().boundingBox();
      const x = box.x + Math.min(box.width / 2, 40);
      const y = (Math.max(box.y, 60) + Math.min(box.y + box.height, 760)) / 2;
      await page.touchscreen.touchStart(x, y);
      await new Promise((done) => setTimeout(done, 900));
      await page.touchscreen.touchEnd();
    };

    await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    await text('Or paste the pairing link');
    await page.type(
      'input[placeholder^="deepseekbot://pair"], textarea[placeholder^="deepseekbot://pair"]',
      link,
    );
    await page.locator('::-p-aria(Pair)').click();
    await text(displayName);
    steps.push('paired the app by pasting the link');

    const botSend = (args) =>
      call(hostOrigin, 'botToolRun', {
        slug: bot.slug,
        tool: 'channel_send',
        args: { channel_id: channel.id, ...args },
      });
    const posted = await botSend({ body: 'The staging deploy finished. All 214 tests passed.' });
    const replyId = /"messageId\\*":\\*"([^"\\]+)/u.exec(JSON.stringify(posted))?.[1];
    if (replyId === undefined) throw new Error('channel_send returned no message id');
    steps.push('the Bot posted in its DM through its own channel_send, without a model turn');

    await page.locator(`::-p-text(${displayName})`).click();
    await page.waitForSelector(`[placeholder="Message ${displayName}"]`, { timeout: 30_000 });
    await text('All 214 tests passed.');

    await longPress('The staging deploy finished. All 214 tests passed.');
    await label('React with 🎉');
    await label('React with 🤔');
    checks.menuOffersReactions = true;
    checks.menuOffersActions = await page.evaluate(
      () =>
        document.querySelector('[aria-label="Copy"]') !== null &&
        document.querySelector('[aria-label="Share"]') !== null,
    );
    checks.menuAnchoredAtBubble = await page.evaluate(() => {
      const island = document.querySelector('[aria-label="Reactions"]')?.getBoundingClientRect();
      const copy = document.querySelector('[aria-label="Copy"]')?.getBoundingClientRect();
      return island !== undefined && copy !== undefined && island.bottom < copy.top;
    });
    await shot('1-long-press-menu');
    steps.push(
      'long-pressed the Bot message: the reaction island opens above the bubble and Copy and Share below it',
    );

    await page.locator('::-p-aria(React with 🎉)').click();
    await page.waitForSelector('[aria-label="Reactions"]', { hidden: true });
    await label('You reacted with 🎉');
    checks.humanReactionStored = (await stored(replyId)).some(
      (reaction) =>
        reaction.emoji === '🎉' && reaction.actors.some((actor) => actor.kind === 'human'),
    );
    steps.push('picked 🎉: the chip shows and the Host stored it');

    await botSend({ body: '', react_to: replyId, reaction: '🎉' });
    await botSend({ body: '', react_to: replyId, reaction: '✅' });
    await label(`You, ${displayName} reacted with 🎉`);
    await label(`${displayName} reacted with ✅`);
    checks.botReactionLive = true;
    await shot('2-reactions');
    steps.push("the Bot's own reactions arrived live: 🎉 counts 2 and ✅ shows as the Bot's");

    await page.locator(`::-p-aria(You, ${displayName} reacted with 🎉)`).click();
    await label(`${displayName} reacted with 🎉`);
    checks.humanReactionRemoved = (await stored(replyId)).some(
      (reaction) =>
        reaction.emoji === '🎉' &&
        reaction.actors.length === 1 &&
        reaction.actors[0].kind === 'bot',
    );
    await shot('3-removed');
    steps.push("tapped the 🎉 chip: only the Human's reaction was taken back");

    const close = async () => {
      const share = await page.$eval('[aria-label="Share"]', (node) =>
        node.getBoundingClientRect().toJSON(),
      );
      await page.mouse.click(share.right + 40 > 390 ? 20 : share.right + 40, share.top);
      await page.waitForFunction(() => document.querySelector('[aria-modal="true"]') === null);
    };
    const inBounds = () =>
      page.evaluate(() => {
        const island = document.querySelector('[aria-label="Reactions"]')?.getBoundingClientRect();
        const share = document.querySelector('[aria-label="Share"]')?.getBoundingClientRect();
        return (
          island !== undefined &&
          share !== undefined &&
          island.top >= 0 &&
          share.bottom <= window.innerHeight &&
          island.bottom < share.top
        );
      });

    const paragraph =
      'Step result: the build compiled, the migrations ran, and every check in the release list passed without a retry.';
    const long = `Long report begins.\n\n${Array.from({ length: 24 }, (_, i) => `${i + 1}. ${paragraph}`).join('\n')}`;
    await botSend({ body: long });
    await text('Long report begins.');
    await new Promise((done) => setTimeout(done, 1000));
    await longPress('Long report begins.');
    await label('React with 👍');
    checks.longMessageFits = await inBounds();
    await shot('5-stress-long');
    steps.push(
      'long-pressed a message taller than the screen: the bubble is clipped and the island and menu stay on screen',
    );
    await close();

    for (let i = 1; i <= 16; i += 1)
      await botSend({ body: `Filler message ${i} to fill the screen.` });
    await botSend({ body: 'Bottom edge marker.' });
    await text('Bottom edge marker.');
    const jump = await page.$('[aria-label*="atest"]');
    if (jump !== null) await jump.click();
    await new Promise((done) => setTimeout(done, 1500));
    await longPress('Bottom edge marker.');
    await label('React with 👍');
    checks.bottomMessageFits = await inBounds();
    await shot('6-stress-bottom');
    steps.push(
      'long-pressed the newest message at the bottom: the group slides up above the composer',
    );
    await close();

    const fillerTop = () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll('div')]
            .filter((node) => node.innerText?.trim() === 'Filler message 1 to fill the screen.')
            .at(-1)
            ?.getBoundingClientRect().top ?? 0,
      );
    await page.mouse.move(195, 400);
    let sign = 1;
    for (let i = 0; i < 12; i += 1) {
      const before = await fillerTop();
      if (before > 70 && before < 140) break;
      await page.mouse.wheel({ deltaY: sign * (before - 100) });
      await new Promise((done) => setTimeout(done, 400));
      const after = await fillerTop();
      if (Math.abs(after - 100) > Math.abs(before - 100)) sign = -sign;
    }
    await new Promise((done) => setTimeout(done, 800));
    await longPress('Filler message 1 to fill the screen.');
    await label('React with 👍');
    checks.topMessageFits = await inBounds();
    await shot('7-stress-top');
    steps.push(
      'long-pressed a message under the header: the group slides down below the status bar',
    );
    await close();

    const composer = await page.waitForSelector(`[placeholder="Message ${displayName}"]`);
    await composer.type('Great, ship it to production after lunch.');
    await page.locator('::-p-aria(Send)').click();
    await text('Great, ship it to production after lunch.');
    await page.waitForFunction(() => !document.body.innerText.includes('Sending'), {
      timeout: 30_000,
    });
    await longPress('Great, ship it to production after lunch.');
    await label('React with 👍');
    checks.humanMenuOpens = await page.evaluate(() => {
      const copy = document.querySelector('[aria-label="Copy"]')?.getBoundingClientRect();
      return copy !== undefined && copy.right > window.innerWidth / 2;
    });
    await shot('4-long-press-human');
    steps.push("long-pressed the Human's own message: the menu opens on the right, at the bubble");

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
