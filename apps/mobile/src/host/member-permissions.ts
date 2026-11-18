import { useSyncExternalStore } from 'react';
import type { HostClient } from '@botharness/host-client/client';

const BOT_CREATION = ['bots.createPrivate', 'bots.createPublic'];

const creation = new Map<string, boolean>();
const listeners = new Set<() => void>();
let version = 0;

function publish(): void {
  version++;
  for (const listener of listeners) listener();
}

export function memberPermissionsOf(value: unknown): readonly string[] | undefined {
  const viewer =
    typeof value === 'object' && value !== null
      ? (value as { viewer?: { permissions?: unknown } }).viewer
      : undefined;
  return Array.isArray(viewer?.permissions)
    ? viewer.permissions.filter((item): item is string => typeof item === 'string')
    : undefined;
}

export async function refreshMemberPermissions(hostId: string, client: HostClient): Promise<void> {
  const permissions = memberPermissionsOf(await client.call<unknown>('teamMode'));
  if (permissions === undefined) return;
  const allowed = BOT_CREATION.some((permission) => permissions.includes(permission));
  if (creation.get(hostId) === allowed) return;
  creation.set(hostId, allowed);
  publish();
}

export function forgetMemberPermissions(hostId: string): void {
  if (creation.delete(hostId)) publish();
}

export function memberCanCreateBots(hostId: string | undefined): boolean {
  return hostId === undefined || creation.get(hostId) !== false;
}

export function useMemberCanCreateBots(hostId: string | undefined): boolean {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  return memberCanCreateBots(hostId);
}
