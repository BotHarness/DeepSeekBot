import { useRef, useSyncExternalStore } from 'react';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';

import { store, type BotSummary, type ClientState, type ClientStore } from './store.js';

export const useClientStore: SnapshotSelectorHook<ClientState> = function useClientStore<S>(
  select: (state: ClientState) => S,
  equal: (a: S, b: S) => boolean = Object.is,
): S {
  return useStoreSlice(store, select, equal);
};

export function useStoreSlice<S>(
  source: Pick<ClientStore, 'subscribe' | 'getSnapshot'>,
  select: (state: ClientState) => S,
  equal: (a: S, b: S) => boolean = Object.is,
): S {
  const memo = useRef<{
    state: ClientState;
    select: typeof select;
    equal: typeof equal;
    value: S;
  }>();
  const read = (): S => {
    const state = source.getSnapshot();
    const last = memo.current;
    if (
      last !== undefined &&
      last.state === state &&
      last.select === select &&
      last.equal === equal
    )
      return last.value;
    const next = select(state);
    const value = last !== undefined && equal(last.value, next) ? last.value : next;
    memo.current = { state, select, equal, value };
    return value;
  };
  return useSyncExternalStore(source.subscribe, read, read);
}

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

export type BotFace = Pick<
  BotSummary,
  'slug' | 'displayName' | 'avatar' | 'appearance' | 'avatarSeed'
>;

export function sameBotFace(left: BotFace | undefined, right: BotFace | undefined): boolean {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.slug === right.slug &&
      left.displayName === right.displayName &&
      left.avatar === right.avatar &&
      left.appearance === right.appearance &&
      left.avatarSeed === right.avatarSeed)
  );
}

export function sameBotFaces(left: readonly BotFace[], right: readonly BotFace[]): boolean {
  return (
    left === right ||
    (left.length === right.length && left.every((bot, index) => sameBotFace(bot, right[index])))
  );
}

export function sameFields<K extends keyof ClientState>(
  keys: readonly K[],
): (left: ClientState, right: ClientState) => boolean {
  return (left, right) => keys.every((key) => left[key] === right[key]);
}

export const keepClientState = (state: ClientState): ClientState => state;
