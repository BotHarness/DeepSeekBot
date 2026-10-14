import { useCallback, useSyncExternalStore } from 'react';

import {
  resolveBotPrimaryColor,
  type BotPresentationSubject,
  type ResolvedBotPrimaryColor,
} from '../../../core/src/bots/primary-color.js';
import type { BotSummary } from './store.js';

export type Rgb = readonly [number, number, number];
export type ThemeName = 'light' | 'dark';

export const NAME_CONTRAST = 4.5;
const NAME_TARGET = 4.6;

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

function readable(source: string, background: string, minimum: number): string {
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

export const BUBBLE_SURFACES: Record<ThemeName, { base: string; surface: string; fg: string }> = {
  light: { base: '#ffffff', surface: '#f5f6f7', fg: '#0f1115' },
  dark: { base: '#151517', surface: '#353638', fg: '#f9fafb' },
};
export const BUBBLE_SEPARATION = 1.3;
const INK_LIGHT: Rgb = [255, 255, 255];
const INK_DARK: Rgb = [15, 17, 21];
const LIGHT_INK_FLOOR = 3;

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((index) => from[index]! + (to[index]! - from[index]!) * amount) as [
    number,
    number,
    number,
  ];
}

export function humanBubbleColors(
  source: string,
  theme: ThemeName,
): { fill: string; ink: string } | undefined {
  const from = parseColor(source)?.rgb;
  if (from === undefined) return undefined;
  const reference = BUBBLE_SURFACES[theme];
  const fg = parseColor(reference.fg)!.rgb;
  const behind = [reference.base, reference.surface].map((value) => parseColor(value)!.rgb);
  const steps = Array.from({ length: 41 }, (_, step) => step / 40);
  const separatedStep = steps.find((step) =>
    behind.every((rgb) => contrastRatio(mixRgb(from, fg, step), rgb) >= BUBBLE_SEPARATION),
  );
  const separated = mixRgb(from, fg, separatedStep ?? 1);
  if (contrastRatio(separated, INK_LIGHT) < LIGHT_INK_FLOOR)
    return { fill: toHex(separated), ink: toHex(INK_DARK) };
  const darkStep = steps.find(
    (step) => contrastRatio(mixRgb(separated, [0, 0, 0], step), INK_LIGHT) >= NAME_TARGET,
  );
  return { fill: toHex(mixRgb(separated, [0, 0, 0], darkStep ?? 1)), ink: toHex(INK_LIGHT) };
}

export const CHART_CONTRAST = 3;
export const CHART_TONE_LEVELS = { cached: 1, uncached: 0.62, output: 0.36 } as const;
export type ChartTone = keyof typeof CHART_TONE_LEVELS;

export function botChartColor(source: string, background: string): string {
  return readable(source, background, CHART_CONTRAST + 0.1);
}

export function botChartTones(source: string, background: string): Record<ChartTone, string> {
  const base = parseColor(botChartColor(source, background))?.rgb;
  const surface = parseColor(background)?.rgb;
  if (base === undefined || surface === undefined)
    return { cached: source, uncached: source, output: source };
  const tone = (level: number): string => toHex(blend(base, level, surface));
  return {
    cached: tone(CHART_TONE_LEVELS.cached),
    uncached: tone(CHART_TONE_LEVELS.uncached),
    output: tone(CHART_TONE_LEVELS.output),
  };
}

export function botPresentationSubject(
  bot: Pick<
    BotSummary,
    'slug' | 'displayName' | 'avatar' | 'appearance' | 'avatarSeed' | 'primaryColor'
  >,
): BotPresentationSubject {
  return {
    slug: bot.slug,
    displayName: bot.displayName,
    avatar: bot.avatar,
    appearance: bot.appearance,
    avatarSeed: bot.avatarSeed,
    primaryColor: bot.primaryColor,
  };
}

export function botPrimaryColorOf(
  bot: Parameters<typeof botPresentationSubject>[0],
): ResolvedBotPrimaryColor {
  return resolveBotPrimaryColor(botPresentationSubject(bot));
}

function currentTheme(): ThemeName {
  return typeof document !== 'undefined' && document.body?.hasAttribute('data-ds-dark-theme')
    ? 'dark'
    : 'light';
}

function blend(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return [0, 1, 2].map((index) => top[index]! * alpha + bottom[index]! * (1 - alpha)) as [
    number,
    number,
    number,
  ];
}

export function renderedBackground(element: Element): string | undefined {
  if (typeof getComputedStyle !== 'function') return undefined;
  const layers: Array<{ rgb: Rgb; alpha: number }> = [];
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const color = parseColor(getComputedStyle(node).backgroundColor);
    if (color === undefined || color.alpha === 0) continue;
    layers.push(color);
    if (color.alpha === 1) {
      return toHex(
        layers.reduceRight<Rgb>(
          (below, layer) => blend(layer.rgb, layer.alpha, below),
          layers[layers.length - 1]!.rgb,
        ),
      );
    }
  }
  return undefined;
}

let surface: string | undefined;
let probe: WeakRef<Element> | undefined;
let observer: MutationObserver | undefined;
const listeners = new Set<() => void>();

function surfaceSnapshot(): string {
  return surface ?? REFERENCE_SURFACES[currentTheme()].background;
}

function measureSurface(): void {
  const element = probe?.deref();
  const next = element?.isConnected ? renderedBackground(element) : undefined;
  if (next === surface) return;
  surface = next;
  listeners.forEach((listener) => listener());
}

function subscribeSurface(listener: () => void): () => void {
  listeners.add(listener);
  if (
    observer === undefined &&
    typeof MutationObserver === 'function' &&
    typeof document !== 'undefined'
  ) {
    observer = new MutationObserver(() => {
      measureSurface();
      listeners.forEach((notify) => notify());
    });
    observer.observe(document.body, { attributes: true });
    observer.observe(document.documentElement, { attributes: true });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    observer?.disconnect();
    observer = undefined;
    surface = undefined;
    probe = undefined;
  };
}

export function useConversationSurface(): {
  background: string;
  probe(element: Element | null): void;
} {
  const background = useSyncExternalStore(subscribeSurface, surfaceSnapshot, surfaceSnapshot);
  const attach = useCallback((element: Element | null) => {
    if (element === null || probe?.deref()?.isConnected) return;
    probe = new WeakRef(element);
    queueMicrotask(measureSurface);
  }, []);
  return { background, probe: attach };
}

let painter: MutationObserver | undefined;

function paint(element: HTMLElement): void {
  const source = element.dataset['botNameSource'];
  if (source === undefined) return;
  const color = botNameColor(
    source,
    renderedBackground(element) ?? REFERENCE_SURFACES[currentTheme()].background,
  );
  element.dataset['botNameColor'] = color;
  element.style.color = color;
}

export function paintBotName(element: HTMLElement | null, source: string | undefined): void {
  if (element === null) return;
  if (source === undefined) {
    if (element.dataset['botNameSource'] === undefined) return;
    delete element.dataset['botNameSource'];
    delete element.dataset['botNameColor'];
    element.style.removeProperty('color');
    return;
  }
  element.dataset['botNameSource'] = source;
  paint(element);
  watchTheme();
}

function watchTheme(): void {
  if (painter !== undefined || typeof MutationObserver !== 'function') return;
  painter = new MutationObserver(() => {
    document.querySelectorAll<HTMLElement>('[data-bot-name-source]').forEach(paint);
    document.querySelectorAll<HTMLElement>('[data-bot-scale-source]').forEach(paintScale);
  });
  painter.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
  painter.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
}

export function botNameSource(
  bot: Parameters<typeof botPresentationSubject>[0] | undefined,
): string | undefined {
  return bot === undefined ? undefined : botPrimaryColorOf(bot).color;
}

function paintScale(element: HTMLElement): void {
  const source = element.dataset['botScaleSource'];
  if (source === undefined) return;
  const color = botChartColor(
    source,
    renderedBackground(element) ?? REFERENCE_SURFACES[currentTheme()].background,
  );
  element.dataset['botScaleColor'] = color;
  element.style.setProperty('--bh-bot-color', color);
}

export function paintBotScale(element: HTMLElement | null, source: string | undefined): void {
  if (element === null) return;
  if (source === undefined) {
    if (element.dataset['botScaleSource'] === undefined) return;
    delete element.dataset['botScaleSource'];
    delete element.dataset['botScaleColor'];
    element.style.removeProperty('--bh-bot-color');
    return;
  }
  element.dataset['botScaleSource'] = source;
  paintScale(element);
  watchTheme();
}
