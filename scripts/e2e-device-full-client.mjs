import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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
  'usage: e2e-device-full-client.mjs --home <dir> --port <n> [--screenshots <dir>]',
);
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

async function operator(url) {
  const response = await fetch(url, { redirect: 'manual' });
  return response.headers
    .getSetCookie()
    .map((entry) => entry.split(';')[0])
    .join('; ');
}

const proof = [];
const step = (name, value) => {
  proof.push({ step: name, ...value });
  console.log(name.padEnd(40), JSON.stringify(value));
};

async function openFullClient(browser, credential, hash, scheme = 'light') {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: scheme,
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  const seen = { gateway: [], bare: [], sockets: [], errors: [] };
  page.on('pageerror', (error) => seen.errors.push(error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/botharness-device/web/api/'))
      seen.gateway.push(response.status());
    else if (url.pathname.startsWith('/api/'))
      seen.bare.push(`${response.status()} ${url.pathname}`);
  });
  page.on('websocket', (socket) => {
    const entry = { path: new URL(socket.url()).pathname, closed: false, frames: 0 };
    seen.sockets.push(entry);
    socket.on('framereceived', () => (entry.frames += 1));
    socket.on('close', () => (entry.closed = true));
  });
  let first = true;
  await page.route(`${base}/botharness-device/web/`, (route) => {
    if (!first) return route.continue();
    first = false;
    return route.continue({
      headers: { ...route.request().headers(), authorization: `Device ${credential}` },
    });
  });
  const response = await page.goto(`${base}/botharness-device/web/${hash}`, {
    waitUntil: 'load',
    timeout: 60000,
  });
  await page.waitForSelector('.bh-root', { state: 'attached', timeout: 30000 });
  for (const name of [/^(Continue|继续)$/u, /^(Later|稍后配置)$/u, /^(Skip tour|Skip|跳过教程)$/u])
    await page
      .getByRole('button', { name })
      .click({ timeout: 4000 })
      .catch(() => undefined);
  await page.waitForTimeout(2500);
  return { context, page, response, seen };
}

let host = await launch();
try {
  const cookie = await operator(host.url);
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
  const credential = paired.credential;
  step('paired', { deviceId: paired.deviceId !== undefined });

  const created = await fetch(`${base}/botharness-device/api/botharness/create`, {
    method: 'POST',
    headers: { authorization: `Device ${credential}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: 'botharness/create',
      payload: { args: { displayName: 'Ada Lovelace' } },
    }),
  });
  const bot = (await created.json()).result?.value?.bot;
  step('PersonaBot created through the device', { status: created.status, slug: bot?.slug });

  const browser = await chromium.launch();
  try {
    const anonymous = await (await browser.newPage()).goto(`${base}/botharness-device/web/`);
    step('WebView without credential', { status: anonymous.status() });

    const home = await openFullClient(browser, credential, '#botharness-open=home');
    const cookies = await home.context.cookies(`${base}/botharness-device/web/`);
    const session = cookies.find((entry) => entry.name === 'botharness-device-web');
    step('full client home', {
      status: home.response.status(),
      url: new URL(home.page.url()).pathname + new URL(home.page.url()).hash,
      botMode: (await home.page.$('.bh-root')) !== null,
      cookie: session && {
        path: session.path,
        httpOnly: session.httpOnly,
        sameSite: session.sameSite,
      },
      dshCookie: cookies.some((entry) => entry.name.startsWith('dsh-auth-')),
      gatewayCalls: home.seen.gateway.length,
      gatewayFailures: home.seen.gateway.filter((status) => status >= 400).length,
      bareApi: home.seen.bare,
      streams: home.seen.sockets.map((entry) => `${entry.path} frames=${entry.frames}`),
      pageErrors: home.seen.errors.length,
    });
    if (shots !== undefined) {
      mkdirSync(shots, { recursive: true });
      await home.page.screenshot({ path: join(shots, 'webview-home-light.png') });
    }

    const dm = await openFullClient(browser, credential, `#botharness-open=dm:${bot.slug}`);
    step('full client lands on the DM', {
      composer: await dm.page
        .locator('.bh-root textarea:visible, .bh-root [contenteditable="true"]:visible')
        .count(),
    });
    if (shots !== undefined) {
      await dm.page.screenshot({ path: join(shots, 'webview-dm-light.png') });
      const dark = await openFullClient(
        browser,
        credential,
        `#botharness-open=dm:${bot.slug}`,
        'dark',
      );
      await dark.page.screenshot({ path: join(shots, 'webview-dm-dark.png') });
      await dark.context.close();
    }
    await dm.context.close();

    const revoke = await fetch(`${base}/api/botharness/devices/revoke`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: paired.deviceId }),
    });
    const revoked = await revoke.json();
    await home.page.waitForTimeout(1500);
    step('revoke while the full client is open', {
      closedStreams: revoked.closedStreams,
      streamClosed: home.seen.sockets
        .filter((entry) => entry.path.endsWith('remote.mux'))
        .every((entry) => entry.closed),
    });
    const reload = await home.page.reload();
    step('full client after revoke', { status: reload.status(), body: await reload.text() });
    const operatorCall = await fetch(`${base}/api/botharness/devices`, { headers: { cookie } });
    step('operator after revoke', { status: operatorCall.status });
  } finally {
    await browser.close();
  }
} finally {
  await stop(host.pid);
}

const expect = Object.fromEntries(proof.map((entry) => [entry.step, entry]));
assert.equal(expect['WebView without credential'].status, 401);
assert.equal(expect['full client home'].status, 200);
assert.equal(expect['full client home'].botMode, true);
assert.equal(expect['full client home'].cookie.httpOnly, true);
assert.equal(expect['full client home'].dshCookie, false);
assert.equal(expect['full client home'].gatewayFailures, 0);
assert.deepEqual(expect['full client home'].bareApi, []);
assert.ok(expect['full client home'].streams.some((entry) => entry.includes('remote.mux')));
assert.ok(expect['full client lands on the DM'].composer > 0);
assert.ok(expect['revoke while the full client is open'].closedStreams >= 1);
assert.equal(expect['revoke while the full client is open'].streamClosed, true);
assert.equal(expect['full client after revoke'].status, 401);
assert.match(expect['full client after revoke'].body, /device-revoked/u);
assert.equal(expect['operator after revoke'].status, 200);
console.log('device full client live proof passed');
