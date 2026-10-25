import { expect, it, vi } from 'vitest';

const device = vi.hoisted(() => {
  const host = {
    hostId: 'a',
    hostName: 'Computer',
    deviceId: 'phone',
    credential: 'fixture',
    routes: [],
  };
  const listeners = new Set<() => void>();
  const clientListeners = new Set<() => void>();
  const removals = new Set<unknown>();
  let status = 'connected';
  return {
    host,
    listeners,
    clientListeners,
    removals,
    client: {
      getSnapshot: () => ({ connection: { status } }),
      subscribe: (fn: () => void) => {
        clientListeners.add(fn);
        return () => {
          clientListeners.delete(fn);
        };
      },
    },
    refuse: () => {
      status = 'refused';
      for (const fn of clientListeners) fn();
    },
    end: vi.fn(async () => {}),
    remote: vi.fn(async () => ({ expiresAt: Date.now() + 60000 })),
    tokenListeners: new Set<unknown>(),
    appStateRemoved: vi.fn(),
  };
});
vi.mock('expo', () => ({ requireOptionalNativeModule: () => ({}) }));
vi.mock('expo-application', () => ({ applicationId: 'app.deepseekbot.mobile' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'fixture-id' }));
vi.mock('expo-file-system', () => ({
  Paths: { document: '/' },
  File: class {
    exists = true;
    async text() {
      return JSON.stringify({
        target: {
          hostId: 'a',
          channelId: 'dm',
          messageId: 'request',
          botSlug: 'ada',
          clientActivityId: 'native',
          linkId: 'link',
          expiresAt: Date.now() + 60000,
        },
        tracking: true,
        pendingStop: false,
      });
    }
    writeSync() {}
  },
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove: device.appStateRemoved }) },
}));
vi.mock('../src/ui/strings', () => ({ locale: 'en' }));
vi.mock('../src/host/native-carrier', () => ({ nativeCarrier: () => ({}) }));
vi.mock('../src/host/host-session', () => ({
  hostSession: {
    getState: () => ({ saved: device.host, hosts: [device.host], client: device.client }),
    subscribe: (fn: () => void) => {
      device.listeners.add(fn);
      return () => {
        device.listeners.delete(fn);
      };
    },
  },
  onHostRemoval: (fn: unknown) => {
    device.removals.add(fn);
    return () => {
      device.removals.delete(fn);
    };
  },
}));
vi.mock('../src/host/live-activity', async (original) => ({
  ...(await original<typeof import('../src/host/live-activity')>()),
  createHostActivity: () => ({ request: device.remote }),
}));
vi.mock('../src/ui/widgets/request-activity', () => ({
  requestActivity: {
    getInstances: () => [
      {
        getId: () => 'native',
        getPushToken: async () => 'a'.repeat(64),
        addPushTokenListener: (fn: unknown) => {
          device.tokenListeners.add(fn);
          return { remove: () => device.tokenListeners.delete(fn) };
        },
        end: device.end,
      },
    ],
  },
}));
import { requestActivitySession, watchRequestActivity } from '../src/host/native-live-activity';

it('stops an existing activity when only the current HostClient publishes refusal, and cleans its watchers', async () => {
  const stop = watchRequestActivity();
  await vi.waitFor(() =>
    expect(device.remote).toHaveBeenCalledWith(device.host, 'register', expect.anything()),
  );
  device.refuse();
  await vi.waitFor(() => expect(device.end).toHaveBeenCalled());
  await requestActivitySession.settled();
  expect(requestActivitySession.getSnapshot().tracking).toBe(false);
  expect(device.remote).toHaveBeenCalledWith(device.host, 'stop', { clientActivityId: 'native' });
  stop();
  expect(
    device.listeners.size +
      device.clientListeners.size +
      device.removals.size +
      device.tokenListeners.size,
  ).toBe(0);
  expect(device.appStateRemoved).toHaveBeenCalledOnce();
});
