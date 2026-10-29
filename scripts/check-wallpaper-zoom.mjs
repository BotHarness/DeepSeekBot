import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pnpmCommand } from './dev-package-manager.mjs';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const modules = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const out = resolve(
  process.env.BH_WALLPAPER_EVIDENCE ?? '.humanlayer/tasks/2292-wallpaper-zoom/browser',
);
mkdirSync(out, { recursive: true });
const bundle = mkdtempSync(resolve(tmpdir(), 'bh-wallpaper-zoom-'));
let entry = 'packages/client/src/client/wallpaper-layer.ts';
if (process.argv.includes('--baseline')) {
  entry = resolve(bundle, 'wallpaper-layer.ts');
  writeFileSync(
    entry,
    execFileSync('git', ['show', 'origin/main:packages/client/src/client/wallpaper-layer.ts']),
  );
  for (const name of ['wallpaper-playback.ts', 'wallpaper-store.ts'])
    copyFileSync(resolve('packages/client/src/client', name), resolve(bundle, name));
}
const [packageManager, packageArguments] = pnpmCommand([
  'exec',
  'tsdown',
  entry,
  '--no-config',
  '--format',
  'esm',
  '--platform',
  'browser',
  '--no-clean',
  '--out-dir',
  bundle,
]);
execFileSync(packageManager, packageArguments, { stdio: 'pipe' });
const code = readFileSync(resolve(bundle, 'wallpaper-layer.js'), 'utf8');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1261, height: 820 });
  await page.setContent(
    '<style>html,body{margin:0;height:100%;overflow:hidden}.bh-workspace-mount{height:100%;width:100%;position:relative}</style><div class="bh-workspace-mount" data-workspace-enabled></div>',
  );
  await page.evaluate(async (source) => {
    const { mountWallpaper } = await import('data:text/javascript;base64,' + source);
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const x = canvas.getContext('2d');
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 8; col++) {
        x.fillStyle = `hsl(${row * 35 + col * 20} 65% 45%)`;
        x.fillRect(col * 200, row * 200, 200, 200);
        x.fillStyle = 'white';
        x.font = '32px sans-serif';
        x.fillText(`${col},${row}`, col * 200 + 20, row * 200 + 60);
      }
    const snapshot = {
      revision: 'fixture',
      current: {
        kind: 'image',
        url: canvas.toDataURL(),
        width: 1600,
        height: 1000,
        crop: { x: 0.5, y: 0.5, zoom: 1 },
      },
    };
    globalThis.releaseWallpaper = mountWallpaper({
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      setPlayback: () => {},
      refresh: async () => {},
      dispose: () => {},
    });
  }, Buffer.from(code).toString('base64'));
  for (const [width, height] of [
    [1261, 820],
    [430, 700],
  ]) {
    await page.setViewport({ width, height });
    for (let level = -8; level <= 8; level++) {
      await page.evaluate((z) => {
        document.documentElement.style.zoom = String(z);
      }, 1.2 ** level);
      try {
        await page.waitForFunction(
          () => {
            const frame = document.querySelector('[data-bh-wallpaper]').getBoundingClientRect();
            const media = document.querySelector('[data-bh-wallpaper] img').getBoundingClientRect();
            return (
              Math.abs(media.height - Math.max(innerWidth / 1600, innerHeight / 1000) * 1000) <
                0.1 &&
              media.left <= frame.left + 0.1 &&
              media.top <= frame.top + 0.1 &&
              media.right >= frame.right - 0.1 &&
              media.bottom >= frame.bottom - 0.1
            );
          },
          { timeout: 1000 },
        );
      } catch (error) {
        await page.screenshot({ path: resolve(out, 'failure.png') });
        throw error;
      }
      const row = await page.evaluate(() => {
        const rect = (e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          frame: rect(document.querySelector('[data-bh-wallpaper]')),
          media: rect(document.querySelector('[data-bh-wallpaper] img')),
        };
      });
      const expectedHeight = Math.max(width / 1600, height / 1000) * 1000;
      assert.ok(Math.abs(row.media.height - expectedHeight) < 0.1, `Crop moved at level ${level}`);
      results.push({ width, height, level, ...row });
      if (level === -1 || level === 2)
        await page.screenshot({ path: resolve(out, `${width}-${level}.png`) });
    }
  }
  await page.evaluate(() => globalThis.releaseWallpaper());
  assert.equal(await page.$('[data-bh-wallpaper]'), null);
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(out, 'measurements.json'),
    JSON.stringify(
      {
        results,
        errors,
        boundary: 'Actual wallpaper layer in Chromium fixture; not native DSH qualification.',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: results.length, errors, evidence: out }));
} finally {
  await browser.close();
}
