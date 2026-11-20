import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildGenuiHtmlDocument } from '../src/channels/genui-html.js';
import { GENUI_DOCUMENT_POLICY_VERSION } from '../src/channels/genui-document-policy.js';

const document = {
  version: 2 as const,
  snapshotId: 'synthetic-html-1',
  observedAt: '2026-11-08T00:00:00.000Z',
  title: 'Synthetic HTML',
  html: '<h2>Safe composition</h2><script>document.body.dataset.local = "yes"</script>',
};
const source = 'globalThis.__BotHarnessGenuiRuntime = {};';
const runtime = { source, sha256: createHash('sha256').update(source).digest('hex') };
const options = { instanceId: 'test-frame', theme: 'dark' as const, runtime };

describe('trusted GenUI preview compiler', () => {
  it('builds deterministic bytes bound to the exact packaged renderer', () => {
    const result = buildGenuiHtmlDocument(document, options);
    expect(buildGenuiHtmlDocument(document, options)).toEqual(result);
    expect(result.policyVersion).toBe(GENUI_DOCUMENT_POLICY_VERSION);
    expect(result.runtimeSha256).toBe(runtime.sha256);
    expect(result.html).toContain(
      `data:application/javascript;base64,${Buffer.from(source).toString('base64')}`,
    );
    expect(result.html).toContain('worker-src blob:');
    expect(result.html).toContain("connect-src 'none'");
    expect(result.html).toContain("script-src 'nonce-test-frame' 'wasm-unsafe-eval'");
    expect(result.html).not.toContain('allow-scripts');
    expect(result.html).toContain('\\u003cscript>');
    expect(result.html).toContain('__BotHarnessGenuiRuntime.mountGenuiDocument');
  });

  it('keeps immutable identity independent of runtime instance and theme', () => {
    const first = buildGenuiHtmlDocument(document, options);
    const second = buildGenuiHtmlDocument(document, {
      ...options,
      instanceId: 'two',
      theme: 'light',
    });
    expect(first.documentId).toBe(second.documentId);
    expect(first.html).not.toBe(second.html);
    const changed = buildGenuiHtmlDocument(
      { ...document, html: `${document.html}<p>New</p>` },
      options,
    );
    expect(changed.documentId).not.toBe(first.documentId);
  });

  it('rejects identity injection and invalid canonical restored state', () => {
    expect(() =>
      buildGenuiHtmlDocument(document, { ...options, instanceId: '"><script>' }),
    ).toThrow();
    expect(() =>
      buildGenuiHtmlDocument(document, {
        ...options,
        state: { version: 1, values: { unknown: true } },
      }),
    ).toThrow();
  });

  it.each([
    { source: '', sha256: runtime.sha256 },
    { source: 'x'.repeat(2_097_153), sha256: runtime.sha256 },
    { source, sha256: 'A'.repeat(64) },
    { source: `${source}changed`, sha256: runtime.sha256 },
  ])('rejects invalid or changed packaged runtime bytes', (invalid) => {
    expect(() => buildGenuiHtmlDocument(document, { ...options, runtime: invalid })).toThrow(
      'renderer is invalid',
    );
  });

  it('keeps generated markup inert even when it resembles trusted script delimiters', () => {
    const result = buildGenuiHtmlDocument(
      {
        ...document,
        html: '</script><script nonce="test-frame">throw 1</script>',
      },
      options,
    );
    expect(result.html.match(/<script /gu)).toHaveLength(2);
    expect(result.html.match(/<\/script>/gu)).toHaveLength(2);
    expect(result.html).toContain('\\u003c/script>');
    expect(result.html).not.toContain('>throw 1</script>');
  });
});
