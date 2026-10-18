import { useCallback, useSyncExternalStore } from 'react';

import {
  resolveBotPrimaryColor,
  type BotPresentationSubject,
  type ResolvedBotPrimaryColor,
} from '../../../core/src/bots/primary-color.js';
import type { BotSummary } from './store.js';

import {
  botNameColor,
  parseColor,
  toHex,
  contrastRatio,
  readable,
  REFERENCE_SURFACES,
  NAME_TARGET,
  type Rgb,
  type ThemeName,
} from './bot-name-color.js';
export {
  parseColor,
  toHex,
  contrastRatio,
  botNameColor,
  NAME_CONTRAST,
  REFERENCE_SURFACES,
  type Rgb,
  type ThemeName,
} from './bot-name-color.js';

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
