import type { HostClient } from '@botharness/host-client/client';
import {
  createHumanAvatarCache,
  parseChannelNickname,
  parseHumanAvatars,
  parseHumanIdentity,
  type HumanAvatarCache,
  type HumanIdentity,
} from '@botharness/host-client/human-profile';
import { useSyncExternalStore } from 'react';
import type { ViewInstance } from 'react-native';

import { useMounted } from '../ui/mounted';

const caches = new WeakMap<HostClient, HumanAvatarCache>();

export function humanAvatarCache(client: HostClient): HumanAvatarCache {
  let cache = caches.get(client);
  if (cache === undefined) {
    cache = createHumanAvatarCache(async (humanIds) => ({
      avatars: parseHumanAvatars(await client.call<unknown>('humanAvatars', { humanIds })),
    }));
    caches.set(client, cache);
  }
  return cache;
}

const idle: HumanAvatarCache = createHumanAvatarCache(async () => ({ avatars: [] }));

export function useHumanAvatar(
  client: HostClient | undefined,
  humanId: string | undefined,
  version: string | undefined,
): string | undefined {
  const cache = client === undefined ? idle : humanAvatarCache(client);
  useSyncExternalStore(cache.subscribe, cache.getSnapshot);
  if (humanId === undefined) return undefined;
  cache.want(humanId, version);
  return cache.get(humanId, version);
}

const identities = new WeakMap<HostClient, HumanIdentity>();
const identityListeners = new Set<() => void>();
let identityRevision = 0;
const identitySource = {
  subscribe(listener: () => void) {
    identityListeners.add(listener);
    return () => {
      identityListeners.delete(listener);
    };
  },
  getSnapshot: () => identityRevision,
};

const writes = new WeakMap<HostClient, number>();

function remember(client: HostClient, identity: HumanIdentity, write = false): HumanIdentity {
  if (write) writes.set(client, (writes.get(client) ?? 0) + 1);
  identities.set(client, identity);
  identityRevision += 1;
  for (const listener of identityListeners) listener();
  return identity;
}

export async function loadHumanIdentity(client: HostClient): Promise<HumanIdentity> {
  const issued = writes.get(client) ?? 0;
  const identity = parseHumanIdentity(await client.call<unknown>('humanIdentity'));
  const newer = identities.get(client);
  return (writes.get(client) ?? 0) !== issued && newer !== undefined
    ? newer
    : remember(client, identity);
}

export function followHumanIdentity(client: HostClient): () => void {
  let loaded = false;
  let pending = false;
  const load = (): void => {
    if (loaded || pending) return;
    pending = true;
    loadHumanIdentity(client).then(
      () => {
        loaded = true;
        pending = false;
      },
      () => {
        pending = false;
      },
    );
  };
  load();
  return client.subscribe(() => {
    if (client.getSnapshot().connection.status === 'connected') load();
  });
}

export async function saveHumanName(
  client: HostClient,
  name: string | null,
): Promise<HumanIdentity> {
  return remember(
    client,
    parseHumanIdentity(await client.call<unknown>('humanNameSet', { displayName: name })),
    true,
  );
}

export async function saveHumanAvatar(
  client: HostClient,
  avatar: string | null,
): Promise<HumanIdentity> {
  const identity = parseHumanIdentity(await client.call<unknown>('humanAvatarSet', { avatar }));
  if (avatar !== null && identity.avatarVersion !== undefined)
    humanAvatarCache(client).put({
      humanId: identity.humanId,
      version: identity.avatarVersion,
      avatar,
    });
  return remember(client, identity, true);
}

export function useHumanIdentity(client: HostClient | undefined) {
  useSyncExternalStore(identitySource.subscribe, identitySource.getSnapshot);
  const identity = client === undefined ? undefined : identities.get(client);
  const mount = useMounted<ViewInstance>(
    () => (client === undefined ? undefined : followHumanIdentity(client)),
    [client],
  );
  const avatar = useHumanAvatar(client, identity?.humanId, identity?.avatarVersion);
  return { identity, avatar, mount };
}

export async function loadChannelNickname(
  client: HostClient,
  channelId: string,
): Promise<string | null> {
  return parseChannelNickname(await client.call<unknown>('channelGet', { channelId }));
}

export async function saveChannelNickname(
  client: HostClient,
  channelId: string,
  nickname: string | null,
): Promise<string | null> {
  const value = parseChannelNickname(
    await client.call<unknown>('channelHumanNameSet', { channelId, nickname }),
  );
  await client.refresh().catch(() => undefined);
  return value;
}
