import { useRef, useState, useSyncExternalStore, type RefCallback } from 'react';
import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';
import type { BridgeActions } from './actions.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import { useMountedResource } from './mounted-resource.js';

const snapshots = new Map<string, MessagingSnapshot>();
const requests = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshMessaging(
  slug: string,
  actions: Pick<BridgeActions, 'messagingSnapshot'>,
): Promise<void> {
  const sequence = (requests.get(slug) ?? 0) + 1;
  requests.set(slug, sequence);
  const value = await actions.messagingSnapshot(slug);
  if (requests.get(slug) !== sequence) return;
  snapshots.set(slug, value);
  for (const listener of [...listeners]) listener();
}

export function useMessagingSnapshot(
  slug: string,
  actions: Pick<BridgeActions, 'messagingSnapshot'>,
): {
  snapshot: MessagingSnapshot | undefined;
  failed: boolean;
  refresh(): Promise<void>;
  mount: RefCallback<HTMLElement>;
} {
  const read = (): MessagingSnapshot | undefined => snapshots.get(slug);
  const snapshot = useSyncExternalStore(subscribe, read, read);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const track = async (isActive: () => boolean): Promise<void> => {
    const sequence = ++latest.current;
    const current = () => isActive() && sequence === latest.current;
    try {
      await refreshMessaging(slug, actions);
      if (current()) setFailed(false);
    } catch (error) {
      if (current()) setFailed(true);
      throw error;
    }
  };
  const refresh = (): Promise<void> => track(() => true);
  const mount = useMountedResource<HTMLElement>(() => {
    let active = true;
    const load = (): void => void track(() => active).catch(() => undefined);
    load();
    const unsubscribe = subscribeMessagingDefaults(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [actions, slug]);
  return { snapshot, failed, refresh, mount };
}
