import { vi } from 'vitest';
export const secure = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
  getItemAsync: async (key: string) => secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void secure.set(key, value),
  deleteItemAsync: async (key: string) => void secure.delete(key),
}));
vi.mock('expo-quick-actions', () => ({
  setItems: async () => undefined,
}));

vi.mock('../src/host/native-source-drafts', async () => {
  const { useCallback, useSyncExternalStore } = await import('react');
  const { createSourceDrafts } = await import('../src/host/source-drafts');
  const sourceDrafts = createSourceDrafts({ read: async () => ({}), write() {} });
  return {
    sourceDrafts,
    useSourceDraft(key: string) {
      const value = useSyncExternalStore(sourceDrafts.subscribe, () => sourceDrafts.get(key));
      const set = useCallback((value: string) => sourceDrafts.set(key, value), [key]);
      return [value, set] as const;
    },
  };
});
vi.mock('../src/host/native-cache', () => ({
  clearHostConversationCache: () => undefined,
  nativeConversationCache: { read: async () => undefined, write() {} },
}));
vi.mock('../src/host/native-conversation-filter', async () => {
  const { useSyncExternalStore } = await import('react');
  const { createConversationFilter } = await import('../src/host/conversation-filter');
  const conversationFilter = createConversationFilter({ read: async () => undefined, write() {} });
  return {
    conversationFilter,
    useConversationFilter: () => [
      useSyncExternalStore(conversationFilter.subscribe, conversationFilter.getSnapshot),
      conversationFilter.set,
    ],
  };
});
vi.mock('../src/host/native-notifications', () => ({
  nativeNotifications: () => ({}),
}));
vi.mock('../src/host/native-notification-avatars', () => ({
  notificationAvatars: { sync: async () => true },
}));
vi.mock('../src/telemetry/native', () => ({
  mobileTelemetry: { foreground: () => undefined, send: () => undefined },
}));
vi.mock('../src/telemetry/connection', () => ({
  createConnectionTelemetry: () => undefined,
}));
vi.mock('../src/host/push-session', () => ({
  createPushSession: () => ({
    getSnapshot: () => ({ status: 'off' }),
    sync: async () => undefined,
    forget: async () => undefined,
    retryFailed: async () => undefined,
    reflect() {},
  }),
}));

import { FakeHost } from './fake-host';
import type { HostCarrier } from '../src/host/carrier';

export const remotes = new Map<string, FakeHost>();
const carrier: HostCarrier = {
  request: (url, init) => remote(url).carrier.request(url, init),
  openSocket: (url, events, headers) => remote(url).carrier.openSocket(url, events, headers),
};
function remote(url: string): FakeHost {
  const host = remotes.get(new URL(url).hostname);
  if (!host) throw new Error('Unknown test Host');
  return host;
}
vi.mock('../src/host/native-carrier', () => ({ nativeCarrier: () => carrier }));
