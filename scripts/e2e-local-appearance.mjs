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
  `appearance-${Date.now()}`,
);
mkdirSync(out, { recursive: true });
const key = 'botharness:appearance:v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  headless: true,
  userDataDir: resolve(out, 'browser-profile'),
  args: ['--no-sandbox', '--lang=en-US'],
});
let page = await browser.newPage();
const errors = [];
const results = [];
const cli = async (command, args = [], patch) => {
  const url = new URL(instance.url);
  const child = execFile(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', command, '--host', url.origin, ...args],
    {
      env: { ...process.env, DEEPSEEKBOT_HOST_TOKEN: url.searchParams.get('token') },
      maxBuffer: 1024 * 1024,
    },
  );
  if (patch !== undefined) child.stdin.end(JSON.stringify(patch));
  else child.stdin.end();
  return new Promise((resolve, reject) => {
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (v) => (stdout += v));
    child.stderr.on('data', (v) => (stderr += v));
    child.on('exit', (code) => {
      try {
        resolve({ code, value: JSON.parse(stdout || stderr) });
      } catch {
        reject(Error('CLI returned invalid JSON'));
      }
    });
  });
};
async function open(p) {
  p.on('pageerror', (e) => errors.push(e.message));
  const cdp = await p.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await p.setViewport({ width: 1440, height: 1000 });
  await p.goto(instance.url, { waitUntil: 'networkidle2' });
  await p.goto(instance.url, { waitUntil: 'networkidle2' });
  for (let i = 0; i < 8; i++) {
    await p.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find(
          (b) =>
            [
              'Continue',
              'Configure later',
              'Skip tutorial',
              '继续',
              '稍后配置',
              '跳过教程',
            ].includes(b.textContent.trim()) && b.offsetParent,
        )
        ?.click(),
    );
    await sleep(250);
  }
}
const click = (name) => page.locator(`::-p-aria(${name}[role="button"])`).click();
async function appearance() {
  if (!(await page.$('.bh-workspace-rail'))) await click('Bot mode');
  await page.waitForSelector('.bh-workspace-rail');
  await page.keyboard.press('Escape');
  await click('Bot settings');
  await click('Appearance');
  await sleep(350);
}
async function select(name, value) {
  if (await page.$(`[role="radiogroup"][aria-label="${name}"]`)) {
    await page.locator(`::-p-aria(${value}[role="radio"])`).click();
    await sleep(150);
    return;
  }
  await click(name);
  await page.locator(`::-p-aria(${value}[role="menuitem"])`).click();
  await sleep(150);
}
const read = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
async function proof(name) {
  await sleep(350);
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  writeFileSync(
    resolve(out, `${name}.aria.json`),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  results.push({
    name,
    config: await read(),
    styles: await page.evaluate(() => ({
      native: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base'),
      nativeMode: document.body.hasAttribute('data-ds-dark-theme'),
      ownedMode: getComputedStyle(
        document.querySelector('[role="dialog"]') ?? document.querySelector('.bh-root'),
      ).colorScheme,
    })),
  });
}
try {
  await open(page);
  const native = await page.evaluate(() => ({
    mode: document.body.hasAttribute('data-ds-dark-theme'),
    style: document.body.getAttribute('style'),
  }));
  await appearance();
  await select('Theme', 'Light');
  await select('Colors', 'Mist Purple');
  await proof('01-light-purple');
  assert.equal(
    await page.$eval('[role="dialog"]', (n) => getComputedStyle(n).colorScheme),
    'light',
  );
  await select('Theme', 'Dark');
  await proof('02-dark-purple');
  assert.equal(await page.$eval('[role="dialog"]', (n) => getComputedStyle(n).colorScheme), 'dark');
  assert.deepEqual(
    await page.evaluate(() => ({
      mode: document.body.hasAttribute('data-ds-dark-theme'),
      style: document.body.getAttribute('style'),
    })),
    native,
  );
  const stored = await read();
  await page.reload({ waitUntil: 'networkidle2' });
  await appearance();
  assert.deepEqual(await read(), stored);
  await proof('03-reloaded');
  let list = await cli('appearance-clients');
  assert.equal(list.code, 0);
  assert.ok(list.value.clients.length >= 1);
  const target = list.value.clients.at(-1).id;
  const got = await cli('appearance-get', ['--client-id', target]);
  assert.equal(got.code, 0);
  assert.deepEqual(got.value.snapshot.config, stored);
  const otherContext = await browser.createBrowserContext();
  const other = await otherContext.newPage();
  await open(other);
  const otherBefore = await other.evaluate((k) => localStorage.getItem(k), key);
  const set = await cli(
    'appearance-set',
    ['--client-id', target, '--patch-stdin', '--expected-revision', stored.revision],
    { preference: 'light', mode: 'light', primary: '#26805a' },
  );
  assert.equal(set.code, 0);
  await page.waitForFunction(
    () => document.querySelector('style[data-bh-appearance]')?.dataset.bhAppearance === 'light',
  );
  assert.equal(
    await page.$eval('input[aria-label="Light primary color"]', (n) => n.value),
    '#26805a',
  );
  assert.equal(await other.evaluate((k) => localStorage.getItem(k), key), otherBefore);
  await proof('04-cli-readback');
  await select('Colors', 'Mist Purple');
  assert.equal((await read()).modes.light.primary, undefined);
  assert.equal((await read()).modes.dark.preset, 'mist-purple');
  const conflict = await cli(
    'appearance-set',
    ['--client-id', target, '--patch-stdin', '--expected-revision', stored.revision],
    { preference: 'dark' },
  );
  assert.notEqual(conflict.code, 0);
  const invalid = await cli('appearance-get', ['--client-id', 'absent']);
  assert.notEqual(invalid.code, 0);
  await otherContext.close();
  await page.keyboard.press('Escape');
  await page.click('.bh-workspace-rail button[aria-label="Exit Bot mode"]');
  await page.waitForSelector('button[aria-label="Bot mode"]');
  assert.deepEqual(
    await page.evaluate(() => ({
      mode: document.body.hasAttribute('data-ds-dark-theme'),
      style: document.body.getAttribute('style'),
    })),
    native,
  );
  await appearance();
  await proof('05-reentered');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await select('Theme', 'Follow system');
  assert.equal(
    await page.$eval('[role="dialog"]', (n) => getComputedStyle(n).colorScheme),
    'light',
  );
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.waitForFunction(
    () => document.querySelector('style[data-bh-appearance]')?.dataset.bhAppearance === 'dark',
  );
  await proof('06-system-dark');
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(out, 'results.json'),
    JSON.stringify(
      {
        results,
        checks: [
          'separate mode palettes',
          'owned modal/menu',
          'reload',
          'explicit CLI target',
          'other browser isolation',
          'revision conflict',
          'stale target',
          'DSH unchanged',
          'exit/re-entry',
          'system changes',
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, evidence: out }));
} catch (e) {
  await page.screenshot({ path: resolve(out, 'failure.png') });
  writeFileSync(
    resolve(out, 'failure.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  writeFileSync(resolve(out, 'errors.json'), JSON.stringify(errors));
  console.error(out);
  throw e;
} finally {
  await browser.close();
}
