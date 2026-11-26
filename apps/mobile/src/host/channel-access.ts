import { readChannelAccess } from '@botharness/host-client/channel-management';
import { useCallback, useSyncExternalStore } from 'react';

export type GroupGoneReason = 'removed' | 'gone';

type AccessClient = { call(method: string, args?: Record<string, unknown>): Promise<unknown> };

type Entry = {
  reason: GroupGoneReason | undefined;
  generation: number;
  listeners: Set<() => void>;
};

const ANSWER_WAIT_MS = 3_000;
const entries = new WeakMap<AccessClient, Map<string, Entry>>();

function entryFor(client: AccessClient, channelId: string): Entry {
  let byChannel = entries.get(client);
  if (byChannel === undefined) {
    byChannel = new Map();
    entries.set(client, byChannel);
  }
  let entry = byChannel.get(channelId);
  if (entry === undefined) {
    entry = { reason: undefined, generation: 0, listeners: new Set() };
    byChannel.set(channelId, entry);
  }
  return entry;
}

function ask(client: AccessClient, channelId: string, entry: Entry): void {
  const generation = ++entry.generation;
  entry.reason = undefined;
  const settle = (reason: GroupGoneReason) => {
    if (entry.generation !== generation) return;
    entry.reason = reason;
    for (const listener of entry.listeners) listener();
  };
  const timer = setTimeout(() => {
    if (entry.reason === undefined) settle('gone');
  }, ANSWER_WAIT_MS);
  void readChannelAccess(client, channelId)
    .then(
      (access) => settle(access === 'removed' ? 'removed' : 'gone'),
      () => settle('gone'),
    )
    .finally(() => clearTimeout(timer));
}

export function useGroupGoneReason(
  client: AccessClient | undefined,
  channelId: string | undefined,
): GroupGoneReason | undefined {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (client === undefined || channelId === undefined) return () => {};
      const entry = entryFor(client, channelId);
      entry.listeners.add(listener);
      if (entry.listeners.size === 1) ask(client, channelId, entry);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [client, channelId],
  );
  const reason = useSyncExternalStore(subscribe, () =>
    client === undefined || channelId === undefined
      ? undefined
      : entries.get(client)?.get(channelId)?.reason,
  );
  if (channelId === undefined) return undefined;
  if (client === undefined) return 'gone';
  return reason;
}
