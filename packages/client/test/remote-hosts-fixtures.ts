import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { FakeHost } from '../../host-client/test/fake-host.js';
import { pairingLink } from '../../core/src/devices/http.js';
import { REMOTE_HOSTS_STORAGE_KEY, type HostStorage } from '../src/client/remote-hosts.js';

export function memoryStorage(initial: Record<string, string> = {}): HostStorage & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

export function fakeCarrier() {
  const calls: { url: string; body?: unknown; headers?: Record<string, string> }[] = [];
  const carrier: HostCarrier = {
    async request(url, init) {
      calls.push({
        url,
        ...(typeof init.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}),
        ...(init.headers === undefined ? {} : { headers: init.headers }),
      });
      if (url.endsWith('/botharness-device/pair'))
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              deviceId: 'device-1',
              credential: 'device-1.secret',
              host: { id: 'host-b', name: 'Studio' },
            }),
        };
      if (url.endsWith('/botharness-device/unpair'))
        return { status: 200, text: async () => '{"revoked":true}' };
      return { status: 503, text: async () => '{}' };
    },
    openSocket(_url, events) {
      queueMicrotask(() => events.closed('offline'));
      return { send: () => {}, close: () => {} };
    },
  };
  return { carrier, calls };
}

export const link = (hostId = 'host-b') =>
  pairingLink({
    v: 1,
    host: { id: hostId, name: 'Studio' },
    offer: 'offer-1',
    routes: ['http://127.0.0.1:47001'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

export const releases: Array<() => void> = [];

export function liveHost() {
  const host = new FakeHost();
  host.methods.set('humanAttention', (args) =>
    args.notifications ? { items: [], notificationVersion: 1 } : { items: [], queryVersion: 1 },
  );
  host.methods.set('channelUnreadCounts', () => ({
    channels: [{ channelId: 'dm-ada', unreadCount: 2 }],
  }));
  host.methods.set('list', () => ({
    bots: [
      {
        slug: 'ada',
        displayName: 'Ada',
        aggregateState: 'idle',
        avatar: '/api/botharness/avatar/ada',
      },
    ],
  }));
  const saved = [
    {
      hostId: host.hostId,
      hostName: 'Studio',
      routes: ['http://127.0.0.1:47001'],
      deviceId: 'device-1',
      credential: host.credential,
    },
  ];
  const storage = memoryStorage({ [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify(saved) });
  return { host, storage, saved };
}
