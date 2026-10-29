import { describe, expect, it } from 'vitest';
import { hasVisibleText, plainMarkdown } from '../src/channels/message-preview.js';

describe('plainMarkdown', () => {
  it('drops inline Markdown markers a preview would show literally', () => {
    expect(
      plainMarkdown('Done — **Study helper** is ready.\n- **Name:** Zed 🧨 — *Friendly*'),
    ).toBe('Done — Study helper is ready.\n- Name: Zed 🧨 — Friendly');
    expect(plainMarkdown('## Plan\n> see `npm test` and [docs](https://x.y) ![img](a.png)')).toBe(
      'Plan\nsee npm test and docs img',
    );
    expect(plainMarkdown('~~old~~ __new__ _it_')).toBe('old new it');
  });

  it('keeps text that only looks like Markdown', () => {
    expect(plainMarkdown('snake_case_name and 2 * 3 * 4 and a*b')).toBe(
      'snake_case_name and 2 * 3 * 4 and a*b',
    );
    expect(plainMarkdown('- item\n1. step')).toBe('- item\n1. step');
    expect(plainMarkdown('call foo__bar__baz and a__b')).toBe('call foo__bar__baz and a__b');
  });
});

describe('hasVisibleText', () => {
  it('treats whitespace and zero-width characters as empty', () => {
    expect(hasVisibleText(' \n\u200b\u200c\u200d\u200e\u200f\u2060\ufeff')).toBe(false);
    expect(hasVisibleText('\u200bhi')).toBe(true);
  });
});
