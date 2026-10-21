import { afterEach, expect, it, vi } from 'vitest';
import { createAppearanceControl } from '../../core/src/appearance/control.js';
import { Appearance } from '../src/client/appearance.js';
import { mountAppearanceControl } from '../src/client/appearance-control.js';
import { createRemoteNotifications } from '../src/client/remote-notifications.js';

it.each(['normal', 'delayed-delivery'] as const)(
  'recovers the same relay after cancellation and expiry with %s transport',
  async (transport) => {
    vi.useFakeTimers();
    const host = createAppearanceControl();
    const data = new Map<string, string>();
    const writes = vi.fn((key: string, value: string) => data.set(key, value));
    const finishes: (() => void)[] = [];
    const prepareEnable = vi.fn(() => new Promise<void>((resolve) => finishes.push(resolve)));
    const notices = createRemoteNotifications({
      storage: { getItem: (key) => data.get(key) ?? null, setItem: writes },
      api: { permission: () => 'granted', requestPermission: async () => 'granted', show: vi.fn() },
      open() {},
      privateBody: () => 'private',
      prepareEnable,
    });
    shared.set('sources', {
      notifications: notices,
      getSnapshot: () => ({ hosts: [{ host: { hostId: 'remote' } }] }),
    });
    let holdDelivery = false;
    let deliver: (() => void) | undefined;
    let polls = 0;
    let registrations = 0;
    vi.stubGlobal('location', { protocol: 'http:' });
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const { action } = JSON.parse(String(init?.body));
      if (action === 'register') registrations++;
      const response = host.fetch(
        new Request('http://localhost/api/botharness/appearance-control', init),
      );
      if (action === 'poll') polls++;
      const result = await response;
      if (action === 'poll' && holdDelivery) {
        holdDelivery = false;
        await new Promise<void>((resolve) => {
          deliver = resolve;
        });
      }
      return result;
    });
    let release = mountAppearanceControl(new Appearance(undefined, () => 'light'));
    const targets = async () =>
      (await (await host.fetch(new Request('http://localhost'))).json()).clients;
    const flush = () => vi.advanceTimersByTimeAsync(0);
    const request = (clientId: string, enable = false) =>
      host.fetch(
        new Request('http://localhost/api/botharness/appearance-control', {
          method: 'POST',
          body: JSON.stringify({
            action: 'request',
            clientId,
            notifications: {
              hostId: 'remote',
              ...(enable
                ? { patch: { enabled: true, preferences: notices.choice('remote').preferences } }
                : {}),
            },
            ...(enable ? { expectedRevision: JSON.stringify(notices.choice('remote')) } : {}),
          }),
        }),
      );
    try {
      await flush();
      const [{ id }] = await targets();
      for (const [index, reason] of ['cancel', 'deadline', 'cancel', 'deadline'].entries()) {
        const before = polls;
        const response = request(id, true);
        await flush();
        expect(prepareEnable).toHaveBeenCalledTimes(index + 1);
        if (reason === 'cancel') notices.cancel('remote');
        else await vi.advanceTimersByTimeAsync(8000);
        await flush();
        expect(await (await response).json()).toMatchObject({
          error: {
            code:
              reason === 'cancel'
                ? 'notification-activation-cancelled'
                : 'appearance-client-timeout',
          },
        });
        expect(writes).not.toHaveBeenCalled();
        expect(polls).toBe(before + 1);
        const read = request(id);
        await flush();
        expect(await (await read).json()).toMatchObject({ enabled: false });
        finishes.at(-1)!();
        await flush();
        expect(writes).not.toHaveBeenCalled();
      }
      if (transport === 'delayed-delivery') {
        holdDelivery = true;
        const calls = prepareEnable.mock.calls.length;
        const response = request(id, true);
        await flush();
        expect(deliver).toBeTypeOf('function');
        await vi.advanceTimersByTimeAsync(8000);
        expect(await (await response).json()).toMatchObject({
          error: { code: 'appearance-client-timeout' },
        });
        expect(await (await request(id)).json()).toMatchObject({
          error: { code: 'appearance-client-unavailable' },
        });
        expect(prepareEnable).toHaveBeenCalledTimes(calls);
        await vi.advanceTimersByTimeAsync(1000);
        deliver!();
        await flush();
        const read = request(id);
        await flush();
        expect(await (await read).json()).toMatchObject({ enabled: false });
      }
      expect(registrations).toBe(1);
      expect(await targets()).toEqual([{ id, platform: 'web' }]);
      expect(writes).not.toHaveBeenCalled();
      const pending = request(id, true);
      await flush();
      release();
      await flush();
      expect(await (await pending).json()).toMatchObject({
        error: { code: 'appearance-client-stale' },
      });
      expect(await targets()).toEqual([]);
      finishes.at(-1)!();
      await flush();
      expect(writes).not.toHaveBeenCalled();
      release = mountAppearanceControl(new Appearance(undefined, () => 'light'));
      await flush();
      const [{ id: next }] = await targets();
      expect(next).not.toBe(id);
      const accepted = request(next, true);
      await flush();
      finishes.at(-1)!();
      await flush();
      expect(await (await accepted).json()).toMatchObject({ enabled: true });
      expect(writes).toHaveBeenCalledTimes(1);
    } finally {
      deliver?.();
      release();
      notices.stop();
      host.dispose();
    }
  },
);

const shared = vi.hoisted(() => new Map<string, unknown>());
vi.mock('../src/client/remote-hosts.js', () => ({ remoteHosts: () => shared.get('sources') }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  shared.clear();
});

it.each(['deadline', 'unmount', 'on-time'] as const)(
  'enforces the relay %s boundary on browser preferences and storage',
  async (reason) => {
    vi.useFakeTimers();
    const host = createAppearanceControl();
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
    let finish!: () => void;
    const prepareEnable = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const notices = createRemoteNotifications({
      storage,
      api: { permission: () => 'granted', requestPermission: async () => 'granted', show: vi.fn() },
      open() {},
      privateBody: () => 'private',
      prepareEnable,
    });
    shared.set('sources', {
      notifications: notices,
      getSnapshot: () => ({ hosts: [{ host: { hostId: 'remote' } }] }),
    });
    const actions: string[] = [];
    vi.stubGlobal('location', { protocol: 'http:' });
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      actions.push(JSON.parse(String(init?.body)).action);
      return host.fetch(new Request('http://localhost/api/botharness/appearance-control', init));
    });
    const release = mountAppearanceControl(new Appearance(undefined, () => 'light'));
    try {
      await vi.waitFor(() => expect(actions).toContain('poll'));
      const { clients } = await (await host.fetch(new Request('http://localhost'))).json();
      const before = notices.choice('remote');
      const response = host.fetch(
        new Request('http://localhost/api/botharness/appearance-control', {
          method: 'POST',
          body: JSON.stringify({
            action: 'request',
            clientId: clients[0].id,
            expectedRevision: JSON.stringify(before),
            notifications: {
              hostId: 'remote',
              patch: { enabled: true, preferences: before.preferences },
            },
          }),
        }),
      );
      await vi.waitFor(() => expect(prepareEnable).toHaveBeenCalledTimes(1));
      if (reason === 'on-time') {
        await vi.advanceTimersByTimeAsync(7000);
        finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(await (await response).json()).toMatchObject({ enabled: true });
        expect(notices.choice('remote').enabled).toBe(true);
        expect(
          JSON.parse(data.get('botharness.remoteNotifications.v1') ?? '{}').remote.enabled,
        ).toBe(true);
        expect(actions.filter((action) => action === 'reply')).toEqual(['reply']);
        return;
      }
      if (reason === 'unmount') release();
      await vi.advanceTimersByTimeAsync(8000);
      expect(await (await response).json()).toMatchObject({
        error: {
          code: reason === 'deadline' ? 'appearance-client-timeout' : 'appearance-client-stale',
        },
      });
      await vi.advanceTimersByTimeAsync(1000);
      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(notices.choice('remote')).toEqual(before);
      expect(data.size).toBe(0);
      expect(actions.filter((action) => action === 'reply')).toEqual([]);
    } finally {
      release();
      notices.stop();
      host.dispose();
    }
  },
);
