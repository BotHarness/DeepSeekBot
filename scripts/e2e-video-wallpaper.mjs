import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  truncateSync,
} from 'node:fs';
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
const out = resolve(dirname(process.env.BH_E2E_INSTANCE), 'video-' + Date.now());
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
  for (let attempt = 0; attempt < 12; attempt++) {
    for (const candidate of (await cli('appearance-clients')).clients) {
      try {
        const value = await cli('appearance-get', ['--client-id', candidate.id]);
        if (value.snapshot.config.revision === revision) return candidate.id;
      } catch {}
    }
    await pause();
  }
  throw Error('No matching live Client after bounded read-only discovery');
};

const videoPath = resolve(out, 'source.webm'),
  imagePath = resolve(out, 'before.png');
const run = (args) => new Promise((r, j) => execFile('ffmpeg', args, (e) => (e ? j(e) : r())));
await run([
  '-y',
  '-f',
  'lavfi',
  '-i',
  'testsrc2=size=960x600:rate=24',
  '-t',
  '1.5',
  '-an',
  '-c:v',
  'libvpx-vp9',
  '-b:v',
  '400k',
  videoPath,
]);
await run(['-y', '-i', videoPath, '-frames:v', '1', imagePath]);
const original = readFileSync(videoPath);
const settings = async () => {
  await click('Bot settings');
  await click('Appearance');
};
let target;
const media = async (command, args = [], crop) => {
  const got = (await cli('wallpaper-get', ['--client-id', target])).wallpaper;
  return cli(command, ['--client-id', target, '--expected-revision', got.revision, ...args], crop);
};
const status = async () => (await cli('wallpaper-get', ['--client-id', target])).wallpaper;
const state = () =>
  page.$eval('[data-bh-wallpaper] video', (v) => ({
    time: v.currentTime,
    paused: v.paused,
    muted: v.muted,
    loop: v.loop,
    controls: v.controls,
    hidden: v.hidden,
    frames: v.getVideoPlaybackQuality().totalVideoFrames,
  }));
const record = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const q = indexedDB.open('botharness-wallpaper-v1');
        q.onerror = reject;
        q.onsuccess = () => {
          const db = q.result;
          const store = db.transaction('assets').objectStore('assets');
          const index = store.get('library');
          index.onsuccess = () => {
            if (!index.result?.active) {
              resolve(null);
              db.close();
              return;
            }
            const r = store.get('item:' + index.result.active);
            r.onsuccess = async () => {
              const v = r.result;
              resolve(
                v
                  ? {
                      revision: v.revision,
                      kind: v.kind,
                      crop: v.crop,
                      size: v.blob.size,
                      bytes: Array.from(new Uint8Array(await v.blob.arrayBuffer())),
                      poster: v.poster?.size,
                    }
                  : null,
              );
              db.close();
            };
          };
        };
      }),
  );
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
  const pref = await read();
  await cli(
    'appearance-set',
    ['--client-id', target, '--expected-revision', pref.revision, '--patch-stdin'],
    {
      mode: 'light',
      materials: { header: { opacity: 65, blur: 5 }, body: { opacity: 35, blur: 3 } },
    },
  );
  if (baseline) {
    await screenshot('before-settings');
    await (
      await page.$(
        baseline ? 'input[aria-label="Upload image"]' : 'input[aria-label="Add wallpaper"]',
      )
    ).uploadFile(imagePath);
    await page.waitForSelector('[data-wallpaper-preview]');
    await click('Use');
    await page.keyboard.press('Escape');
    await screenshot('before-image');
  } else {
    await screenshot('after-settings');
    await (await page.$('input[aria-label="Add wallpaper"]')).uploadFile(videoPath);
    await page.waitForSelector('[data-wallpaper-item]');
    await click('Adjust crop · Wallpaper 1');
    await page.waitForSelector('[data-wallpaper-preview] video');
    await screenshot('video-preview');
    await page.$eval('input[aria-label="Zoom"]', (n) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(n, '1.3');
      n.dispatchEvent(new Event('input', { bubbles: true }));
      n.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('Save');
    await page.waitForFunction(() => !document.querySelector('[data-wallpaper-preview]'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-bh-wallpaper] video');
      return v && !v.paused && v.currentTime > 0;
    });
    const saved = await record();
    assert.equal(saved.kind, 'video');
    assert.ok(saved.poster > 0);
    assert.deepEqual(Buffer.from(saved.bytes), original);
    assert.equal(saved.crop.zoom, 1.3);
    const samples = [];
    for (let i = 0; i < 38; i++) {
      samples.push(await state());
      await new Promise((r) => setTimeout(r, 100));
    }
    let loops = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i].time < samples[i - 1].time) loops++;
    assert.ok(loops >= 2);
    assert.ok(samples.at(-1).frames > samples[0].frames + 40);
    assert.ok(samples.every((s) => s.muted && s.loop && !s.controls));
    await screenshot('looping-video');
    const other = await browser.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await pause();
    const paused = await state();
    assert.equal(paused.paused, true);
    await new Promise((r) => setTimeout(r, 600));
    assert.ok(Math.abs((await state()).time - paused.time) < 0.05);
    assert.equal((await status()).playback.state, 'paused');
    await other.close();
    await page.bringToFront();
    await page.waitForFunction(() => !document.querySelector('[data-bh-wallpaper] video').paused);
    assert.equal((await status()).playback.state, 'playing');
    unlinkSync(videoPath);
    await page.reload({ waitUntil: 'networkidle2' });
    target = await findTarget();
    await page.waitForSelector('[data-bh-wallpaper] video');
    assert.deepEqual(await record(), saved);
    await screenshot('video-restored');
    await page.$eval('[data-bh-wallpaper] video', (v) => {
      v.src = 'data:video/webm;base64,AAAA';
      v.load();
    });
    await page.waitForFunction(() => document.querySelector('[data-bh-wallpaper] video').hidden);
    const fallback = await status();
    assert.equal(fallback.playback.state, 'poster');
    assert.ok(fallback.playback.reason.startsWith('wallpaper-playback-error-'));
    assert.ok(await page.$eval('[data-bh-wallpaper] img', (n) => n.complete && n.naturalWidth > 0));
    assert.deepEqual(await record(), saved);
    await screenshot('error-poster');
    await settings();
    await page.evaluate(() =>
      [...document.querySelectorAll('p[role="status"]')]
        .find((n) => n.textContent.startsWith('Video status'))
        .scrollIntoView({ block: 'center' }),
    );
    await screenshot('failure-reason');
    await page.keyboard.press('Escape');
    const block = await page.evaluateOnNewDocument(() => {
      HTMLMediaElement.prototype.play = () =>
        Promise.reject(new DOMException('QA blocked', 'NotAllowedError'));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    target = await findTarget();
    await page.waitForSelector('[data-bh-wallpaper] img');
    const restoredFallback = await status();
    assert.equal(restoredFallback.playback.state, 'poster');
    assert.deepEqual(await record(), saved);
    await screenshot('restore-poster');
    await page.removeScriptToEvaluateOnNewDocument(block.identifier);
    await page.reload({ waitUntil: 'networkidle2' });
    target = await findTarget();
    await page.waitForSelector('[data-bh-wallpaper] video');
    await media('wallpaper-crop', ['--patch-stdin'], { x: 0.6, y: 0.4, zoom: 1.2 });
    assert.deepEqual((await record()).crop, { x: 0.6, y: 0.4, zoom: 1.2 });
    writeFileSync(videoPath, original);
    await media('wallpaper-import', ['--file', videoPath]);
    assert.equal((await status()).current.kind, 'video');
    const accepted = await record();
    await settings();
    const oversized = resolve(out, 'oversized.webm');
    writeFileSync(oversized, 'x');
    truncateSync(oversized, 100 * 1024 * 1024 + 1);
    await (await page.$('input[aria-label="Add wallpaper"]')).uploadFile(oversized);
    await page.locator('::-p-text(Could not add or save)').wait();
    assert.deepEqual(await record(), accepted);
    unlinkSync(oversized);
    await page.evaluate(() => {
      window.restoreVideoPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        if (this.name === 'assets')
          throw new DOMException('QA quota failure', 'QuotaExceededError');
        return window.restoreVideoPut.apply(this, arguments);
      };
    });
    const items = (await page.$$('[data-wallpaper-item]')).length;
    await (await page.$('input[aria-label="Add wallpaper"]')).uploadFile(videoPath);
    await page.locator('::-p-text(Could not add or save)').wait();
    await pause();
    assert.deepEqual(await record(), accepted);
    assert.equal((await page.$$('[data-wallpaper-item]')).length, items);
    await screenshot('video-storage-failure');
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.restoreVideoPut;
      delete window.restoreVideoPut;
    });
    const invalid = resolve(out, 'invalid.webm');
    writeFileSync(invalid, 'invalid video');
    await (
      await page.$(
        baseline ? 'input[aria-label="Upload image"]' : 'input[aria-label="Add wallpaper"]',
      )
    ).uploadFile(invalid);
    await page
      .locator(
        baseline
          ? '::-p-text(The media could not be decoded or saved)'
          : '::-p-text(Could not add or save)',
      )
      .wait();
    assert.deepEqual(await record(), accepted);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.oldWallpaperVideo = document.querySelector('[data-bh-wallpaper] video');
      [...document.querySelectorAll('button')]
        .find((n) => n.getAttribute('aria-label') === 'Exit Bot mode')
        .click();
    });
    await pause();
    assert.equal(await page.$('[data-bh-wallpaper]'), null);
    assert.deepEqual(
      await page.evaluate(() => ({
        paused: window.oldWallpaperVideo.paused,
        src: window.oldWallpaperVideo.getAttribute('src'),
      })),
      { paused: true, src: null },
    );
    assert.equal((await status()).playback.state, 'inactive');
    await screenshot('dsh-no-video');
    assert.deepEqual(errors, []);
    writeFileSync(
      resolve(out, 'proof.json'),
      JSON.stringify(
        {
          codec: 'WebM VP9, no audio',
          loops,
          samples,
          backgroundPaused: paused,
          posterFailure: fallback.playback,
          restoreFallback: restoredFallback.playback,
          originalBytes: true,
          sourceDeletionReload: true,
          cli: true,
          exitReleasesSource: true,
          oversizedAndStorageFailurePreserve: true,
          errors,
        },
        null,
        2,
      ),
    );
  }
  console.log(JSON.stringify({ ok: true, out, baseline }));
} catch (e) {
  await page.screenshot({ path: resolve(out, 'failure.png') });
  writeFileSync(
    resolve(out, 'failure.aria.json'),
    JSON.stringify(await page.accessibility.snapshot(), null, 2),
  );
  writeFileSync(resolve(out, 'errors.json'), JSON.stringify(errors));
  throw e;
} finally {
  await browser.close();
}
