import { acknowledgement, fixture, request, saved } from './connection-management-fixtures.js';
import { expect, it, vi } from 'vitest';
import { FakeHost } from '../../host-client/test/fake-host.js';
import { withRemoteHostCredentialWrite } from '../src/client/remote-host-storage-lock.js';
import { createRemoteHosts, REMOTE_HOSTS_STORAGE_KEY } from '../src/client/remote-hosts.js';
import { manageConnections } from '../src/client/connection-management.js';

it('review: rejects a replaced persisted grant queued behind the shared execution lock', async () => {
  const { sources, storage, lock } = fixture();
  let release: (() => void) | undefined;
  const holding = lock(
    'execution',
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await vi.waitFor(() => expect(release).toBeDefined());
  const api = vi.spyOn(sources.client('a')!, 'api');
  const result = expect(
    manageConnections(
      sources,
      { action: 'stop-route', kind: 'lan', hostId: 'a', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-host-changed');
  await withRemoteHostCredentialWrite({
    storage,
    run: () =>
      storage.setItem(
        REMOTE_HOSTS_STORAGE_KEY,
        JSON.stringify([
          { ...saved('a'), deviceId: 'queued-replacement', credential: 'queued.secret' },
          saved('b'),
        ]),
      ),
  });
  release!();
  await Promise.all([holding, result]);
  expect(api).not.toHaveBeenCalled();
  sources.close();
});

it('review: initiates dispatch under credential coordination but releases it before the network finishes', async () => {
  const { sources, storage } = fixture();
  const steps: string[] = [];
  let finish: (() => void) | undefined;
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) => {
    if (path === '/api/botharness/devices')
      return {
        status: 200,
        body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
      };
    steps.push('dispatch');
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    steps.push('reply');
    return { status: 200, body: { state: 'off' } };
  });
  const operation = manageConnections(
    sources,
    { action: 'stop-route', kind: 'lan', hostId: 'a', confirm: true },
    request(),
  );
  await vi.waitFor(() => expect(finish).toBeDefined());
  await withRemoteHostCredentialWrite({
    storage,
    run: () => {
      steps.push('credential-write');
      storage.setItem('unrelated', 'changed');
    },
  });
  expect(steps).toEqual(['dispatch', 'credential-write']);
  finish!();
  await expect(operation).resolves.toMatchObject({ accepted: true });
  expect(steps).toEqual(['dispatch', 'credential-write', 'reply']);
  sources.close();
});

it.each([false, true])(
  'review: rechecks self-disconnection after waiting for credential coordination (independent revoke: %s)',
  async (independent) => {
    const lan = 'http://192.168.56.1:47001';
    const quick = 'https://quick.trycloudflare.com';
    const { sources, storage } = fixture([lan, quick]);
    const client = sources.client('a')!;
    let route = lan;
    let release: (() => void) | undefined;
    let queued: Promise<unknown> | undefined;
    vi.spyOn(client, 'getSnapshot').mockImplementation(() => ({
      connection: { status: 'connected', route },
    }));
    let writes = 0;
    const store = vi.spyOn(storage, 'setItem');
    vi.spyOn(client, 'api').mockImplementation(async (path, init) => {
      if (path !== '/api/botharness/devices') {
        writes++;
        return { status: 200, body: acknowledgement(path, init?.body) };
      }
      queued = withRemoteHostCredentialWrite({
        storage,
        run: () =>
          new Promise<void>((resolve) => {
            release = () => {
              route = quick;
              resolve();
            };
          }),
      });
      return {
        status: 200,
        body: {
          host: { id: 'a', name: 'Studio' },
          devices: [{ id: 'phone', name: 'Independent phone' }],
          privateRoutes: [
            { id: 'quick', revision: 'quick-revision', origin: quick, state: 'connected' },
          ],
        },
      };
    });
    const operation = manageConnections(
      sources,
      independent
        ? { action: 'revoke-device', hostId: 'a', deviceId: 'phone', confirm: true }
        : {
            action: 'stop-route',
            kind: 'private-tunnel',
            routeId: 'quick',
            expectedRevision: 'quick-revision',
            hostId: 'a',
            confirm: true,
          },
      request(),
    );
    const checked = independent
      ? expect(operation).resolves.toMatchObject({ accepted: true })
      : expect(operation).rejects.toThrow('connection-disconnect-confirmation-required');
    await vi.waitFor(() => expect(release).toBeDefined());
    release!();
    await Promise.all([queued, checked]);
    expect(writes).toBe(independent ? 1 : 0);
    if (!independent)
      expect(
        store.mock.calls.filter(([key]) => key === 'botharness.remoteHosts.operations.v1'),
      ).toEqual([]);
    expect(sources.getSnapshot().hosts[0]?.host.pendingConnection).toBeUndefined();
    sources.close();
  },
);

it('review: abort while queued for the credential transaction performs neither journal write nor dispatch', async () => {
  const { sources, storage } = fixture();
  let release: (() => void) | undefined;
  let queued: Promise<unknown> | undefined;
  const abort = new AbortController();
  const store = vi.spyOn(storage, 'setItem');
  let writes = 0;
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) => {
    if (path !== '/api/botharness/devices') {
      writes++;
      return { status: 200, body: { state: 'off' } };
    }
    queued = withRemoteHostCredentialWrite({
      storage,
      run: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    return {
      status: 200,
      body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
    };
  });
  const result = expect(
    manageConnections(
      sources,
      { action: 'stop-route', kind: 'lan', hostId: 'a', confirm: true },
      { expiresAt: Date.now() + 30000, signal: abort.signal },
    ),
  ).rejects.toThrow('connection-request-stale');
  await vi.waitFor(() => expect(release).toBeDefined());
  abort.abort();
  release!();
  await Promise.all([queued, result]);
  expect(writes).toBe(0);
  expect(
    store.mock.calls.filter(([key]) => key === 'botharness.remoteHosts.operations.v1'),
  ).toEqual([]);
  expect(sources.getSnapshot().hosts[0]?.host.pendingConnection).toBeUndefined();
  sources.close();
});

it('fresh-reads a shared pending guard after another Client instance releases its execution lock', async () => {
  const { sources, storage, lock } = fixture();
  const second = createRemoteHosts({
    storage,
    carrier: new FakeHost().carrier,
    connectionOperationLock: lock,
  });
  let writes = 0;
  let loseAcknowledgement: (() => void) | undefined;
  const inspectOwner = {
    status: 200,
    body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
  };
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) => {
    if (path === '/api/botharness/devices') return inspectOwner;
    writes++;
    return new Promise((_resolve, reject) => {
      loseAcknowledgement = () => reject(Error('lost acknowledgement'));
    });
  });
  const secondApi = vi.spyOn(second.client('a')!, 'api').mockImplementation(async (path) => {
    if (path !== '/api/botharness/devices') writes++;
    return inspectOwner;
  });
  const operation = { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true };
  const first = manageConnections(sources, operation, request());
  const firstResult = expect(first).rejects.toThrow('connection-management-unconfirmed');
  await vi.waitFor(() => expect(loseAcknowledgement).toBeDefined());
  const competing = manageConnections(second, operation, request());
  const competingResult = expect(competing).rejects.toThrow('connection-management-unconfirmed');
  expect(secondApi).not.toHaveBeenCalled();
  loseAcknowledgement?.();
  await Promise.all([firstResult, competingResult]);
  expect(writes).toBe(1);
  expect(second.getSnapshot().hosts[0]!.host.pendingConnection).toBeDefined();
});

it('refuses dangerous writes without Web Locks instead of falling back to an instance-only queue', async () => {
  vi.stubGlobal('navigator', {});
  const { storage } = fixture();
  const sources = createRemoteHosts({ storage, carrier: new FakeHost().carrier });
  const api = vi.spyOn(sources.client('a')!, 'api');
  try {
    await expect(
      manageConnections(
        sources,
        { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
        request(),
      ),
    ).rejects.toThrow('connection-operation-lock-unavailable');
    expect(api).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each([false, true])(
  'uses a new grant only to read an older outcome, refusing a changed pin (%s)',
  async (changedPin) => {
    const { sources, storage, values, lock } = fixture();
    const generation = crypto.randomUUID();
    sources.setPendingConnection('a', sources.client('a')!, {
      generation,
      hostKey: '11'.repeat(32),
      deviceId: 'device-a',
      operation: { action: 'revoke-device', deviceId: 'device-a' },
    });
    storage.setItem(
      REMOTE_HOSTS_STORAGE_KEY,
      JSON.stringify([
        {
          ...saved('a'),
          deviceId: 'new-browser',
          credential: 'new-grant.secret',
          encryption: {
            ...saved('a').encryption,
            hostKey: (changedPin ? 'ff' : '11').repeat(32),
            deviceKey: '33'.repeat(32),
          },
        },
        saved('b'),
      ]),
    );
    const fresh = createRemoteHosts({
      storage,
      carrier: new FakeHost().carrier,
      connectionOperationLock: lock,
    });
    const api = vi.spyOn(fresh.client('a')!, 'api').mockResolvedValue({
      status: 200,
      body: {
        host: { id: 'a', name: 'Studio' },
        devices: [
          { id: 'device-a', name: 'Previous browser', revokedAt: '2026-11-14T00:00:00Z' },
          { id: 'new-browser', name: 'New trusted browser' },
        ],
      },
    });
    expect(fresh.getSnapshot().hosts[0]!.host.connectionOwnerChanged).toBe(true);
    expect(fresh.getSnapshot().hosts[0]!.host.pendingConnection).toBeUndefined();
    const readback = manageConnections(
      fresh,
      { action: 'read-previous-operation', hostId: 'a' },
      request(),
    );
    if (changedPin) {
      await expect(readback).rejects.toThrow('connection-operation-owner-changed');
      expect(api).not.toHaveBeenCalled();
      expect([...values.values()].some((value) => value.includes(generation))).toBe(true);
    } else {
      await expect(readback).resolves.toMatchObject({
        outcome: 'completed',
        outcomes: [{ generation, outcome: 'completed' }],
      });
      expect(api).toHaveBeenCalledTimes(1);
      expect(api.mock.calls[0]?.[1]?.body).toBeUndefined();
      expect(fresh.getSnapshot().hosts[0]!.host.connectionOwnerChanged).toBeUndefined();
    }
  },
);
