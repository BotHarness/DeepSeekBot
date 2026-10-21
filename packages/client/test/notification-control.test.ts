import { afterEach, expect, it, vi } from 'vitest';
import { createAppearanceControl } from '../../core/src/appearance/control.js';
import { Appearance } from '../src/client/appearance.js';
import { mountAppearanceControl } from '../src/client/appearance-control.js';
import { createRemoteNotifications } from '../src/client/remote-notifications.js';

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
