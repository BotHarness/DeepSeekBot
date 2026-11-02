import { useSyncExternalStore } from 'react';
import type { BotModeIcon } from '../bot-mode-settings.js';
import type { BotSummary } from './store.js';

interface TobPresentationSource {
  bot(slug: string): BotSummary | undefined;
  icon(): BotModeIcon;
  subscribe(listener: () => void): () => void;
}
let source: TobPresentationSource | undefined;
const listeners = new Set<() => void>();

export function bindTobPresentation(next: TobPresentationSource): () => void {
  source = next;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const unsubscribe = next.subscribe(notify);
  notify();
  return () => {
    unsubscribe();
    if (source === next) {
      source = undefined;
      notify();
    }
  };
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useTobDefaultIcon(slug: string | undefined): BotModeIcon | undefined {
  const read = () =>
    slug !== undefined && source?.bot(slug)?.tob?.defaultAvatar ? source.icon() : undefined;
  return useSyncExternalStore(subscribe, read, read);
}

export function useTobName(slug: string | undefined, fallback: string): string {
  const read = () => {
    const bot = slug === undefined ? undefined : source?.bot(slug);
    return bot?.tob ? bot.displayName : fallback;
  };
  return useSyncExternalStore(subscribe, read, read);
}

export function useTobBot(slug: string | undefined): BotSummary | undefined {
  const read = () => {
    const bot = slug === undefined ? undefined : source?.bot(slug);
    return bot?.tob ? bot : undefined;
  };
  return useSyncExternalStore(subscribe, read, read);
}
