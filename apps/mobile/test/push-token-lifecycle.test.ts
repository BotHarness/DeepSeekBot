import { afterEach, expect, it, vi } from 'vitest';

import { createPushSession, type NotificationsPort } from '../src/host/push-session';
import type { HostPush, PushSettings } from '../src/host/push';
import type { SavedHost } from '../src/host/hosts';

const host: SavedHost = {
  hostId: 'host',
  hostName: 'Host',
  deviceId: 'device',
  credential: 'credential',
  routes: [],
};
const settings: PushSettings = {
  registered: true,
  enabled: true,
  preferences: { approval: true, question: true, 'private-input': true, reply: true },
  quietChannelIds: [],
};
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

function fixture(token: () => Promise<string> = async () => 'A') {
  let listener: (resolveToken: () => Promise<string>, nativeToken?: string) => void = () => {};
  const off = vi.fn();
  const notifications: NotificationsPort = {
    permission: async () => 'granted',
    request: async () => 'granted',
    token: vi.fn(token),
    onTokenChanged(fn) {
      listener = fn;
      return off;
    },
    setBadge: async () => {},
    presented: async () => [],
    dismiss: async () => {},
  };
  const register = vi.fn(async (_host: SavedHost, _registration: { token: string }) => settings);
  const hostPush: HostPush = {
    register,
    settings: vi.fn(),
    setPreferences: vi.fn(),
    setEnabled: vi.fn(),
    setQuiet: vi.fn(),
    test: vi.fn(),
    unregister: vi.fn(),
  };
  const session = createPushSession({
    notifications,
    hostPush,
    platform: 'android',
    locale: 'en',
    tokenTimeoutMs: 20,
  });
  return {
    session,
    register,
    notifications,
    off,
    change: (resolveToken: () => Promise<string>, nativeToken?: string) =>
      listener(resolveToken, nativeToken),
  };
}

it('uses the event resolver without a fresh native read', async () => {
  const f = fixture();
  await f.session.sync([host]);
  f.change(async () => 'B');
  await flush();
  expect(f.notifications.token).toHaveBeenCalledTimes(1);
  expect(f.register.mock.calls.map(([, r]) => r.token)).toEqual(['A', 'B']);
  f.session.stop();
});

it('keeps a rotation during checking and ignores the older late token', async () => {
  const a = deferred<string>();
  const f = fixture(() => a.promise);
  const initial = f.session.sync([host]);
  await flush();
  f.change(async () => 'B');
  await flush();
  a.resolve('A');
  await initial;
  expect(f.register.mock.calls.map(([, r]) => r.token)).toEqual(['B']);
  expect(f.session.getSnapshot()).toEqual({ status: 'on', failed: [] });
  f.session.stop();
});

it('orders already dispatched Host registrations so B cannot be overwritten by A', async () => {
  const a = deferred<void>();
  const f = fixture();
  let remote = '';
  f.register.mockImplementation(async (_host, registration) => {
    if (registration.token === 'A') await a.promise;
    remote = registration.token;
    return settings;
  });
  const initial = f.session.sync([host]);
  await flush();
  f.change(async () => 'B');
  await flush();
  a.resolve();
  await initial;
  await flush();
  expect(remote).toBe('B');
  f.session.stop();
});

it('keeps event exchange errors inside the timeout gate and can retry the same event', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.session.sync([host]);
  const late = deferred<string>();
  f.change(() => late.promise);
  await vi.advanceTimersByTimeAsync(21);
  expect(f.session.getSnapshot()).toEqual({ status: 'unavailable', reason: 'push-token-timeout' });
  f.change(async () => 'B');
  await flush();
  late.resolve('old');
  await flush();
  expect(f.register.mock.calls.map(([, r]) => r.token)).toEqual(['A', 'B']);
  expect(f.session.getSnapshot()).toEqual({ status: 'on', failed: [] });
  f.session.stop();
});

it('does not register a late token or process queued callbacks after stop', async () => {
  const late = deferred<string>();
  const f = fixture(() => late.promise);
  const initial = f.session.sync([host]);
  await flush();
  f.session.stop();
  late.resolve('A');
  f.change(async () => 'B');
  await initial;
  await flush();
  expect(f.off).toHaveBeenCalledOnce();
  expect(f.register).not.toHaveBeenCalled();
  expect(f.session.getSnapshot()).toEqual({ status: 'checking' });
});

it('does not let an older rejected exchange replace a newer successful rotation', async () => {
  const f = fixture();
  await f.session.sync([host]);
  const b = deferred<string>();
  f.change(() => b.promise);
  await flush();
  f.change(async () => 'C');
  await flush();
  b.reject(new Error('old-exchange-failed'));
  await flush();
  expect(f.register.mock.calls.map(([, r]) => r.token)).toEqual(['A', 'C']);
  expect(f.session.getSnapshot()).toEqual({ status: 'on', failed: [] });
  f.session.stop();
});

it('reports an event SDK error and retries the same resolver after failure', async () => {
  const f = fixture();
  await f.session.sync([host]);
  const exchange = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error('sdk-exchange-failed'))
    .mockResolvedValue('B');
  f.change(exchange);
  await flush();
  expect(f.session.getSnapshot()).toEqual({ status: 'unavailable', reason: 'sdk-exchange-failed' });
  f.change(exchange);
  await flush();
  expect(f.register.mock.calls.map(([, r]) => r.token)).toEqual(['A', 'B']);
  f.session.stop();
});

it('does not revive registration after permission was denied during an exchange', async () => {
  const a = deferred<string>();
  const f = fixture(() => a.promise);
  const initial = f.session.sync([host]);
  await flush();
  f.notifications.permission = async () => 'denied';
  await f.session.sync([host]);
  a.resolve('A');
  await initial;
  f.change(async () => 'B');
  await flush();
  expect(f.register).not.toHaveBeenCalled();
  expect(f.session.getSnapshot()).toEqual({ status: 'denied' });
  f.session.stop();
});

it.each(['event', 'sync'] as const)(
  'keeps all Host coverage when retry overlaps %s rotation',
  async (source) => {
    const f = fixture();
    const other = { ...host, hostId: 'other' };
    const remote = new Map<string, string>();
    f.register.mockImplementation(async (target, registration) => {
      if (target.hostId === other.hostId && registration.token === 'A') throw new Error('offline');
      remote.set(target.hostId, registration.token);
      return settings;
    });
    await f.session.sync([host, other]);
    expect(f.session.getSnapshot()).toEqual({ status: 'on', failed: ['other'] });
    const rotation = deferred<string>();
    let pending: Promise<void> | undefined;
    if (source === 'event') f.change(() => rotation.promise);
    else {
      f.notifications.token = () => rotation.promise;
      pending = f.session.sync([host, other]);
    }
    await flush();
    f.notifications.token = async () => 'B';
    await f.session.retryFailed();
    rotation.resolve('B');
    await pending;
    await flush();
    expect([...remote.values()]).toEqual(['B', 'B']);
    expect(f.session.getSnapshot()).toEqual({ status: 'on', failed: [] });
    f.session.stop();
  },
);

it('supersedes a pending fetch when an identified native token actually rotates', async () => {
  const a = deferred<string>();
  const f = fixture(() => a.promise);
  const initial = f.session.sync([host]);
  await flush();
  f.change(() => a.promise, 'native-A');
  f.change(async () => 'B', 'native-B');
  await flush();
  expect(f.register.mock.calls.map(([, r]) => r.token)).toEqual(['B']);
  a.resolve('A');
  await initial;
  expect(f.register.mock.calls.map(([, r]) => r.token)).toEqual(['B']);
  f.session.stop();
});
