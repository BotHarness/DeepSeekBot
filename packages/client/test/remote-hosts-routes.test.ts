import { fakeCarrier, link, memoryStorage, releases } from './remote-hosts-fixtures.js';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';
import { FakeHost } from '../../host-client/test/fake-host.js';
import { serializeSavedHost, type SavedHost } from '@botharness/host-client/hosts';
import { manageConnections } from '../src/client/connection-management.js';
import { hostSettingsDrafts, type HostDraftChoice } from '../src/client/host-settings-drafts.js';
import { withRemoteHostStorageLock } from '../src/client/remote-host-storage-lock.js';
import {
  ALL_HOSTS,
  HOST_TAB_STORAGE_KEY,
  REMOTE_HOSTS_STORAGE_KEY,
  createRemoteHosts,
} from '../src/client/remote-hosts.js';

it('applies another tab saved routes and preference to the existing Client without writing them back', async () => {
  const host = new FakeHost();
  const first = 'https://first.example.ts.net';
  const second = 'https://second.example.ts.net';
  const saved = {
    hostId: 'host-b',
    hostName: 'Studio B',
    deviceId: 'device-1',
    credential: host.credential,
    routes: [first],
  };
  const storage = memoryStorage({ [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([saved]) });
  const events = new EventTarget();
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
  const source = createRemoteHosts({ storage, carrier: host.carrier });
  const release = source.subscribe(() => {});
  try {
    const client = source.client('host-b');
    assert(client);
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    const updated = JSON.stringify([
      { ...saved, routes: [first, second], routePreference: second },
    ]);
    storage.setItem(REMOTE_HOSTS_STORAGE_KEY, updated);
    const write = vi.spyOn(storage, 'setItem');
    const changed = new Event('storage');
    Object.defineProperties(changed, {
      key: { value: REMOTE_HOSTS_STORAGE_KEY },
      storageArea: { value: storage },
    });
    events.dispatchEvent(changed);
    await vi.waitFor(() =>
      expect(client.getSnapshot()).toMatchObject({
        routes: [{ url: first }, { url: second }],
        routePreference: second,
        connection: { status: 'connected', route: second },
      }),
    );
    expect(source.client('host-b')).toBe(client);
    expect(storage.getItem(REMOTE_HOSTS_STORAGE_KEY)).toBe(updated);
    expect(write).not.toHaveBeenCalled();
  } finally {
    release();
  }
});

describe('remote hosts', () => {
  it.each(['legacy-missing', 'legacy-corrupt', 'inline-corrupt'] as const)(
    'refuses a %s indexed record for current and previous grants without discarding it',
    async (failure) => {
      for (const previous of [false, true]) {
        const host: SavedHost = {
          hostId: 'history-host',
          hostName: 'History',
          deviceId: previous ? 'new-device' : 'old-device',
          credential: 'private',
          routes: ['https://history.example.ts.net'],
          encryption: {
            protocol: 'connect-noise-xk-v1',
            hostKey: '11'.repeat(32),
            deviceKey: '22'.repeat(32),
          },
        };
        const key = `botharness.remoteHosts.operation.v1:${JSON.stringify([host.hostId, host.encryption!.hostKey, 'old-device'])}`;
        const storage = memoryStorage({
          [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([host]),
          'botharness.remoteHosts.operations.v1': JSON.stringify([
            {
              hostId: host.hostId,
              key,
              ...(failure === 'inline-corrupt' ? { record: { generation: 'invalid' } } : {}),
            },
          ]),
          ...(failure === 'legacy-corrupt' ? { [key]: 'invalid JSON' } : {}),
        });
        const before = [...storage.values];
        const sources = createRemoteHosts({
          storage,
          carrier: fakeCarrier().carrier,
          connectionOperationLock: async (_name, run) => run(),
        });
        const client = sources.client(host.hostId)!;
        const api = vi.spyOn(client, 'api');
        expect(sources.getSnapshot().hosts[0]?.host).toMatchObject({
          hostId: host.hostId,
          credential: host.credential,
          connectionOperationUnavailable: true,
        });
        await expect(
          manageConnections(
            sources,
            { action: 'stop-route', hostId: host.hostId, kind: 'lan', confirm: true },
            { expiresAt: Date.now() + 30000, signal: new AbortController().signal },
          ),
        ).rejects.toThrow('connection-operation-storage-unavailable');
        expect(api).not.toHaveBeenCalled();
        expect([...storage.values]).toEqual(before);
        sources.close();
      }
    },
  );
  it.each(['cancel', 'new-forget'] as const)(
    'preserves Human intent when manual pairing waits for storage and receives %s',
    async (mode) => {
      const choice = {
        kind: 'automatic-enrollment-suppressed',
        hostId: 'host-b',
        publicKey: null,
        generation: 'earlier-forget',
      };
      const storage = memoryStorage({ [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([choice]) });
      const { carrier, calls } = fakeCarrier();
      const sources = createRemoteHosts({ storage, carrier });
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const held = withRemoteHostStorageLock({ storage, name: 'credentials', run: () => gate });
      const abort = new AbortController();
      const pending = sources.pair(link(), 'Cancelled browser', undefined, {
        signal: abort.signal,
      });
      await vi.waitFor(() => expect(calls.some((call) => call.url.endsWith('/pair'))).toBe(true));
      await new Promise<void>((resolve) => setImmediate(resolve));
      const newerChoice = { ...choice, generation: 'newer-forget' };
      if (mode === 'cancel') abort.abort();
      else storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([newerChoice]));
      release();
      await held;
      expect((await pending).ok).toBe(false);
      expect(sources.getSnapshot().hosts).toEqual([]);
      expect(JSON.parse(storage.getItem(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')).toEqual([
        mode === 'cancel' ? choice : newerChoice,
      ]);
      expect(calls.some((call) => call.url.endsWith('/unpair'))).toBe(true);
    },
  );

  it('keeps mixed saved credentials and local automatic choices separate, preserves unrelated choices and clears only an explicit manual add', async () => {
    const a = {
      hostId: 'host-a',
      hostName: 'A',
      deviceId: 'a',
      credential: 'a.private',
      routes: ['http://127.0.0.1:47001'],
    };
    const c = { ...a, hostId: 'host-c', hostName: 'C', deviceId: 'c', credential: 'c.private' };
    const choice = { kind: 'automatic-enrollment-suppressed', hostId: 'host-b', publicKey: null };
    const storage = memoryStorage({
      [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([
        a,
        choice,
        { kind: 'broken-record', hostId: 5 },
        c,
      ]),
    });
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ storage, carrier });
    expect(sources.getSnapshot().hosts.map((item) => item.host.hostId)).toEqual([
      'host-a',
      'host-c',
    ]);
    await sources.forgetLocal('host-a');
    expect(calls).toEqual([]);
    const restored = createRemoteHosts({ storage, carrier });
    expect(restored.getSnapshot().hosts.map((item) => item.host.hostId)).toEqual(['host-c']);
    const automatic = await restored.enrollRelationship(
      {
        id: 'b'.repeat(32),
        peer: {
          id: 'host-b',
          name: 'B',
          publicKey: 'ab'.repeat(32),
          routes: ['https://hbbbbbbbbbbbb.deepseekbot.dev'],
        },
      },
      'Desktop',
      undefined,
      { accountGeneration: 'test-generation' },
    );
    expect(automatic).toEqual({ ok: false, code: 'client-automatic-enrollment-suppressed' });
    expect(calls).toEqual([]);
    expect((await restored.pair(link(), 'Manual browser')).ok).toBe(true);
    const persisted = JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY) ?? '[]');
    expect(persisted).toContainEqual(c);
    expect(persisted).toContainEqual(
      expect.objectContaining({
        kind: 'automatic-enrollment-suppressed',
        hostId: 'host-a',
        publicKey: null,
      }),
    );
    expect(persisted).not.toContainEqual(choice);
    expect(
      createRemoteHosts({ storage, carrier })
        .getSnapshot()
        .hosts.map((item) => item.host.hostId),
    ).toEqual(['host-c', 'host-b']);
  });
  it('fresh-merges an unrelated Host added by another Client and refuses a stale exact-device removal', async () => {
    const host = {
      hostId: 'host-b',
      hostName: 'B',
      deviceId: 'old',
      credential: 'old.private',
      routes: ['http://192.168.56.1:47001'],
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: 'ab'.repeat(32),
        deviceKey: 'cd'.repeat(32),
      },
    };
    const storage = memoryStorage({ [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([host]) });
    const sources = createRemoteHosts({ storage, carrier: fakeCarrier().carrier });
    const added = {
      hostId: 'host-c',
      hostName: 'C',
      deviceId: 'c',
      credential: 'c.private',
      routes: ['http://127.0.0.1:47001'],
    };
    storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([host, added]));
    await sources.learnRelationshipRoutes({
      id: host.hostId,
      name: host.hostName,
      publicKey: host.encryption.hostKey,
      routes: ['http://192.168.56.1:47002'],
    });
    expect(JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')).toContainEqual(added);
    const newer = { ...host, deviceId: 'new', credential: 'new.private' };
    storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([newer, added]));
    await expect(sources.forgetLocal(host.hostId)).rejects.toThrow('connection-host-changed');
    expect(JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')).toEqual([
      newer,
      added,
    ]);
  });
  it('stores private route recovery in the same Client grant and refuses to override a manual route', async () => {
    const host = {
      hostId: 'host-b',
      hostName: 'Studio',
      deviceId: 'existing-device',
      credential: 'existing.secret',
      routes: ['http://192.168.56.1:47001'],
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: 'ab'.repeat(32),
        deviceKey: 'cd'.repeat(32),
      },
    };
    const admission = { origin: 'https://private.example', token: 'ef'.repeat(32) };
    const peer = {
      id: host.hostId,
      name: host.hostName,
      publicKey: host.encryption.hostKey,
      routes: [admission.origin],
    };
    const storage = memoryStorage({ [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([host]) });
    const sources = createRemoteHosts({ storage, carrier: fakeCarrier().carrier });
    await sources.learnRelationshipRoutes(peer);
    expect(sources.getSnapshot().hosts[0]?.host).toEqual(host);
    await sources.learnRelationshipRoutes(peer, admission);
    expect(sources.getSnapshot().hosts[0]?.host).toEqual({
      ...host,
      routes: [admission.origin],
      encryption: { ...host.encryption, privateRelay: admission },
    });
    const restored = createRemoteHosts({ storage, carrier: fakeCarrier().carrier });
    expect(restored.getSnapshot().hosts[0]?.host.deviceId).toBe(host.deviceId);
    expect(restored.getSnapshot().hosts[0]?.host.encryption?.privateRelay).toEqual(admission);
    const manual = createRemoteHosts({
      storage: memoryStorage({
        [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([{ ...host, routePreference: host.routes[0] }]),
      }),
      carrier: fakeCarrier().carrier,
    });
    await expect(manual.learnRelationshipRoutes(peer, admission)).rejects.toThrow(
      'relationship-route-preference-unavailable',
    );
    expect(manual.getSnapshot().hosts[0]?.host.routes).toEqual(host.routes);
    sources.close();
    restored.close();
    manual.close();
  });
  it('does not let an old removal waiting for settings delete a newly enrolled Client for the same Host', async () => {
    const relationshipId = 'a'.repeat(32);
    const storage = memoryStorage({
      [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([
        {
          hostId: 'host-b',
          hostName: 'Studio',
          deviceId: 'old-device',
          credential: 'old.secret',
          routes: ['http://127.0.0.1:47001'],
          relationshipId,
        },
      ]),
    });
    const { carrier } = fakeCarrier();
    const sources = createRemoteHosts({ storage, carrier });
    let dirty = true;
    let choose: (value: HostDraftChoice) => void = () => {};
    const releaseDraft = hostSettingsDrafts.register('host-b', {
      dirty: () => dirty,
      save: async () => false,
      discard: () => {
        dirty = false;
      },
    });
    const releasePrompt = hostSettingsDrafts.prompt(
      'host-b',
      () =>
        new Promise((resolve) => {
          choose = resolve;
        }),
    );
    try {
      sources.select('host-b');
      const pending = sources.remove('host-b');
      await Promise.resolve();
      await sources.retireRelationship(relationshipId);
      expect(sources.getSnapshot().tab).toBe(ALL_HOSTS);
      expect(storage.values.get(HOST_TAB_STORAGE_KEY)).toBe(ALL_HOSTS);
      expect((await sources.pair(link(), 'New browser')).ok).toBe(true);
      choose('discard');
      await pending;
      expect(sources.getSnapshot().hosts[0]?.host.deviceId).toBe('device-1');
    } finally {
      releasePrompt();
      releaseDraft();
    }
  });
  it('recovers relationship routes without replacing this Client grant or accepting another Host key', async () => {
    const host = {
      hostId: 'host-b',
      hostName: 'Studio',
      deviceId: 'existing-device',
      credential: 'existing.secret',
      routes: ['http://192.168.56.1:47001'],
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: 'ab'.repeat(32),
        deviceKey: 'cd'.repeat(32),
      },
    };
    const storage = memoryStorage({ [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([host]) });
    const sources = createRemoteHosts({ storage, carrier: fakeCarrier().carrier });
    const peer = {
      id: host.hostId,
      name: host.hostName,
      publicKey: host.encryption.hostKey,
      routes: ['http://192.168.56.1:47002'],
    };
    await expect(
      sources.learnRelationshipRoutes({ ...peer, publicKey: 'ff'.repeat(32) }),
    ).rejects.toThrow('host-key-mismatch');
    expect(sources.getSnapshot().hosts[0]?.host).toEqual(host);
    await sources.learnRelationshipRoutes(peer);
    expect(sources.getSnapshot().hosts).toHaveLength(1);
    expect(sources.getSnapshot().hosts[0]?.host).toEqual({ ...host, routes: peer.routes });
    const restored = createRemoteHosts({ storage, carrier: fakeCarrier().carrier });
    expect(restored.getSnapshot().hosts[0]?.host).toEqual({ ...host, routes: peer.routes });
    sources.close();
    restored.close();
  });
  it('keeps a disabled member provider away from Owner credentials, network and enrollment', async () => {
    const storage = memoryStorage({
      [REMOTE_HOSTS_STORAGE_KEY]: 'owner-private-saved-hosts',
      [HOST_TAB_STORAGE_KEY]: 'owner-host',
    });
    const read = vi.spyOn(storage, 'getItem');
    const write = vi.spyOn(storage, 'setItem');
    const remove = vi.spyOn(storage, 'removeItem');
    const { carrier, calls } = fakeCarrier();
    const sources = createRemoteHosts({ enabled: false, storage, carrier });
    const relationship = {
      id: 'a'.repeat(32),
      peer: { id: 'owner-host', name: 'Private', publicKey: 'ab'.repeat(32), routes: [] },
    };
    const off = sources.subscribe(() => {});
    expect(sources.getSnapshot()).toEqual({ hosts: [], avatars: new Map(), tab: ALL_HOSTS });
    expect(await sources.pair(link(), 'Member')).toEqual({ ok: false, code: 'owner-required' });
    expect(await sources.enrollRelationship(relationship, 'Member')).toEqual({
      ok: false,
      code: 'owner-required',
    });
    expect(
      await sources.enrollRelationship(relationship, 'Member', undefined, {
        accountGeneration: 'caller-generation',
      }),
    ).toEqual({ ok: false, code: 'owner-required' });
    await expect(sources.learnRelationshipRoutes(relationship.peer)).rejects.toMatchObject({
      code: 'owner-required',
    });
    await expect(sources.retireRelationship(relationship.id)).rejects.toMatchObject({
      code: 'owner-required',
    });
    expect(() => sources.select('owner-host')).toThrow('owner-required');
    expect(() =>
      sources.open({ hostId: 'owner-host', channelId: 'private', title: 'Private' }),
    ).toThrow('owner-required');
    await expect(sources.remove('owner-host')).rejects.toMatchObject({ code: 'owner-required' });
    await expect(sources.forgetLocal('owner-host')).rejects.toMatchObject({
      code: 'owner-required',
    });
    await expect(sources.notifications.set('owner-host', { enabled: false })).rejects.toMatchObject(
      { code: 'owner-required' },
    );
    expect(() => sources.notifications.forget('owner-host')).toThrow('owner-required');
    await expect(
      sources.markRead({ hostId: 'owner-host', channelId: 'private', title: 'Private' }, 'message'),
    ).rejects.toMatchObject({ code: 'owner-required' });
    sources.close();
    off();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)).toBe('owner-private-saved-hosts');
  });

  it('keeps execution history while applying another tab’s encrypted loopback routes and preference', async () => {
    const host: SavedHost = {
      hostId: 'loopback-host',
      hostName: 'This computer',
      routes: ['http://127.0.0.1:47001'],
      deviceId: 'loopback-device',
      credential: 'loopback.secret',
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: '11'.repeat(32),
        deviceKey: '22'.repeat(32),
        loopback: 'encrypted',
      },
    };
    const storage = memoryStorage({
      [REMOTE_HOSTS_STORAGE_KEY]: JSON.stringify([serializeSavedHost(host)]),
    });
    const events = new EventTarget();
    vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
    vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
    const sources = createRemoteHosts({ storage, carrier: fakeCarrier().carrier });
    expect(sources.getSnapshot().hosts[0]?.host.routes).toEqual(host.routes);
    const pending = {
      generation: crypto.randomUUID(),
      hostKey: host.encryption!.hostKey,
      deviceId: host.deviceId,
      operation: { action: 'stop-route', kind: 'lan' },
    } as const;
    sources.setPendingConnection(host.hostId, sources.client(host.hostId)!, pending);
    await sources.client(host.hostId)?.setRoutePreference?.(host.routes[0]);
    expect(sources.client(host.hostId)?.getSnapshot().routePreference).toBe(host.routes[0]);
    expect(sources.getSnapshot().hosts[0]?.host.pendingConnection).toEqual(pending);
    const persisted = JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY)!)[0];
    expect(persisted).toMatchObject({
      routes: [],
      encryptedLoopbackRoutes: host.routes,
    });
    expect(persisted).not.toHaveProperty('pendingConnection');
    expect(persisted).not.toHaveProperty('connectionOwnerChanged');
    expect(persisted).not.toHaveProperty('connectionOperationUnavailable');
    const release = sources.subscribe(() => {});
    const changedRoute = 'http://127.0.0.1:47002';
    const updated = JSON.stringify([
      serializeSavedHost({
        ...host,
        routes: [changedRoute],
        routePreference: changedRoute,
      }),
    ]);
    storage.setItem(REMOTE_HOSTS_STORAGE_KEY, updated);
    const write = vi.spyOn(storage, 'setItem');
    const changed = new Event('storage');
    Object.defineProperties(changed, {
      key: { value: REMOTE_HOSTS_STORAGE_KEY },
      storageArea: { value: storage },
    });
    events.dispatchEvent(changed);
    expect(sources.client(host.hostId)?.getSnapshot().routePreference).toBe(changedRoute);
    expect(sources.getSnapshot().hosts[0]?.host.pendingConnection).toEqual(pending);
    expect(storage.getItem(REMOTE_HOSTS_STORAGE_KEY)).toBe(updated);
    expect(write).not.toHaveBeenCalled();
    release();
    sources.close();
  });
});
afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.unstubAllGlobals();
});
