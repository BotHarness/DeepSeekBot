import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
const modules = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((x) => x.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
assert.ok(process.env.BH_E2E_INSTANCE, 'Set the task-owned instance.json');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(
  process.env.BH_SCREENSHOT_DIR ?? dirname(process.env.BH_E2E_INSTANCE),
  `client-settings-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--lang=en-US'],
});
const errors = [];
const steps = [];
const cli = async (command, args = [], patch) => {
  const url = new URL(instance.url);
  const child = execFile(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', command, '--host', url.origin, ...args],
    {
      env: {
        ...process.env,
        DEEPSEEKBOT_HOST_TOKEN: url.searchParams.get('token'),
      },
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  child.stdin.end(patch === undefined ? undefined : JSON.stringify(patch));
  return new Promise((done, fail) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (v) => (stdout += v));
    child.stderr.on('data', (v) => (stderr += v));
    child.on('exit', (code) => {
      try {
        const value = JSON.parse(stdout || stderr);
        steps.push({ command, args, patch, code, value });
        done({ code, value });
      } catch {
        fail(Error(`CLI returned invalid JSON: ${stdout}${stderr}`));
      }
    });
  });
};
const ok = async (...args) => {
  const result = await cli(...args);
  assert.equal(result.code, 0, JSON.stringify(result.value));
  return result.value;
};
const refusal = async (...args) => {
  const result = await cli(...args);
  assert.notEqual(result.code, 0, JSON.stringify(result.value));
  return result.value.error ?? result.value;
};
const clients = async () => (await ok('appearance-clients')).clients.map((c) => c.id);
async function newClient(page, known) {
  for (let i = 0; i < 40; i++) {
    const fresh = (await clients()).filter((id) => !known.includes(id));
    if (fresh.length === 1) return fresh[0];
    await sleep(250);
  }
  throw Error('No single new Client registered');
}
async function open(page) {
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await settle(page);
}
async function dismiss(page) {
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .find(
          (b) =>
            [
              'Continue',
              'Configure later',
              'Skip tutorial',
              'Skip',
              'Close',
              'Don’t show again',
            ].includes(b.textContent.trim() || b.getAttribute('aria-label')) && b.offsetParent,
        )
        ?.click(),
    );
    await sleep(200);
  }
}
async function settle(page) {
  await dismiss(page);
  if (!(await page.$('.bh-workspace-rail')))
    await page.locator('::-p-aria(Bot mode[role="button"])').click();
  await page.waitForSelector('.bh-workspace-rail');
  await sleep(800);
  await dismiss(page);
  assert.equal(await page.$('[role="dialog"]'), null, 'no dialog left open');
}
async function openTob(page) {
  await page.locator('::-p-aria(Tob: Idle Tob No messages yet)').click();
  await sleep(800);
}
const shot = async (page, name) => {
  await sleep(500);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
};
const theme = async (client, preference) => {
  const { snapshot } = await ok('appearance-get', ['--client-id', client]);
  return ok(
    'appearance-set',
    ['--client-id', client, '--patch-stdin', '--expected-revision', snapshot.config.revision],
    { preference },
  );
};
const both = async (page, client, name) => {
  await theme(client, 'light');
  await shot(page, `${name}-light`);
  await theme(client, 'dark');
  await shot(page, `${name}-dark`);
};
const pageA = await browser.newPage();
const contextB = await browser.createBrowserContext();
const pageB = await contextB.newPage();
try {
  const before = await clients();
  await open(pageA);
  let a = await newClient(pageA, before);
  await open(pageB);
  const b = await newClient(pageB, [...before, a]);

  const prefsB = await ok('client-preferences-get', ['--client-id', b]);
  const prefsA = await ok('client-preferences-get', ['--client-id', a]);
  assert.equal(prefsA.theme.scope, 'client');
  assert.equal(prefsA.locale.scope, 'host');
  assert.equal(prefsA.theme.writeWith, 'appearance-set');
  const themeRefusal = await refusal(
    'client-preferences-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', prefsA.revision],
    { theme: 'dark' },
  );
  assert.equal(themeRefusal.code, 'client-settings-invalid-input');
  assert.match(themeRefusal.message, /appearance-set/);
  await theme(a, 'dark');
  const dark = await ok('client-preferences-get', ['--client-id', a]);
  assert.equal(dark.theme.preference, 'dark');
  await pageA.waitForFunction(
    () => document.querySelector('style[data-bh-appearance]')?.dataset.bhAppearance === 'dark',
  );
  assert.equal(
    (
      await refusal(
        'client-preferences-set',
        ['--client-id', a, '--patch-stdin', '--expected-revision', prefsA.revision],
        { notifications: { enabled: false } },
      )
    ).code,
    'client-settings-revision-conflict',
  );
  const consent = await refusal(
    'client-preferences-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', dark.revision],
    { notifications: { enabled: true } },
  );
  assert.ok(
    [
      'notification-permission-pending',
      'notification-permission-denied',
      'notification-unsupported',
    ].includes(consent.code),
    consent.code,
  );
  assert.deepEqual(await ok('client-preferences-get', ['--client-id', b]), prefsB);
  await shot(pageA, '01-preferences-theme-dark');
  await theme(a, 'light');
  await shot(pageA, '01-preferences-theme-light');

  const keys = await ok('client-shortcuts-get', ['--client-id', a]);
  const keysB = await ok('client-shortcuts-get', ['--client-id', b]);
  const altJ = { code: 'KeyJ', mod: false, alt: true, shift: false };
  const moved = await ok(
    'client-shortcuts-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', keys.revision],
    { action: 'quick-switcher', binding: altJ },
  );
  assert.deepEqual(moved.actions.find((x) => x.id === 'quick-switcher').binding, altJ);
  const taken = await refusal(
    'client-shortcuts-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', moved.revision],
    { action: 'help', binding: altJ },
  );
  assert.equal(taken.code, 'shortcut-conflict');
  assert.match(taken.message, /quick-switcher/u);
  const reserved = await refusal(
    'client-shortcuts-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', moved.revision],
    {
      action: 'help',
      binding: { code: 'KeyC', mod: true, alt: false, shift: false },
    },
  );
  assert.equal(reserved.code, 'shortcut-reserved');
  await pageA.keyboard.down('Alt');
  await pageA.keyboard.press('KeyJ');
  await pageA.keyboard.up('Alt');
  await pageA.waitForSelector('[role="listbox"]');
  await both(pageA, a, '02-shortcut-alt-j-opens-switcher');
  await pageA.keyboard.press('Escape');
  const latest = await ok('client-shortcuts-get', ['--client-id', a]);
  const disabled = await ok(
    'client-shortcuts-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', latest.revision],
    { action: 'help', binding: null },
  );
  assert.equal(disabled.actions.find((x) => x.id === 'help').binding, null);
  const reset = await ok(
    'client-shortcuts-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', disabled.revision],
    { action: 'help', reset: true },
  );
  assert.equal(reset.actions.find((x) => x.id === 'help').custom, false);
  assert.deepEqual(await ok('client-shortcuts-get', ['--client-id', b]), keysB);

  await openTob(pageA);
  await sleep(800);
  let layout = await ok('client-layout-get', ['--client-id', a]);
  const layoutB = await ok('client-layout-get', ['--client-id', b]);
  const active = layout.activeChannelId;
  assert.ok(active, 'Tob DM is active');
  layout = await ok(
    'client-layout-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', layout.revision],
    { global: { mode: 'advanced', channelsWidth: 0.3 } },
  );
  assert.equal(layout.global.mode, 'advanced');
  await sleep(800);
  await both(pageA, a, '03-layout-advanced-mode');
  layout = await ok('client-layout-get', ['--client-id', a]);
  layout = await ok(
    'client-layout-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', layout.revision],
    { channel: { id: active, direction: 'below', ratio: 0.4 } },
  );
  assert.equal(layout.activeChannelId, active);
  assert.deepEqual(
    {
      direction: layout.channels[active].direction,
      ratio: layout.channels[active].ratio,
    },
    { direction: 'below', ratio: 0.4 },
  );
  await both(pageA, a, '04-layout-channel-moved-below');
  layout = await ok('client-layout-get', ['--client-id', a]);
  layout = await ok(
    'client-layout-set',
    ['--client-id', a, '--patch-stdin', '--expected-revision', layout.revision],
    { channel: { id: active, open: false } },
  );
  assert.equal(layout.channels[active].open, false);
  await both(pageA, a, '05-layout-channel-hidden');
  assert.equal(
    (
      await refusal(
        'client-layout-set',
        ['--client-id', a, '--patch-stdin', '--expected-revision', layout.revision],
        { channel: { id: 'no-such-channel', open: true } },
      )
    ).code,
    'layout-channel-unknown',
  );
  const final = {
    preferences: await ok('client-preferences-get', ['--client-id', a]),
    shortcuts: await ok('client-shortcuts-get', ['--client-id', a]),
    layout: await ok('client-layout-get', ['--client-id', a]),
  };
  const old = a;
  const known = await clients();
  await pageA.reload({ waitUntil: 'networkidle2' });
  await settle(pageA);
  a = await newClient(pageA, known);
  await openTob(pageA);
  await sleep(800);
  for (const domain of ['preferences', 'shortcuts', 'layout'])
    assert.equal(
      (await ok(`client-${domain}-get`, ['--client-id', a])).revision,
      final[domain].revision,
      `${domain} survives reload`,
    );
  await shot(pageA, '06-after-reload');
  assert.ok(
    ['appearance-client-stale', 'appearance-client-unavailable'].includes(
      (await refusal('client-layout-get', ['--client-id', old])).code,
    ),
  );
  assert.equal(
    (await refusal('client-shortcuts-get', ['--client-id', 'missing-client'])).code,
    'appearance-client-stale',
  );
  assert.deepEqual(await ok('client-layout-get', ['--client-id', b]), layoutB);
  await shot(pageB, '07-second-client-unchanged');
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ steps, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, evidence: out }));
} catch (error) {
  await pageA.screenshot({ path: resolve(out, 'failure-a.png') }).catch(() => {});
  writeFileSync(resolve(out, 'results.json'), JSON.stringify({ steps, errors }, null, 2));
  console.error(out);
  throw error;
} finally {
  await browser.close();
}
