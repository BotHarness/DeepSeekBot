import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';
import type { ActivityTarget } from '../src/host/live-activity-session';

const native = vi.hoisted(() => ({
  alive: false,
  storage: undefined as unknown,
  prepare: undefined as (() => Promise<void>) | undefined,
  register: undefined as (() => Promise<void>) | undefined,
  token: undefined as (() => Promise<void>) | undefined,
  listeners: new Set<(event: { pushToken: string }) => void>(),
  end: vi.fn(async () => {}),
  start: vi.fn(),
  remote: vi.fn(),
}));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => ({}) }));
vi.mock('expo-application', () => ({ applicationId: 'app.deepseekbot.mobile' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'fixture-link' }));
vi.mock('expo-router', () => ({ useFocusEffect() {} }));
vi.mock('expo-file-system', () => ({
  Paths: { document: '/' },
  File: class {
    get exists() {
      return native.storage !== undefined;
    }
    async text() {
      return JSON.stringify(native.storage);
    }
    writeSync(value: string) {
      native.storage = JSON.parse(value);
    }
  },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options['ios'] },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
}));
vi.mock('../src/ui/strings', () => ({ locale: 'en', t: {} }));
vi.mock('../src/ui/shell/recent-chats', () => ({ forgetRecentChats: async () => {} }));
vi.mock('../src/host/live-activity', async (original) => ({
  ...(await original<typeof import('../src/host/live-activity')>()),
  createHostActivity: () => ({ request: native.remote }),
}));
vi.mock('../src/ui/widgets/request-activity', () => {
  const activity = {
    getId: () => 'native',
    getPushToken: async () => {
      await native.token?.();
      return 'a'.repeat(64);
    },
    addPushTokenListener: (listener: (event: { pushToken: string }) => void) => {
      native.listeners.add(listener);
      return { remove: () => native.listeners.delete(listener) };
    },
    end: async () => {
      native.alive = false;
      await native.end();
    },
  };
  return {
    requestActivity: {
      start: (...args: unknown[]) => {
        native.start(...args);
        native.alive = true;
        return activity;
      },
      getInstances: () => (native.alive ? [activity] : []),
    },
  };
});
let session: typeof import('../src/host/host-session').hostSession;
let owner: typeof import('../src/host/native-live-activity').requestActivitySession;
let off: (() => void) | undefined;
const target: ActivityTarget = {
  hostId: 'b',
  botSlug: 'same',
  channelId: 'dm-same',
  messageId: 'human-b',
};
beforeEach(() => {
  vi.resetModules();
  secure.clear();
  remotes.clear();
  native.alive = false;
  native.storage = undefined;
  native.prepare = undefined;
  native.register = undefined;
  native.token = undefined;
  native.listeners.clear();
  native.start.mockClear();
  native.end.mockClear();
  native.remote.mockReset();
  native.remote.mockImplementation(async (_host, operation) => {
    if (operation === 'register') await native.register?.();
    if (operation === 'prepare') {
      await native.prepare?.();
      return {
        bundleIdentifier: 'app.deepseekbot.mobile',
        source: 'Computer B',
        progress: { state: 'working', terminal: false, updatedAt: '2026-10-26T00:00:00Z' },
      };
    }
    return { expiresAt: Date.now() + 60_000 };
  });
});
afterEach(async () => {
  off?.();
  off = undefined;
  await owner?.stop();
  for (const host of session?.getState().hosts ?? []) await session.unpair(host.hostId);
});
async function setup(current = 'a') {
  const a = new FakeHost('a');
  const b = new FakeHost('b');
  remotes.set('a.tailnet.ts.net', a);
  remotes.set('b.tailnet.ts.net', b);
  remotes.set('c.tailnet.ts.net', new FakeHost('c'));
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      current,
      hosts: ['a', 'b', 'c'].map((hostId) => ({
        hostId,
        hostName: hostId,
        routes: [`https://${hostId}.tailnet.ts.net`],
        deviceId: `device-${hostId}`,
        credential: a.credential,
      })),
    }),
  );
  session = (await import('../src/host/host-session')).hostSession;
  await vi.waitFor(() =>
    expect(session.getHost('b')?.snapshot.connection.status).toBe('connected'),
  );
  const activity = await import('../src/host/native-live-activity');
  owner = activity.requestActivitySession;
  await owner.ready;
  off = activity.watchRequestActivity();
  return { a, b };
}
it('tracks the exact B request while A is selected, and observes B refusal independently of browsing', async () => {
  const { b } = await setup();
  await owner.start(target);
  expect(session.getState().saved?.hostId).toBe('a');
  expect(native.remote.mock.calls.map(([host, operation]) => [host.hostId, operation])).toEqual([
    ['b', 'prepare'],
    ['b', 'register'],
  ]);
  expect(native.remote).toHaveBeenCalledWith(
    session.getHost('b')?.saved,
    'register',
    expect.objectContaining({
      channelId: 'dm-same',
      messageId: 'human-b',
    }),
  );
  await owner.sync();
  expect(owner.getSnapshot().tracking).toBe(true);
  expect(native.end).not.toHaveBeenCalled();
  b.revoke();
  session.getHost('b')?.client.retryNow();
  await vi.waitFor(() => expect(owner.getSnapshot().tracking).toBe(false));
  expect(native.remote.mock.calls.at(-1)?.slice(0, 2)).toEqual([
    session.getHost('b')?.saved,
    'stop',
  ]);
  expect(native.remote.mock.calls.every(([host]) => host.hostId === 'b')).toBe(true);
  expect(native.end).toHaveBeenCalledOnce();
});

it('ends the original B presentation and server registration when the selected source changes from A to C', async () => {
  await setup();
  await owner.start(target);
  await session.switchTo('c');
  await vi.waitFor(() => expect(owner.getSnapshot().tracking).toBe(false));
  await owner.settled();
  expect(native.end).toHaveBeenCalledOnce();
  expect(native.remote.mock.calls.map(([host, operation]) => [host.hostId, operation])).toEqual([
    ['b', 'prepare'],
    ['b', 'register'],
    ['b', 'stop'],
  ]);
  expect(owner.target('fixture-link')).toMatchObject(target);
});
it('retires only the tracked B registration before removing its pairing while A remains selected', async () => {
  await setup();
  await owner.start(target);
  await session.unpair('b');
  await owner.settled();
  expect(session.getState().saved?.hostId).toBe('a');
  expect(session.getHost('b')).toBeUndefined();
  expect(owner.getSnapshot().tracking).toBe(false);
  expect(native.end).toHaveBeenCalledOnce();
  expect(native.remote.mock.calls.map(([host, operation]) => [host.hostId, operation])).toEqual([
    ['b', 'prepare'],
    ['b', 'register'],
    ['b', 'stop'],
  ]);
});
it.each([false, true])(
  'refuses registration when a newer source selection starts while the native token is pending (return to A: %s)',
  async (returnToA) => {
    await setup();
    let release!: () => void;
    native.token = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const pending = owner.start(target);
    const rejected = expect(pending).rejects.toThrow('activity-source-changed');
    await vi.waitFor(() => expect(release).toBeDefined());
    const selection = session.switchTo('c');
    if (returnToA) await session.switchTo('a');
    release();
    await rejected;
    await selection;
    await owner.settled();
    expect(native.remote.mock.calls.some(([, operation]) => operation === 'register')).toBe(false);
    expect(native.remote.mock.calls.every(([host]) => host.hostId === 'b')).toBe(true);
    expect(native.end).toHaveBeenCalledOnce();
  },
);
it.each([
  { selectedHostId: 'a', selected: 'a', tracking: true },
  { selectedHostId: 'a', selected: 'c', tracking: false },
  { selectedHostId: undefined, selected: 'b', tracking: true },
  { selectedHostId: undefined, selected: 'a', tracking: false },
])(
  'restores an existing display against its saved or legacy source selection: %j',
  async ({ selectedHostId, selected, tracking }) => {
    native.alive = true;
    native.storage = {
      target: {
        ...target,
        selectedHostId,
        clientActivityId: 'native',
        linkId: 'fixture-link',
        expiresAt: Date.now() + 60_000,
      },
      tracking: true,
      pendingStop: false,
    };
    await setup(selected);
    await owner.sync();
    expect(owner.getSnapshot().tracking).toBe(tracking);
    expect(native.remote.mock.calls.map(([host, operation]) => [host.hostId, operation])).toEqual([
      ['b', tracking ? 'register' : 'stop'],
    ]);
    expect(native.start).not.toHaveBeenCalled();
  },
);

it.each([
  { change: 'selection', rejected: false },
  { change: 'refusal', rejected: false },
  { change: 'selection', rejected: true },
  { change: 'refusal', rejected: true },
])(
  'cleans a restored display when its source changes during registration: %j',
  async ({ change, rejected }) => {
    native.alive = true;
    native.storage = {
      target: {
        ...target,
        selectedHostId: 'a',
        clientActivityId: 'native',
        linkId: 'fixture-link',
        expiresAt: Date.now() + 60_000,
      },
      tracking: true,
      pendingStop: false,
    };
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    native.register = async () => {
      entered();
      await gate;
      if (rejected) throw new Error('temporary-provider-failure');
    };
    const { b } = await setup();
    await pending;
    try {
      if (change === 'selection') await session.switchTo('c');
      else {
        b.revoke();
        session.getHost('b')?.client.retryNow();
        await vi.waitFor(() =>
          expect(session.getHost('b')?.snapshot.connection.status).toBe('refused'),
        );
      }
    } finally {
      release();
    }
    await owner.settled();
    await vi.waitFor(() => expect(owner.getSnapshot().tracking).toBe(false));
    expect(owner.getSnapshot().pendingStop).toBe(false);
    expect(native.end).toHaveBeenCalledOnce();
    expect(native.start).not.toHaveBeenCalled();
    expect(native.remote.mock.calls.map(([host, operation]) => [host.hostId, operation])).toEqual([
      ['b', 'register'],
      ['b', 'stop'],
    ]);
  },
);

it.each(['same-selected-host', 'unrelated-removal'])(
  'preserves B tracking when the selected source is unchanged: %s',
  async (change) => {
    await setup();
    await owner.start(target);
    if (change === 'same-selected-host') await session.switchTo('a');
    else await session.unpair('c');
    await owner.sync();
    expect(session.getState().saved?.hostId).toBe('a');
    expect(owner.getSnapshot().tracking).toBe(true);
    expect(native.end).not.toHaveBeenCalled();
    expect(native.remote.mock.calls.map(([host, operation]) => [host.hostId, operation])).toEqual([
      ['b', 'prepare'],
      ['b', 'register'],
    ]);
  },
);

it('ends a restored B display when the selected A pairing identity is replaced without navigation', async () => {
  native.alive = true;
  native.storage = {
    target: {
      ...target,
      selectedHostId: 'a',
      clientActivityId: 'native',
      linkId: 'fixture-link',
      expiresAt: Date.now() + 60_000,
    },
    tracking: true,
    pendingStop: false,
  };
  await setup();
  await owner.sync();
  const selected = session.getState().saved;
  if (!selected) throw new Error('missing-selected-host');
  await session.replaceApprovedPairing(
    { ...selected, deviceId: 'replacement-device-a', credential: 'replacement-credential-a' },
    selected.credential,
  );
  await owner.sync();
  expect(session.getState().saved?.hostId).toBe('a');
  expect(owner.getSnapshot().tracking).toBe(false);
  expect(native.end).toHaveBeenCalledOnce();
  expect(native.remote.mock.calls.map(([host, operation]) => [host.hostId, operation])).toEqual([
    ['b', 'register'],
    ['b', 'stop'],
  ]);
});
