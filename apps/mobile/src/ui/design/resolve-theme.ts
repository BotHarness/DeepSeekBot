import {
  humanBubbleColors,
  readable,
} from '@botharness/host-client/shared/bot-name-color';
import {
  type Material,
  type ModeConfig,
  type ThemePreset,
  type ThemeStyle,
} from '../appearance-model';
import { layers, tint, type Layer, type LayerName } from './layers';
import { palette } from '@botharness/host-client/ui/design/palette.generated';
import { mono, touch, typeScale, weight, type PlatformOS } from './tokens';

export type { AppearanceDocument, Material, ThemePreset, ThemeStyle } from '../appearance-model';

export type { ColorRole } from '@botharness/host-client/ui/design/color-math';
import type { ColorRole } from '@botharness/host-client/ui/design/color-math';

export const APPEARANCE_PRIMARY: Record<ThemePreset, { light: string; dark: string }> = {
  'classic-blue': { light: '#4176e6', dark: '#7aaaff' },
  'mist-purple': { light: '#7957c9', dark: '#b19af0' },
  'forest-green': { light: '#287454', dark: '#7cc7a0' },
  'warm-amber': { light: '#94600d', dark: '#e6b75c' },
};
export type { ColorScheme } from '@botharness/host-client/ui/design/color-math';
import type { ColorScheme } from '@botharness/host-client/ui/design/color-math';

export type Appearance = {
  scheme?: 'system' | ColorScheme;
  accent?: string;
  style?: ThemeStyle;
  preset?: ThemePreset;
  primary?: string;
  materialEnabled?: boolean;
  materials?: ModeConfig['materials'];
};

export type DesignTheme = {
  scheme: ColorScheme;
  style: ThemeStyle;
  glass: boolean;
  fontScale: number;
  largeText: boolean;
  color: Record<ColorRole, string>;
  layer: Record<LayerName, Layer>;
  overlay: { fill: string; handle: string };
  scrim: string;
  material: { header: Material; body: Material };
  type: (typeof typeScale)[PlatformOS];
  weight: (typeof weight)[PlatformOS];
  touch: number;
  mono: string;
};

const HEX = /^#([0-9a-f]{6})$/i;

function rgb(hex: string): number {
  const digits = hex.slice(1);
  return Number.parseInt(
    digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits,
    16,
  );
}

function luminance(hex: string): number {
  const value = rgb(hex);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const INK_LIGHT = '#ffffff';
const SCRIM: Record<ColorScheme, string> = { light: '#0f111566', dark: '#00000099' };
const BODY_CONTRAST = 4.5;

export function mix(from: string, to: string, amount: number): string {
  const a = rgb(from);
  const b = rgb(to);
  return `#${[16, 8, 0]
    .map((shift) => {
      const start = (a >> shift) & 0xff;
      const end = (b >> shift) & 0xff;
      return Math.round(start + (end - start) * amount)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

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

type MaterialRecipe = { opacity: number; blur: number };
const SOLID_MATERIAL: { header: MaterialRecipe; body: MaterialRecipe } = {
  header: { opacity: 80, blur: 24 },
  body: { opacity: 100, blur: 0 },
};
const GLASS_MATERIAL: Record<PlatformOS, { header: MaterialRecipe; body: MaterialRecipe }> = {
  android: {
    header: { opacity: 90, blur: 16 },
    body: { opacity: 96, blur: 8 },
  },
  ios: {
    header: { opacity: 64, blur: 28 },
    body: { opacity: 82, blur: 20 },
  },
};

function applyMaterial(
  recipe: MaterialRecipe,
  override: Partial<Material> | undefined,
  color: string,
): Material {
  return {
    color: override?.color ?? color,
    opacity: override?.opacity ?? recipe.opacity,
    blur: override?.blur ?? recipe.blur,
  };
}

export function resolveMaterial(
  color: Record<ColorRole, string>,
  glass: boolean,
  os: PlatformOS,
  overrides: NonNullable<ModeConfig['materials']> = {},
): { header: Material; body: Material } {
  const recipe = glass ? GLASS_MATERIAL[os] : SOLID_MATERIAL;
  return {
    header: applyMaterial(recipe.header, overrides.header, color.surface),
    body: applyMaterial(recipe.body, overrides.body, color.base),
  };
}

export function resolveTheme(
  system: ColorScheme,
  appearance: Appearance = {},
  os: PlatformOS = 'ios',
): DesignTheme {
  const scheme =
    appearance.scheme === undefined || appearance.scheme === 'system' ? system : appearance.scheme;
  const preset = appearance.preset ?? 'classic-blue';
  const supplied = appearance.accent;
  const primary =
    supplied !== undefined && HEX.test(supplied)
      ? supplied
      : (appearance.primary ?? APPEARANCE_PRIMARY[preset][scheme]);
  const color = withAccent({ ...palette[scheme] }, primary);
  const style = appearance.style ?? 'default';
  const glass = appearance.materialEnabled === true && (style === 'glass' || style === 'image');
  const modeMaterials = appearance.materials;
  const material = resolveMaterial(color, glass, os, modeMaterials);
  return {
    scheme,
    style,
    glass,
    fontScale: 1,
    largeText: false,
    color,
    layer: layers(scheme, color),
    overlay: { fill: color.sheet, handle: tint(color.sheet, color.fg, 0.38) },
    scrim: SCRIM[scheme],
    material,
    type: typeScale[os],
    weight: weight[os],
    touch: touch[os],
    mono: mono[os],
  };
}
