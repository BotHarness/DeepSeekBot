import type { HumanInboxState } from './store.js';

export const ACTIVITY_INDICATOR_SCOPES = ['all', 'action', 'replies', 'unread', 'none'] as const;
export type ActivityIndicatorScope = (typeof ACTIVITY_INDICATOR_SCOPES)[number];
export const ACTIVITY_INDICATOR_KEY = 'botharness:activity:indicator:v1';

export function parseActivityIndicatorScope(value: unknown): ActivityIndicatorScope {
  return ACTIVITY_INDICATOR_SCOPES.some((scope) => scope === value)
    ? (value as ActivityIndicatorScope)
    : 'all';
}

export function activityIndicator(
  scope: ActivityIndicatorScope,
  state: Pick<HumanInboxState, 'unreadCount' | 'hasAction' | 'messageCounts' | 'attentionStatus'>,
): 'on' | 'off' | 'unknown' {
  if (scope === 'none') return 'off';
  if (state.attentionStatus !== 'ready') return 'unknown';
  if (scope === 'all') return state.unreadCount > 0 || state.hasAction ? 'on' : 'off';
  if (scope === 'action') return state.hasAction ? 'on' : 'off';
  if (!state.messageCounts) return 'unknown';
  return state.messageCounts[scope === 'replies' ? 'replies' : 'other'] > 0 ? 'on' : 'off';
}

export function createActivityIndicatorPreference(target: Window | undefined) {
  const read = () => {
    try {
      return {
        scope: parseActivityIndicatorScope(target?.localStorage.getItem(ACTIVITY_INDICATOR_KEY)),
        saveFailed: false,
      };
    } catch {
      return { scope: 'all' as const, saveFailed: true };
    }
  };
  let snapshot: { scope: ActivityIndicatorScope; saveFailed: boolean } = read();
  const listeners = new Set<() => void>();
  const publish = (next: typeof snapshot) => {
    if (next.scope === snapshot.scope && next.saveFailed === snapshot.saveFailed) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== ACTIVITY_INDICATOR_KEY) return;
    try {
      if (event.storageArea !== target?.localStorage) return;
    } catch {
      return;
    }
    publish(read());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        target?.addEventListener('storage', onStorage);
        publish(read());
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) target?.removeEventListener('storage', onStorage);
      };
    },
    set(scope: ActivityIndicatorScope) {
      let saveFailed = false;
      try {
        target?.localStorage.setItem(ACTIVITY_INDICATOR_KEY, scope);
      } catch {
        saveFailed = true;
      }
      publish({ scope, saveFailed });
    },
  };
}

export const activityIndicatorPreference = createActivityIndicatorPreference(
  typeof window === 'undefined' ? undefined : window,
);
