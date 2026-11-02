import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'tsdown';
import { stylexPlugin } from './stylex-plugin.mjs';
const modules = resolve('node_modules/.pnpm');
const puppeteer = createRequire(
  resolve(
    modules,
    readdirSync(modules).find((x) => x.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const out = resolve(
  process.env.BH_WALLPAPER_EVIDENCE ?? '.humanlayer/tasks/2293-wallpaper-chrome/browser',
);
mkdirSync(out, { recursive: true });
const bundle = mkdtempSync(resolve(tmpdir(), 'bh-wallpaper-chrome-'));
await build({
  config: false,
  entry: 'scripts/fixtures/wallpaper-chrome/entry.ts',
  outDir: bundle,
  platform: 'browser',
  format: 'esm',
  plugins: [stylexPlugin({ rootDir: process.cwd() })],
});
const code = Buffer.from(readFileSync(resolve(bundle, 'entry.js'))).toString('base64');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const rows = [],
  errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  for (const mode of ['light', 'dark'])
    for (const fullscreen of [false, true])
      for (const reverse of [false, true])
        for (const override of [false, true]) {
          await page.setContent(
            '<style>html,body{margin:0;height:100%}.bh-workspace-mount{position:relative;height:100%}.bh-dock{height:100%;padding:4px}.dv-tabs-and-actions-container{height:40px}.bh-workspace-chrome{pointer-events:none}</style><div class="bh-workspace-mount" data-workspace-enabled><div class="bh-workspace-chrome"></div><div class="bh-dock" data-workspace-dock><div class="bh-dock-theme"><div class="dv-groupview"><div class="dv-tabs-and-actions-container"><div class="dv-active-tab"><span data-dock-header="fixture">Header</span></div></div><div class="dv-content-container"><div class="bh-channel-session-header" data-appearance-header="fixture">Nested header</div></div></div></div></div></div>',
          );
          await page.evaluate(
            async ({ code, mode, fullscreen, reverse, override }) => {
              const m = await import('data:text/javascript;base64,' + code);
              document.documentElement.dataset.platform = 'darwin';
              document.documentElement.toggleAttribute('data-fullscreen', fullscreen);
              const appearance = new m.Appearance(
                { getItem: () => null, setItem: () => {} },
                () => mode,
                () => 'fixture-revision',
              );
              appearance.update({
                preference: mode,
                mode,
                preset: 'mist-purple',
                materials: { header: { opacity: 35 }, body: { opacity: 25 } },
              });
              const a = document.createElement('style');
              a.dataset.bhAppearance = mode;
              const snapshot = structuredClone(appearance.getSnapshot());
              if (override)
                snapshot.config.modes[mode].panels = {
                  'dock:fixture': { header: { color: '#abcdef', opacity: 55, blur: 3 } },
                };
              a.textContent = m.appearanceCss(snapshot);
              document.head.append(a);
              const workspace = document.createElement('style');
              workspace.textContent = m.WORKSPACE_CSS;
              if (reverse) document.head.append(workspace);
              const current = {
                kind: 'image',
                url:
                  'data:image/svg+xml,' +
                  encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="teal"/></svg>',
                  ),
                width: 1600,
                height: 1000,
                crop: { x: 0.5, y: 0.5, zoom: 1 },
              };
              globalThis.releaseChromeWallpaper = m.mountWallpaper({
                getSnapshot: () => ({ revision: 'fixture', current }),
                subscribe: () => () => {},
                setPlayback: () => {},
                refresh: async () => {},
                dispose: () => {},
              });
              if (!reverse) document.head.append(workspace);
            },
            { code, mode, fullscreen, reverse, override },
          );
          for (const level of [-8, 0, 2, 8]) {
            await page.evaluate((z) => {
              document.documentElement.style.zoom = String(z);
              document
                .querySelector('.bh-workspace-mount')
                .style.setProperty('--bh-workspace-zoom', String(z));
            }, 1.2 ** level);
            const row = await page.evaluate(() => {
              const c = document.querySelector('.bh-workspace-chrome'),
                h = document.querySelector('.dv-tabs-and-actions-container'),
                n = document.querySelector('.bh-channel-session-header');
              const style = (e) => {
                const s = getComputedStyle(e);
                return {
                  background: s.backgroundColor,
                  border: s.borderBottomColor,
                  clip: s.backgroundClip,
                  filter: s.backdropFilter,
                };
              };
              return {
                corner: style(c),
                header: style(h),
                nested: style(n),
                cornerWidth: c.getBoundingClientRect().width,
                cornerHeight: c.getBoundingClientRect().height,
              };
            });
            try {
              assert.equal(row.header.border, 'rgba(0, 0, 0, 0)');
              assert.equal(row.nested.border, 'rgba(0, 0, 0, 0)');
              assert.equal(row.header.clip, 'padding-box');
              assert.equal(row.nested.clip, 'padding-box');
              if (!fullscreen) {
                assert.equal(row.corner.background, 'rgba(0, 0, 0, 0)');
                assert.equal(row.corner.filter, 'none');
                assert.ok(Math.abs(row.cornerWidth - 88) < 0.1);
                assert.ok(Math.abs(row.cornerHeight - 40) < 0.1);
              }
              assert.notEqual(row.header.background, 'rgba(0, 0, 0, 0)');
              if (override) {
                assert.ok(row.header.background.endsWith('/ 0.55)'));
                assert.equal(row.header.filter, 'blur(3px)');
              }
            } catch (error) {
              await page.screenshot({ path: resolve(out, 'failure.png') });
              console.log(JSON.stringify({ mode, fullscreen, reverse, override, level, ...row }));
              throw error;
            }
            rows.push({ mode, fullscreen, reverse, override, level, ...row });
          }
          await page.evaluate(() => globalThis.releaseChromeWallpaper());
          const restored = await page.evaluate(
            () =>
              getComputedStyle(document.querySelector('.dv-tabs-and-actions-container'))
                .borderBottomColor,
          );
          assert.notEqual(restored, 'rgba(0, 0, 0, 0)');
        }
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(out, 'measurements.json'),
    JSON.stringify(
      {
        rows,
        errors,
        boundary:
          'Production workspace, appearance and wallpaper CSS in Chromium fixture; native controls and drag require native QA.',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: rows.length, errors }));
} finally {
  await browser.close();
  rmSync(bundle, { recursive: true, force: true });
}
