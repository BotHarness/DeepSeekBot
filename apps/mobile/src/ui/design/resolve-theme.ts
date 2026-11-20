import { humanBubbleColors, readable } from '@botharness/host-client/shared/bot-name-color';
import { layers, type Layer, type LayerName } from './layers';
import { mobileAccents, palette } from '@botharness/host-client/ui/design/palette.generated';
import { mono, touch, typeScale, weight, type PlatformOS } from './tokens';

import {
  contrast,
  mix,
  type ColorRole,
  type ColorScheme,
} from '@botharness/host-client/ui/design/color-math';
export { contrast, mix } from '@botharness/host-client/ui/design/color-math';
export type { ColorRole, ColorScheme } from '@botharness/host-client/ui/design/color-math';

export type Appearance = {
  scheme?: 'system' | ColorScheme;
  accent?: string;
};

export type DesignTheme = {
  scheme: ColorScheme;
  fontScale: number;
  largeText: boolean;
  color: Record<ColorRole, string>;
  layer: Record<LayerName, Layer>;
  overlay: { fill: string; handle: string };
  scrim: string;
  type: (typeof typeScale)[PlatformOS];
  weight: (typeof weight)[PlatformOS];
  touch: number;
  mono: string;
};

const HEX = /^#([0-9a-f]{6})$/i;

const INK_LIGHT = '#ffffff';
const BODY_CONTRAST = 4.5;

export function withAccent(
  color: Record<ColorRole, string>,
  source: string | undefined,
): Record<ColorRole, string> {
  if (source === undefined || !HEX.test(source)) return color;
  const pair = humanBubbleColors(source, 'light', color.base, {
    base: color.base,
    surface: color.surface,
    fg: color.fg,
  });
  return pair === undefined
    ? color
    : {
        ...color,
        accent: pair.fill,
        onAccent: pair.ink,
        accentText: readable(source, color.surface, 4.6),
      };
}

export type HeaderBand = { top: string; bottom: string; ink: ColorRole; lightInk: boolean };

export function headerBand(scheme: ColorScheme, color: Record<ColorRole, string>): HeaderBand {
  const steps = Array.from({ length: 41 }, (_, step) => step / 40);
  if (scheme === 'dark') {
    const sink = (from: number) =>
      mix(
        color.accent,
        color.base,
        steps.find(
          (step) =>
            step >= from &&
            contrast(mix(color.accent, color.base, step), color.fg) >= BODY_CONTRAST,
        ) ?? 1,
      );
    return { top: sink(0.5), bottom: sink(0.8), ink: 'fg', lightInk: true };
  }
  const lightInk = contrast(color.onAccent, INK_LIGHT) < 2;
  return {
    top: color.accent,
    bottom: mix(color.accent, lightInk ? '#000000' : INK_LIGHT, 0.18),
    ink: 'onAccent',
    lightInk,
  };
}

export function resolveTheme(
  system: ColorScheme,
  appearance: Appearance = {},
  os: PlatformOS = 'ios',
): DesignTheme {
  const scheme =
    appearance.scheme === undefined || appearance.scheme === 'system' ? system : appearance.scheme;
  const base = { ...palette[scheme] };
  const preset = Object.entries(mobileAccents[scheme]).find(([name]) => name === appearance.accent);
  const color = preset ? { ...base, ...preset[1] } : withAccent(base, appearance.accent);
  return {
    scheme,
    fontScale: 1,
    largeText: false,
    color,
    layer: layers(scheme, color),
    overlay: { fill: color.sheet, handle: color.borderStrong },
    scrim: color.scrim,
    type: typeScale[os],
    weight: weight[os],
    touch: touch[os],
    mono: mono[os],
  };
}
