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

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const INK_LIGHT = '#ffffff';
const INK_DARK = '#0f1115';
const SEPARATION = 1.3;
const BODY_CONTRAST = 4.5;
const LIGHT_SURFACE = 3;

function mix(from: string, to: string, amount: number): string {
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
  const steps = Array.from({ length: 41 }, (_, step) => step / 40);
  const separated = mix(
    source.toLowerCase(),
    color.fg,
    steps.find((step) =>
      [color.base, color.surface].every(
        (behind) => contrast(mix(source.toLowerCase(), color.fg, step), behind) >= SEPARATION,
      ),
    ) ?? 1,
  );
  if (contrast(separated, INK_LIGHT) < LIGHT_SURFACE)
    return { ...color, accent: separated, onAccent: INK_DARK };
  const accent = mix(
    separated,
    '#000000',
    steps.find((step) => contrast(mix(separated, '#000000', step), INK_LIGHT) >= BODY_CONTRAST) ??
      1,
  );
  const onAccent = INK_LIGHT;
  return { ...color, accent, onAccent };
}

export function resolveTheme(
  system: ColorScheme,
  appearance: Appearance = {},
  os: PlatformOS = 'ios',
): DesignTheme {
  const scheme =
    appearance.scheme === undefined || appearance.scheme === 'system' ? system : appearance.scheme;
  const color = withAccent({ ...palette[scheme] }, appearance.accent);
  return { scheme, color, type: typeScale[os], weight: weight[os], touch: touch[os] };
}
