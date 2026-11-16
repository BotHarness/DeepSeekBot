import { useCallback, useSyncExternalStore } from 'react';

import type { SkillCatalogEntry } from '../../../../../packages/core/src/skills/entries';
import type { HostClient } from '../../host/client';
import { loadSkillCatalog } from '../../host/skill-catalog';

interface Entry {
  skills: readonly SkillCatalogEntry[];
  listeners: Set<() => void>;
  revision: number;
  release?: () => void;
}

const EMPTY: readonly SkillCatalogEntry[] = [];
const stores = new WeakMap<HostClient, Map<string, Entry>>();

function entryFor(client: HostClient, channelId: string): Entry {
  let channels = stores.get(client);
  if (channels === undefined) {
    channels = new Map();
    stores.set(client, channels);
  }
  let entry = channels.get(channelId);
  if (entry === undefined) {
    entry = { skills: EMPTY, listeners: new Set(), revision: 0 };
    channels.set(channelId, entry);
  }
  return entry;
}

function load(client: HostClient, channelId: string, entry: Entry): void {
  const revision = ++entry.revision;
  void loadSkillCatalog(client, channelId).then(
    (skills) => {
      if (revision !== entry.revision) return;
      entry.skills = skills;
      for (const listener of entry.listeners) listener();
    },
    () => undefined,
  );
}

export function subscribeSkillCatalog(
  client: HostClient,
  channelId: string,
  listener: () => void,
): () => void {
  const entry = entryFor(client, channelId);
  entry.listeners.add(listener);
  if (entry.listeners.size === 1) {
    load(client, channelId, entry);
    const release = client.onSkills?.((channelIds) => {
      if (channelIds.includes(channelId)) load(client, channelId, entry);
    });
    if (release !== undefined) entry.release = release;
  }
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0) return;
    entry.release?.();
    delete entry.release;
  };
}

export function useSkillCatalog(
  client: HostClient | undefined,
  channelId: string | undefined,
): readonly SkillCatalogEntry[] {
  const subscribe = useCallback(
    (listener: () => void) =>
      client === undefined || channelId === undefined
        ? () => undefined
        : subscribeSkillCatalog(client, channelId, listener),
    [client, channelId],
  );
  return useSyncExternalStore(subscribe, () =>
    client === undefined || channelId === undefined
      ? EMPTY
      : (stores.get(client)?.get(channelId)?.skills ?? EMPTY),
  );
}
