import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import { parseSavedHosts } from '../src/host/hosts';
import { createHostDrawer } from '../src/ui/shell/host-drawer-model';

const secure = new Map<string, string>();
const quickActions = vi.hoisted(() => ({ items: [] as Array<{ id: string }> }));
const clearedCaches = vi.hoisted(() => [] as string[]);
const forgotten = vi.hoisted(() => [] as string[]);
const clearCache = vi.hoisted(() => vi.fn((hostId: string) => void clearedCaches.push(hostId)));
const clearDrafts = vi.hoisted(() => vi.fn(async () => {}));
const clientStops = vi.hoisted(() => vi.fn());
let beforeSave: ((key: string, value: string) => Promise<void>) | undefined;
let savedFilter = 'all';

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
  getItemAsync: async (key: string) => secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    await beforeSave?.(key, value);
    secure.set(key, value);
  },
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
  sourceDrafts: {
    ready: Promise.resolve(),
    removeWhere: () => undefined,
    removePersistedWhere: clearDrafts,
  },
}));
vi.mock('../src/host/conversation', () => ({ createConversation: vi.fn() }));
vi.mock('../src/host/conversation-playback', () => ({ createConversationPlayback: vi.fn() }));
vi.mock('../src/host/native-cache', () => ({
  clearHostConversationCache: clearCache,
  nativeConversationCache: {},
}));
vi.mock('../src/host/native-conversation-filter', async () => {
  const { createConversationFilter } = await import('../src/host/conversation-filter');
  return {
    conversationFilter: createConversationFilter({
      read: async () => undefined,
      write: (value: string) => {
        savedFilter = value;
      },
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
vi.mock('../src/host/native-notification-preferences', () => ({
  notificationPreferences: {
    setForeground: () => undefined,
    sync: async () => undefined,
    retry: async () => undefined,
    prepare: async () => undefined,
  },
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
    stop: clientStops,
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

async function session(current: string, ids = ['old', 'new']) {
  secure.set('deepseekbot.hosts.v3', JSON.stringify({ hosts: ids.map(host), current }));
  secure.set(
    'deepseekbot.recent-chats.v1',
    JSON.stringify([chat('writer', 'old'), chat('coder', 'new')]),
  );
  const { hostSession } = await import('../src/host/host-session');
  const { conversationFilter } = await import('../src/host/native-conversation-filter');
  await vi.waitFor(() => expect(hostSession.getState().hosts).toHaveLength(ids.length));
  conversationFilter.set(JSON.stringify(['computer', 'old']));
  return { hostSession, conversationFilter };
}

const savedIds = () =>
  (
    JSON.parse(secure.get('deepseekbot.hosts.v3')!) as {
      hosts: Array<{ hostId: string }>;
    }
  ).hosts.map((entry) => entry.hostId);

beforeEach(() => {
  clearCache.mockClear();
  clearDrafts.mockClear();
  secure.clear();
  quickActions.items = [];
  clearedCaches.length = 0;
  forgotten.length = 0;
  beforeSave = undefined;
  savedFilter = 'all';
  vi.resetModules();
});

describe('unpairing a Computer', () => {
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

function deferredSave() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function switchingSession() {
  const { hostSession, conversationFilter } = await session('a', ['a', 'b', 'c']);
  conversationFilter.set(computerEnvironmentKey('a'));
  const writes: string[] = [];
  const gates = { b: deferredSave(), c: deferredSave() };
  beforeSave = async (key, value) => {
    if (key !== 'deepseekbot.hosts.v3') return;
    const current = parseSavedHosts(value).current!;
    writes.push(current);
    if (current === 'b' || current === 'c') await gates[current].promise;
  };
  const drawer = createHostDrawer({
    switchTo: hostSession.switchTo,
    showView: (hostId) =>
      conversationFilter.set(hostId === undefined ? 'all' : computerEnvironmentKey(hostId)),
    pair: () => {},
    notifications: () => {},
  });
  const expectSelection = async (owner: string, filter = computerEnvironmentKey(owner)) => {
    const { loadSavedHosts } = await import('../src/host/saved-host');
    expect(hostSession.getState().saved?.hostId).toBe(owner);
    expect((await loadSavedHosts()).current).toBe(owner);
    expect(conversationFilter.getSnapshot()).toBe(filter);
    expect(savedFilter).toBe(filter);
  };
  return { drawer, writes, gates, expectSelection };
}

describe('drawer selection through the real Host Session', () => {
  it('returns to A after a pending B save instead of accepting the old current A early', async () => {
    const { drawer, writes, gates, expectSelection } = await switchingSession();
    const b = drawer.select('b');
    await vi.waitFor(() => expect(writes).toEqual(['b']));
    const a = drawer.select('a');
    gates.b.resolve();
    await Promise.all([b, a]);
    await expectSelection('a');
    expect(writes).toEqual(['b', 'a']);
  });

  it.each([true, false])(
    'keeps C as owner and filter when C storage is released first: %s',
    async (newerFirst) => {
      const { drawer, writes, gates, expectSelection } = await switchingSession();
      const b = drawer.select('b');
      await vi.waitFor(() => expect(writes).toEqual(['b']));
      const c = drawer.select('c');
      if (newerFirst) {
        gates.c.resolve();
        await Promise.resolve();
        gates.b.resolve();
      } else {
        gates.b.resolve();
        await b;
        gates.c.resolve();
      }
      await Promise.all([b, c]);
      await expectSelection('c');
      expect(writes).toEqual(['b', 'c']);
    },
  );

  it('keeps All after the pending Host is saved and adopted', async () => {
    const { drawer, writes, gates, expectSelection } = await switchingSession();
    const b = drawer.select('b');
    await vi.waitFor(() => expect(writes).toEqual(['b']));
    drawer.selectAll();
    gates.b.resolve();
    await b;
    await expectSelection('b', 'all');
  });
});

it('removes account-owned connections through the real session and stops its client, preserving manual records', async () => {
  const owner = {
    issuer: 'https://api.workos.com' as const,
    relay: 'https://fixture.invalid',
    clientId: 'client_fixture',
    subject: 'user_a',
  };
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      hosts: [{ ...host('old'), accountOwner: owner }, host('new')],
      current: 'old',
    }),
  );
  const { hostSession } = await import('../src/host/host-session');
  await vi.waitFor(() => expect(hostSession.getState().hosts).toHaveLength(2));
  clientStops.mockClear();
  await hostSession.removeAccount(owner);
  expect(savedIds()).toEqual(['new']);
  expect(hostSession.getState().hosts.map((host) => host.hostId)).toEqual(['new']);
  expect(clientStops).toHaveBeenCalledTimes(1);
  expect(forgotten).toContain('old');
  expect(forgotten).not.toContain('new');
  expect(clearedCaches).toEqual(['old']);
  expect(parseSavedHosts(secure.get('deepseekbot.hosts.v3')).pendingAccountRemoval).toBeUndefined();
});

it.each(['draft', 'cache', 'recent'] as const)(
  'retains the account cleanup journal after a required %s failure, then retries',
  async (failure) => {
    const owner = {
      issuer: 'https://api.workos.com' as const,
      relay: 'https://fixture.invalid',
      clientId: 'client_fixture',
      subject: 'user_a',
    };
    secure.set(
      'deepseekbot.hosts.v3',
      JSON.stringify({
        hosts: [{ ...host('old'), accountOwner: owner }, host('new')],
        current: 'old',
      }),
    );
    secure.set(
      'deepseekbot.recent-chats.v1',
      JSON.stringify([chat('writer', 'old'), chat('coder', 'new')]),
    );
    const { hostSession } = await import('../src/host/host-session');
    await vi.waitFor(() => expect(hostSession.getState().hosts).toHaveLength(2));
    if (failure === 'draft') clearDrafts.mockRejectedValueOnce(new Error('disk'));
    if (failure === 'cache')
      clearCache.mockImplementationOnce(() => {
        throw new Error('disk');
      });
    if (failure === 'recent')
      beforeSave = async (key) => {
        if (key === 'deepseekbot.recent-chats.v1') throw new Error('disk');
      };
    await expect(hostSession.removeAccount(owner)).rejects.toThrow('disk');
    expect(savedIds()).toEqual(['new']);
    expect(
      parseSavedHosts(secure.get('deepseekbot.hosts.v3')).pendingAccountRemoval?.map(
        (host) => host.hostId,
      ),
    ).toEqual(['old']);
    beforeSave = undefined;
    await hostSession.removeAccount(owner);
    expect(
      parseSavedHosts(secure.get('deepseekbot.hosts.v3')).pendingAccountRemoval,
    ).toBeUndefined();
    expect(
      JSON.parse(secure.get('deepseekbot.recent-chats.v1')!).map((chat: { id: string }) => chat.id),
    ).toEqual(['coder']);
  },
);
