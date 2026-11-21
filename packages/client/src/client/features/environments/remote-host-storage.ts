import { isCustodyHandle } from '@botharness/host-client/hosts';
import type { HostStorage } from './remote-host-types.js';

export const REMOTE_HOSTS_STORAGE_KEY = 'botharness.remoteHosts.v1';
export const HOST_TAB_STORAGE_KEY = 'botharness.hostTab.v1';
export const REMOTE_HOST_RELEASE_STORAGE_KEY = 'botharness.remoteHosts.release.v1';
const RELEASE_LIMIT = 256;

export function readReleaseQueue(storage: HostStorage | undefined): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(REMOTE_HOST_RELEASE_STORAGE_KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && isCustodyHandle(item))
      : [];
  } catch {
    return [];
  }
}

export function updateReleaseQueue(
  storage: HostStorage | undefined,
  change: (handles: string[]) => string[],
): void {
  if (!storage) return;
  const handles = [...new Set(change(readReleaseQueue(storage)))].slice(-RELEASE_LIMIT);
  try {
    if (handles.length === 0) storage.removeItem(REMOTE_HOST_RELEASE_STORAGE_KEY);
    else storage.setItem(REMOTE_HOST_RELEASE_STORAGE_KEY, JSON.stringify(handles));
  } catch {}
}
export const ALL_HOSTS = 'all';
export const THIS_HOST = 'local';

export function readStorage(
  storage: HostStorage | undefined,
  key: string,
  oldKey: string,
): string | null {
  const current = storage?.getItem(key);
  const previous = storage?.getItem(oldKey);
  if (previous == null) return current ?? null;
  if (key === REMOTE_HOSTS_STORAGE_KEY) return current ?? previous;
  try {
    if (current == null) storage?.setItem(key, previous);
    storage?.removeItem(oldKey);
  } catch {}
  return current ?? previous;
}

export function readTab(storage: HostStorage | undefined): string {
  try {
    return readStorage(storage, HOST_TAB_STORAGE_KEY, 'botharness.computers.tab.v1') ?? ALL_HOSTS;
  } catch {
    return ALL_HOSTS;
  }
}
