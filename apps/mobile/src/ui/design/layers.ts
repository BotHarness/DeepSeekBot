import type { ColorScheme } from './resolve-theme';

export const LAYERS = ['canvas', 'raised', 'well', 'field', 'sheet'] as const;
export type LayerName = (typeof LAYERS)[number];

export type Layer = {
  fill: string;
  pressed: string;
  selected: string;
  chosen: string;
  danger: string;
  inset: string;
  edge: string;
  divider: string;
};

export const LAYER_PARENT: Record<LayerName, LayerName | undefined> = {
  canvas: undefined,
  raised: 'canvas',
  well: 'raised',
  field: 'raised',
  sheet: 'canvas',
};

const CHOSEN: Record<ColorScheme, number> = { light: 0.13, dark: 0.3 };
const DANGER: Record<ColorScheme, number> = { light: 2, dark: 1 };

type Rgba = { r: number; g: number; b: number; a: number };

function parse(hex: string): Rgba {
  let digits = hex.slice(1);
  if (digits.length === 3 || digits.length === 4)
    digits = [...digits].map((digit) => digit + digit).join('');
  const channel = (at: number) => Number.parseInt(digits.slice(at, at + 2), 16);
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: digits.length === 8 ? channel(6) / 255 : 1,
  };
}

function format({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

export const SEPARATION = 0.03;

export function over(top: string, under: string, strength = 1): string {
  const a = parse(top);
  const b = parse(under);
  const alpha = Math.min(1, a.a * strength);
  const blend = (x: number, y: number) => x * alpha + y * (1 - alpha);
  return format({ r: blend(a.r, b.r), g: blend(a.g, b.g), b: blend(a.b, b.b), a: 1 });
}

export function tint(under: string, ink: string, amount: number): string {
  const a = parse(under);
  const b = parse(ink);
  const blend = (x: number, y: number) => x + (y - x) * amount;
  return format({ r: blend(a.r, b.r), g: blend(a.g, b.g), b: blend(a.b, b.b), a: 1 });
}

function oklab(hex: string): [number, number, number] {
  const { r, g, b } = parse(hex);
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function distance(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export function layers(
  scheme: ColorScheme,
  color: {
    base: string;
    surface: string;
    field: string;
    sheet: string;
    hover: string;
    selected: string;
    accent: string;
    dangerSoft: string;
    border: string;
    borderField: string;
    divider: string;
  },
): Record<LayerName, Layer> {
  const fills: Record<LayerName, string> = {
    canvas: color.base,
    raised: color.surface,
    well: color.base,
    field: color.field,
    sheet: color.sheet,
  };
  const layer = (name: LayerName): Layer => {
    const fill = fills[name];
    const parent = LAYER_PARENT[name];
    const separate = (paint: (strength: number) => string, avoid: string[] = []) => {
      const others = [fill, ...(parent === undefined ? [] : [fills[parent]]), ...avoid];
      for (let strength = 1; strength < 4; strength += 0.25) {
        const state = paint(strength);
        if (others.every((other) => distance(state, other) >= SEPARATION)) return state;
      }
      return paint(4);
    };
    const pressed = separate((strength) => over(color.hover, fill, strength));
    const selected = separate((strength) => over(color.selected, fill, strength), [pressed]);
    return {
      fill,
      pressed,
      selected,
      inset: pressed,
      chosen: separate(
        (strength) => tint(fill, color.accent, CHOSEN[scheme] * strength),
        [selected],
      ),
      danger: separate(
        (strength) => over(color.dangerSoft, fill, DANGER[scheme] * strength),
        [pressed, selected],
      ),
      edge: over(name === 'field' ? color.borderField : color.border, fill),
      divider: over(color.divider, fill),
    };
  };
  return Object.fromEntries(LAYERS.map((name) => [name, layer(name)])) as Record<LayerName, Layer>;
}
