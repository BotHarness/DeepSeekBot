import { useCallback, useRef, useState, useSyncExternalStore, type RefCallback } from 'react';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type { BridgeActions } from './actions.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import { useMountedResource } from './mounted-resource.js';
import { readSavedThenStatus } from './progressive-settings.js';

type MessagingActions = Pick<BridgeActions, 'messagingSnapshot'>;
interface MessagingStore {
  snapshots: Map<string, MessagingSnapshot>;
  requests: Map<string, number>;
  pending: Map<string, Promise<void>>;
  invalidating: Set<string>;
  discovery: Set<string>;
  mounts: Map<string, number>;
  listeners: Map<string, Set<() => void>>;
}
const stores = new WeakMap<MessagingActions, MessagingStore>();
function storeFor(actions: MessagingActions): MessagingStore {
  let store = stores.get(actions);
  if (!store) {
    store = {
      snapshots: new Map(),
      requests: new Map(),
      pending: new Map(),
      invalidating: new Set(),
      discovery: new Set(),
      mounts: new Map(),
      listeners: new Map(),
    };
    stores.set(actions, store);
  }
  return store;
}

export async function refreshMessaging(
  slug: string,
  actions: MessagingActions,
  { progressive = false, invalidate = false }: { progressive?: boolean; invalidate?: boolean } = {},
): Promise<void> {
  const store = storeFor(actions);
  const settings = progressive && !store.discovery.has(slug);
  const key = `${slug}:${settings ? 'settings' : 'discovery'}`;
  if (invalidate && !store.invalidating.has(key)) {
    store.pending.delete(key);
    store.invalidating.add(key);
    queueMicrotask(() => store.invalidating.delete(key));
  }
  const pending = store.pending.get(key);
  if (pending) return pending;
  const sequence = (store.requests.get(slug) ?? 0) + 1;
  store.requests.set(slug, sequence);
  const publish = (value: MessagingSnapshot) => {
    if (store.requests.get(slug) !== sequence) return;
    store.snapshots.set(slug, value);
    for (const listener of store.listeners.get(slug) ?? []) listener();
  };
  const work = (
    settings
      ? readSavedThenStatus((mode) => actions.messagingSnapshot(slug, mode), publish)
      : actions.messagingSnapshot(slug).then(publish)
  ).finally(() => {
    if (store.pending.get(key) === work) store.pending.delete(key);
  });
  store.pending.set(key, work);
  return work;
}

export function useMessagingSnapshot(
  slug: string,
  actions: Pick<BridgeActions, 'messagingSnapshot'>,
): {
  snapshot: MessagingSnapshot | undefined;
  failed: boolean;
  refresh(): Promise<void>;
  discover(): Promise<void>;
  mount: RefCallback<HTMLElement>;
} {
  const store = storeFor(actions);
  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      let listeners = store.listeners.get(slug);
      if (!listeners) {
        listeners = new Set();
        store.listeners.set(slug, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) store.listeners.delete(slug);
      };
    },
    [store, slug],
  );
  const read = (): MessagingSnapshot | undefined => store.snapshots.get(slug);
  const snapshot = useSyncExternalStore(subscribe, read, read);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const track = async (
    isActive: () => boolean,
    progressive = false,
    invalidate = false,
  ): Promise<void> => {
    const sequence = ++latest.current;
    let sharedSequence: number | undefined;
    const current = () =>
      isActive() && sequence === latest.current && sharedSequence === store.requests.get(slug);
    try {
      const read = refreshMessaging(slug, actions, { progressive, invalidate });
      sharedSequence = store.requests.get(slug);
      await read;
      if (current()) setFailed(false);
    } catch (error) {
      if (current()) setFailed(true);
      throw error;
    }
  };
  const refresh = (): Promise<void> => track(() => true, true, true);
  const discover = (): Promise<void> => {
    store.discovery.add(slug);
    return track(() => true, false, true);
  };
  const mount = useMountedResource<HTMLElement>(() => {
    store.mounts.set(slug, (store.mounts.get(slug) ?? 0) + 1);
    let active = true;
    const load = (invalidate = false): void =>
      void track(() => active, true, invalidate).catch(() => undefined);
    load();
    const unsubscribe = subscribeMessagingDefaults(() => load(true));
    return () => {
      active = false;
      unsubscribe();
      const remaining = (store.mounts.get(slug) ?? 1) - 1;
      if (remaining) store.mounts.set(slug, remaining);
      else {
        store.mounts.delete(slug);
        store.discovery.delete(slug);
        store.pending.delete(`${slug}:settings`);
        store.pending.delete(`${slug}:discovery`);
        store.requests.set(slug, (store.requests.get(slug) ?? 0) + 1);
        store.snapshots.delete(slug);
      }
    };
  }, [actions, slug]);
  return { snapshot, failed, refresh, discover, mount };
}
