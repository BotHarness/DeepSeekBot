import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const dsDir = fileURLToPath(new URL('../src/client/ds/', import.meta.url));
const clientDir = fileURLToPath(new URL('../src/client/', import.meta.url));

function stylexSources(): { name: string; source: string }[] {
  const files = [
    ...readdirSync(dsDir).map((name) => `ds/${name}`),
    ...readdirSync(clientDir).filter((name) => /\.tsx?$/.test(name)),
  ];
  return files
    .map((name) => ({ name, source: readFileSync(`${clientDir}${name}`, 'utf8') }))
    .filter(({ source }) => source.includes('@stylexjs/stylex'));
}

function styleBlocks(source: string): { text: string; start: number }[] {
  const blocks: { text: string; start: number }[] = [];
  let from = source.indexOf('stylex.create(');
  while (from >= 0) {
    const end = source.indexOf('\n});', from);
    const stop = end < 0 ? source.length : end;
    blocks.push({
      text: source.slice(from, stop),
      start: source.slice(0, from).split('\n').length - 1,
    });
    from = source.indexOf('stylex.create(', stop);
  }
  return blocks;
}

const SCALED =
  /\b(fontSize|lineHeight|fontWeight|gap|rowGap|columnGap|padding\w*|margin\w*|borderRadius)\s*:\s*(['"])(?!0\2)/;
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

describe('design-system tokens', () => {
  it('keeps every StyleX colour on a DSH token', () => {
    const tokens = readFileSync(`${dsDir}tokens.stylex.ts`, 'utf8');
    const colours = tokens.slice(tokens.indexOf('export const color'));
    for (const value of colours.matchAll(/:\s*'([^']+)'/g))
      expect(value[1]).toMatch(/^var\(--dsw-[a-z0-9-]+\)$/);
  });

  it('authors spacing, type and radius only through tokens', () => {
    const offenders = stylexSources()
      .filter(({ name }) => name !== 'ds/tokens.stylex.ts')
      .flatMap(({ name, source }) =>
        styleBlocks(source).flatMap(({ text, start }) =>
          text
            .split('\n')
            .map((line, index) => ({ line, index }))
            .filter(({ line }) => SCALED.test(line) || LITERAL_COLOUR.test(line))
            .map(({ line, index }) => `${name}:${start + index + 1} ${line.trim()}`),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('keeps tokens in the scale the Channel sidebar uses', () => {
    const tokens = readFileSync(`${dsDir}tokens.stylex.ts`, 'utf8');
    const block = (name: string) =>
      tokens.slice(tokens.indexOf(`export const ${name}`)).split('});')[0]!;
    const px = (name: string) =>
      [...block(name).matchAll(/'(\d+)px'/g)].map((match) => Number(match[1]));
    expect(px('space')).toEqual([2, 4, 8, 12, 16, 24]);
    expect(px('radius')).toEqual([6, 8, 10]);
    expect(px('size')).toEqual([26, 28, 32, 40]);
  });
});
