export type Rgb = readonly [number, number, number];
export type ThemeName = 'light' | 'dark';

export const NAME_CONTRAST = 4.5;
export const NAME_TARGET = 4.6;

export const REFERENCE_SURFACES: Record<ThemeName, { background: string; label: string }> = {
  light: { background: '#ffffff', label: '#0f1115' },
  dark: { background: '#151517', label: '#f9fafb' },
};

export function parseColor(value: string): { rgb: Rgb; alpha: number } | undefined {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/u.exec(text);
  if (hex !== null) {
    const number = Number.parseInt(hex[1]!, 16);
    return { rgb: [number >> 16, (number >> 8) & 255, number & 255], alpha: 1 };
  }
  const functional = /^(rgba?|color)\(([^)]+)\)$/u.exec(text);
  if (functional === null) return undefined;
  const tokens = functional[2]!.split(/[\s,/]+/u).filter((part) => part.length > 0);
  const srgb = functional[1] === 'color';
  if (srgb && tokens[0] !== 'srgb') return undefined;
  const parts = srgb ? tokens.slice(1) : tokens;
  const channels = parts.slice(0, 3).map((part) => Number(part) * (srgb ? 255 : 1));
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel)))
    return undefined;
  const rawAlpha = parts[3];
  const alpha =
    rawAlpha === undefined
      ? 1
      : rawAlpha.endsWith('%')
        ? Number(rawAlpha.slice(0, -1)) / 100
        : Number(rawAlpha);
  if (!Number.isFinite(alpha)) return undefined;
  return {
    rgb: [channels[0]!, channels[1]!, channels[2]!],
    alpha: Math.min(1, Math.max(0, alpha)),
  };
}

export function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function luminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

export function contrastRatio(first: Rgb, second: Rgb): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function toOklch(rgb: Rgb): [number, number, number] {
  const [r, g, b] = [linear(rgb[0]), linear(rgb[1]), linear(rgb[2])];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [lightness, Math.hypot(a, bAxis), Math.atan2(bAxis, a)];
}

function fromOklch(lightness: number, chroma: number, hue: number): Rgb | undefined {
  const a = chroma * Math.cos(hue);
  const bAxis = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * bAxis) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * bAxis) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * bAxis) ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  if (channels.some((channel) => channel < -0.0005 || channel > 1.0005)) return undefined;
  return channels.map((channel) => {
    const value = Math.min(1, Math.max(0, channel));
    return (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) * 255;
  }) as [number, number, number];
}

function inGamut(lightness: number, chroma: number, hue: number): Rgb {
  const exact = fromOklch(lightness, chroma, hue);
  if (exact !== undefined) return exact;
  let low = 0;
  let high = chroma;
  for (let step = 0; step < 20; step += 1) {
    const middle = (low + high) / 2;
    if (fromOklch(lightness, middle, hue) === undefined) high = middle;
    else low = middle;
  }
  return fromOklch(lightness, low, hue) ?? [0, 0, 0];
}

export function readable(source: string, background: string, minimum: number): string {
  const from = parseColor(source)?.rgb;
  const surface = parseColor(background)?.rgb;
  if (from === undefined || surface === undefined) return source;
  if (contrastRatio(from, surface) >= minimum) return toHex(from);
  const [lightness, chroma, hue] = toOklch(from);
  const at = (target: number): Rgb => parseColor(toHex(inGamut(target, chroma, hue)))?.rgb ?? from;
  const reads = (target: number): boolean => contrastRatio(at(target), surface) >= minimum;
  const reach = (target: number): Rgb | undefined => {
    if (!reads(target)) return undefined;
    let near = lightness;
    let far = target;
    for (let step = 0; step < 24; step += 1) {
      const middle = (near + far) / 2;
      if (reads(middle)) far = middle;
      else near = middle;
    }
    return at(far);
  };
  const preferred = luminance(surface) > 0.18 ? 0 : 1;
  const adjusted = reach(preferred) ?? reach(1 - preferred);
  return adjusted === undefined ? toHex(from) : toHex(adjusted);
}

export function botNameColor(source: string, background: string): string {
  return readable(source, background, NAME_TARGET);
}
