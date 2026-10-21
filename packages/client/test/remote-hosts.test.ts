import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { pairingLink } from '../../core/src/devices/http.js';
import {
  ALL_HOSTS,
  HOST_TAB_STORAGE_KEY,
  REMOTE_HOSTS_STORAGE_KEY,
  conversationKey,
  createRemoteHosts,
  type HostStorage,
} from '../src/client/remote-hosts.js';

function memoryStorage(initial: Record<string, string> = {}): HostStorage & {
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

describe('remote hosts', () => {
  it('pairs another remote with this browser and remembers it in browser storage', async () => {
    const storage = memoryStorage();
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ storage, carrier });
    expect(sources.getSnapshot()).toEqual({ hosts: [], avatars: new Map(), tab: ALL_HOSTS });

    const result = await sources.pair(link(), 'Browser on Laptop', 'host-a');

    expect(result).toMatchObject({ ok: true, host: { hostId: 'host-b', hostName: 'Studio' } });
    expect(calls[0]).toEqual({
      url: 'http://127.0.0.1:47001/botharness-device/pair',
      body: { offer: 'offer-1', name: 'Browser on Laptop' },
    });
    expect(sources.getSnapshot().tab).toBe('host-b');
    expect(sources.getSnapshot().hosts.map((remote) => remote.host.hostId)).toEqual(['host-b']);
    expect(JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)!)).toEqual([
      {
        hostId: 'host-b',
        hostName: 'Studio',
        routes: ['http://127.0.0.1:47001'],
        deviceId: 'device-1',
        credential: 'device-1.secret',
      },
    ]);
    expect(storage.values.get(HOST_TAB_STORAGE_KEY)).toBe('host-b');

    const reloaded = createRemoteHosts({ storage, carrier });
    expect(reloaded.getSnapshot().tab).toBe('host-b');
    expect(reloaded.getSnapshot().hosts[0]?.host.credential).toBe('device-1.secret');
  });

  it('refuses this remote’s own link, a second pairing and a broken link', async () => {
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ storage: memoryStorage(), carrier });
    expect(await sources.pair(link('host-a'), 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'this-host',
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

  it('keys conversations by remote so the same slug on two hosts never shares state', async () => {
    const { carrier } = fakeCarrier();
    const sources = createRemoteHosts({ storage: memoryStorage(), carrier });
    await sources.pair(link(), 'Browser', 'host-a');
    const here = { hostId: 'host-b', title: 'Ada', botSlug: 'ada' };
    expect(conversationKey(here)).not.toBe(conversationKey({ ...here, hostId: 'host-c' }));
    expect(conversationKey(here)).not.toBe(
      conversationKey({ hostId: 'host-b', title: 'Ada', channelId: 'ada' }),
    );
    expect(sources.conversation(here)).toBe(sources.conversation({ ...here }));
    expect(sources.conversation({ ...here, hostId: 'host-c' })).toBeUndefined();
  });

  it('removes a remote, revokes this browser there and forgets its open chat', async () => {
    const storage = memoryStorage();
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ storage, carrier });
    await sources.pair(link(), 'Browser', 'host-a');
    sources.open({ hostId: 'host-b', title: 'Ada', botSlug: 'ada' });
    expect(sources.getSnapshot().open?.hostId).toBe('host-b');

    await sources.remove('host-b');

    expect(sources.getSnapshot()).toEqual({ hosts: [], avatars: new Map(), tab: ALL_HOSTS });
    expect(storage.values.has(REMOTE_HOSTS_STORAGE_KEY)).toBe(false);
    expect(calls.at(-1)).toEqual({
      url: 'http://127.0.0.1:47001/botharness-device/unpair',
      body: {},
      headers: { authorization: 'Device device-1.secret' },
    });
  });

  it('falls back to All when the remembered tab names a remote that is gone', () => {
    const { carrier } = fakeCarrier();
    const sources = createRemoteHosts({
      storage: memoryStorage({ [HOST_TAB_STORAGE_KEY]: 'host-z' }),
      carrier,
    });
    expect(sources.getSnapshot().tab).toBe(ALL_HOSTS);
    sources.select('local');
    expect(sources.getSnapshot().tab).toBe('local');
  });
});

const releases: Array<() => void> = [];
afterEach(() => {
  for (const release of releases.splice(0)) release();
});

function liveHost() {
  const host = new FakeHost();
  host.methods.set('humanAttention', () => ({ items: [], queryVersion: 1 }));
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

describe('Host Feed lifecycle', () => {
  it('retains legacy pairings when browser storage refuses the migration write', () => {
    const { host, saved } = liveHost();
    const storage = memoryStorage({
      'botharness.computers.v1': JSON.stringify(saved),
      'botharness.computers.tab.v1': host.hostId,
    });
    storage.setItem = () => {
      throw new Error('quota');
    };
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    expect(sources.getSnapshot().hosts[0]?.host).toEqual(saved[0]);
    expect(sources.getSnapshot().tab).toBe(host.hostId);
    expect(storage.values.has('botharness.computers.v1')).toBe(true);
  });

  it('migrates the existing pairing and selected tab once without resurrecting a removed Host', async () => {
    const { host, saved } = liveHost();
    const storage = memoryStorage({
      'botharness.computers.v1': JSON.stringify(saved),
      'botharness.computers.tab.v1': host.hostId,
    });
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    expect(sources.getSnapshot().tab).toBe(host.hostId);
    expect(sources.getSnapshot().hosts[0]?.host).toEqual(saved[0]);
    expect(storage.values.has('botharness.computers.v1')).toBe(false);
    expect(storage.values.has('botharness.computers.tab.v1')).toBe(false);
    await sources.remove(host.hostId);
    expect(createRemoteHosts({ carrier: host.carrier, storage }).getSnapshot().hosts).toEqual([]);
  });

  it('shares one activity Inbox, refreshes on live frames, stops with the last reader and restarts', async () => {
    const { host, storage } = liveHost();
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    expect(sources.getSnapshot().hosts[0]?.inbox).toEqual({ status: 'idle' });
    expect(host.requests).toEqual([]);
    const first = sources.subscribe(() => {});
    const second = sources.subscribe(() => {});
    releases.push(first, second);
    await vi.waitFor(() =>
      expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({
        status: 'ready',
        unread: { 'dm-ada': 2 },
      }),
    );
    expect(
      host.calls.filter(({ method }) => method === 'humanAttention').map(({ args }) => args),
    ).toEqual([
      { category: 'action', limit: 100, sort: 'newest', queryVersion: 1 },
      { category: 'replies', limit: 30, sort: 'mentions-first', queryVersion: 1 },
      { category: 'unread', limit: 30, queryVersion: 1 },
    ]);
    first();
    host.methods.set('channelUnreadCounts', () => ({
      channels: [{ channelId: 'dm-ada', unreadCount: 4 }],
    }));
    host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
    await vi.waitFor(() =>
      expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({ unread: { 'dm-ada': 4 } }),
    );
    second();
    expect(sources.getSnapshot().hosts[0]?.snapshot.connection.status).toBe('stopped');
    const reads = host.calls.length;
    host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
    await Promise.resolve();
    expect(host.calls).toHaveLength(reads);
    expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({ unread: { 'dm-ada': 4 } });
    host.methods.set('channelUnreadCounts', () => ({ channels: [] }));
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() =>
      expect(sources.getSnapshot().hosts[0]?.inbox).toMatchObject({ status: 'ready', unread: {} }),
    );
    await sources.remove(host.hostId);
    const removedReads = host.calls.length;
    host.push('botharness/followActivity', { type: 'changed', snapshot: { bots: [] } });
    await Promise.resolve();
    expect(sources.getSnapshot().hosts).toEqual([]);
    expect(host.calls).toHaveLength(removedReads);
  });

  it('loads avatars once with device headers, publishes immutable snapshots and releases on removal', async () => {
    const { host, storage } = liveHost();
    const loadImage = vi.fn(async () => 'blob:ada');
    const releaseImage = vi.fn();
    const sources = createRemoteHosts({ carrier: host.carrier, storage, loadImage, releaseImage });
    const before = sources.getSnapshot().avatars;
    releases.push(sources.subscribe(() => {}));
    const url = 'http://127.0.0.1:47001/botharness-device/api/botharness/avatar/ada';
    await vi.waitFor(() => expect(sources.getSnapshot().avatars.get(url)).toBe('blob:ada'));
    expect(before.size).toBe(0);
    expect(loadImage).toHaveBeenCalledExactlyOnceWith(url, {
      authorization: `Device ${host.credential}`,
    });
    sources.select(ALL_HOSTS);
    expect(loadImage).toHaveBeenCalledTimes(1);
    await sources.remove(host.hostId);
    expect(sources.getSnapshot().avatars.size).toBe(0);
    expect(releaseImage).toHaveBeenCalledExactlyOnceWith('blob:ada');
  });

  it('retries a failed avatar on the next update and releases it when the final reader leaves', async () => {
    const { host, storage } = liveHost();
    const loadImage = vi
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue('blob:retry');
    const releaseImage = vi.fn();
    const sources = createRemoteHosts({ carrier: host.carrier, storage, loadImage, releaseImage });
    const release = sources.subscribe(() => {});
    releases.push(release);
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    sources.select(ALL_HOSTS);
    await vi.waitFor(() =>
      expect([...sources.getSnapshot().avatars.values()]).toEqual(['blob:retry']),
    );
    release();
    expect(sources.getSnapshot().avatars.size).toBe(0);
    expect(releaseImage).toHaveBeenCalledExactlyOnceWith('blob:retry');
  });

  it('discards and releases an avatar that finishes after its Host was removed', async () => {
    const { host, storage } = liveHost();
    let finish: (image: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const loadImage = vi.fn(() => pending);
    const releaseImage = vi.fn();
    const sources = createRemoteHosts({ carrier: host.carrier, storage, loadImage, releaseImage });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(loadImage).toHaveBeenCalledTimes(1));
    await sources.remove(host.hostId);
    finish('blob:late');
    await vi.waitFor(() => expect(releaseImage).toHaveBeenCalledWith('blob:late'));
    expect(sources.getSnapshot().avatars.size).toBe(0);
  });
});
