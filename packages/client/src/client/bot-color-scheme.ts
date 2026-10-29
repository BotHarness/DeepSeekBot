import type { Appearance } from './appearance.js';
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
const DARK_ATTRIBUTE = 'data-ds-dark-theme';

export function readBotColorScheme(): BotColorScheme {
  if (appearance) return appearance.getSnapshot().mode;
  if (typeof document === 'undefined') return 'light';
  return document.body.hasAttribute(DARK_ATTRIBUTE) ? 'dark' : 'light';
}

export function subscribeBotColorScheme(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {
      listeners.delete(listener);
    };
  }
  const observer = new MutationObserver(listener);
  observer.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTRIBUTE] });
  return () => {
    observer.disconnect();
    listeners.delete(listener);
  };
}

export function useBotColorScheme(): BotColorScheme {
  return useSyncExternalStore(subscribeBotColorScheme, readBotColorScheme, () => 'light');
}
