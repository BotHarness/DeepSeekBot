import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isPolicySource, scanSource } from '../source-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('source policy', () => {
  it('keeps document and generated boundaries explicit', () => {
    expect(isPolicySource('packages/client/src/main.tsx')).toBe(true);
    expect(isPolicySource('apps/docs/src/pages/index.astro')).toBe(true);
    expect(isPolicySource('apps/docs/astro.config.mjs')).toBe(true);
    expect(isPolicySource('design/tokens.css')).toBe(true);
    expect(isPolicySource('apps/docs/src/content/docs/guide.mdx')).toBe(false);
    expect(isPolicySource('docs/guide.md')).toBe(false);
    expect(isPolicySource('packages/computer/lib/client.js')).toBe(false);
    expect(isPolicySource('packages/computer/lib/client.js.map')).toBe(false);
    expect(isPolicySource('.agents/skills/vendor/src/index.ts')).toBe(false);
    expect(isPolicySource('agent/skills/vendor/src/index.ts')).toBe(false);
  });

  it('distinguishes JS, JSX, regex, and template content from comment tokens', async () => {
    const source = [
      'const url = "https://example.test/* path */";',
      'const pattern = /https?:\\/\\/host/;',
      'const view = <div>https://host /* text */ {/* JSX comment */}</div>;',
      'const template = `/* text */ ${1 /* expression */}`;',
      'const real = 1; // line',
    ].join('\n');
    const result = await scanSource('packages/client/src/sample.tsx', source);
    expect(result.map((item) => item.token)).toEqual([
      '/* JSX comment */',
      '/* expression */',
      '// line',
    ]);
    expect(result.every((item) => item.kind === 'comment')).toBe(true);
  });

  it('recognizes only calls backed by React named, aliased, and namespace imports', async () => {
    const source = [
      "import React, { useEffect as effect } from 'react';",
      "import * as R from 'react';",
      'const alias = effect;',
      'const fallback = typeof window === "undefined" ? effect : useLayoutEffect;',
      'const { useEffect: destructured } = R;',
      'const { useEffect } = React;',
      'effect(() => {}); alias(() => {}); fallback(() => {}); destructured(() => {}); useEffect(() => {}); React.useEffect(() => {}); R["useEffect"](() => {});',
      'other.useEffect(() => {}); unrelatedEffect(() => {});',
    ].join('\n');
    const result = await scanSource('packages/client/src/sample.tsx', source);
    expect(result.filter((item) => item.kind === 'useEffect')).toHaveLength(7);
  });

  it('parses TypeScript angle assertions without treating them as JSX', async () => {
    const result = await scanSource(
      'packages/core/src/sample.ts',
      'type Box = { value: number }; const boxed = <Box>{ value: 1 }; // real',
    );
    expect(result.map((item) => item.token)).toEqual(['// real']);
  });

  it('resolves calls by lexical binding when local names shadow React hooks', async () => {
    const source = [
      "import { useEffect } from 'react';",
      "import * as R from 'react';",
      'function local() { const useEffect = () => {}; useEffect(); }',
      'function scoped() { const { useEffect: run } = R; run(() => {}); }',
      'function unrelated() { const run = () => {}; run(); }',
      'useEffect(() => {});',
    ].join('\n');
    const result = await scanSource('packages/client/src/scopes.tsx', source);
    expect(result.filter((item) => item.kind === 'useEffect').map((item) => item.token)).toEqual([
      'run(() => {})',
      'useEffect(() => {})',
    ]);
  });

  it('parses Astro frontmatter, HTML, attributes, scripts, and styles', async () => {
    const source = [
      '---',
      'const value = 1; // frontmatter',
      '---',
      '<div data-value={value /* attribute */}>text <!-- HTML -->',
      '<script>const script = 1; // script',
      '</script><style>.x { color: red; /* style */ }</style></div>',
    ].join('\n');
    const result = await scanSource('apps/docs/src/sample.astro', source);
    expect(result.map((item) => item.token)).toEqual([
      '// frontmatter',
      '/* attribute */',
      '<!-- HTML -->',
      '// script',
      '/* style */',
    ]);
  });

  it('parses CSS comments without flagging string content', async () => {
    const result = await scanSource(
      'apps/docs/src/styles/sample.css',
      'a { content: "/* text */"; } /* actual */',
    );
    expect(result.map((item) => item.token)).toEqual(['/* actual */']);
  });

  it('retains only required machine and license exceptions', async () => {
    expect(await scanSource('scripts/sample.mjs', '#!/usr/bin/env node\nconst x = 1;')).toEqual([]);
    expect(
      await scanSource(
        'packages/client/test/sample.test.ts',
        '// @vitest-environment jsdom\nconst x = 1;',
      ),
    ).toEqual([]);
    expect(
      await scanSource(
        'packages/client/src/sample.ts',
        '// @vitest-environment jsdom\nconst x = 1;',
      ),
    ).toHaveLength(1);
    expect(
      await scanSource(
        'apps/docs/src/components/ui/search/providers/pagefind.ts',
        'import(/* @vite-ignore */ url);',
      ),
    ).toEqual([]);
    expect(
      await scanSource('apps/docs/src/other.ts', 'import(/* @vite-ignore */ url);'),
    ).toHaveLength(1);
    const licenseSource = readFileSync('packages/client/src/client/hash-icon.tsx', 'utf8');
    const actual = await scanSource('packages/client/src/client/hash-icon.tsx', licenseSource);
    expect(actual).toEqual([]);
    const alteredLicense = licenseSource.replace('Permission to use', 'Permission to misuse');
    const altered = await scanSource('packages/client/src/client/hash-icon.tsx', alteredLicense);
    expect(altered.some((item) => item.token.includes('ISC License'))).toBe(true);
  });

  it('rejects real non-ignored comment and aliased React effect files with locations', () => {
    const directory = mkdtempSync(join(root, 'scripts', 'source-policy-probe-'));
    const path = join(directory, 'violation.ts');
    const relativePath = relative(root, path).replaceAll('\\', '/');
    try {
      writeFileSync(
        path,
        "import { useEffect as effect } from 'react';\neffect(() => {}); // forbidden\n",
      );
      const result = spawnSync(process.execPath, ['scripts/check-source-policy.mjs'], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`${relativePath}:2:19 comment`);
      expect(result.stderr).toContain(`${relativePath}:2:1 useEffect`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 60_000);
});

it('retains the required Inbox ISC notice without allowing other or modified comments', async () => {
  const source = readFileSync('packages/client/src/client/inbox-icon.tsx', 'utf8');
  expect(await scanSource('packages/client/src/client/inbox-icon.tsx', source)).toEqual([]);
  expect(await scanSource('packages/client/src/client/other-icon.tsx', source)).toHaveLength(1);
  expect(
    await scanSource(
      'packages/client/src/client/inbox-icon.tsx',
      source.replace('Vendored', 'Modified'),
    ),
  ).toHaveLength(1);
  expect(
    await scanSource('packages/client/src/client/inbox-icon.tsx', source + '\n// unrelated'),
  ).toHaveLength(1);
});
