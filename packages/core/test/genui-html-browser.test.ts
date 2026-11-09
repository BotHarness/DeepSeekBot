import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildGenuiHtmlDocument } from '../src/channels/genui-html.js';
import { previewGenuiDocument } from '../src/runtime/genui-preview.js';
import { loadGenuiRuntimeSource } from '../src/runtime/genui-runtime-source.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';
import { initialGenuiDocumentState } from '../src/channels/genui-document.js';
import { syntheticGenuiDiagrams } from './fixtures/genui-diagrams.js';
import { compileGenuiDiagram } from '../src/runtime/genui-diagram.js';

const enabled = process.env['BH_GENUI_BROWSER_QA'] === '1';

vi.mock('../src/runtime/genui-runtime-source.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/runtime/genui-runtime-source.js')>();
  return {
    ...actual,
    loadGenuiRuntimeSource: () =>
      actual.loadGenuiRuntimeSource(
        new URL('../dist/genui-runtime.js', import.meta.url),
        new URL('../dist/genui-runtime.json', import.meta.url),
      ),
  };
});

describe.skipIf(!enabled)('real Chromium isolated HTML documents', () => {
  let browser: {
    newPage(): Promise<VerificationPage>;
    close(): Promise<void>;
    pages(): Promise<unknown[]>;
  };
  let page: VerificationPage;
  let origin: string;
  let requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? '/');
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<p>Synthetic network probe</p>');
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Probe server unavailable');
    origin = `http://127.0.0.1:${address.port}`;
    const store = join(process.cwd(), 'node_modules/.pnpm');
    const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
    if (!entry) throw new Error('Installed verification browser driver unavailable');
    const puppeteer = createRequire(join(store, entry, 'node_modules/'))('puppeteer') as {
      launch(options: { headless: boolean; timeout: number }): Promise<typeof browser>;
    };
    browser = await puppeteer.launch({ headless: true, timeout: 15_000 });
    page = await browser.newPage();
    page.on('console', (message) => console.info('genui-browser-diagnostic', message.text()));
  }, 25_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  async function load(html = syntheticGenuiDocument.html, allowRefusal = false) {
    requests = [];
    const compiled = buildGenuiHtmlDocument(
      { ...syntheticGenuiDocument, html },
      { instanceId: 'browser-test', theme: 'dark', runtime: await loadGenuiRuntimeSource() },
    );
    await page.setContent(compiled.html);
    await page.waitForFunction(
      allowRefusal
        ? 'window.__genuiPreview?.ready === true || window.__genuiPreview?.failed === true'
        : 'window.__genuiPreview?.ready === true',
      { timeout: 10_000 },
    );
    const frame = page.frames().find((candidate) => candidate.parentFrame() === page.mainFrame());
    if (!frame && !allowRefusal) throw new Error('Script-disabled mirror frame unavailable');
    return frame!;
  }

  it('renders inline scripts, all content forms and locally changes the visible result', async () => {
    const frame = await load();
    await frame.waitForSelector('#rows tr');
    expect(
      await frame.$$eval('[data-scene]', (elements) =>
        elements.map((element) => element.getAttribute('data-scene')),
      ),
    ).toHaveLength(9);
    await frame.type('#filter', 'Alpha');
    await page.waitForFunction(
      () =>
        document.querySelector('iframe')?.contentDocument?.querySelectorAll('#rows tr').length ===
        1,
      { timeout: 5000 },
    );
    expect(
      await frame.$$eval('#rows tr', (elements) => elements.map((element) => element.textContent)),
    ).toHaveLength(1);
    expect(await frame.$eval('#rows tr', (element) => element.textContent)).toContain('Alpha');
    expect(requests).toEqual([]);
  });

  it('keeps native typed filters connected after repeated scene snapshots', async () => {
    const frame = await load();
    for (const scene of [
      'metrics',
      'comparison',
      'table',
      'bar',
      'line',
      'donut',
      'flow',
      'relations',
      'timeline',
      'table',
    ]) {
      await frame.select('#scene', scene);
      await page.waitForFunction(
        `document.querySelector('iframe').contentDocument.querySelector('[data-scene="${scene}"]').hidden === false`,
        { timeout: 5000 },
      );
    }
    await frame.type('#filter', 'Beta', { delay: 60 });
    await page.waitForFunction(
      'document.querySelector("iframe").contentDocument.querySelectorAll("#rows tr").length === 1',
      {
        timeout: 5000,
      },
    );
    expect(await frame.$eval('#rows tr', (element) => element.textContent)).toContain('Beta');
  });

  it.each(syntheticGenuiDiagrams)(
    'renders theme-aware offline SVG for $id without hiding axes',
    async (fixture) => {
      const compiled = await compileGenuiDiagram(fixture.source, 728);
      const frame = await load(
        `<section class="genui-surface">${compiled.svg}<p>${fixture.caption}</p></section>`,
      );
      const result = await frame.$eval('svg.pele', (svg) => {
        const seriesProbe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        seriesProbe.style.fill = 'var(--pele-series-1)';
        svg.append(seriesProbe);
        document.documentElement.style.colorScheme = 'light';
        const light = getComputedStyle(seriesProbe).fill;
        const lightAxes = [...svg.querySelectorAll('.pele-axis')].map(
          (axis) => getComputedStyle(axis).stroke,
        );
        document.documentElement.style.colorScheme = 'dark';
        const dark = getComputedStyle(seriesProbe).fill;
        const darkAxes = [...svg.querySelectorAll('.pele-axis')].map(
          (axis) => getComputedStyle(axis).stroke,
        );
        seriesProbe.remove();
        return {
          light,
          dark,
          lightAxes,
          darkAxes,
          border: getComputedStyle(svg.parentElement!).borderTopWidth,
        };
      });
      expect(result.light).not.toBe(result.dark);
      expect(result.border).toBe('0px');
      if (fixture.id === 'pele-xychart') {
        expect(result.lightAxes.length).toBeGreaterThan(0);
        for (const stroke of [...result.lightAxes, ...result.darkAxes])
          expect(['none', 'transparent', 'rgba(0, 0, 0, 0)']).not.toContain(stroke);
      }
      expect(requests).toEqual([]);
    },
  );

  it('keeps browser globals and credentials absent inside generated guest execution', async () => {
    const frame = await load(`<p id="result"></p><script>
      const results = [typeof parent, typeof localStorage, typeof indexedDB, typeof fetch, typeof WebSocket, typeof document.cookie];
      document.querySelector('#result').textContent = JSON.stringify(results);
    </script>`);
    expect(await frame.$eval('#result', (element) => element.textContent)).toBe(
      JSON.stringify(Array(6).fill('undefined')),
    );
    expect(await page.$eval('iframe', (element) => element.getAttribute('sandbox'))).toBe(
      'allow-same-origin allow-scripts',
    );
  });

  it.each(['fetch', 'image', 'style', 'frame', 'form', 'navigation', 'refresh', 'popup'])(
    'blocks document %s requests without a browser interception bypass',
    async (kind) => {
      const destination = `${origin}/${kind}`;
      const snippets: Record<string, string> = {
        fetch: `<script>fetch(${JSON.stringify(destination)}).catch(()=>{});</script>`,
        image: `<img src="${destination}">`,
        style: `<style>@import url('${destination}');body{background-image:url('${destination}')}</style>`,
        frame: `<iframe src="${destination}"></iframe>`,
        form: `<form action="${destination}" method="post"><input name="synthetic" value="probe"></form><script>document.querySelector('form').submit()</script>`,
        navigation: `<script>setTimeout(()=>location.assign(${JSON.stringify(destination)}),50)</script>`,
        refresh: `<meta http-equiv="refresh" content="0;url=${destination}">`,
        popup: `<script>window.open(${JSON.stringify(destination)})</script>`,
      };
      await load(`<p>Synthetic ${kind} restriction</p>${snippets[kind]}`, true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(requests).toEqual([]);
      expect((await browser.pages()).length).toBe(2);
    },
  );

  it('detects asynchronous overflow without a root border-box resize', async () => {
    await load(
      '<div style="height:100px;position:relative"><div id="overflow" style="position:absolute;height:100px">Overflow probe</div></div><script>setTimeout(()=>document.querySelector("#overflow").setAttribute("style","position:absolute;height:25001px"),300)</script>',
    );
    await page.waitForFunction(
      'window.__genuiPreview.failed === true && window.__genuiPreview.diagnostics.some(message => message.includes("resource"))',
      { timeout: 5000 },
    );
  });

  it('runs the production preview owner and returns exact content identity and an image', async () => {
    const result = await previewGenuiDocument(syntheticGenuiDocument, { width: 728 });
    const compiled = buildGenuiHtmlDocument(syntheticGenuiDocument, {
      instanceId: 'test',
      theme: 'dark',
      runtime: await loadGenuiRuntimeSource(),
    });
    expect(result.documentId).toBe(compiled.documentId);
    expect(result.policyVersion).toBe(compiled.policyVersion);
    expect(result.runtimeSha256).toBe(compiled.runtimeSha256);
    expect(result.height).toBeGreaterThan(200);
    expect(Buffer.from(result.screenshot.data, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect(result.diagnostics).toEqual([]);
  }, 25_000);

  it('measures the minimum-height mirror without waiting for a later resize', async () => {
    const result = await previewGenuiDocument({
      ...syntheticGenuiDocument,
      html: '<span>Small</span>',
    });
    expect(result.height).toBe(48);
    expect(result.diagnostics).toEqual([]);
  }, 25_000);

  it('refuses runaway guest execution while leaving the trusted page usable', async () => {
    await load('<p>Runaway</p><script>while(true){}</script>', true);
    await page.waitForFunction('window.__genuiPreview.failed === true', { timeout: 5000 });
    expect(await page.$eval('#genui-document', (element) => element.childElementCount)).toBe(0);
    expect(requests).toEqual([]);
    const frame = await load('<p id="recovered">Recovered</p>');
    expect(await frame.$eval('#recovered', (element) => element.textContent)).toBe('Recovered');
  });

  it('shares bounded execution across visible reports and fails siblings explicitly on a hard stop', async () => {
    const compiled = buildGenuiHtmlDocument(syntheticGenuiDocument, {
      instanceId: 'browser-test',
      theme: 'dark',
      runtime: await loadGenuiRuntimeSource(),
    });
    const config = JSON.stringify({
      document: syntheticGenuiDocument,
      state: initialGenuiDocumentState(syntheticGenuiDocument),
      theme: 'dark',
      generation: 1,
    }).replaceAll('<', '\\u003c');
    const script = `
      const qa = { handles: [], failures: [], ready: [] };
      window.__genuiMulti = qa;
      const mount = (name, html) => {
        const container = document.createElement('div');
        container.id = name;
        document.body.append(container);
        const options = ${config};
        if (html !== undefined) options.document.html = html;
        const surface = __BotHarnessGenuiRuntime.mountGenuiDocument(container, {
          ...options, instanceId: name,
          onState: () => {}, onHeight: () => {},
          onFailure: (reason) => qa.failures.push({ name, reason }),
        });
        qa.handles.push(surface);
        surface.ready.then(() => qa.ready.push(name), () => {});
        return surface;
      };
      mount('report-second');
      mount('report-third');
      mount('report-fourth');
      window.__genuiMultiNext = () => mount('report-overflow');
      window.__genuiMultiFail = () => {
        qa.handles[0].dispose();
        mount('report-runaway', '<p>Runaway</p><script>for(;;){}</' + 'script>');
      };
    `;
    await page.setContent(
      compiled.html.replace('</body>', `<script nonce="browser-test">${script}</script></body>`),
    );
    await page.waitForFunction(
      'window.__genuiPreview.ready && window.__genuiMulti.ready.length === 3',
      { timeout: 10_000 },
    );
    expect(await page.$eval('body', (element) => element.querySelectorAll('iframe').length)).toBe(
      4,
    );
    await page.$eval('body', () => Reflect.get(window, '__genuiMultiNext')());
    await page.waitForFunction(
      'window.__genuiMulti.failures.some(entry => entry.name === "report-overflow" && entry.reason === "resource")',
      { timeout: 5000 },
    );
    expect(await page.$eval('body', (element) => element.querySelectorAll('iframe').length)).toBe(
      4,
    );
    await page.$eval('body', () => Reflect.get(window, '__genuiMultiFail')());
    await page.waitForFunction(
      'window.__genuiPreview.failed && ["report-third", "report-fourth", "report-runaway"].every(name => window.__genuiMulti.failures.some(entry => entry.name === name))',
      { timeout: 5000 },
    );
    expect(await page.$eval('body', (element) => element.querySelectorAll('iframe').length)).toBe(
      0,
    );
    const recovered = await load('<p id="recovered">Recovered after shared failure</p>');
    expect(await recovered.$eval('#recovered', (element) => element.textContent)).toBe(
      'Recovered after shared failure',
    );
  });
});

interface VerificationFrame {
  parentFrame(): VerificationFrame | null;
  waitForSelector(selector: string): Promise<unknown>;
  type(selector: string, value: string, options?: { delay: number }): Promise<void>;
  select(selector: string, value: string): Promise<unknown>;
  waitForFunction(expression: string, options: { timeout: number }): Promise<unknown>;
  $$eval<Result>(selector: string, callback: (elements: Element[]) => Result): Promise<Result>;
  $eval<Result>(selector: string, callback: (element: Element) => Result): Promise<Result>;
}

interface VerificationPage {
  setContent(html: string): Promise<void>;
  waitForFunction(
    expression: string | (() => boolean),
    options: { timeout: number },
  ): Promise<unknown>;
  $eval<Result>(selector: string, callback: (element: Element) => Result): Promise<Result>;
  frames(): VerificationFrame[];
  mainFrame(): VerificationFrame;
  on(event: 'console', callback: (message: { text(): string }) => void): void;
}
