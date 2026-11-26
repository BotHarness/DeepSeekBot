import { readTeamMode } from '@botharness/host-client/people';
import { useSyncExternalStore } from 'react';
import type { HostClient } from '@botharness/host-client/client';

const BOT_CREATION = ['bots.createPrivate', 'bots.createPublic'];

type CreationPermissions = { bots: boolean; channels: boolean; people: boolean };

const creation = new WeakMap<HostClient, CreationPermissions>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshMemberPermissions(client: HostClient): Promise<void> {
  const {
    enabled,
    viewer: { permissions, owner },
  } = await readTeamMode(client);
  const next = {
    bots: owner || BOT_CREATION.some((permission) => permissions.includes(permission)),
    channels: owner || permissions.includes('channels.create'),
    people: enabled && (owner || permissions.includes('dm.humans')),
  };
  const previous = creation.get(client);
  if (
    previous?.bots === next.bots &&
    previous.channels === next.channels &&
    previous.people === next.people
  )
    return;
  creation.set(client, next);
  for (const listener of listeners) listener();
}

export function useMemberCreationPermissions(client: HostClient | undefined) {
  return useSyncExternalStore(subscribe, () => (client ? creation.get(client) : undefined));
}
