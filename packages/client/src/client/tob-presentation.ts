import { useSyncExternalStore } from 'react';
import type { BotModeIcon } from '../bot-mode-settings.js';
import type { BotSummary } from './store.js';
import { useClientStore } from './use-client-store.js';
import { useMessageHost } from './message-host.js';

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
  const remote = useMessageHost() !== undefined;
  const scoped = useClientStore((state) =>
    remote ? state.bots.find((bot) => bot.slug === slug) : undefined,
  );
  const read = () =>
    slug !== undefined && (remote ? scoped : source?.bot(slug))?.tob?.defaultAvatar
      ? source?.icon()
      : undefined;
  return useSyncExternalStore(subscribe, read, read);
}

export function useTobName(slug: string | undefined, fallback: string): string {
  const remote = useMessageHost() !== undefined;
  const scoped = useClientStore((state) =>
    remote ? state.bots.find((bot) => bot.slug === slug) : undefined,
  );
  const read = () => {
    const bot = slug === undefined ? undefined : remote ? scoped : source?.bot(slug);
    return bot?.tob ? bot.displayName : fallback;
  };
  return useSyncExternalStore(subscribe, read, read);
}

export function useTobBot(slug: string | undefined): BotSummary | undefined {
  const remote = useMessageHost() !== undefined;
  const scoped = useClientStore((state) =>
    remote ? state.bots.find((bot) => bot.slug === slug) : undefined,
  );
  const read = () => {
    const bot = slug === undefined ? undefined : remote ? scoped : source?.bot(slug);
    return bot?.tob ? bot : undefined;
  };
  return useSyncExternalStore(subscribe, read, read);
}
