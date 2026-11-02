import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stylexPlugin } from './stylex-plugin.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const { createServer: createViteServer } = await import(
  pathToFileURL(createRequire(require.resolve('vitest/package.json')).resolve('vite')).href
);
const vite = await createViteServer({
  configFile: false,
  plugins: [stylexPlugin({ rootDir: root })],
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});
const { WORKSPACE_CSS } = await vite.ssrLoadModule(
  '/packages/client/src/client/workspace-styles.ts',
);
const moduleSource = stripTypeScriptTypes(
  readFileSync(join(root, 'packages/client/src/client/workspace-chrome.ts'), 'utf8'),
);
const store = join(root, 'node_modules/.pnpm');
const puppeteer = createRequire(
  join(
    store,
    readdirSync(store).find((name) => name.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const html = `<!doctype html><html data-platform="darwin"><head><style>
${WORKSPACE_CSS}
body{margin:0}.workspace{position:fixed;inset:0}.bh-dock{position:absolute;inset:0;display:grid;grid-template-columns:64px 1fr;grid-template-rows:1fr 1fr}
.rail{grid-column:1;grid-row:1/3}.top{grid-column:2;grid-row:1}.bottom{grid-column:2;grid-row:2}
.rail-right .rail{grid-column:2}.rail-right .top,.rail-right .bottom{grid-column:1}
.dv-tabs-and-actions-container{height:36px}.bh-dock-header{display:flex;height:100%}.bh-dock-header button{margin-left:4px}
</style></head><body><div class="workspace" data-workspace-enabled>
<div class="bh-workspace-chrome"></div><div class="bh-dock" data-workspace-dock>
<div class="dv-groupview rail"><div class="bh-workspace-rail"><button>Rail</button></div></div>
<div class="dv-groupview top"><div class="dv-tabs-and-actions-container"><div class="bh-dock-header"><button>Channels</button></div></div></div>
<div class="dv-groupview bottom"><div class="dv-tabs-and-actions-container"><div class="bh-dock-header"><button>Tools</button></div></div></div>
</div></div><script type="module">
import {mountWorkspaceChrome,updateWorkspaceChrome} from '/chrome.mjs';
const root=document.querySelector('[data-workspace-enabled]');
const groups=[...document.querySelectorAll('.dv-groupview')].map(element=>({element,panels:[{id:element.classList.contains('rail')?'bh:workspace-rail':'test'}]}));
window.fixture={root,groups,update:()=>updateWorkspaceChrome(root,groups),release:mountWorkspaceChrome(root,()=>groups)};
</script></body></html>`;
const server = createServer((request, response) => {
  response.setHeader(
    'Content-Type',
    request.url === '/chrome.mjs' ? 'text/javascript' : 'text/html',
  );
  response.end(request.url === '/chrome.mjs' ? moduleSource : html);
});
let browser;
try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1261, height: 820 });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.fixture);
  const failures = [];
  let cases = 0;
  for (const level of Array.from({ length: 17 }, (_, i) => i - 8))
    for (const gap of [0, 4, 16])
      for (const placement of ['rail-left', 'rail-right', 'fullscreen', 'non-mac']) {
        const result = await page.evaluate(
          async ({ level, gap, placement }) => {
            document.documentElement.style.zoom = String(1.2 ** level);
            document.documentElement.toggleAttribute('data-fullscreen', placement === 'fullscreen');
            document.documentElement.dataset.platform =
              placement === 'non-mac' ? 'win32' : 'darwin';
            const dock = document.querySelector('.bh-dock');
            dock.style.padding = `${gap}px`;
            dock.style.gap = `${gap}px`;
            dock.classList.toggle('rail-right', placement === 'rail-right');
            dock.style.gridTemplateColumns = placement === 'rail-right' ? '1fr 64px' : '64px 1fr';
            window.fixture.update();
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
            const corner = document.querySelector('.bh-workspace-chrome').getBoundingClientRect();
            const active = corner.width > 0;
            return {
              width: corner.width,
              height: corner.height,
              active,
              groups: window.fixture.groups.map(({ element }) => {
                const button = element.querySelector('button').getBoundingClientRect();
                const intersects =
                  active &&
                  button.left < corner.right - 0.5 &&
                  button.right > corner.left &&
                  button.top < corner.bottom - 0.5 &&
                  button.bottom > corner.top;
                return { intersects, reserved: element.hasAttribute('data-bh-mac-corner') };
              }),
            };
          },
          { level, gap, placement },
        );
        cases++;
        const active = placement !== 'fullscreen' && placement !== 'non-mac';
        if (
          result.active !== active ||
          (active && (Math.abs(result.width - 88) > 0.5 || Math.abs(result.height - 40) > 0.5)) ||
          result.groups.some((group) => group.intersects || (!active && group.reserved))
        )
          failures.push({ level, gap, placement, ...result });
      }
  console.log(JSON.stringify({ cases, failures }, null, 2));
  assert.equal(
    failures.length,
    0,
    'Native corner must retain viewport size and never cover panel or rail controls',
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await vite.close();
}
