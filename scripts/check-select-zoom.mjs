import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stylexPlugin } from './stylex-plugin.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  args.set(process.argv[index], process.argv[index + 1]);
const baseline = args.get('--baseline');
if (baseline && (!/^[\w./-]+$/u.test(baseline) || baseline.startsWith('-')))
  throw Error('Invalid baseline ref');
const require = createRequire(join(root, 'scripts/stylex-plugin.mjs'));
const clientRequire = createRequire(join(root, 'packages/client/package.json'));
const nativeFile = clientRequire.resolve('@deepseek-ai/dsh-client-ui-primitives');
const nativeSource = readFileSync(nativeFile, 'utf8');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const ast = parse(nativeSource, { sourceType: 'module' });
let program;
traverse(ast, {
  Program(path) {
    program = path;
  },
});
const selected = new Map();
const names = new Set();
function visit(name) {
  if (names.has(name)) return;
  names.add(name);
  const binding = program.scope.getBinding(name);
  if (!binding) throw Error(`Native fixture binding missing: ${name}`);
  let statement = binding.path;
  while (statement.parentPath && !statement.parentPath.isProgram())
    statement = statement.parentPath;
  if (selected.has(statement.node.start)) return;
  selected.set(statement.node.start, statement.node);
  statement.traverse({
    ReferencedIdentifier(path) {
      if (path.scope.getBinding(path.node.name)?.scope === program.scope) visit(path.node.name);
    },
  });
}
const exports = [
  'Menu',
  'Modal',
  'Tooltip',
  'IconChevronDownOutlineRegular',
  'IconCloseOutlineRegular',
];
exports.forEach(visit);
const slices = [...selected.values()]
  .sort((a, b) => a.start - b.start)
  .map((node) => {
    const text = nativeSource.slice(node.start, node.end);
    return node.type === 'ImportDeclaration' && node.source.value.startsWith('.')
      ? text.replace(
          JSON.stringify(node.source.value),
          JSON.stringify(resolve(dirname(nativeFile), node.source.value)),
        )
      : text;
  });
const temporary = mkdtempSync(join(tmpdir(), 'bh-select-zoom-'));
const nativeFixture = join(temporary, 'native-menu.mjs');
writeFileSync(nativeFixture, `${slices.join('\n')}\nexport { ${exports.join(', ')} };\n`);
writeFileSync(
  join(temporary, 'LICENSE.native'),
  readFileSync(join(dirname(nativeFile), '../LICENSE')),
);
const entry = join(temporary, 'fixture.tsx');
const selectFile = join(root, 'packages/client/src/client/ds/select.tsx');
writeFileSync(
  entry,
  `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Select } from ${JSON.stringify(selectFile)};
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { mountZoomTooltips } from ${JSON.stringify(join(root, 'packages/client/src/client/window-zoom-tooltips.ts'))};
window.releaseTooltipAdapter=${args.get('--tooltip-baseline') ? '()=>{}' : 'mountZoomTooltips(document)'};
import { SettingsDialog } from ${JSON.stringify(join(root, 'packages/client/src/client/ds/settings-dialog.tsx'))};
const style=document.createElement('style');style.textContent='@bh-stylex-css';document.head.append(style);
function App(){
 const [config,setConfig]=useState({align:'end',dialog:false,tooltip:false,side:'bottom'});
 const [value,setValue]=useState('a');
 window.fixture={configure:setConfig};
 const content=config.tooltip?<div style={{position:'fixed',left:'40%',top:'30%'}}><Tooltip label="Fixture tooltip" portal openOnClick side={config.side} align={config.align}><button aria-label="Tooltip anchor">Anchor</button></Tooltip></div>:<><input aria-label="Retained draft" defaultValue="keep this draft"/><div className={config.dialog?'dialog-anchor':'page-anchor'}><Select label="Fixture selector" value={value} options={[{value:'a',label:'First'},{value:'b',label:'Second'},{value:'c',label:'Third'}]} onChange={setValue} align={config.align}/></div></>;
 return config.dialog?<SettingsDialog title="Fixture settings" sections={[{id:'general',label:'General'}]} activeId="general" onSelect={()=>{}} onClose={()=>{window.fixtureOwnerCloseCount=(window.fixtureOwnerCloseCount??0)+1}} labels={{nav:'Sections',close:'Close settings',picker:s=>'Choose '+s}}>{content}</SettingsDialog>:content;
}
createRoot(document.getElementById('app')).render(<App/>);
`,
);
const { build } = await import(
  pathToFileURL(createRequire(require.resolve('vitest/package.json')).resolve('vite')).href
);
const store = join(root, 'node_modules/.pnpm');
const puppeteer = createRequire(
  join(
    store,
    readdirSync(store).find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
let browser;
let server;
try {
  const built = await build({
    root,
    configFile: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      ...(baseline
        ? [
            {
              name: 'select-baseline',
              enforce: 'pre',
              load(id) {
                if (id === selectFile)
                  return execFileSync(
                    'git',
                    ['show', `${baseline}:packages/client/src/client/ds/select.tsx`],
                    { cwd: root, encoding: 'utf8' },
                  );
              },
            },
          ]
        : []),
      stylexPlugin({ rootDir: root }),
    ],
    resolve: {
      alias: {
        '@deepseek-ai/dsh-client-ui-primitives': nativeFixture,
        clsx: createRequire(nativeFile).resolve('clsx'),
        react: dirname(clientRequire.resolve('react/package.json')),
        'react-dom': dirname(clientRequire.resolve('react-dom/package.json')),
      },
    },
    build: { write: false, lib: { entry, formats: ['es'] } },
  });
  const chunks = built.output ?? built[0].output;
  const entryName = chunks.find((chunk) => chunk.type === 'chunk' && chunk.isEntry).fileName;
  const assets = new Map(
    chunks.map((chunk) => [
      '/' + chunk.fileName,
      chunk.type === 'chunk' ? chunk.code : chunk.source,
    ]),
  );
  const css = chunks
    .filter((chunk) => chunk.type === 'asset' && chunk.fileName.endsWith('.css'))
    .map((chunk) => chunk.source)
    .join('\n');
  const html = `<!doctype html><html data-platform="darwin"><head><style>${css}
html{--dsh-frame-top-clearance:40px;--dsh-frame-overlay-top:40px;--dsw-alias-bg-base:white;--dsw-alias-bg-layer-1:white;--dsw-alias-bg-layer-2:white;--dsw-alias-label-primary:black;--dsw-alias-label-secondary:gray;--dsw-alias-border-l2:gray;--dsw-menu-surface-fill:white;--dsw-alias-bg-mask-1:transparent}
body{margin:0;font-family:sans-serif}.page-anchor{position:fixed;right:24px;top:80px}.dialog-anchor{display:flex;justify-content:flex-end;margin-block:20px}input{max-width:100%;box-sizing:border-box}
</style></head><body><div id="app"></div><script type="module" src="/${entryName}"></script></body></html>`;
  server = createServer((request, response) => {
    response.setHeader('content-type', assets.has(request.url) ? 'text/javascript' : 'text/html');
    response.end(assets.get(request.url) ?? html);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', (request) =>
    request.url().startsWith(origin + '/') ? request.continue() : request.abort(),
  );
  await page.goto(origin);
  await page.waitForFunction(() => window.fixture);
  const rows = [];
  const frame = () =>
    page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
  for (const viewport of [
    { width: 1261, height: 820 },
    { width: 800, height: 600 },
  ]) {
    await page.setViewport(viewport);
    for (const dialog of [false, true])
      for (const align of ['start', 'end'])
        for (let level = -8; level <= 8; level++) {
          await page.evaluate(
            ({ dialog, align, level }) => {
              document.documentElement.style.zoom = String(1.2 ** level);
              document.documentElement.style.setProperty('--bh-window-zoom', String(1.2 ** level));
              window.fixture.configure({ dialog, align });
              window.fixtureOwnerCloseCount = 0;
            },
            { dialog, align, level },
          );
          await frame();
          await page.click('[aria-label="Fixture selector"]');
          await page.waitForSelector('[role="menu"]');
          await frame();
          const geometry = await page.evaluate(
            ({ align }) => {
              const trigger = document.querySelector('[aria-label="Fixture selector"]');
              const anchor = trigger.getBoundingClientRect();
              const menu = document.querySelector('[role="menu"]');
              const box = menu.getBoundingClientRect();
              const expected = Math.max(
                12,
                Math.min(
                  align === 'end' ? anchor.right - box.width : anchor.left,
                  innerWidth - box.width - 12,
                ),
              );
              return {
                anchor: anchor.toJSON(),
                menu: box.toJSON(),
                within:
                  box.left >= 11 &&
                  box.right <= innerWidth - 11 &&
                  box.top >= 39 &&
                  box.bottom <= innerHeight - 11,
                aligned: Math.abs(box.left - expected) <= 1,
                inDialog:
                  !trigger.closest('[role="dialog"]') ||
                  menu.closest('[role="dialog"]') === trigger.closest('[role="dialog"]'),
              };
            },
            { align },
          );
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('[role="menu"]'));
          const dismissal = await page.evaluate(() => ({
            focusReturned:
              document.activeElement?.getAttribute('aria-label') === 'Fixture selector',
            ownerClosed: window.fixtureOwnerCloseCount ?? 0,
          }));
          rows.push({ viewport, dialog, align, level, ...geometry, ...dismissal });
        }
  }
  await page.setViewport({ width: 1261, height: 820 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.44';
    document.documentElement.style.setProperty('--bh-window-zoom', '1.44');
    window.fixture.configure({ dialog: true, align: 'end' });
    window.fixtureOwnerCloseCount = 0;
  });
  await frame();
  await page.click('[aria-label="Fixture selector"]');
  await frame();
  if (args.get('--screenshots')) {
    const directory = resolve(args.get('--screenshots'));
    mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: join(directory, baseline ? 'before.png' : 'after.png') });
  }
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await frame();
  const keyboard = await page.evaluate(() => ({
    selected: document.querySelector('[aria-label="Fixture selector"]').textContent.trim(),
    draft: document.querySelector('[aria-label="Retained draft"]').value,
    menuClosed: !document.querySelector('[role="menu"]'),
    focus: document.activeElement?.getAttribute('aria-label'),
    ownerClosed: window.fixtureOwnerCloseCount ?? 0,
  }));
  await page.click('[aria-label="Fixture selector"]');
  await frame();
  await page.click('[aria-label="Fixture selector"]');
  await frame();
  const toggleClosed = await page.evaluate(() => !document.querySelector('[role="menu"]'));
  await page.click('[aria-label="Fixture selector"]');
  await frame();
  await page.evaluate(() => {
    window.fixtureRetained = {
      draft: document.querySelector('[aria-label="Retained draft"]'),
      menu: document.querySelector('[role="menu"]'),
    };
  });
  for (const level of [-8, 8, 0]) {
    await page.evaluate((level) => {
      document.documentElement.style.zoom = String(1.2 ** level);
      document.documentElement.style.setProperty('--bh-window-zoom', String(1.2 ** level));
    }, level);
    await frame();
    const stable = await page.evaluate(() => {
      const box = document.querySelector('[role="menu"]').getBoundingClientRect();
      return (
        document.querySelector('[aria-label="Retained draft"]') === window.fixtureRetained.draft &&
        document.querySelector('[role="menu"]') === window.fixtureRetained.menu &&
        box.left >= 11 &&
        box.right <= innerWidth - 11 &&
        box.top >= 39 &&
        box.bottom <= innerHeight - 11
      );
    });
    if (!baseline) assert.ok(stable, 'An open Select must follow a zoom change');
  }
  await page.click('[aria-label="Retained draft"]');
  await frame();
  const outside = await page.evaluate(() => ({
    closed: !document.querySelector('[role="menu"]'),
    focus: document.activeElement?.getAttribute('aria-label'),
  }));
  const tooltipRows = [];
  if (!baseline) {
    for (const viewport of [
      { width: 1261, height: 820 },
      { width: 800, height: 600 },
    ]) {
      await page.setViewport(viewport);
      for (const side of ['right', 'bottom', 'top'])
        for (const align of ['center', 'end'])
          for (let level = -8; level <= 8; level++) {
            await page.evaluate(
              ({ side, align, level }) => {
                document.documentElement.style.zoom = String(1.2 ** level);
                window.fixture.configure({ dialog: false, tooltip: true, side, align });
              },
              { side, align, level },
            );
            await frame();
            await page.hover('[aria-label="Tooltip anchor"]');
            await page.waitForSelector('[role="tooltip"]');
            await frame();
            const geometry = await page.evaluate(() => {
              const anchor = document
                .querySelector('[aria-label="Tooltip anchor"]')
                .getBoundingClientRect();
              const bubble = document.querySelector('[role="tooltip"]');
              const box = bubble.getBoundingClientRect();
              const side = bubble.dataset.side;
              const align = bubble.dataset.align;
              const desired =
                side === 'right'
                  ? anchor.right + 10
                  : align === 'end'
                    ? anchor.right - box.width
                    : (anchor.left + anchor.right - box.width) / 2;
              const expected = Math.max(12, Math.min(desired, innerWidth - box.width - 12));
              return {
                within:
                  box.left >= 11 &&
                  box.right <= innerWidth - 11 &&
                  box.top >= 39 &&
                  box.bottom <= innerHeight - 11,
                aligned: Math.abs(box.left - expected) < 1,
                anchor: anchor.toJSON(),
                bubble: box.toJSON(),
              };
            });
            tooltipRows.push({ viewport, side, align, level, ...geometry });
            if (level === 0) {
              await page.click('[aria-label="Tooltip anchor"]');
              await frame();
              await page.evaluate(() => {
                window.retainedTooltip = document.querySelector('[role="tooltip"]');
              });
              for (const next of [8, -8, 0]) {
                await page.evaluate((level) => {
                  document.documentElement.style.zoom = String(1.2 ** level);
                }, next);
                await frame();
                const stable = await page.evaluate(() => {
                  const bubble = document.querySelector('[role="tooltip"]');
                  const box = bubble.getBoundingClientRect();
                  const anchor = document
                    .querySelector('[aria-label="Tooltip anchor"]')
                    .getBoundingClientRect();
                  const desired =
                    bubble.dataset.side === 'right'
                      ? anchor.right + 10
                      : bubble.dataset.align === 'end'
                        ? anchor.right - box.width
                        : (anchor.left + anchor.right - box.width) / 2;
                  const expected = Math.max(12, Math.min(desired, innerWidth - box.width - 12));
                  return (
                    bubble === window.retainedTooltip &&
                    Math.abs(box.left - expected) < 1 &&
                    box.left >= 11 &&
                    box.right <= innerWidth - 11 &&
                    box.top >= 39 &&
                    box.bottom <= innerHeight - 11
                  );
                });
                if (!args.get('--tooltip-baseline'))
                  assert.ok(stable, 'An open tooltip must keep its anchor after zoom');
              }
            }
            await page.keyboard.press('Escape');
            await page.evaluate(() => document.activeElement?.blur());
            await page.mouse.move(0, 0);
            await page.waitForFunction(() => !document.querySelector('[role="tooltip"]'));
          }
    }
  }
  const report = {
    scope:
      'Isolated Chromium source-component regression using the production Select/SettingsDialog/PointerMenu and unmodified reachable native Menu/Modal code and CSS. No production Host, native OS chrome or embedded guest is exercised.',
    baseline: baseline ?? null,
    nativeSha256: createHash('sha256').update(nativeSource).digest('hex'),
    rows,
    tooltipRows,
    interactions: { keyboard, toggleClosed, outside },
    errors,
  };
  if (args.get('--output'))
    writeFileSync(resolve(args.get('--output')), JSON.stringify(report, null, 2) + '\n');
  const failures = rows.filter(
    (row) =>
      !row.within || !row.aligned || !row.inDialog || !row.focusReturned || row.ownerClosed > 0,
  );
  const tooltipFailures = tooltipRows.filter((row) => !row.within || !row.aligned);
  console.log(
    JSON.stringify({
      cases: rows.length,
      failures: failures.length,
      tooltipCases: tooltipRows.length,
      tooltipFailures: tooltipFailures.length,
      errors,
    }),
  );
  assert.equal(
    tooltipFailures.length,
    0,
    'Native tooltips must follow their viewport anchors under zoom',
  );
  assert.equal(errors.length, 0);
  if (!baseline) {
    assert.deepEqual(keyboard, {
      selected: 'Second',
      draft: 'keep this draft',
      menuClosed: true,
      focus: 'Fixture selector',
      ownerClosed: 0,
    });
    assert.equal(toggleClosed, true);
    assert.deepEqual(outside, { closed: true, focus: 'Retained draft' });
  }
  assert.equal(
    failures.length,
    0,
    'Select must remain aligned, visible and inside its owning Modal, then return focus',
  );
} finally {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
  rmSync(temporary, { recursive: true, force: true });
}
