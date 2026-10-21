import { useRef, useSyncExternalStore } from 'react';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';

import { store, type BotSummary, type ClientState } from './store.js';

export const useClientStore: SnapshotSelectorHook<ClientState> = function useClientStore<S>(
  select: (state: ClientState) => S,
  equal: (a: S, b: S) => boolean = Object.is,
): S {
  const memo = useRef<{ state: ClientState; select: typeof select; value: S }>();
  const read = (): S => {
    const state = store.getSnapshot();
    const last = memo.current;
    if (last !== undefined && last.state === state && last.select === select) return last.value;
    const next = select(state);
    const value = last !== undefined && equal(last.value, next) ? last.value : next;
    memo.current = { state, select, value };
    return value;
  };
  return useSyncExternalStore(store.subscribe, read, read);
};

export function sameBotNames(
  left: readonly Pick<BotSummary, 'slug' | 'displayName'>[],
  right: readonly Pick<BotSummary, 'slug' | 'displayName'>[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (bot, index) =>
        bot.slug === right[index]!.slug && bot.displayName === right[index]!.displayName,
    )
  );
}

export function sameFields<K extends keyof ClientState>(
  keys: readonly K[],
): (left: ClientState, right: ClientState) => boolean {
  return (left, right) => keys.every((key) => left[key] === right[key]);
}

export const keepClientState = (state: ClientState): ClientState => state;
