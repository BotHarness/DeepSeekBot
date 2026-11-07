import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGenuiHtmlDocument } from '../src/channels/genui-html.js';
import { genuiPreviewPage, previewGenuiDocument } from '../src/runtime/genui-preview.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';
import { syntheticGenuiDiagrams } from './fixtures/genui-diagrams.js';
import { compileGenuiDiagram } from '../src/runtime/genui-diagram.js';

const enabled = process.env['BH_GENUI_BROWSER_QA'] === '1';

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

  async function load(html = syntheticGenuiDocument.html) {
    requests = [];
    const compiled = buildGenuiHtmlDocument(
      { ...syntheticGenuiDocument, html },
      { instanceId: 'browser-test', theme: 'dark' },
    );
    await page.setContent(genuiPreviewPage(compiled.html, 'browser-test', 'dark'));
    await page.waitForFunction('window.__genuiPreview?.ready === true', { timeout: 5000 });
    const frame = page
      .frames()
      .find(
        (candidate) => candidate.parentFrame()?.parentFrame()?.parentFrame() === page.mainFrame(),
      );
    const inner =
      frame ??
      page
        .frames()
        .find((candidate) => candidate.parentFrame()?.parentFrame() === page.mainFrame());
    if (!inner) throw new Error('Generated document frame unavailable');
    return inner;
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
    expect(
      await frame.$$eval('#rows tr', (elements) => elements.map((element) => element.textContent)),
    ).toHaveLength(1);
    expect(await frame.$eval('#rows tr', (element) => element.textContent)).toContain('Alpha');
    expect(requests).toEqual([]);
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

  it('denies parent DOM and origin-scoped cookie/storage access', async () => {
    const frame = await load('<p>Synthetic opaque-origin fixture</p>');
    const denied = await frame.$eval('body', () => {
      let count = 0;
      for (const read of [
        () => parent.document.body.textContent,
        () => document.cookie,
        () => localStorage.getItem('synthetic'),
      ]) {
        try {
          read();
        } catch {
          count += 1;
        }
      }
      return count;
    });
    expect(denied).toBe(3);
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
      await load(`<p>Synthetic ${kind} restriction</p>${snippets[kind]}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(requests).toEqual([]);
      expect((await browser.pages()).length).toBe(2);
    },
  );

  it('detects asynchronous overflow without a root border-box resize', async () => {
    const inner = await load(
      '<div style="height:100px;position:relative"><div id="overflow" style="position:absolute;height:100px">Overflow probe</div></div>',
    );
    await inner.$eval('#overflow', (element) =>
      element.setAttribute('style', 'position:absolute;height:25001px'),
    );
    await page.waitForFunction(
      'window.__genuiPreview.diagnostics.includes("The document exceeds the height limit.")',
      { timeout: 5000 },
    );
  });

  it('runs the production preview owner and returns exact content identity and an image', async () => {
    const result = await previewGenuiDocument(syntheticGenuiDocument, { width: 728 });
    const compiled = buildGenuiHtmlDocument(syntheticGenuiDocument, {
      instanceId: 'test',
      theme: 'dark',
    });
    expect(result.documentId).toBe(compiled.documentId);
    expect(result.policyVersion).toBe(compiled.policyVersion);
    expect(result.height).toBeGreaterThan(200);
    expect(Buffer.from(result.screenshot.data, 'base64').subarray(1, 4).toString()).toBe('PNG');
    expect(result.diagnostics).toEqual([]);
  }, 25_000);
});

interface VerificationFrame {
  parentFrame(): VerificationFrame | null;
  waitForSelector(selector: string): Promise<unknown>;
  type(selector: string, value: string): Promise<void>;
  $$eval<Result>(selector: string, callback: (elements: Element[]) => Result): Promise<Result>;
  $eval<Result>(selector: string, callback: (element: Element) => Result): Promise<Result>;
}

interface VerificationPage {
  setContent(html: string): Promise<void>;
  waitForFunction(expression: string, options: { timeout: number }): Promise<unknown>;
  frames(): VerificationFrame[];
  mainFrame(): VerificationFrame;
  on(event: 'console', callback: (message: { text(): string }) => void): void;
}
