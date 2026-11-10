import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({}));

import { CSS } from '../src/client/styles.js';
import { siblingSelector } from '../src/client/has-sibling-rewrite.js';

function withoutArguments(selector: string): string {
  let out = '';
  let depth = 0;
  for (const char of selector) {
    if (char === '(') depth += 1;
    if (depth === 0) out += char;
    if (char === ')') depth -= 1;
  }
  return out;
}

function splitList(selectorList: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of selectorList) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function invalidatesWholeDocument(complex: string): boolean {
  if (!complex.includes(':has(')) return false;
  const compounds = withoutArguments(complex)
    .trim()
    .split(/\s*[>+~]\s*|\s+/)
    .filter(Boolean);
  const subject = compounds.at(-1) ?? '';
  if (subject.includes(':has')) return false;
  if (!compounds.some((compound) => compound.includes(':has'))) return false;
  if (/^(:root|html)\b/.test(compounds[0]!) && compounds[0]!.includes(':has')) return true;
  return !/[.#[]/.test(subject.replace(/::?[a-z-]+$/, ''));
}

function selectorsOf(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors: string[] = [];
  for (const match of source.matchAll(/(?:^|[{};])\s*([^{};@]+?)\s*\{/g))
    selectors.push(...splitList(match[1]!));
  return selectors;
}

describe(':has() invalidation', () => {
  it('flags a :has() anchor with a plain subject', () => {
    expect(invalidatesWholeDocument('.a:has(.b) > div > span')).toBe(true);
    expect(invalidatesWholeDocument('html[x]:has([y]) body > :not(#root)')).toBe(true);
    expect(invalidatesWholeDocument(':has(> .a) > :not(.b)')).toBe(true);
    expect(invalidatesWholeDocument('.a:has(.b) h1')).toBe(true);
    expect(invalidatesWholeDocument(':root:has(style[data-x="dark"]) .a')).toBe(true);
  });

  it('accepts :has() on the subject or a subject with a class or attribute', () => {
    expect(invalidatesWholeDocument('.a:has(.b)')).toBe(false);
    expect(invalidatesWholeDocument('nav > button:is(.a, :has(~ .a))')).toBe(false);
    expect(invalidatesWholeDocument('.a:has(.b) > .c')).toBe(false);
    expect(invalidatesWholeDocument('.a:has(.b) [data-c]::after')).toBe(false);
  });

  it('keeps every Client rule cheap to invalidate', () => {
    expect(
      selectorsOf(CSS).filter((selector) => selector.includes(':has(')).length,
    ).toBeGreaterThan(20);
    expect(selectorsOf(CSS).filter(invalidatesWholeDocument)).toEqual([]);
  });
});

describe('host :has() sibling rewrite', () => {
  it('rewrites a parent :has(> X) > S rule into the equivalent sibling selectors', () => {
    expect(siblingSelector(':has(> .nav.fill) > :not(.nav)')).toBe(
      '.nav.fill ~ :not(.nav), :not(.nav):has(~ .nav.fill)',
    );
    expect(siblingSelector(':has(> .nav:not(.whole)) > :not(.nav)')).toBe(
      '.nav:not(.whole) ~ :not(.nav), :not(.nav):has(~ .nav:not(.whole))',
    );
    expect(invalidatesWholeDocument(siblingSelector(':has(> .a) > :not(.b)')!)).toBe(false);
  });

  it('leaves every other shape alone', () => {
    expect(siblingSelector('.p:has(> .a) > .b')).toBeUndefined();
    expect(siblingSelector(':has(> .a .c) > .b')).toBeUndefined();
    expect(siblingSelector(':has(.a) > .b')).toBeUndefined();
    expect(siblingSelector(':has(> .a) .b')).toBeUndefined();
    expect(siblingSelector(':has(> .a) > .b, .c')).toBeUndefined();
  });
});
