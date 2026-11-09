import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGenuiPageHtml } from '../src/channels/genui-page.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';
import { initialGenuiDocumentState } from '../src/channels/genui-document.js';

const enabled = process.env['BH_GENUI_BROWSER_QA'] === '1';

interface NativePage {
  setContent(html: string): Promise<void>;
  waitForFunction(expression: string, options: { timeout: number }): Promise<unknown>;
  evaluate<T>(expression: string): Promise<T>;
  frames(): {
    parentFrame(): unknown;
    type(selector: string, text: string): Promise<void>;
    $$eval<T>(selector: string, run: (nodes: Element[]) => T): Promise<T>;
  }[];
  mainFrame(): unknown;
}

describe.skipIf(!enabled)('real Chromium native-bridge GenUI page', () => {
  let browser: { newPage(): Promise<NativePage>; close(): Promise<void> };
  let page: NativePage;

  beforeAll(async () => {
    const store = join(process.cwd(), 'node_modules/.pnpm');
    const entry = readdirSync(store).find((name) => name.startsWith('puppeteer@'));
    if (!entry) throw new Error('Installed verification browser driver unavailable');
    const puppeteer = createRequire(join(store, entry, 'node_modules/'))('puppeteer') as {
      launch(options: { headless: boolean; timeout: number }): Promise<typeof browser>;
    };
    browser = await puppeteer.launch({ headless: true, timeout: 15_000 });
    page = await browser.newPage();
  }, 25_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function open(html: string) {
    const runtime = readFileSync(new URL('../dist/genui-runtime.js', import.meta.url));
    const stub =
      '<script nonce="native-test">window.__nativeMessages = []; window.ReactNativeWebView = { postMessage: (data) => window.__nativeMessages.push(JSON.parse(data)) };</script>';
    await page.setContent(
      buildGenuiPageHtml(
        { ...syntheticGenuiDocument, html },
        {
          instanceId: 'native-test',
          theme: 'dark',
          textScale: 22 / 14,
          runtimeBase64: runtime.toString('base64'),
          bridge: 'native',
        },
      ).replace('<head>', `<head>${stub}`),
    );
  }

  it('posts readiness and a measured height for the packaged runtime and keeps the mirror script-free', async () => {
    await open(syntheticGenuiDocument.html);
    await page.waitForFunction(
      'window.__nativeMessages.some((message) => message.type === "ready") && window.__nativeMessages.some((message) => message.type === "height")',
      { timeout: 10_000 },
    );
    const messages =
      await page.evaluate<{ instanceId: string; type: string; height?: number }[]>(
        'window.__nativeMessages',
      );
    expect(messages.every((message) => message.instanceId === 'native-test')).toBe(true);
    expect(messages.some((message) => message.type === 'failure')).toBe(false);
    const height = messages.findLast((message) => message.type === 'height')?.height;
    expect(height).toBeGreaterThan(100);
    expect(
      await page.evaluate<number>(
        'document.querySelector("iframe").contentDocument.scripts.length',
      ),
    ).toBe(0);
    expect(page.frames().filter((frame) => frame.parentFrame() === page.mainFrame())).toHaveLength(
      1,
    );
  });

  it('reports a bounded failure instead of readiness for a document that cannot run', async () => {
    await open('<p>Before</p><script>while (true) {}</script>');
    await page.waitForFunction(
      'window.__nativeMessages.some((message) => message.type === "failure")',
      { timeout: 15_000 },
    );
    const messages =
      await page.evaluate<{ type: string; reason?: string }[]>('window.__nativeMessages');
    expect(messages.some((message) => message.type === 'ready')).toBe(false);
    expect(messages.filter((message) => message.type === 'failure')).toHaveLength(1);
    expect(['execution', 'startup']).toContain(
      messages.find((message) => message.type === 'failure')?.reason,
    );
  });

  it('reports local state changes and applies only instance-bound native restores', async () => {
    await open(syntheticGenuiDocument.html);
    await page.waitForFunction(
      'window.__nativeMessages.some((message) => message.type === "ready")',
      {
        timeout: 10_000,
      },
    );
    const mirror = page.frames().find((frame) => frame.parentFrame() === page.mainFrame());
    if (!mirror) throw new Error('Script-disabled mirror frame unavailable');
    await mirror.type('#filter', 'Beta');
    await page.waitForFunction(
      'window.__nativeMessages.some((message) => message.type === "state" && message.state.values.filter === "Beta")',
      { timeout: 10_000 },
    );
    const initial = initialGenuiDocumentState(syntheticGenuiDocument);
    const restore = (instanceId: string, filter: string) =>
      page.evaluate(
        `window.postMessage(${JSON.stringify(
          JSON.stringify({
            instanceId,
            type: 'restore',
            state: { ...initial, values: { ...initial.values, filter } },
          }),
        )}, '*')`,
      );
    await restore('native-test', 'Alpha');
    await page.waitForFunction(
      'window.__nativeMessages.some((message) => message.type === "state" && message.state.values.filter === "Alpha")',
      { timeout: 10_000 },
    );
    await restore('another-mount', 'Gamma');
    await page.evaluate('new Promise((resolve) => setTimeout(resolve, 300))');
    const messages =
      await page.evaluate<{ type: string; state?: { values: { filter?: string } } }[]>(
        'window.__nativeMessages',
      );
    expect(messages.some((message) => message.state?.values.filter === 'Gamma')).toBe(false);
    expect(messages.some((message) => message.type === 'failure')).toBe(false);
    expect(
      await mirror.$$eval('#rows tr', (rows) => rows.map((row) => row.textContent ?? '').join(' ')),
    ).toContain('Alpha');
  });
});
