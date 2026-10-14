import { describe, expect, it } from 'vitest';
import { stylexCss } from '../stylex-plugin.mjs';

const longhand = ['bhxa', { ltr: '.bhxa{padding-top:4px}', rtl: null }, 4000];
const shorthand = ['bhxb', { ltr: '.bhxb{padding:8px}', rtl: null }, 2000];
const hover = ['bhxc', { ltr: '.bhxc:hover{color:var(--x)}', rtl: null }, 3130];

function selectorOf(css, name) {
  return css.split('\n').find((line) => line.startsWith(`.${name}`));
}

describe('StyleX stylesheet', () => {
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
