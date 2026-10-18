import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { palette as dshPalette, render } from '../scripts/generate-palette.mjs';
import { palette } from '../src/ui/design/palette.generated';
import { BUTTON_TONES, buttonColors, settingsColors } from '../src/ui/design/controls';
import { distance, LAYER_PARENT, LAYERS, SEPARATION } from '../src/ui/design/layers';
import { headerBand, resolveTheme, withAccent } from '../src/ui/design/resolve-theme';
import { botColor } from '../src/ui/bot-color';
import { edge, radius, space } from '../src/ui/design/tokens';

const DSH_LAYER_ROLES = ['borderField', 'field', 'sheet'];

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
      [
        ...Object.keys(webConsts('color')).filter((role) => role !== 'navSelected'),
        ...DSH_LAYER_ROLES,
      ].sort(),
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
    expect(resolveTheme('dark').color).toMatchObject(palette.dark);
    expect(resolveTheme('dark', { scheme: 'light' }).color).toMatchObject(palette.light);
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
      mono: 'Menlo',
      type: { body: { size: 17 } },
    });
    expect(resolveTheme('light', {}, 'android')).toMatchObject({
      touch: 48,
      mono: 'monospace',
      type: { body: { size: 14 } },
    });
  });
});

describe('Layers and their states', () => {
  const accents = [undefined, '#d9475a', '#3f8fd0', '#5f9e45', '#c79a2b', '#ffd60a', '#000000'];

  it('tints a chosen row like the DSH accent tint on the base', () => {
    for (const scheme of ['light', 'dark'] as const)
      expect(
        distance(resolveTheme(scheme).layer.well.chosen, palette[scheme].accentTint),
      ).toBeLessThan(0.01);
  });

  it('keeps every state apart from its layer, the layer under it and the other states', () => {
    for (const scheme of ['light', 'dark'] as const)
      for (const accent of accents) {
        const { layer } = resolveTheme(scheme, accent === undefined ? {} : { accent });
        for (const name of LAYERS) {
          const { fill, pressed, selected, chosen, danger } = layer[name];
          const parent = LAYER_PARENT[name];
          const floor = [fill, ...(parent === undefined ? [] : [layer[parent].fill])];
          for (const [state, value] of Object.entries({ pressed, selected, chosen, danger }))
            for (const other of floor)
              expect(
                distance(value, other),
                `${scheme} ${accent ?? 'default'} ${name}.${state} ${value} vs ${other}`,
              ).toBeGreaterThanOrEqual(SEPARATION);
          for (const [a, b] of [
            [pressed, selected],
            [selected, chosen],
            [selected, danger],
          ] as const)
            expect(
              distance(a, b),
              `${scheme} ${accent ?? 'default'} ${name}`,
            ).toBeGreaterThanOrEqual(SEPARATION);
        }
      }
  });

  it('never lets a selected row inside a card match the card', () => {
    const dark = resolveTheme('dark').layer;
    expect(distance(dark.well.selected, dark.raised.fill)).toBeGreaterThanOrEqual(SEPARATION);
    expect(distance(dark.well.chosen, dark.raised.fill)).toBeGreaterThanOrEqual(SEPARATION);
  });

  it('paints only opaque colours', () => {
    for (const scheme of ['light', 'dark'] as const)
      for (const name of LAYERS)
        for (const value of Object.values(resolveTheme(scheme).layer[name]))
          expect(value).toMatch(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/);
  });
});

describe('Button tones', () => {
  it('keep the primary neutral whatever the Bot accent is', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const plain = buttonColors(resolveTheme(scheme), 'primary', 'raised');
      for (const accent of ['#d9475a', '#c79a2b', '#000000'])
        expect(buttonColors(resolveTheme(scheme, { accent }), 'primary', 'raised')).toEqual(plain);
      expect(plain.fill).toBe(resolveTheme(scheme).color.fg);
    }
  });

  it('stand apart from the layer they sit on and from each other, with readable labels', () => {
    for (const scheme of ['light', 'dark'] as const)
      for (const accent of [undefined, '#d9475a', '#c79a2b', '#000000']) {
        const theme = resolveTheme(scheme, accent === undefined ? {} : { accent });
        for (const on of ['canvas', 'raised', 'sheet'] as const) {
          const behind = theme.layer[on].fill;
          const tones = BUTTON_TONES.map((tone) => [tone, buttonColors(theme, tone, on)] as const);
          for (const [tone, colors] of tones) {
            const where = `${scheme} ${accent ?? 'default'} ${tone} on ${on}`;
            expect(distance(colors.fill, behind), where).toBeGreaterThanOrEqual(SEPARATION);
            expect(distance(colors.pressed, colors.fill), where).toBeGreaterThanOrEqual(
              SEPARATION / 2,
            );
            expect(contrastOf(colors.label, colors.fill), where).toBeGreaterThanOrEqual(4.5);
          }
          for (let a = 0; a < tones.length; a += 1)
            for (let b = a + 1; b < tones.length; b += 1)
              expect(
                distance(tones[a]![1].fill, tones[b]![1].fill),
                `${scheme} ${accent ?? 'default'} ${tones[a]![0]}~${tones[b]![0]} on ${on}`,
              ).toBeGreaterThanOrEqual(SEPARATION);
        }
      }
  });
});

describe('Android settings readability', () => {
  it('keeps accent headings and selected labels readable in both schemes and custom accents', () => {
    for (const scheme of ['light', 'dark'] as const)
      for (const accent of [undefined, '#d9475a', '#c79a2b', '#000000', '#ffffff']) {
        const theme = resolveTheme(scheme, accent === undefined ? {} : { accent }, 'android');
        for (const on of LAYERS) {
          const colors = settingsColors(theme, on);
          expect(contrastOf(colors.heading, theme.overlay.fill)).toBeGreaterThanOrEqual(4.5);
          expect(contrastOf(colors.selectedText, colors.selected)).toBeGreaterThanOrEqual(4.5);
        }
      }
  });
});

function contrastOf(a: string, b: string): number {
  const full = (hex: string) =>
    hex.length === 4 ? [...hex.slice(1)].map((digit) => digit + digit).join('') : hex.slice(1);
  const lum = (hex: string) =>
    [16, 8, 0]
      .map((shift) => ((Number.parseInt(full(hex), 16) >> shift) & 0xff) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index]!, 0);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('Bot colour on the Human bubble', () => {
  const bot = {
    slug: 'ada',
    displayName: 'Ada',
    roles: [],
    computerAccess: false,
    browserAccess: false,
    state: 'idle' as const,
    paused: false,
  };

  it('uses the Bot primary colour, custom first', () => {
    expect(botColor({ ...bot, primaryColor: { mode: 'custom', color: '#2f9e8f' } })).toBe(
      '#2f9e8f',
    );
    expect(botColor(bot)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps message text at 4.5:1 on every Bot colour', () => {
    for (const scheme of [palette.light, palette.dark])
      for (const source of ['#d9475a', '#3f8fd0', '#5f9e45', '#e07a3f', '#888888', '#c79a2b']) {
        const { accent, onAccent } = withAccent(scheme, source);
        expect(contrastOf(accent, onAccent), `${source} → ${accent}`).toBeGreaterThanOrEqual(4.5);
      }
  });

  it('keeps a light colour as is with dark text, and darkens a mid-tone under white text', () => {
    expect(withAccent(palette.dark, '#c79a2b')).toMatchObject({
      accent: '#c79a2b',
      onAccent: '#0f1115',
    });
    expect(withAccent(palette.light, '#5b2ecc')).toMatchObject({
      accent: '#5b2ecc',
      onAccent: '#ffffff',
    });
    const red = withAccent(palette.light, '#d9475a');
    expect(red.onAccent).toBe('#ffffff');
    expect(red.accent).not.toBe('#d9475a');
  });

  it('keeps the Home header text readable on every accent in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const)
      for (const source of ['#d9475a', '#3f8fd0', '#5f9e45', '#e07a3f', '#888888', '#c79a2b']) {
        const { color } = resolveTheme(scheme, { accent: source });
        const band = headerBand(scheme, color);
        for (const behind of [band.top, band.bottom])
          expect(contrastOf(behind, color[band.ink]), `${scheme} ${source}`).toBeGreaterThanOrEqual(
            4.5,
          );
      }
  });

  it('lifts a colour that would vanish into the chat background', () => {
    const dark = withAccent(palette.dark, '#141414');
    expect(dark.accent).not.toBe('#141414');
    expect(dark.accent).not.toBe(palette.dark.surface);
    expect(dark.onAccent).toBe('#ffffff');
    expect(withAccent(palette.light, '#fbf6ec').accent).not.toBe('#fbf6ec');
    expect(withAccent(palette.light, undefined)).toEqual(palette.light);
  });
});
