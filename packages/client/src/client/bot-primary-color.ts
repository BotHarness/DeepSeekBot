import { readBotColorScheme } from './bot-color-scheme.js';
import { useCallback, useRef, useSyncExternalStore } from 'react';

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
  readable,
  REFERENCE_SURFACES,
  type Rgb,
  type ThemeName,
} from './bot-name-color.js';
export {
  BUBBLE_SURFACES,
  BUBBLE_SEPARATION,
  humanBubbleColors,
  parseColor,
  toHex,
  contrastRatio,
  botNameColor,
  NAME_CONTRAST,
  REFERENCE_SURFACES,
  type Rgb,
  type ThemeName,
} from './bot-name-color.js';

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
  return readBotColorScheme();
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

let observer: MutationObserver | undefined;
const listeners = new Set<() => void>();

function notifySurfaces(): void {
  listeners.forEach((notify) => notify());
}

function subscribeSurface(listener: () => void): () => void {
  listeners.add(listener);
  if (
    observer === undefined &&
    typeof MutationObserver === 'function' &&
    typeof document !== 'undefined'
  ) {
    observer = new MutationObserver(notifySurfaces);
    observer.observe(document.body, { attributes: true });
    observer.observe(document.documentElement, { attributes: true });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    observer?.disconnect();
    observer = undefined;
  };
}

export function useConversationSurface(): {
  background: string;
  probe(element: Element | null): void;
} {
  const probe = useRef<Element | null>(null);
  const snapshot = useCallback(
    () =>
      (probe.current?.isConnected ? renderedBackground(probe.current) : undefined) ??
      REFERENCE_SURFACES[currentTheme()].background,
    [],
  );
  const background = useSyncExternalStore(subscribeSurface, snapshot, snapshot);
  const attach = useCallback((element: Element | null) => {
    probe.current = element;
    if (element !== null) queueMicrotask(notifySurfaces);
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

export function refreshBotPrimaryColors(): void {
  if (typeof document === 'undefined') return;
  notifySurfaces();
  document.querySelectorAll<HTMLElement>('[data-bot-name-source]').forEach(paint);
  document.querySelectorAll<HTMLElement>('[data-bot-scale-source]').forEach(paintScale);
}

function watchTheme(): void {
  if (painter !== undefined || typeof MutationObserver !== 'function') return;
  painter = new MutationObserver(refreshBotPrimaryColors);
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
