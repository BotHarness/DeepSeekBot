import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { stylexCss, stylexPlugin } from '../stylex-plugin.mjs';

const longhand = ['bhxa', { ltr: '.bhxa{padding-top:4px}', rtl: null }, 4000];
const shorthand = ['bhxb', { ltr: '.bhxb{padding:8px}', rtl: null }, 2000];
const hover = ['bhxc', { ltr: '.bhxc:hover{color:var(--x)}', rtl: null }, 3130];

function selectorOf(css, name) {
  return css.split('\n').find((line) => line.startsWith(`.${name}`));
}

describe('StyleX stylesheet', () => {
  it.each(['', '.js', '.ts'])(
    'uses portable token-derived classes with %s imports',
    async (suffix) => {
      const plugin = stylexPlugin({ rootDir: process.cwd() });
      const source = `import * as stylex from '@stylexjs/stylex';
import { space } from './ds/tokens.stylex${suffix}';
export const styles = stylex.create({ root: { padding: space.x5 } });`;
      const filename = resolve('packages/client/src/client/stylex-platform-probe.ts');
      const tokens = resolve('packages/client/src/client/ds/tokens.stylex.ts');
      await plugin.transform(readFileSync(tokens, 'utf8'), tokens);
      const lf = await plugin.transform(source, filename);
      const crlf = await plugin.transform(source.replaceAll('\n', '\r\n'), filename);
      expect(lf.code).toContain('bhx1tsjn1a');
      expect(crlf.code).toBe(lf.code);
      const css = plugin.renderChunk('const css = "@bh-stylex-css";');
      expect(css.code).toContain('bhx1tsjn1a');
      expect(css.code).toContain('padding:16px');
      expect(css.code).not.toContain('var(--bhx');
    },
  );

  it('keeps CSS output stable when source transforms finish in another order', () => {
    expect(stylexCss([longhand, shorthand, hover])).toBe(stylexCss([hover, shorthand, longhand]));
  });

  it('gives a class the same specificity in every bundle that ships it', () => {
    const full = stylexCss([longhand, shorthand, hover]);
    const partial = stylexCss([longhand]);
    expect(selectorOf(partial, 'bhxa')).toBe(selectorOf(full, 'bhxa'));
    expect(selectorOf(full, 'bhxa')).toBe(
      '.bhxa:not(#\\#):not(#\\#):not(#\\#):not(#\\#){padding-top:4px}',
    );
    expect(selectorOf(stylexCss([hover]), 'bhxc')).toBe(selectorOf(full, 'bhxc'));
  });

  it('keeps longhands above shorthands', () => {
    const css = stylexCss([shorthand, longhand]);
    const ids = (name) => (selectorOf(css, name).match(/:not/g) ?? []).length;
    expect(ids('bhxa')).toBeGreaterThan(ids('bhxb'));
  });

  it('emits nothing without rules', () => {
    expect(stylexCss([])).toBe('');
  });
});
