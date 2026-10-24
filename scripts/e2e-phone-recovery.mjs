import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cookieFor, verifyPaths } from './verify-app.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const name = option('--name', 'phone-recovery-2731');
const before = args.includes('--before');
const theme = option('--theme', 'light');
const paths = verifyPaths(name);
const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
const origin = new URL(instance.url).origin;
const cookie = cookieFor(instance.home);
const evidence = resolve('.humanlayer/tasks/2731-phone-recovery/evidence');
mkdirSync(evidence, { recursive: true });
const store = resolve('node_modules/.pnpm');
const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(join(store, entry, 'node_modules', '/'))('puppeteer');
const canonical = async (path = '', body) => {
  const response = await fetch(`${origin}/api/botharness/devices${path}`, {
    headers: { cookie, 'content-type': 'application/json' },
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.ok, true, `Devices ${path}: ${response.status}`);
  return response.json();
};
const initial = await canonical();
let routingSnapshot = initial;
const enabledHere = initial.lan?.state !== 'listening';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--lang=en-US'],
  protocolTimeout: 120_000,
});
const page = await browser.newPage();
const consoleIssues = [];
const scripts = [];
page.on('pageerror', (error) => consoleIssues.push(error.message));
page.on('response', async (response) => {
  if (response.request().resourceType() === 'script') {
    const url = new URL(response.url());
    scripts.push(url.pathname + url.search);
  }
});
await page.setViewport({ width: 1280, height: 900 });
await page.setExtraHTTPHeaders({ 'accept-language': 'en-US' });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US'] });
});
let failStatus = false;
let failOffer = false;
let changedRoutes = false;
const baseBundle = option('--bundle');
let baseLoaded = false;
await page.setRequestInterception(true);
page.on('request', (request) => {
  const url = new URL(request.url());
  if (baseBundle && url.pathname === '/plugins/' && url.search.includes('@botharness/ui/client.js'))
    return void fetch(request.url(), { headers: { cookie } }).then(async (response) => {
      const content = await response.text();
      const current = readFileSync('packages/client/lib/client.js', 'utf8').replace(
        /\n\/\/# sourceMappingURL=.*$/u,
        '',
      );
      assert.ok(
        content.includes(current),
        'The served chunk must contain the exact current UI bundle',
      );
      baseLoaded = true;
      await request.respond({
        status: 200,
        contentType: 'application/javascript',
        body: content.replace(current, () =>
          readFileSync(baseBundle, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/u, ''),
        ),
      });
    });
  if (url.pathname === '/api/botharness/devices' && request.method() === 'GET') {
    if (failStatus) return void request.respond({ status: 503, body: '{}' });
    if (changedRoutes)
      return void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...routingSnapshot,
          routes: {
            ...routingSnapshot.routes,
            routes: routingSnapshot.routes.routes.filter((route) => route.kind === 'loopback'),
          },
        }),
      });
  }
  if (url.pathname.endsWith('/devices/offer') && failOffer)
    return void request.respond({ status: 503, contentType: 'application/json', body: '{}' });
  void request.continue();
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const click = async (text) => {
  const selector = `::-p-aria([name="${text}"][role="button"])`;
  await page.waitForSelector(selector, { timeout: 20_000 });
  const targets = await page.$$(selector);
  await targets.at(-1).click();
  console.log(JSON.stringify({ step: 'click', label: text }));
};
const dismiss = async () => {
  for (let round = 0; round < 4; round += 1) {
    for (const text of ['Continue', 'Configure later', 'Skip tutorial', 'Continue later']) {
      const handle = await page.$(`::-p-aria(${text})`);
      if (handle) await handle.click().catch(() => undefined);
    }
    await pause(250);
  }
};
const capture = async (label, selector = '[role="dialog"]') => {
  const target = await page.$(selector);
  assert.ok(target, label);
  const box = await target.boundingBox();
  const crop = await page.evaluate((label) => {
    const scope = document.querySelector(
      label === 'offer' ? '[data-pair-dialog]' : '[data-paired-devices]',
    );
    const note = [...scope.querySelectorAll('p')].find((node) =>
      node.textContent.includes(label === 'offer' ? 'Something went wrong.' : 'Host fingerprint'),
    );
    return note?.getBoundingClientRect().top;
  }, label);
  assert.ok(crop !== undefined, `Private-data crop: ${label}`);
  const clip =
    label === 'offer'
      ? { x: box.x, y: crop, width: box.width, height: box.y + box.height - crop }
      : { x: box.x, y: box.y, width: box.width, height: crop - box.y - 8 };
  await page.screenshot({
    path: join(evidence, `${before ? 'b' : 'a'}-${theme}-${label}.png`),
    clip,
  });
  writeFileSync(
    join(evidence, `${before ? 'b' : 'a'}-${theme}-${label}.aria.json`),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};
const checks = {};
try {
  if (enabledHere) await canonical('/lan', { action: 'enable', confirm: true });
  routingSnapshot = await canonical();
  await page.goto(instance.url, { waitUntil: 'domcontentloaded' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await dismiss();
  await click('Bot mode');
  await page.waitForSelector('.bh-root.bh-main');
  await pause(1500);
  await dismiss();
  if (theme === 'dark')
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''));
  await click('Bot settings');
  await pause(500);
  await dismiss();
  await click('Devices');
  await page.waitForFunction(() => document.querySelector('[data-device-lan="listening"]'), {
    timeout: 30_000,
  });
  failStatus = true;
  await pause(4000);
  await capture('status');
  const stale = await page.$('[data-device-status="stale"]');
  if (!before) assert.ok(stale, 'Status failure must mark the cached result stale');
  checks.staleShown = stale !== null;
  failStatus = false;
  if (!before) await click('Retry');
  await page.waitForFunction(() => !document.querySelector('[data-device-status="stale"]'));
  await pause(3500);
  failOffer = true;
  await click('Pair a phone');
  await pause(500);
  await capture('offer', '[data-pair-dialog]');
  if (!before) {
    assert.equal(
      await page.$eval('[data-pair-dialog]', (node) => node.textContent.includes('Loading…')),
      false,
    );
    failOffer = false;
    await click('Retry');
  } else {
    failOffer = false;
    await click('Close');
    await click('Pair a phone');
  }
  await page.waitForSelector('[data-pair-qr]');
  checks.retryCreatedRealOffer = true;
  changedRoutes = true;
  if (before) await pause(10_000);
  else
    await page.waitForFunction(() => !document.querySelector('[data-pair-qr]'), {
      timeout: 20_000,
    });
  if (!before) {
    assert.equal(await page.$('[data-pair-qr]'), null, 'Changed routes must hide the old QR');
    assert.ok(await page.$('::-p-aria(New code)'));
  }
  checks.oldQrHidden = (await page.$('[data-pair-qr]')) === null;
  const dialog = await page.$('[data-pair-dialog]');
  const box = await dialog.boundingBox();
  const action = await dialog.$('button');
  const actionBox = await action.boundingBox();
  await page.screenshot({
    path: join(evidence, `${before ? 'b' : 'a'}-${theme}-routes.png`),
    clip: {
      x: box.x,
      y: Math.max(box.y, actionBox.y - 30),
      width: box.width,
      height: box.y + box.height - Math.max(box.y, actionBox.y - 30),
    },
  });
  checks.canonicalDeviceCountUnchanged =
    (await canonical()).devices.length === initial.devices.length;
  assert.equal(checks.canonicalDeviceCountUnchanged, true);
  assert.deepEqual(consoleIssues, []);
  if (baseBundle) assert.equal(baseLoaded, true);
  writeFileSync(
    join(evidence, `${before ? 'before' : 'after'}-${theme}.json`),
    JSON.stringify(
      {
        checks,
        consoleIssues,
        scripts: [...new Set(scripts)],
        faultScope:
          'Browser-only status/offer failures and route-set removal; actual task-owned Host and real LAN pairing offer. No OS Tailscale or physical-phone claim.',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ before, theme, checks, consoleIssues, evidence }));
} catch (error) {
  await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => undefined);
  writeFileSync(
    join(evidence, 'failure.json'),
    JSON.stringify({ message: error.message, scripts, consoleIssues }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  if (enabledHere) await canonical('/lan', { action: 'disable', confirm: true });
}
process.exit(0);
