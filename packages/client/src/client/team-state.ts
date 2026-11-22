import { setSelfHumanId } from './self-human.js';
import { useCallback, useSyncExternalStore } from 'react';

import type { BridgeCall } from './bridge.js';
import { loadTeamMode, type TeamModeView } from './team-bridge.js';

interface TeamModeRead {
  value: TeamModeView | undefined;
  failed: boolean;
}

interface Entry {
  read: TeamModeRead;
  loading: Promise<void> | undefined;
  readonly listeners: Set<() => void>;
}

const unread: TeamModeRead = { value: undefined, failed: false };
const entries = new WeakMap<BridgeCall, Entry>();
const isolatedIdentity = new WeakSet<BridgeCall>();

export function isolateTeamIdentity(call: BridgeCall): void {
  isolatedIdentity.add(call);
}

let viewerKind: 'owner' | 'member' | undefined;
const viewerListeners = new Set<() => void>();

function publish(call: BridgeCall, current: Entry, value: TeamModeView): void {
  current.read = { value, failed: false };
  if (!isolatedIdentity.has(call)) setSelfHumanId(value.viewer.humanId);
  for (const listener of current.listeners) listener();
  if (!isolatedIdentity.has(call) && viewerKind !== value.viewer.kind) {
    viewerKind = value.viewer.kind;
    for (const listener of viewerListeners) listener();
  }
}

export function useTeamMember(): boolean {
  return (
    useSyncExternalStore(
      (listener) => {
        viewerListeners.add(listener);
        return () => viewerListeners.delete(listener);
      },
      () => viewerKind,
      () => undefined,
    ) === 'member'
  );
}

function entry(call: BridgeCall): Entry {
  let found = entries.get(call);
  if (found === undefined) {
    found = { read: unread, loading: undefined, listeners: new Set() };
    entries.set(call, found);
  }
  return found;
}

export function refreshTeamMode(call: BridgeCall): Promise<void> {
  const current = entry(call);
  current.loading ??= loadTeamMode(call)
    .then((value) => publish(call, current, value))
    .catch(() => {
      if (current.read.value !== undefined || current.read.failed) return;
      current.read = { value: undefined, failed: true };
      for (const listener of current.listeners) listener();
    })
    .finally(() => {
      current.loading = undefined;
    });
  return current.loading;
}

export function setTeamModeSnapshot(call: BridgeCall, value: TeamModeView): void {
  publish(call, entry(call), value);
}

export function currentTeamMode(call: BridgeCall): TeamModeView | undefined {
  return entry(call).read.value;
}

export function useTeamModeRead(call: BridgeCall | undefined): TeamModeRead {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (call === undefined) return () => {};
      const current = entry(call);
      current.listeners.add(listener);
      if (current.read.value === undefined) void refreshTeamMode(call);
      return () => current.listeners.delete(listener);
    },
    [call],
  );
  return useSyncExternalStore(
    subscribe,
    () => (call === undefined ? unread : entry(call).read),
    () => unread,
  );
}

export function useTeamMode(call: BridgeCall | undefined): TeamModeView | undefined {
  return useTeamModeRead(call).value;
}
