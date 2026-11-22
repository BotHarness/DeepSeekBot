import type { Appearance, AppearanceStyle } from './appearance.js';
import { useSyncExternalStore } from 'react';

export type BotColorScheme = 'light' | 'dark';

let appearance: Appearance | undefined;
const listeners = new Set<() => void>();
export function bindBotAppearance(owner: Appearance): () => void {
  appearance = owner;
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const off = owner.subscribe(publish);
  publish();
  return () => {
    off();
    if (appearance === owner) appearance = undefined;
    publish();
  };
}
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

export function readBotColorScheme(): BotColorScheme {
  if (appearance) return appearance.getSnapshot().mode;
  return globalThis.matchMedia?.(SYSTEM_DARK).matches ? 'dark' : 'light';
}

export function readBotStyle(): AppearanceStyle {
  return appearance?.getSnapshot().config.style ?? 'a';
}

export function subscribeBotColorScheme(listener: () => void): () => void {
  listeners.add(listener);
  const media = globalThis.matchMedia?.(SYSTEM_DARK);
  media?.addEventListener('change', listener);
  return () => {
    media?.removeEventListener('change', listener);
    listeners.delete(listener);
  };
}

export function useBotColorScheme(): BotColorScheme {
  return useSyncExternalStore(subscribeBotColorScheme, readBotColorScheme, () => 'light');
}
