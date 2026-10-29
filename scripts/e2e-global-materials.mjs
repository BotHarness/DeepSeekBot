import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
const modules = resolve('node_modules/.pnpm');
const dependency = (name) =>
  createRequire(
    resolve(
      modules,
      readdirSync(modules).find((x) => x.startsWith(name + '@')),
      'node_modules/',
    ),
  )(name);
const puppeteer = dependency('puppeteer');
const { PNG } = dependency('pngjs');
assert.ok(process.env.BH_E2E_INSTANCE);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), 'materials-' + Date.now());
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = () => new Promise((r) => setTimeout(r, 300));
const key = 'botharness:appearance:v1';
const read = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
const cli = async (command, args = [], patch) => {
  const url = new URL(instance.url);
  const child = execFile(
    process.execPath,
    ['packages/deepseekbot/dist/deepseekbot.mjs', command, '--host', url.origin, ...args],
    { env: { ...process.env, DEEPSEEKBOT_HOST_TOKEN: url.searchParams.get('token') } },
  );
  child.stdin.end(patch === undefined ? '' : JSON.stringify(patch));
  return new Promise((resolve, reject) => {
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (v) => (stdout += v));
    child.stderr.on('data', (v) => (stderr += v));
    child.on('exit', (code) => {
      if (code !== 0) return reject(Error(stderr || stdout));
      resolve(JSON.parse(stdout));
    });
  });
};
const click = (name) => page.locator(`::-p-aria(${name}[role="button"])`).click();
const select = async (name, value) => {
  if (await page.$(`[role="radiogroup"][aria-label="${name}"]`)) {
    await page.locator(`::-p-aria(${value}[role="radio"])`).click();
    await pause();
    return;
  }
  await click(name);
  await page.locator(`::-p-aria(${value}[role="menuitem"])`).click();
  await pause();
};
const screenshot = async (name) => {
  await pause();
  await page.screenshot({ path: resolve(out, name + '.png') });
  writeFileSync(
    resolve(out, name + '.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
};
const findTarget = async () => {
  const revision = (await read()).revision;
  for (const candidate of (await cli('appearance-clients')).clients) {
    try {
      const value = await cli('appearance-get', ['--client-id', candidate.id]);
      if (value.snapshot.config.revision === revision) return candidate.id;
    } catch {}
  }
  throw Error('No Client matches the browser configuration revision');
};
let target;
const patch = async (value) => {
  const current = await read();
  await cli(
    'appearance-set',
    ['--client-id', target, '--expected-revision', current.revision, '--patch-stdin'],
    value,
  );
  await pause();
};
try {
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: await browser.userAgent(),
    acceptLanguage: 'en-US,en',
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() =>
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
    await pause();
  }
  if (!(await page.$('.bh-workspace-rail'))) await click('Bot mode');
  const native = await page.evaluate(() => ({
    mode: document.body.hasAttribute('data-ds-dark-theme'),
    style: document.body.getAttribute('style'),
  }));
  await click('Bot settings');
  await click('Appearance');
  await select('Theme', 'Light');
  target = await findTarget();
  if (process.argv.includes('--baseline')) {
    await select('Colors', 'Classic Blue');
    await screenshot('before-settings');
    await page.keyboard.press('Escape');
    await screenshot('before-panels');
  } else {
    await select('Colors', 'Forest Green');
    const cardBefore = await page.$eval('.bh-workspace-channels', (n) => ({
      background: getComputedStyle(n).backgroundColor,
      opacity: getComputedStyle(n).opacity,
    }));
    const input = page.locator('input[aria-label="Header opacity"]');
    await input.fill('35');
    await page.keyboard.press('Enter');
    await pause();
    assert.equal((await read()).modes.light.materials.header.opacity, 35);
    await patch({
      mode: 'light',
      materials: {
        header: { color: '#d9cbea', blur: 18 },
        body: { color: '#e9f1e9', opacity: 60, blur: 12 },
      },
    });
    assert.equal(
      await page.$eval('input[aria-label="Header background color"]', (n) => n.value),
      '#d9cbea',
    );
    await page.$eval('input[aria-label="Header opacity"]', (n) =>
      n.scrollIntoView({ block: 'center' }),
    );
    await screenshot('after-light-settings');
    await page.keyboard.press('Escape');
    await screenshot('after-light-panels');
    const light = await read();
    assert.deepEqual(
      await page.$eval('.bh-workspace-channels', (n) => ({
        background: getComputedStyle(n).backgroundColor,
        opacity: getComputedStyle(n).opacity,
      })),
      cardBefore,
    );
    const styles = await page.evaluate(() => ({
      headers: [
        ...document.querySelectorAll('.bh-workspace-mount .dv-tabs-and-actions-container'),
      ].map((n) => ({
        background: getComputedStyle(n).backgroundColor,
        blur: getComputedStyle(n).backdropFilter,
        opacity: getComputedStyle(n).opacity,
      })),
      bodies: [...document.querySelectorAll('.bh-workspace-mount .dv-content-container')].map(
        (n) => ({
          background: getComputedStyle(n).backgroundColor,
          blur: getComputedStyle(n).backdropFilter,
          opacity: getComputedStyle(n).opacity,
        }),
      ),
    }));
    assert.ok(styles.headers.length > 0 && styles.bodies.length > 0);
    assert.ok(styles.headers.every((s) => s.blur === 'blur(18px)' && s.opacity === '1'));
    assert.ok(styles.bodies.every((s) => s.blur === 'blur(12px)' && s.opacity === '1'));
    await click('Bot settings');
    await click('Appearance');
    await select('Theme', 'Dark');
    await patch({ mode: 'dark', preset: 'warm-amber' });
    await screenshot('after-dark-settings');
    await page.keyboard.press('Escape');
    await screenshot('after-dark-panels');
    assert.deepEqual((await read()).modes.light, light.modes.light);
    const saved = await read();
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.bh-workspace-rail');
    assert.deepEqual(await read(), saved);
    target = await findTarget();
    await patch({
      preference: 'light',
      mode: 'light',
      materials: { body: { opacity: 0, blur: 0 } },
    });
    const rect = await page.evaluate(() => {
      const body = document.querySelector(
        '.dv-groupview:has([data-dock-header="bh:channels"]) .dv-content-container',
      );
      if (!body) throw Error('Channels body missing');
      const fixture = document.createElement('style');
      fixture.dataset.materialFixture = '';
      fixture.textContent =
        '.dv-groupview:has([data-tab-panel-id="bh:channels"]){background-image:repeating-linear-gradient(90deg, black 0 5px, white 5px 10px)}';
      document.head.appendChild(fixture);
      const r = body.getBoundingClientRect();
      return { x: r.x + 30, y: r.y + r.height / 2, width: 150, height: 150 };
    });
    const sharp = await page.screenshot({ path: resolve(out, 'blur-off.png'), clip: rect });
    await patch({ mode: 'light', materials: { body: { blur: 20 } } });
    assert.ok(
      await page.$eval('.dv-groupview:has([data-tab-panel-id="bh:channels"])', (element) =>
        getComputedStyle(element).backgroundImage.includes('repeating-linear-gradient'),
      ),
    );
    const blurred = await page.screenshot({ path: resolve(out, 'blur-on.png'), clip: rect });
    const variance = (bytes) => {
      const png = PNG.sync.read(Buffer.from(bytes));
      let sum = 0,
        squares = 0,
        n = 0;
      for (let y = 20; y < png.height - 20; y++)
        for (let x = 20; x < png.width - 20; x++) {
          const value = png.data[(y * png.width + x) * 4];
          sum += value;
          squares += value * value;
          n++;
        }
      return squares / n - (sum / n) ** 2;
    };
    const pixels = { sharpVariance: variance(sharp), blurredVariance: variance(blurred) };
    assert.ok(pixels.sharpVariance > 1000, JSON.stringify(pixels));
    assert.ok(pixels.blurredVariance < pixels.sharpVariance * 0.3, JSON.stringify(pixels));
    await page.evaluate(() => {
      document.querySelector('style[data-material-fixture]').remove();
    });
    await patch({ mode: 'light', materials: light.modes.light.materials });
    assert.deepEqual(
      await page.evaluate(() => ({
        mode: document.body.hasAttribute('data-ds-dark-theme'),
        style: document.body.getAttribute('style'),
      })),
      native,
    );
    assert.deepEqual(errors, []);
    writeFileSync(
      resolve(out, 'results.json'),
      JSON.stringify({ native, styles, pixels, cardBefore, saved, errors }, null, 2),
    );
  }
  console.log(JSON.stringify({ ok: true, evidence: out }));
} catch (e) {
  await page.screenshot({ path: resolve(out, 'failure.png') });
  writeFileSync(
    resolve(out, 'failure.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  console.error(out);
  throw e;
} finally {
  await browser.close();
}
