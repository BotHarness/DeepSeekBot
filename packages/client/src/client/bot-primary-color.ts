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
export const CHART_TONE_LEVELS = {
  cached: 1,
  uncached: 0.62,
  output: 0.36,
} as const;
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

type Layer = { rgb: Rgb; alpha: number };

let surfaceEpoch = 0;
let ownLayers = new WeakMap<Element, Layer | undefined>();

export function invalidateBotSurfaces(): void {
  surfaceEpoch += 1;
  ownLayers = new WeakMap();
}

function ownLayer(node: Element): Layer | undefined {
  if (ownLayers.has(node)) return ownLayers.get(node);
  const color = parseColor(getComputedStyle(node).backgroundColor);
  const layer = color === undefined || color.alpha === 0 ? undefined : color;
  if (node.isConnected) ownLayers.set(node, layer);
  return layer;
}

export function renderedBackground(element: Element): string | undefined {
  if (typeof getComputedStyle !== 'function') return undefined;
  const layers: Layer[] = [];
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const layer = ownLayer(node);
    if (layer === undefined) continue;
    layers.push(layer);
    if (layer.alpha === 1) {
      return toHex(
        layers.reduceRight<Rgb>(
          (below, current) => blend(current.rgb, current.alpha, below),
          layer.rgb,
        ),
      );
    }
  }
  return undefined;
}

const listeners = new Set<() => void>();

function notifySurfaces(): void {
  listeners.forEach((notify) => notify());
}

let surfaceNotificationQueued = false;
function scheduleSurfaceNotification(): void {
  if (surfaceNotificationQueued) return;
  surfaceNotificationQueued = true;
  queueMicrotask(() => {
    surfaceNotificationQueued = false;
    notifySurfaces();
  });
}

const THEME_ROOT_ATTRIBUTES = new Set(['class', 'style']);
const THEME_BODY_ATTRIBUTES = new Set(['data-ds-dark-theme']);
const SCOPE_ATTRIBUTES = ['data-workspace-enabled', 'data-wallpaper-active'];

function isStylesheet(node: Node): boolean {
  return node.nodeName === 'STYLE' || node.nodeName === 'LINK';
}

function changesStyles(record: MutationRecord): boolean {
  if (record.type === 'attributes') {
    const name = record.attributeName ?? '';
    if (SCOPE_ATTRIBUTES.includes(name)) return true;
    return record.target === document.documentElement
      ? THEME_ROOT_ATTRIBUTES.has(name)
      : THEME_BODY_ATTRIBUTES.has(name);
  }
  if (record.type === 'characterData') return record.target.parentNode?.nodeName === 'STYLE';
  return (
    isStylesheet(record.target) || [...record.addedNodes, ...record.removedNodes].some(isStylesheet)
  );
}

function changesSurface(record: MutationRecord): boolean {
  return record.type === 'attributes' || changesStyles(record);
}

let watcher: MutationObserver | undefined;
let scopes: MutationObserver | undefined;
let watchingPaint = false;

function watchSurfaces(): void {
  if (
    watcher !== undefined ||
    typeof MutationObserver !== 'function' ||
    typeof document === 'undefined'
  )
    return;
  const changed = (records: MutationRecord[]): void => {
    if (watchingPaint && records.some(changesStyles)) return refreshBotPrimaryColors();
    if (listeners.size > 0 && records.some(changesSurface)) {
      invalidateBotSurfaces();
      notifySurfaces();
    }
  };
  watcher = new MutationObserver(changed);
  watcher.observe(document.body, { attributes: true });
  watcher.observe(document.documentElement, { attributes: true });
  watcher.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  scopes = new MutationObserver(changed);
  scopes.observe(document.body, {
    attributes: true,
    subtree: true,
    attributeFilter: SCOPE_ATTRIBUTES,
  });
}

function subscribeSurface(listener: () => void): () => void {
  listeners.add(listener);
  watchSurfaces();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || watchingPaint) return;
    watcher?.disconnect();
    scopes?.disconnect();
    watcher = undefined;
    scopes = undefined;
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
    if (element !== null) scheduleSurfaceNotification();
  }, []);
  return { background, probe: attach };
}

const paintedEpoch = new WeakMap<HTMLElement, number>();

function paint(element: HTMLElement): void {
  const source = element.dataset['botNameSource'];
  if (source === undefined) return;
  if (element.isConnected) paintedEpoch.set(element, surfaceEpoch);
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
  if (
    element.dataset['botNameSource'] === source &&
    element.dataset['botNameColor'] !== undefined &&
    paintedEpoch.get(element) === surfaceEpoch
  )
    return;
  element.dataset['botNameSource'] = source;
  paint(element);
  watchTheme();
}

export function refreshBotPrimaryColors(): void {
  if (typeof document === 'undefined') return;
  invalidateBotSurfaces();
  notifySurfaces();
  document.querySelectorAll<HTMLElement>('[data-bot-name-source]').forEach(paint);
  document.querySelectorAll<HTMLElement>('[data-bot-scale-source]').forEach(paintScale);
}

function watchTheme(): void {
  watchingPaint = true;
  watchSurfaces();
}

export function botNameSource(
  bot: Parameters<typeof botPresentationSubject>[0] | undefined,
): string | undefined {
  return bot === undefined ? undefined : botPrimaryColorOf(bot).color;
}

function paintScale(element: HTMLElement): void {
  const source = element.dataset['botScaleSource'];
  if (source === undefined) return;
  if (element.isConnected) paintedEpoch.set(element, surfaceEpoch);
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
  if (
    element.dataset['botScaleSource'] === source &&
    element.dataset['botScaleColor'] !== undefined &&
    paintedEpoch.get(element) === surfaceEpoch
  )
    return;
  element.dataset['botScaleSource'] = source;
  paintScale(element);
  watchTheme();
}
