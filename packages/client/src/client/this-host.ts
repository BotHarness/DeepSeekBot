import { useSyncExternalStore } from 'react';

interface ThisHostInfo {
  id?: string;
  name?: string;
}

export const getThisHost = (): ThisHostInfo => local;

let local: ThisHostInfo = {};
let localRequested = false;
const localListeners = new Set<() => void>();

function subscribeLocal(listener: () => void): () => void {
  localListeners.add(listener);
  if (!localRequested) {
    localRequested = true;
    void fetch('./api/botharness/devices')
      .then((response) => (response.ok ? response.json() : undefined))
      .then((value: { host?: { id?: unknown; name?: unknown } } | undefined) => {
        const host = value?.host;
        local = {
          ...(typeof host?.id === 'string' ? { id: host.id } : {}),
          ...(typeof host?.name === 'string' ? { name: host.name } : {}),
        };
        for (const notify of localListeners) notify();
      })
      .catch(() => {
        localRequested = false;
      });
  }
  return () => {
    localListeners.delete(listener);
  };
}

export function useThisHost(): ThisHostInfo {
  return useSyncExternalStore(
    subscribeLocal,
    () => local,
    () => local,
  );
}
