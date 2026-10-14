import { palette } from './palette.generated';
import { touch, typeScale, weight, type PlatformOS } from './tokens';

export type ColorRole = keyof typeof palette.light;
export type ColorScheme = 'light' | 'dark';

export type Appearance = {
  scheme?: 'system' | ColorScheme;
  accent?: string;
};

export type DesignTheme = {
  scheme: ColorScheme;
  color: Record<ColorRole, string>;
  type: (typeof typeScale)[PlatformOS];
  weight: (typeof weight)[PlatformOS];
  touch: number;
};

const HEX = /^#([0-9a-f]{6})$/i;

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const INK_LIGHT = '#ffffff';
const INK_DARK = '#0f1115';

export function resolveTheme(
  system: ColorScheme,
  appearance: Appearance = {},
  os: PlatformOS = 'ios',
): DesignTheme {
  const scheme =
    appearance.scheme === undefined || appearance.scheme === 'system' ? system : appearance.scheme;
  const color: Record<ColorRole, string> = { ...palette[scheme] };
  if (appearance.accent !== undefined && HEX.test(appearance.accent)) {
    color.accent = appearance.accent.toLowerCase();
    color.onAccent =
      contrast(color.accent, INK_LIGHT) >= contrast(color.accent, INK_DARK) ? INK_LIGHT : INK_DARK;
  }
  return { scheme, color, type: typeScale[os], weight: weight[os], touch: touch[os] };
}
