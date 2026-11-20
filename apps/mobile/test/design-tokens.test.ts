import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { mobileAccents, palette } from '@botharness/host-client/ui/design/palette.generated';
import {
  BUTTON_TONES,
  buttonColors,
  cardChoiceColors,
  settingsColors,
  messageColors,
} from '../src/ui/design/controls';
import { distance, LAYER_PARENT, LAYERS, SEPARATION } from '../src/ui/design/layers';
import { contrast, headerBand, resolveTheme, withAccent } from '../src/ui/design/resolve-theme';
import { botColor } from '../src/ui/bot-color';
import { edge, space } from '../src/ui/design/tokens';

const schemes = ['light', 'dark'] as const;
const presets = Object.keys(mobileAccents.light);

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
  it('share the Web spacing and focus scales', () => {
    expect(
      Object.fromEntries(Object.entries(webConsts('space')).map(([k, v]) => [k, px(v)])),
    ).toEqual(space);
    expect(px(webConsts('border')['focus']!)).toBe(edge.focus);
    expect(px(webConsts('border')['hairline']!)).toBe(edge.hairline);
  });
});

describe('resolveTheme', () => {
  it('follows the system scheme unless the Human picks one', () => {
    expect(resolveTheme('dark').color.base).toBe(palette.dark.base);
    expect(resolveTheme('dark', { scheme: 'light' }).color.base).toBe(palette.light.base);
    for (const scheme of ['light', 'dark'] as const) {
      const color = resolveTheme(scheme).color;
      expect(contrast(color.accent, color.onAccent)).toBeGreaterThanOrEqual(4.5);
    }
    expect(resolveTheme('light', { scheme: 'system' }).scheme).toBe('light');
  });

  it('applies a custom accent with readable text on it', () => {
    const yellow = resolveTheme('light', { accent: '#FFD60A' }).color;
    expect(distance(yellow.accent, '#ffd60a')).toBeLessThan(SEPARATION);
    expect(yellow.onAccent).toBe('#0f1115');
    expect(contrastOf(yellow.onAccent, yellow.accent)).toBeGreaterThanOrEqual(4.5);
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

describe.each(schemes)('Tobs mobile contrast in %s mode', (scheme) => {
  it.each([undefined, ...presets])('qualifies custom-surface roles for %s', (accent) => {
    const theme = resolveTheme(scheme, accent === undefined ? {} : { accent });
    const { color } = theme;
    const surfaces = [...LAYERS.map((name) => theme.layer[name].fill), color.elevated];
    const textRoles = [
      'fg',
      'muted',
      'subtle',
      'accent',
      'accentText',
      'danger',
      'warning',
      'success',
    ] as const;
    const graphicalRoles = ['borderStrong', 'borderField', 'dangerEdge', 'warningEdge'] as const;
    for (const background of surfaces) {
      for (const role of textRoles)
        expect(
          contrastOf(color[role], background),
          `${role} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      for (const role of graphicalRoles)
        expect(
          contrastOf(color[role], background),
          `${role} on ${background}`,
        ).toBeGreaterThanOrEqual(3);
    }
    for (const [foreground, background] of [
      [color.onAccent, color.accent],
      [color.onDanger, color.danger],
      [color.onWarning, color.warning],
      [color.accentText, color.accentTint],
      [color.muted, theme.layer.canvas.inset],
    ] as const)
      expect(
        contrastOf(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    expect(contrastOf(theme.overlay.handle, theme.overlay.fill)).toBeGreaterThanOrEqual(3);

    const band = headerBand(scheme, color);
    for (const background of [band.top, band.bottom])
      expect(contrastOf(color[band.ink], background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([undefined, ...presets, '#b84124', '#ffd60a', '#000000', '#ffffff'])(
    'keeps action card text and decision symbols legible for %s',
    (accent) => {
      const theme = resolveTheme(scheme, accent === undefined ? {} : { accent });
      expect(
        contrastOf(theme.color.warning, theme.color.warningSoft),
        'warning pill',
      ).toBeGreaterThanOrEqual(4.5);

      for (const tone of ['primary', 'secondary', 'danger'] as const) {
        const resting = cardChoiceColors(theme, tone);
        for (const state of ['rest', 'pressed', 'disabled', 'selected-disabled'] as const) {
          const { fill, ink } = cardChoiceColors(theme, tone, state);
          expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
          expect(contrastOf(ink, fill), `${tone} ${state} label and symbol`).toBeGreaterThanOrEqual(
            4.5,
          );
          if (tone !== 'primary' && state === 'rest')
            expect(distance(fill, theme.layer.raised.fill)).toBeGreaterThanOrEqual(SEPARATION);
          if (state === 'pressed')
            expect(contrastOf(resting.ink, fill)).toBeGreaterThanOrEqual(4.5);
          if (state !== 'rest') expect(fill).not.toBe(resting.fill);
        }
        if (tone === 'primary') expect(resting.fill).toBe(theme.color.accent);
      }
    },
  );

  it('swaps only the accent roles for a preset', () => {
    expect(resolveTheme(scheme).color).toEqual(palette[scheme]);
    for (const [name, roles] of Object.entries(mobileAccents[scheme]))
      expect(resolveTheme(scheme, { accent: name }).color).toEqual({
        ...palette[scheme],
        ...roles,
      });
  });
});

describe('Layers and their states', () => {
  const accents = [
    undefined,
    ...presets,
    '#d9475a',
    '#3f8fd0',
    '#5f9e45',
    '#c79a2b',
    '#ffd60a',
    '#000000',
  ];

  it('uses the generated accent tint for a chosen row on the base', () => {
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

describe('message text across custom themes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it.each(['#f5c400', '#00ff00', '#ff0000', '#4176e6', '#ffffff', '#000000'])(
      `${scheme} keeps links and secondary text readable for %s`,
      (accent) => {
        const theme = resolveTheme(scheme, { accent });
        const original = { ...theme.color };
        const colors = messageColors(theme);
        expect(contrast(colors.link, theme.color.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.muted, theme.color.surface)).toBeGreaterThanOrEqual(4.5);
        expect(theme.color).toEqual(original);
      },
    );
  }
});
