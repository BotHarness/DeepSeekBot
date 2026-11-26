import {
  canEditGroupDetails,
  editsGroupDetailsWithoutChannelRead,
  groupDetailsViewer,
  type GroupDetailsViewer,
} from '@botharness/host-client/group-details';
import { useCallback, useSyncExternalStore } from 'react';

import type { BridgeCall } from './bridge.js';
import { loadChannelAccess } from './team-channels-bridge.js';
import { currentTeamMode, refreshTeamMode, useTeamModeRead } from './team-state.js';

interface Entry {
  value: boolean | undefined;
  loading: Promise<boolean> | undefined;
  readonly listeners: Set<() => void>;
}

const entries = new WeakMap<BridgeCall, Map<string, Entry>>();

function entry(call: BridgeCall, channelId: string): Entry {
  let channels = entries.get(call);
  if (channels === undefined) {
    channels = new Map();
    entries.set(call, channels);
  }
  let found = channels.get(channelId);
  if (found === undefined) {
    found = { value: undefined, loading: undefined, listeners: new Set() };
    channels.set(channelId, found);
  }
  return found;
}

function load(call: BridgeCall, channelId: string, viewer: GroupDetailsViewer): Promise<boolean> {
  const current = entry(call, channelId);
  current.loading ??= loadChannelAccess(call, channelId)
    .then((access) => canEditGroupDetails(viewer, access))
    .catch(() => true)
    .then((value) => {
      current.value = value;
      for (const listener of current.listeners) listener();
      return value;
    })
    .finally(() => {
      current.loading = undefined;
    });
  return current.loading;
}

export async function recheckGroupDetails(
  call: BridgeCall | undefined,
  channelId: string,
): Promise<boolean> {
  if (call === undefined) return true;
  await refreshTeamMode(call);
  const team = currentTeamMode(call);
  if (team === undefined) return true;
  const viewer = groupDetailsViewer(team);
  if (editsGroupDetailsWithoutChannelRead(viewer)) return true;
  await entry(call, channelId).loading?.catch(() => undefined);
  return load(call, channelId, viewer);
}

export function useGroupDetailsEditable(
  call: BridgeCall | undefined,
  channelId: string,
): boolean | undefined {
  const team = useTeamModeRead(call);
  const viewer = team.value === undefined ? undefined : groupDetailsViewer(team.value);
  const needsRead = viewer !== undefined && !editsGroupDetailsWithoutChannelRead(viewer);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (call === undefined || viewer === undefined || !needsRead) return () => {};
      const current = entry(call, channelId);
      current.listeners.add(listener);
      if (current.value === undefined || current.listeners.size === 1)
        void load(call, channelId, viewer);
      return () => current.listeners.delete(listener);
    },
    [call, channelId, needsRead, viewer?.owner, viewer?.teamEnabled, viewer?.permissions],
  );
  const read = useSyncExternalStore(
    subscribe,
    () => (call === undefined ? undefined : entry(call, channelId).value),
    () => undefined,
  );
  if (call === undefined || team.failed) return true;
  if (viewer === undefined) return undefined;
  return needsRead ? read : true;
}
