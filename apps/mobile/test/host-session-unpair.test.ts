import { beforeEach, describe, expect, it, vi } from 'vitest';

const secure = new Map<string, string>();
const quickActions = vi.hoisted(() => ({ items: [] as Array<{ id: string }> }));
const clearedCaches = vi.hoisted(() => [] as string[]);
const forgotten = vi.hoisted(() => [] as string[]);

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
  getItemAsync: async (key: string) => secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void secure.set(key, value),
  deleteItemAsync: async (key: string) => void secure.delete(key),
}));
vi.mock('expo-quick-actions', () => ({
  setItems: async (items: Array<{ id: string }>) => void (quickActions.items = items),
}));
vi.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove() {} }),
  },
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options['ios'],
  },
}));
vi.mock('../src/host/native-source-drafts', () => ({
  sourceDrafts: { ready: Promise.resolve(), removeWhere: () => undefined },
}));
vi.mock('../src/host/native-cache', () => ({
  clearHostConversationCache: (hostId: string) => void clearedCaches.push(hostId),
  nativeConversationCache: {},
}));
vi.mock('../src/host/native-conversation-filter', async () => {
  const { createConversationFilter } = await import('../src/host/conversation-filter');
  return {
    conversationFilter: createConversationFilter({
      read: async () => undefined,
      write: () => undefined,
    }),
  };
});
vi.mock('../src/host/native-carrier', () => ({
  nativeCarrier: () => ({
    request: async () => new Response(null, { status: 503 }),
  }),
}));
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
  createConnectionTelemetry: () => ({}),
}));
vi.mock('../src/host/client', () => ({
  createHostClient: () => ({
    start() {},
    stop() {},
    retryNow() {},
    subscribe: () => () => {},
    getSnapshot: () => ({ connection: { status: 'connecting', route: '' } }),
  }),
}));
vi.mock('../src/host/inbox', () => ({
  createInbox: () => ({
    stop() {},
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'idle' }),
  }),
}));
vi.mock('../src/host/push-session', () => ({
  createPushSession: () => ({
    sync: async () => undefined,
    forget: async (host: { hostId: string }) => void forgotten.push(host.hostId),
    retryFailed: async () => undefined,
    reflect() {},
  }),
}));

const host = (id: string) => ({
  hostId: id,
  hostName: id,
  routes: [`https://${id}.example.ts.net`],
  deviceId: `device-${id}`,
  credential: `cred-${id}`,
});

const chat = (id: string, hostId: string) => ({
  id,
  title: id,
  href: `/dm/${id}?hostId=${encodeURIComponent(hostId)}`,
});

async function session(current: string) {
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({ hosts: [host('old'), host('new')], current }),
  );
  secure.set(
    'deepseekbot.recent-chats.v1',
    JSON.stringify([chat('writer', 'old'), chat('coder', 'new')]),
  );
  const { hostSession } = await import('../src/host/host-session');
  const { conversationFilter } = await import('../src/host/native-conversation-filter');
  await vi.waitFor(() => expect(hostSession.getState().hosts).toHaveLength(2));
  conversationFilter.set(JSON.stringify(['computer', 'old']));
  return { hostSession, conversationFilter };
}

const savedIds = () =>
  (
    JSON.parse(secure.get('deepseekbot.hosts.v3')!) as {
      hosts: Array<{ hostId: string }>;
    }
  ).hosts.map((entry) => entry.hostId);

describe('unpairing a Computer', () => {
  beforeEach(() => {
    secure.clear();
    quickActions.items = [];
    clearedCaches.length = 0;
    forgotten.length = 0;
    vi.resetModules();
  });

  it('drops an older Computer from the list, storage and everything it left on the phone', async () => {
    const { hostSession, conversationFilter } = await session('new');
    const result = await hostSession.unpair('old');

    expect(result?.current).toBe(false);
    expect(hostSession.getState().hosts.map((entry) => entry.hostId)).toEqual(['new']);
    expect(hostSession.getState().saved?.hostId).toBe('new');
    expect(savedIds()).toEqual(['new']);
    expect(clearedCaches).toEqual(['old']);
    await vi.waitFor(() => expect(forgotten).toEqual(['old']));
    await vi.waitFor(() => expect(quickActions.items.map((item) => item.id)).toEqual(['coder']));
    expect(
      (
        JSON.parse(secure.get('deepseekbot.recent-chats.v1')!) as Array<{
          id: string;
        }>
      ).map((entry) => entry.id),
    ).toEqual(['coder']);
    await vi.waitFor(() => expect(conversationFilter.getSnapshot()).toBe('all'));
    expect(await result?.revoked).toBe(false);
  });

  it('moves to the next Computer when the shown one is unpaired', async () => {
    const { hostSession } = await session('old');
    const result = await hostSession.unpair('old');

    expect(result?.current).toBe(true);
    expect(hostSession.getState().saved?.hostId).toBe('new');
    expect(hostSession.getState().hosts.map((entry) => entry.hostId)).toEqual(['new']);
    expect(clearedCaches).toEqual(['old']);
  });

  it('keeps the other Computer’s cache, chats and filter', async () => {
    const { hostSession, conversationFilter } = await session('old');
    await hostSession.unpair('new');

    expect(clearedCaches).toEqual(['new']);
    await vi.waitFor(() => expect(quickActions.items.map((item) => item.id)).toEqual(['writer']));
    expect(conversationFilter.getSnapshot()).toBe(JSON.stringify(['computer', 'old']));
  });
});
