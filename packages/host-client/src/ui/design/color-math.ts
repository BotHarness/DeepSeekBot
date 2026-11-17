import type { palette } from './palette.generated';
export type ColorRole = keyof typeof palette.light;
export type ColorScheme = 'light' | 'dark';

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
