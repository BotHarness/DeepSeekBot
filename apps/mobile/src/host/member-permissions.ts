import { createHostFolder } from '@botharness/host-client/bot-settings';
import { CREATE_FOLDER_PERMISSION } from '@botharness/host-client/new-folder';
import { readTeamMode } from '@botharness/host-client/people';
import { useMemo, useSyncExternalStore } from 'react';
import type { HostClient } from '@botharness/host-client/client';

const BOT_CREATION = ['bots.createPrivate', 'bots.createPublic'];

type CreationPermissions = { bots: boolean; channels: boolean; folders: boolean };

const creation = new WeakMap<HostClient, CreationPermissions>();
const members = new WeakSet<HostClient>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markMemberClient(client: HostClient): void {
  members.add(client);
}

export async function refreshMemberPermissions(client: HostClient): Promise<void> {
  const {
    viewer: { permissions },
  } = await readTeamMode(client);
  const next = {
    bots: BOT_CREATION.some((permission) => permissions.includes(permission)),
    channels: permissions.includes('channels.create'),
    folders: permissions.includes(CREATE_FOLDER_PERMISSION),
  };
  const previous = creation.get(client);
  if (
    previous?.bots === next.bots &&
    previous.channels === next.channels &&
    previous.folders === next.folders
  )
    return;
  creation.set(client, next);
  for (const listener of listeners) listener();
}

export function useMemberCreationPermissions(client: HostClient | undefined) {
  return useSyncExternalStore(subscribe, () => (client ? creation.get(client) : undefined));
}

export function useCreateFolder(client: HostClient | undefined) {
  const permissions = useMemberCreationPermissions(client);
  const allowed = client !== undefined && (!members.has(client) || permissions?.folders === true);
  return useMemo(
    () =>
      client === undefined || !allowed
        ? undefined
        : (parent: string, name: string) => createHostFolder(client, { parent, name }),
    [client, allowed],
  );
}
