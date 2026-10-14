import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { palette as dshPalette, render } from '../scripts/generate-palette.mjs';
import { palette } from '../src/ui/design/palette.generated';
import { resolveTheme } from '../src/ui/design/resolve-theme';
import { edge, radius, space } from '../src/ui/design/tokens';

const webTokens = readFileSync(
  new URL('../../../packages/client/src/client/ds/tokens.stylex.ts', import.meta.url),
  'utf8',
);

function webConsts(name: string): Record<string, string> {
  const block = new RegExp(`export const ${name} = stylex\\.defineConsts\\(\\{([^}]*)\\}`).exec(
    webTokens,
  );
  if (block === null) throw new Error(`Web tokens have no ${name}`);
  return Object.fromEntries(
    [...block[1]!.matchAll(/(\w+):\s*'([^']*)'/g)].map((m) => [m[1]!, m[2]!]),
  );
}

function px(value: string): number {
  const match = /(\d+)px\)?$/.exec(value);
  if (match === null) throw new Error(`No px value in ${value}`);
  return Number(match[1]);
}

describe('mobile design tokens', () => {
  it('match the DSH theme the Web Client paints with', () => {
    expect(render(dshPalette())).toBe(
      readFileSync(new URL('../src/ui/design/palette.generated.ts', import.meta.url), 'utf8'),
    );
  });

  it('keep every Web colour role', () => {
    expect(Object.keys(palette.light).sort()).toEqual(
      [...Object.keys(webConsts('color')).filter((role) => role !== 'navSelected')].sort(),
    );
    expect(Object.keys(palette.dark)).toEqual(Object.keys(palette.light));
  });

  it('share the Web spacing, radius and focus scales', () => {
    expect(
      Object.fromEntries(Object.entries(webConsts('space')).map(([k, v]) => [k, px(v)])),
    ).toEqual(space);
    const web = webConsts('radius');
    for (const role of ['xs', 'sm', 'md', 'lg'] as const) expect(px(web[role]!)).toBe(radius[role]);
    expect(px(webConsts('border')['focus']!)).toBe(edge.focus);
    expect(px(webConsts('border')['hairline']!)).toBe(edge.hairline);
  });
});

describe('resolveTheme', () => {
  it('follows the system scheme unless the Human picks one', () => {
    expect(resolveTheme('dark').color).toEqual(palette.dark);
    expect(resolveTheme('dark', { scheme: 'light' }).color).toEqual(palette.light);
    expect(resolveTheme('light', { scheme: 'system' }).scheme).toBe('light');
  });

  it('applies a custom accent with readable text on it', () => {
    expect(resolveTheme('light', { accent: '#FFD60A' }).color).toMatchObject({
      accent: '#ffd60a',
      onAccent: '#0f1115',
    });
    expect(resolveTheme('dark', { accent: '#5b2ecc' }).color).toMatchObject({
      accent: '#5b2ecc',
      onAccent: '#ffffff',
    });
    expect(resolveTheme('light', { accent: 'red' }).color.accent).toBe(palette.light.accent);
  });

  it('uses each platform type and touch scale', () => {
    expect(resolveTheme('light', {}, 'ios')).toMatchObject({
      touch: 44,
      type: { body: { size: 17 } },
    });
    expect(resolveTheme('light', {}, 'android')).toMatchObject({
      touch: 48,
      type: { body: { size: 14 } },
    });
  });
});
