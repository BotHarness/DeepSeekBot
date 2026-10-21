import { describe, expect, it } from 'vitest';

import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';
import { pairingLink } from '../../core/src/devices/http.js';
import {
  ALL_COMPUTERS,
  COMPUTER_TAB_STORAGE_KEY,
  COMPUTERS_STORAGE_KEY,
  conversationKey,
  createComputerSources,
  type ComputerStorage,
} from '../src/client/computer-sources.js';

function memoryStorage(initial: Record<string, string> = {}): ComputerStorage & {
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

function fakeCarrier() {
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

const link = (hostId = 'host-b') =>
  pairingLink({
    v: 1,
    host: { id: hostId, name: 'Studio' },
    offer: 'offer-1',
    routes: ['http://127.0.0.1:47001'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

describe('computer sources', () => {
  it('pairs another computer with this browser and remembers it in browser storage', async () => {
    const storage = memoryStorage();
    const { carrier, calls } = fakeCarrier();
    const sources = createComputerSources({ storage, carrier });
    expect(sources.getSnapshot()).toEqual({ computers: [], tab: ALL_COMPUTERS });

    const result = await sources.pair(link(), 'Browser on Laptop', 'host-a');

    expect(result).toMatchObject({ ok: true, host: { hostId: 'host-b', hostName: 'Studio' } });
    expect(calls[0]).toEqual({
      url: 'http://127.0.0.1:47001/botharness-device/pair',
      body: { offer: 'offer-1', name: 'Browser on Laptop' },
    });
    expect(sources.getSnapshot().tab).toBe('host-b');
    expect(sources.getSnapshot().computers.map((computer) => computer.host.hostId)).toEqual([
      'host-b',
    ]);
    expect(JSON.parse(storage.values.get(COMPUTERS_STORAGE_KEY)!)).toEqual([
      {
        hostId: 'host-b',
        hostName: 'Studio',
        routes: ['http://127.0.0.1:47001'],
        deviceId: 'device-1',
        credential: 'device-1.secret',
      },
    ]);
    expect(storage.values.get(COMPUTER_TAB_STORAGE_KEY)).toBe('host-b');

    const reloaded = createComputerSources({ storage, carrier });
    expect(reloaded.getSnapshot().tab).toBe('host-b');
    expect(reloaded.getSnapshot().computers[0]?.host.credential).toBe('device-1.secret');
  });

  it('refuses this computer’s own link, a second pairing and a broken link', async () => {
    const { carrier, calls } = fakeCarrier();
    const sources = createComputerSources({ storage: memoryStorage(), carrier });
    expect(await sources.pair(link('host-a'), 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'this-computer',
    });
    expect(await sources.pair('https://example.com', 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'link-invalid',
    });
    await sources.pair(link(), 'Browser', 'host-a');
    expect(await sources.pair(link(), 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'already-paired',
    });
    expect(calls.filter((call) => call.url.endsWith('/pair'))).toHaveLength(1);
  });

  it('keys conversations by computer so the same slug on two computers never shares state', async () => {
    const { carrier } = fakeCarrier();
    const sources = createComputerSources({ storage: memoryStorage(), carrier });
    await sources.pair(link(), 'Browser', 'host-a');
    const here = { hostId: 'host-b', title: 'Ada', botSlug: 'ada' };
    expect(conversationKey(here)).not.toBe(conversationKey({ ...here, hostId: 'host-c' }));
    expect(conversationKey(here)).not.toBe(
      conversationKey({ hostId: 'host-b', title: 'Ada', channelId: 'ada' }),
    );
    expect(sources.conversation(here)).toBe(sources.conversation({ ...here }));
    expect(sources.conversation({ ...here, hostId: 'host-c' })).toBeUndefined();
  });

  it('removes a computer, revokes this browser there and forgets its open chat', async () => {
    const storage = memoryStorage();
    const { carrier, calls } = fakeCarrier();
    const sources = createComputerSources({ storage, carrier });
    await sources.pair(link(), 'Browser', 'host-a');
    sources.open({ hostId: 'host-b', title: 'Ada', botSlug: 'ada' });
    expect(sources.getSnapshot().open?.hostId).toBe('host-b');

    await sources.remove('host-b');

    expect(sources.getSnapshot()).toEqual({ computers: [], tab: ALL_COMPUTERS });
    expect(storage.values.has(COMPUTERS_STORAGE_KEY)).toBe(false);
    expect(calls.at(-1)).toEqual({
      url: 'http://127.0.0.1:47001/botharness-device/unpair',
      body: {},
      headers: { authorization: 'Device device-1.secret' },
    });
  });

  it('falls back to All when the remembered tab names a computer that is gone', () => {
    const { carrier } = fakeCarrier();
    const sources = createComputerSources({
      storage: memoryStorage({ [COMPUTER_TAB_STORAGE_KEY]: 'host-z' }),
      carrier,
    });
    expect(sources.getSnapshot().tab).toBe(ALL_COMPUTERS);
    sources.select('local');
    expect(sources.getSnapshot().tab).toBe('local');
  });
});
