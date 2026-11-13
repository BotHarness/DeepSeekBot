import { useEffect, useSyncExternalStore } from 'react';

import type { BridgeCall } from './bridge.js';
import { loadTeamMode, type TeamModeView } from './team-bridge.js';

/**
 * One Team mode snapshot per Bridge call, shared by the sidebar entry, the password gate and
 * Settings. The Host stays authoritative: this only decides what to show.
 */
interface Entry {
  value: TeamModeView | undefined;
  loading: Promise<void> | undefined;
  readonly listeners: Set<() => void>;
}

const entries = new WeakMap<BridgeCall, Entry>();

/** The signed-in Human's kind on this page's Host, from the last Team mode snapshot. */
let viewerKind: 'owner' | 'member' | undefined;
const viewerListeners = new Set<() => void>();

function publish(current: Entry, value: TeamModeView): void {
  current.value = value;
  for (const listener of current.listeners) listener();
  if (viewerKind !== value.viewer.kind) {
    viewerKind = value.viewer.kind;
    for (const listener of viewerListeners) listener();
  }
}

/** True while this page is signed in as a Host Member rather than the Owner. */
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
    found = { value: undefined, loading: undefined, listeners: new Set() };
    entries.set(call, found);
  }
  return found;
}

export function refreshTeamMode(call: BridgeCall): Promise<void> {
  const current = entry(call);
  current.loading ??= loadTeamMode(call)
    .then((value) => publish(current, value))
    .catch(() => {})
    .finally(() => {
      current.loading = undefined;
    });
  return current.loading;
}

export function setTeamModeSnapshot(call: BridgeCall, value: TeamModeView): void {
  publish(entry(call), value);
}

export function useTeamMode(call: BridgeCall | undefined): TeamModeView | undefined {
  const value = useSyncExternalStore(
    (listener) => {
      if (call === undefined) return () => {};
      const current = entry(call);
      current.listeners.add(listener);
      return () => current.listeners.delete(listener);
    },
    () => (call === undefined ? undefined : entry(call).value),
    () => undefined,
  );
  useEffect(() => {
    if (call !== undefined && entry(call).value === undefined) void refreshTeamMode(call);
  }, [call]);
  return value;
}
