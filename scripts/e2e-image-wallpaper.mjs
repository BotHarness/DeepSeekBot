import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
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
assert.ok(process.env.BH_E2E_INSTANCE);
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), 'wallpaper-' + Date.now());
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--lang=en-US'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const pause = () => new Promise((r) => setTimeout(r, 300));
const key = 'botharness:appearance:v1';
const baseline = process.argv.includes('--baseline');
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

const asset = resolve(out, 'source.png');
const imageBytes = async () =>
  Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1600;
      c.height = 1000;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 1600, 1000);
      g.addColorStop(0, '#182d6f');
      g.addColorStop(0.45, '#ca85af');
      g.addColorStop(1, '#f3d89a');
      x.fillStyle = g;
      x.fillRect(0, 0, 1600, 1000);
      x.fillStyle = '#fbe9b8';
      x.beginPath();
      x.arc(1180, 280, 140, 0, Math.PI * 2);
      x.fill();
      for (const [color, y] of [
        ['#496997', 620],
        ['#324e79', 780],
        ['#1d335d', 930],
      ]) {
        x.fillStyle = color;
        x.beginPath();
        x.moveTo(0, 1000);
        x.lineTo(0, y);
        x.bezierCurveTo(400, y - 280, 850, y + 180, 1600, y - 250);
        x.lineTo(1600, 1000);
        x.fill();
      }
      return c.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
const dbRead = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('botharness-wallpaper-v1', 1);
        r.onerror = () => reject(Error('database'));
        r.onsuccess = () => {
          const db = r.result,
            store = db.transaction('assets').objectStore('assets');
          const index = store.get('library');
          index.onsuccess = () => {
            const id = index.result?.active;
            if (!id) {
              resolve(null);
              db.close();
              return;
            }
            const q = store.get('item:' + id);
            q.onsuccess = async () => {
              const v = q.result;
              resolve(
                v
                  ? {
                      revision: v.revision,
                      crop: v.crop,
                      width: v.width,
                      height: v.height,
                      size: v.blob.size,
                      bytes: Array.from(new Uint8Array(await v.blob.arrayBuffer())),
                    }
                  : null,
              );
              db.close();
            };
          };
        };
      }),
  );
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
const getMedia = async () => (await cli('wallpaper-get', ['--client-id', target])).wallpaper;
const media = async (command, args = [], crop) => {
  const got = await getMedia();
  return cli(command, ['--client-id', target, '--expected-revision', got.revision, ...args], crop);
};
const settings = async () => {
  await click('Bot settings');
  await click('Appearance');
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

  await settings();
  await select('Theme', 'Light');
  target = await findTarget();
  await patch({
    mode: 'light',
    materials: { header: { opacity: 65, blur: 5 }, body: { opacity: 35, blur: 3 } },
  });
  if (baseline) {
    await screenshot('before-settings');
    await page.keyboard.press('Escape');
    await screenshot('before-workspace');
  } else {
    await page.waitForSelector('input[aria-label="Add wallpaper"]');
    await screenshot('after-settings-empty');
    const bytes = Buffer.concat([await imageBytes(), Buffer.alloc(450000)]);
    writeFileSync(asset, bytes);
    await (await page.$('input[aria-label="Add wallpaper"]')).uploadFile(asset);
    await page.waitForSelector('[data-wallpaper-item]');
    await page.waitForSelector('[data-bh-wallpaper]');
    assert.deepEqual((await dbRead()).crop, { x: 0.5, y: 0.5, zoom: 1 });
    await screenshot('library-added');
    await click('Adjust crop · Wallpaper 1');
    await page.waitForSelector('[data-wallpaper-preview]');
    await page.$eval('input[aria-label="Zoom"]', (n) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(n, '1.8');
      n.dispatchEvent(new Event('input', { bubbles: true }));
      n.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await pause();
    const box = await page.$eval('[data-wallpaper-preview]', (n) => {
      n.scrollIntoView({ block: 'center' });
      const r = n.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.mouse.move(box.x - 60, box.y + 30, { steps: 8 });
    await page.mouse.up();
    await screenshot('crop-adjusted');
    await click('Save');
    await page.waitForFunction(() => !document.querySelector('[data-wallpaper-preview]'));
    await page.waitForSelector('[data-bh-wallpaper]');
    const saved = await dbRead();
    assert.deepEqual(Buffer.from(saved.bytes), bytes);
    assert.equal(saved.crop.zoom, 1.8);
    assert.notEqual(saved.crop.x, 0.5);
    unlinkSync(asset);
    await page.keyboard.press('Escape');
    await screenshot('after-workspace');
    const coverage = async () =>
      page.$eval('[data-bh-wallpaper]', (n) => {
        const a = n.getBoundingClientRect(),
          b = n.querySelector('img').getBoundingClientRect();
        return {
          frame: { x: a.x, y: a.y, width: a.width, height: a.height },
          image: { x: b.x, y: b.y, width: b.width, height: b.height },
          pointer: getComputedStyle(n).pointerEvents,
          layers: document.querySelectorAll('[data-bh-wallpaper]').length,
        };
      });
    const wide = await coverage();
    assert.equal(wide.layers, 1);
    assert.equal(wide.pointer, 'none');
    for (const size of [
      { width: 1000, height: 1100 },
      { width: 1800, height: 850 },
    ]) {
      await page.setViewport(size);
      await pause();
      const c = await coverage();
      assert.ok(c.image.x <= c.frame.x + 0.1 && c.image.y <= c.frame.y + 0.1);
      assert.ok(c.image.width + c.image.x >= c.frame.x + c.frame.width - 0.1);
      assert.ok(c.image.height + c.image.y >= c.frame.y + c.frame.height - 0.1);
      assert.ok(Math.abs(c.image.width / c.image.height - 1.6) < 0.01);
      await screenshot('responsive-' + size.width);
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-bh-wallpaper]');
    target = await findTarget();
    assert.deepEqual(await dbRead(), saved);
    await screenshot('restored');
    const prefs = await read();
    await patch({ preference: 'dark' });
    assert.deepEqual(await dbRead(), saved);
    await screenshot('dark-same-image');
    await patch({ preference: 'light' });
    assert.deepEqual((await read()).modes, prefs.modes);
    await settings();
    await click('Adjust crop · Wallpaper 1');
    await page.waitForSelector('[data-wallpaper-preview]');
    await click('Cancel');
    assert.deepEqual(await dbRead(), saved);
    const invalid = resolve(out, 'invalid.png');
    writeFileSync(invalid, 'not an image');
    await (await page.$('input[aria-label="Add wallpaper"]')).uploadFile(invalid);
    await page.locator('::-p-text(Could not add or save)').wait();
    assert.deepEqual(await dbRead(), saved);
    await screenshot('decode-failure');
    writeFileSync(asset, bytes);
    await page.evaluate(() => {
      window.restoreWallpaperPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        if (this.name === 'assets')
          throw new DOMException('QA quota failure', 'QuotaExceededError');
        return window.restoreWallpaperPut.apply(this, arguments);
      };
    });
    await (await page.$('input[aria-label="Add wallpaper"]')).uploadFile(asset);
    await page.locator('::-p-text(Could not add or save)').wait();
    assert.deepEqual(await dbRead(), saved);
    assert.equal((await page.$$('[data-wallpaper-item]')).length, 1);
    await screenshot('storage-failure');
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.restoreWallpaperPut;
      delete window.restoreWallpaperPut;
    });
    await page.keyboard.press('Escape');
    await media('wallpaper-crop', ['--patch-stdin'], { x: 0.7, y: 0.3, zoom: 1.2 });
    assert.deepEqual((await dbRead()).crop, { x: 0.7, y: 0.3, zoom: 1.2 });
    await media('wallpaper-import', ['--file', asset]);
    assert.deepEqual(Buffer.from((await dbRead()).bytes), bytes);
    const beforeRemove = await read();
    await media('wallpaper-remove');
    assert.notEqual(await dbRead(), null);
    await media('wallpaper-remove');
    assert.equal(await dbRead(), null);
    assert.equal(await page.$('[data-bh-wallpaper]'), null);
    assert.deepEqual(await read(), beforeRemove);
    await screenshot('removed');
    await media('wallpaper-import', ['--file', asset]);
    await screenshot('cli-imported');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((n) =>
        /Exit Bot mode|退出 Bot 模式/.test(n.getAttribute('aria-label') || ''),
      );
      if (!b) throw Error('exit missing');
      b.click();
    });
    await pause();
    assert.equal(await page.$('[data-bh-wallpaper]'), null);
    await screenshot('dsh-unaffected');
    assert.deepEqual(errors, []);
    writeFileSync(
      resolve(out, 'proof.json'),
      JSON.stringify(
        {
          originalBytesPreserved: true,
          sourceDeletedRestore: true,
          crop: saved.crop,
          wide,
          resize: true,
          decodeFailurePreserves: true,
          quotaFailurePreserves: true,
          cliImportCropRemove: true,
          themeIndependent: true,
          dshUnaffected: true,
          errors,
        },
        null,
        2,
      ),
    );
  }
  console.log(JSON.stringify({ ok: true, out, baseline }));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png') });
  writeFileSync(
    resolve(out, 'failure.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  writeFileSync(resolve(out, 'errors.json'), JSON.stringify(errors));
  throw error;
} finally {
  await browser.close();
}
