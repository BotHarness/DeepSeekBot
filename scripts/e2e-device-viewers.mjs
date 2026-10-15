import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const home = flag('--home');
const port = flag('--port');
const shots = flag('--screenshots');
assert.ok(
  home && port,
  'usage: e2e-device-viewers.mjs --home <dir> --port <n> [--screenshots <dir>]',
);
assert.notEqual(process.getuid?.(), 0, 'run as a regular user; Chrome refuses root');
const base = `http://127.0.0.1:${port}`;
const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve('playwright', {
    paths: [root, execSync('npm root -g', { encoding: 'utf8' }).trim()],
  }),
);

function launch() {
  return new Promise((resolveLaunch, reject) => {
    const child = spawn(
      process.execPath,
      [join(root, 'scripts/dev-instance.mjs'), '--home', home, '--port', port, '--json'],
      { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`dev-instance exited ${code}`));
      const summary = JSON.parse(out);
      resolveLaunch({ pid: summary.pid, url: summary.url });
    });
  });
}

async function stop(pid) {
  process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 100; i += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  process.kill(pid, 'SIGKILL');
}

const proof = [];
const step = (name, value) => {
  proof.push({ step: name, ...value });
  console.log(name.padEnd(44), JSON.stringify(value));
};

const fixture = createServer((_, response) => {
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(
    '<!doctype html><title>Phone viewer QA</title><body style="margin:0;font:40px sans-serif;background:#fde68a;color:#111;padding:48px"><h1>Phone viewer QA</h1><p>The Bot Browser, seen from the phone.</p></body>',
  );
});
await new Promise((r) => fixture.listen(0, '127.0.0.1', r));
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}/`;

let host = await launch();
try {
  const cookie = (await fetch(host.url, { redirect: 'manual' })).headers
    .getSetCookie()
    .map((entry) => entry.split(';')[0])
    .join('; ');
  const offer = await (
    await fetch(`${base}/api/botharness/devices/offer`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ origin: base }),
    })
  ).json();
  const payload = JSON.parse(
    Buffer.from(new URL(offer.link).searchParams.get('p'), 'base64url').toString(),
  );
  const paired = await (
    await fetch(`${base}/botharness-device/pair`, {
      method: 'POST',
      body: JSON.stringify({ offer: payload.offer, name: 'E2E phone' }),
    })
  ).json();
  const device = {
    authorization: `Device ${paired.credential}`,
    'content-type': 'application/json',
  };
  const rpc = async (method, args) =>
    (
      await (
        await fetch(`${base}/botharness-device/api/${method}`, {
          method: 'POST',
          headers: device,
          body: JSON.stringify({
            type: 'client-request',
            rpcId: crypto.randomUUID(),
            method,
            payload: { args },
          }),
        })
      ).json()
    ).result;
  const browserApi = async (path, body) => {
    const response = await fetch(`${base}/botharness-device/api/browser/${path}`, {
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: device,
    });
    return { status: response.status, body: await response.json() };
  };
  const bot = (await rpc('botharness/create', { displayName: 'Ada Lovelace' })).value.bot;
  await rpc('botharness/browserAccessSet', { slug: bot.slug, enabled: true });
  await rpc('botharness/computerAccessSet', { slug: bot.slug, enabled: true });
  const opened = await browserApi('tool', {
    slug: bot.slug,
    tool: 'browser_open',
    args: { url: fixtureUrl },
  });
  step('Bot Browser opened through the device', { status: opened.status, ok: opened.body.ok });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    const seen = { requests: [], outside: [], sockets: [] };
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin !== base) return;
      const entry = { path: url.pathname, status: response.status() };
      seen.requests.push(entry);
      if (!url.pathname.startsWith('/botharness-device/')) seen.outside.push(entry);
    });
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());
      if (url.origin === base && !url.pathname.startsWith('/botharness-device/'))
        seen.outside.push({ path: url.pathname, status: 'failed' });
    });
    page.on('websocket', (socket) => {
      const entry = { path: new URL(socket.url()).pathname, closed: false };
      seen.sockets.push(entry);
      socket.on('close', () => (entry.closed = true));
    });
    let first = true;
    await page.route(`${base}/botharness-device/web/`, (route) => {
      if (!first) return route.continue();
      first = false;
      return route.continue({
        headers: { ...route.request().headers(), authorization: device.authorization },
      });
    });
    await page.goto(`${base}/botharness-device/web/#botharness-open=dm:${bot.slug}`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    await page.waitForSelector('.bh-root', { state: 'attached', timeout: 30000 });
    for (const name of [
      /^(Continue|继续)$/u,
      /^(Later|稍后配置)$/u,
      /^(Skip tour|Skip|跳过教程)$/u,
    ])
      await page
        .getByRole('button', { name })
        .click({ timeout: 4000 })
        .catch(() => undefined);
    await page.getByRole('button', { name: /^(Channel settings|会话设置)$/u }).click();
    await page.getByText(/^(Browser|浏览器)$/u).click();
    const frame = page.locator('iframe[src*="botharness-browser/viewer/"]');
    await frame.waitFor({ timeout: 30000 });
    await page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/botharness-browser/viewer/local/frame') &&
        response.status() === 200,
      { timeout: 30000 },
    );
    await page.waitForTimeout(1500);
    const viewerPath = (path) => seen.requests.filter((entry) => entry.path.includes(path));
    step('Browser entry shows the live view', {
      frameSrc: await frame.getAttribute('src'),
      viewerPage: viewerPath('/botharness-browser/viewer/local/').map((entry) => entry.status)[0],
      frames: viewerPath('/viewer/local/frame').filter((entry) => entry.status === 200).length,
      observation: viewerPath('/api/browser/observation').every(
        (entry) => entry.path.startsWith('/botharness-device/web/') && entry.status === 200,
      ),
    });
    if (shots !== undefined) {
      mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: join(shots, 'webview-browser-live-light.png') });
    }

    await page.getByRole('button', { name: /^(Pause Bot|暂停 Bot)$/u }).click();
    await page.getByRole('button', { name: /^(Resume|继续)$/u }).waitFor({ timeout: 15000 });
    const paused = (await browserApi(`observation?slug=${bot.slug}`)).body.takeover;
    const pausedFrame = await page
      .waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith('/botharness-browser/viewer/local/frame') &&
          response.status() === 200,
        { timeout: 20000 },
      )
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(1500);
    if (shots !== undefined)
      await page.screenshot({ path: join(shots, 'webview-browser-paused-light.png') });
    await page.getByRole('button', { name: /^(Resume|继续)$/u }).click();
    await page.getByRole('button', { name: /^(Pause Bot|暂停 Bot)$/u }).waitFor({ timeout: 15000 });
    const resumed = (await browserApi(`observation?slug=${bot.slug}`)).body.takeover;
    step('pause and resume from the phone', {
      paused,
      pausedFrame,
      resumed,
      takeoverCalls: viewerPath('/api/browser/takeover').map(
        (entry) => `${entry.status} ${entry.path}`,
      ),
    });

    await page.getByText(/^(Computer|电脑)$/u).click();
    await page
      .waitForResponse(
        (response) => new URL(response.url()).pathname.endsWith('/api/computer/status'),
        { timeout: 15000 },
      )
      .catch(() => undefined);
    await page.waitForTimeout(1500);
    step('Computer entry reaches its routes', {
      status: viewerPath('/api/computer/').map((entry) => `${entry.status} ${entry.path}`),
    });
    if (shots !== undefined)
      await page.screenshot({ path: join(shots, 'webview-computer-light.png') });

    step('nothing left the device web directory', { outside: seen.outside });

    const revoke = await fetch(`${base}/api/botharness/devices/revoke`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: paired.deviceId }),
    });
    const revoked = await revoke.json();
    const viewer = page.frames().find((entry) => entry.url().includes('/viewer/local/'));
    const after = await viewer.evaluate(async (slug) => {
      const response = await fetch(`frame?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      return { status: response.status, body: await response.text() };
    }, bot.slug);
    await page.waitForTimeout(1000);
    step('revoke while the viewer is open', {
      closedStreams: revoked.closedStreams,
      muxClosed: seen.sockets
        .filter((entry) => entry.path.endsWith('remote.mux'))
        .every((entry) => entry.closed),
      nextFrame: after,
    });
    const operator = await fetch(`${base}/api/browser/observation?slug=${bot.slug}`, {
      headers: { cookie },
    });
    step('operator after revoke', { status: operator.status });
  } finally {
    await browser.close();
  }
} finally {
  await stop(host.pid);
  fixture.close();
}

const expect = Object.fromEntries(proof.map((entry) => [entry.step, entry]));
assert.equal(expect['Bot Browser opened through the device'].ok, true);
const live = expect['Browser entry shows the live view'];
assert.match(live.frameSrc, /^\.\/botharness-browser\/viewer\/local\//u);
assert.equal(live.viewerPage, 200);
assert.ok(live.frames > 0);
assert.equal(live.observation, true);
const control = expect['pause and resume from the phone'];
assert.equal(control.paused, true);
assert.equal(control.pausedFrame, true);
assert.equal(control.resumed, false);
assert.ok(control.takeoverCalls.length >= 2);
assert.ok(
  control.takeoverCalls.every((call) => call === '200 /botharness-device/web/api/browser/takeover'),
);
const computer = expect['Computer entry reaches its routes'].status;
assert.ok(computer.length > 0);
assert.ok(computer.every((call) => call.startsWith('200 /botharness-device/web/api/computer/')));
assert.deepEqual(expect['nothing left the device web directory'].outside, []);
const revoked = expect['revoke while the viewer is open'];
assert.ok(revoked.closedStreams >= 1);
assert.equal(revoked.muxClosed, true);
assert.equal(revoked.nextFrame?.status, 401);
assert.match(revoked.nextFrame.body, /device-revoked/u);
assert.equal(expect['operator after revoke'].status, 200);
console.log('device viewers live proof passed');
