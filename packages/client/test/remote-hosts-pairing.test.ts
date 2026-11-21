import { fakeCarrier, link, liveHost, memoryStorage, releases } from './remote-hosts-fixtures.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { REMOTE_NOTIFICATION_KEY } from '../src/client/remote-notifications.js';
import {
  ALL_HOSTS,
  HOST_TAB_STORAGE_KEY,
  REMOTE_HOSTS_STORAGE_KEY,
  conversationKey,
  createRemoteHosts,
} from '../src/client/remote-hosts.js';

describe('remote hosts', () => {
  it('pairs another remote with this browser and remembers it in browser storage', async () => {
    const storage = memoryStorage();
    const { carrier, calls } = fakeCarrier();
    const record = vi.fn();
    const sources = createRemoteHosts({ storage, carrier, record });
    expect(sources.getSnapshot()).toEqual({ hosts: [], avatars: new Map(), tab: ALL_HOSTS });

    const result = await sources.pair(link(), 'Browser on Laptop', 'host-a');
    expect(record).toHaveBeenCalledWith('remote_host:host_pair_complete', { outcome: 'success' });

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
    const record = vi.fn();
    const sources = createRemoteHosts({ storage: memoryStorage(), carrier, record });
    expect(await sources.pair(link('host-a'), 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'this-host',
    });
    expect(await sources.pair('https://example.com', 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'link-invalid',
    });
    expect(record).toHaveBeenCalledWith('remote_host:host_pair_complete', { outcome: 'refused' });
    await sources.pair(link(), 'Browser', 'host-a');
    expect(await sources.pair(link(), 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'already-paired',
    });
    expect(calls.filter((call) => call.url.endsWith('/pair'))).toHaveLength(1);
    expect(record.mock.calls.map(([, properties]) => properties)).toEqual([
      { outcome: 'refused' },
      { outcome: 'refused' },
      { outcome: 'success' },
      { outcome: 'refused' },
    ]);
  });

  it.each([false, true])(
    'projects earlier execution history immediately when attaching a new grant (missing record: %s)',
    async (missing) => {
      const key = `botharness.remoteHosts.operation.v1:${JSON.stringify(['host-b', '11'.repeat(32), 'old-device'])}`;
      const index = JSON.stringify([{ hostId: 'host-b', key }]);
      const storage = memoryStorage({
        'botharness.remoteHosts.operations.v1': index,
        ...(!missing
          ? {
              [key]: JSON.stringify({
                generation: crypto.randomUUID(),
                hostKey: '11'.repeat(32),
                deviceId: 'old-device',
                operation: { action: 'revoke-device', deviceId: 'old-device' },
              }),
            }
          : {}),
      });
      const sources = createRemoteHosts({ storage, carrier: fakeCarrier().carrier });
      expect((await sources.pair(link(), 'New browser', 'host-a')).ok).toBe(true);
      expect(sources.getSnapshot().hosts[0]?.host).toMatchObject({
        deviceId: 'device-1',
        ...(missing ? { connectionOperationUnavailable: true } : { connectionOwnerChanged: true }),
      });
      expect(storage.values.get('botharness.remoteHosts.operations.v1')).toBe(index);
      sources.close();
    },
  );

  it('records an unreachable remote as a failed pairing', async () => {
    const record = vi.fn();
    const carrier: HostCarrier = {
      request: () => Promise.reject(new Error('offline')),
      openSocket: () => ({ send: () => {}, close: () => {} }),
    };
    const sources = createRemoteHosts({ storage: memoryStorage(), carrier, record });
    expect(await sources.pair(link(), 'Browser', 'host-a')).toEqual({
      ok: false,
      code: 'unreachable',
      detail: 'remote:socket-offline',
    });
    expect(record).toHaveBeenCalledWith('remote_host:host_pair_complete', { outcome: 'failed' });
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
    expect(sources.client('host-b')).toBe(sources.client('host-b'));
    expect(sources.client('host-b')).toBeDefined();
    expect(sources.client('local')).toBeUndefined();
    expect(sources.client('host-c')).toBeUndefined();
  });

  it('removes a remote, revokes this browser there and forgets its open chat', async () => {
    const storage = memoryStorage();
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ storage, carrier });
    await sources.pair(link(), 'Browser', 'host-a');
    sources.open({ hostId: 'host-b', title: 'Ada', botSlug: 'ada' });
    expect(sources.getSnapshot().open?.hostId).toBe('host-b');

    await sources.remove('host-b');

    expect(sources.client('host-b')).toBeUndefined();
    expect(sources.getSnapshot()).toEqual({ hosts: [], avatars: new Map(), tab: ALL_HOSTS });
    expect(JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')).toEqual([
      expect.objectContaining({
        kind: 'automatic-enrollment-suppressed',
        hostId: 'host-b',
        publicKey: null,
      }),
    ]);
    expect(storage.values.get(HOST_TAB_STORAGE_KEY)).toBe(ALL_HOSTS);
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

  it('shares a persisted browsing scope without retargeting an open remote conversation or device grant', async () => {
    const storage = memoryStorage();
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ storage, carrier });
    expect(sources.getSnapshot().tab).toBe(ALL_HOSTS);
    await sources.pair(link(), 'Browser', 'host-a');
    const target = { hostId: 'host-b', title: 'Ada', botSlug: 'ada' };
    sources.open(target);
    const client = sources.client('host-b');
    const saved = storage.values.get(REMOTE_HOSTS_STORAGE_KEY);
    const requests = calls.length;
    for (const scope of ['local', ALL_HOSTS, 'host-b', 'local']) {
      sources.select(scope);
      expect(sources.getSnapshot().tab).toBe(scope);
      expect(sources.getSnapshot().open).toEqual(target);
      expect(sources.client('host-b')).toBe(client);
      expect(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)).toBe(saved);
      expect(calls.length).toBe(requests);
    }
    expect(createRemoteHosts({ storage, carrier }).getSnapshot().tab).toBe('local');
  });

  it('permanently forgets only the removed Host notification choice across reload and re-pair', async () => {
    const preferences = { approval: false, question: true, 'private-input': false, reply: true };
    const retained = { enabled: true, preferences };
    const storage = memoryStorage({
      [REMOTE_NOTIFICATION_KEY]: JSON.stringify({ 'host-b': retained, 'host-c': retained }),
    });
    const { carrier } = fakeCarrier();
    const sources = createRemoteHosts({ storage, carrier });
    await sources.pair(link(), 'Browser', 'host-a');
    expect(sources.notifications.choice('host-b')).toEqual(retained);

    await sources.remove('host-b');

    expect(sources.notifications.getSnapshot().hosts).not.toHaveProperty('host-b');
    expect(JSON.parse(storage.values.get(REMOTE_NOTIFICATION_KEY)!)).toEqual({
      'host-c': retained,
    });
    const reloaded = createRemoteHosts({ storage, carrier });
    await reloaded.pair(link(), 'Browser', 'host-a');
    expect(reloaded.notifications.choice('host-b')).toEqual({
      enabled: false,
      preferences: { approval: true, question: true, 'private-input': true, reply: true },
    });
    expect(reloaded.notifications.choice('host-c')).toEqual(retained);
  });
});
afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.unstubAllGlobals();
});

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
    expect(storage.values.has('botharness.computers.v1')).toBe(true);
    expect(storage.values.has('botharness.computers.tab.v1')).toBe(false);
    await sources.remove(host.hostId);
    expect(createRemoteHosts({ carrier: host.carrier, storage }).getSnapshot().hosts).toEqual([]);
  });
});
