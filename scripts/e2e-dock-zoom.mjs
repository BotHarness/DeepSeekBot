import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireClient = createRequire(join(root, 'packages/client/package.json'));
const core = dirname(
  createRequire(requireClient.resolve('dockview-react')).resolve('dockview-core'),
);
const store = join(root, 'node_modules/.pnpm');
const puppeteer = createRequire(
  join(
    store,
    readdirSync(store).find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const html = `<!doctype html><html><head><link rel="stylesheet" href="/dock.css"></head>
<body style="margin:0;position:fixed;inset:0"><div id="dock" style="width:100%;height:100%"></div>
<script type="module">
import {createDockview} from '/dock.mjs';
const elements = new Map();
const dock = createDockview(document.querySelector('#dock'), {
 defaultRenderer:'always', proportionalLayout:true, disableFloatingGroups:true,
 createComponent() {const element=document.createElement('input');element.value='retained';elements.set(element, true);return {element,init(){}};}
});
const a=dock.addPanel({id:'channels',component:'input'});
const b=dock.addPanel({id:'home',component:'input',position:{referencePanel:a,direction:'right'}});
const c=dock.addPanel({id:'tools',component:'input',position:{referencePanel:b,direction:'below'}});
a.api.setSize({width:300});
window.fixture={dock,a,b,c,elements};
</script></body></html>`;
const server = createServer((request, response) => {
  if (request.url === '/dock.mjs') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(readFileSync(join(core, 'main.esm.mjs')));
  } else if (request.url === '/dock.css') {
    response.setHeader('Content-Type', 'text/css');
    response.end(readFileSync(requireClient.resolve('dockview-react/dist/styles/dockview.css')));
  } else response.end(html);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1261, height: 820 });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.fixture?.dock.panels.length === 3);
  const failures = [];
  const measurements = [];
  for (const level of [0, ...Array.from({ length: 17 }, (_, i) => i - 8), 0]) {
    await page.evaluate((level) => {
      document.documentElement.style.zoom = String(1.2 ** level);
    }, level);
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))),
        ),
    );
    const result = await page.evaluate(() =>
      window.fixture.dock.panels.map((panel) => {
        const rect = (element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const actual = rect(panel.view.content.element.parentElement);
        const expected = rect(panel.group.element.querySelector('.dv-content-container'));
        const difference = Math.max(
          ...Object.keys(actual).map((key) => Math.abs(actual[key] - expected[key])),
        );
        return {
          id: panel.id,
          actual,
          expected,
          difference,
          retained:
            window.fixture.elements.has(panel.view.content.element) &&
            panel.view.content.element.value === 'retained',
        };
      }),
    );
    measurements.push({ level, panels: result });
    for (const panel of result)
      if (panel.difference > 2 || !panel.retained) failures.push({ level, ...panel });
  }
  for (const zoom of [1, 1 / 1.2, 1.2]) {
    await page.evaluate((zoom) => {
      document.documentElement.style.zoom = String(zoom);
      window.fixture.a.api.setSize({ width: 300 });
    }, zoom);
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    for (const axis of ['x', 'y']) {
      const drag = await page.evaluate((axis) => {
        const sash = [...document.querySelectorAll('.dv-sash')].find((element) => {
          const rect = element.getBoundingClientRect();
          return axis === 'x'
            ? rect.height > 100 && rect.width < 20
            : rect.width > 100 && rect.height < 20;
        });
        const rect = sash.getBoundingClientRect();
        const panel = axis === 'x' ? window.fixture.a : window.fixture.b;
        const dimension = axis === 'x' ? 'width' : 'height';
        const before = panel.group.element.getBoundingClientRect()[dimension];
        const start = { clientX: rect.x + 1, clientY: rect.y + 1 };
        const finish = {
          ...start,
          [axis === 'x' ? 'clientX' : 'clientY']: start[axis === 'x' ? 'clientX' : 'clientY'] + 60,
        };
        sash.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, ...start }));
        document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, ...finish }));
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, ...finish }));
        return { before, after: panel.group.element.getBoundingClientRect()[dimension] };
      }, axis);
      measurements.push({ zoom, axis, drag });
      if (Math.abs(drag.after - drag.before - 60) > 2) failures.push({ zoom, axis, drag });
    }
  }
  console.log(JSON.stringify({ measurements, failures }, null, 2));
  assert.equal(
    failures.length,
    0,
    'Dock panels must match their allocated geometry and splitters must track viewport pointer movement at every zoom',
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
