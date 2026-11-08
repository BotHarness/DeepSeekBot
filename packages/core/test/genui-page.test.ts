import { describe, expect, it } from 'vitest';
import { buildGenuiPageHtml } from '../src/channels/genui-page.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';

const runtimeBase64 = Buffer.from('var __BotHarnessGenuiRuntime={};').toString('base64');

function page(options: Partial<Parameters<typeof buildGenuiPageHtml>[1]> = {}) {
  return buildGenuiPageHtml(syntheticGenuiDocument, {
    instanceId: 'page-test',
    theme: 'light',
    runtimeBase64,
    bridge: 'native',
    ...options,
  });
}

describe('GenUI shared document page', () => {
  it('reports only bounded readiness, height and failure through the native bridge', () => {
    const html = page({ textScale: 22 / 14 });
    expect(html).toContain('window.ReactNativeWebView');
    expect(html).not.toContain('__genuiPreview');
    expect(html).toContain('"instanceId":"page-test"');
    expect(html).toContain(`"textScale":${22 / 14}`);
    expect(html).toContain(`data:application/javascript;base64,${runtimeBase64}`);
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("script-src 'nonce-page-test' 'wasm-unsafe-eval'");
    expect(html.match(/<script /gu)).toHaveLength(2);
    expect(html).not.toContain(syntheticGenuiDocument.html.slice(0, 40));
  });

  it('keeps the preview status object for the Host diagnostic browser', () => {
    const html = page({ bridge: 'preview' });
    expect(html).toContain('window.__genuiPreview = status');
    expect(html).not.toContain('ReactNativeWebView');
  });

  it('refuses invalid identities, themes, scales and renderer encodings', () => {
    expect(() => page({ instanceId: 'bad id' })).toThrow('identity');
    expect(() => page({ theme: 'sepia' as 'light' })).toThrow('theme');
    for (const textScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => page({ textScale })).toThrow('scale');
    for (const encoded of ['', 'not base64!', 'QUJD"><script>'])
      expect(() => page({ runtimeBase64: encoded })).toThrow('renderer');
  });
});
