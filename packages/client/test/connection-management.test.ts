import { expect, it, vi } from 'vitest';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import type { SavedHost } from '../../../apps/mobile/src/host/hosts.js';
import type { HostClient } from '../../../apps/mobile/src/host/client.js';
import type { ConnectionMutation } from '../../core/src/devices/connection-operation.js';
import {
  createRemoteHosts,
  REMOTE_HOSTS_STORAGE_KEY,
  type RemoteHost,
} from '../src/client/remote-hosts.js';
import {
  connectionRows,
  manageConnections,
  observedHost,
} from '../src/client/connection-management.js';

const saved = (hostId: string): SavedHost => ({
  hostId,
  hostName: 'Same name',
  routes: ['http://127.0.0.1:47001'],
  deviceId: `device-${hostId}`,
  credential: `${hostId}.secret`,
  encryption: {
    protocol: 'connect-noise-xk-v1',
    hostKey: '11'.repeat(32),
    deviceKey: '22'.repeat(32),
  },
});
const remote = (id: string): RemoteHost => ({
  host: saved(id),
  snapshot: {
    connection: { status: 'connected', route: 'http://127.0.0.1:47001' },
    routes: [
      { url: 'http://127.0.0.1:47001', status: 'verified' },
      { url: 'https://other.ts.net', status: 'unreachable' },
    ],
  },
  inbox: { status: 'idle' },
});
const request = () => ({ expiresAt: Date.now() + 30_000, signal: new AbortController().signal });
const fixture = (routes?: string[]) => {
  let tail = Promise.resolve();
  const lock = async <T>(_name: string, run: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release: (() => void) | undefined;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      release?.();
    }
  };
  const values = new Map([
    [
      REMOTE_HOSTS_STORAGE_KEY,
      JSON.stringify([{ ...saved('a'), ...(routes ? { routes } : {}) }, saved('b')]),
    ],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const sources = createRemoteHosts({
    storage,
    carrier: new FakeHost().carrier,
    connectionOperationLock: lock,
  });
  for (const hostId of ['a', 'b']) {
    const client = sources.client(hostId)!;
    const snapshot = client.getSnapshot();
    vi.spyOn(client, 'getSnapshot').mockImplementation(() => ({
      ...snapshot,
      connection: { status: 'connected', route: routes?.[0] ?? 'http://127.0.0.1:47001' },
    }));
  }
  return { sources, values, storage, lock };
};

it('preserves the central Owner refusal instead of presenting a storage recovery error', async () => {
  const { sources } = fixture();
  const api = vi.spyOn(sources.client('a')!, 'api');
  vi.spyOn(sources, 'withConnectionOperation').mockRejectedValue(
    Object.assign(new Error('owner-required'), { code: 'owner-required' }),
  );
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
      request(),
    ),
  ).rejects.toMatchObject({ code: 'owner-required' });
  expect(api).not.toHaveBeenCalled();
});

it('does not acknowledge local removal when a draft guard cancels it', async () => {
  const { sources } = fixture();
  const client = sources.client('a');
  vi.spyOn(sources, 'forgetLocal').mockResolvedValue();
  await expect(
    manageConnections(sources, { action: 'forget-host', hostId: 'a', confirm: true }, request()),
  ).resolves.toEqual({ hostId: 'a', removedLocally: false });
  expect(sources.client('a')).toBe(client);
});

it.each([401, 403])(
  'retains an unknown result when the original Host grant read is refused with %s',
  async (status) => {
    const { sources, values } = fixture();
    const client = sources.client('a')!;
    sources.setPendingConnection('a', client, {
      generation: crypto.randomUUID(),
      hostKey: '11'.repeat(32),
      deviceId: 'device-a',
      operation: { action: 'stop-route', kind: 'lan' },
    });
    const before = [...values];
    const api = vi.spyOn(client, 'api').mockResolvedValue({
      status,
      body: { code: status === 401 ? 'device-revoked' : 'owner-required' },
    });
    const fallback = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('No Native fallback'));
    try {
      await expect(
        manageConnections(sources, { action: 'read-operation', hostId: 'a' }, request()),
      ).rejects.toMatchObject({ code: 'connection-management-refused' });
      expect([...values]).toEqual(before);
      expect(sources.client('a')).toBe(client);
      expect(api).toHaveBeenCalledExactlyOnceWith(
        '/api/botharness/devices',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(fallback).not.toHaveBeenCalled();
    } finally {
      fallback.mockRestore();
    }
  },
);

it('groups only exact account Host identity and pinned key without rewriting manual provenance', () => {
  const hosts = [remote('a'), remote('b')];
  const listed = (id: string, hostId: string, key = '11'.repeat(32)) => ({
    id,
    name: 'Same name',
    hostname: 'same.test',
    createdAt: '2026-01-01T00:00:00Z',
    current: false,
    sessionKnown: true,
    botNetwork: { hostId, publicKey: key },
  });
  const rows = connectionRows(hosts, [
    listed('account-a', 'a'),
    listed('forged', 'b', 'ff'.repeat(32)),
    listed('other', 'c'),
  ]);
  expect(rows.account.map((row) => row.remote.host.hostId)).toEqual(['a']);
  expect(rows.other.map((row) => row.remote.host.hostId)).toEqual(['b']);
  expect(rows.discovered.map((row) => row.id)).toEqual(['forged', 'other']);
  expect(hosts[0]!.host.accountOwner).toBeUndefined();
  expect(rows.account[0]!.remote.snapshot.connection.route).toBe('http://127.0.0.1:47001');
});

it('reports actual route observations without credentials or inferring alternative connectivity', () => {
  const result = observedHost(remote('a'));
  expect(result.routes).toEqual([
    { address: 'http://127.0.0.1:47001', status: 'verified', current: true },
    { address: 'https://other.ts.net', status: 'unreachable', current: false },
  ]);
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(JSON.stringify(result)).not.toContain('deviceKey');
});

it('removes only the selected browser connection, persists first and never revokes a Host grant', async () => {
  const { sources, values } = fixture();
  const first = vi.spyOn(sources.client('a')!, 'api');
  const second = vi.spyOn(sources.client('b')!, 'api');
  await expect(
    manageConnections(sources, { action: 'forget-host', hostId: 'a' }, request()),
  ).rejects.toThrow('connection-confirmation-required');
  await expect(
    manageConnections(sources, { action: 'forget-host', hostId: 'a', confirm: true }, request()),
  ).resolves.toEqual({ hostId: 'a', removedLocally: true });
  expect(sources.getSnapshot().hosts.map((x) => x.host.hostId)).toEqual(['b']);
  expect(JSON.parse(values.get(REMOTE_HOSTS_STORAGE_KEY)!)).toEqual([
    expect.objectContaining({ hostId: 'b', credential: expect.any(String) }),
    expect.objectContaining({ kind: 'automatic-enrollment-suppressed', hostId: 'a' }),
  ]);
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
});

it('retains the visible connection if local removal cannot be persisted', async () => {
  const { sources, storage } = fixture();
  vi.spyOn(storage, 'setItem').mockImplementation(() => {
    throw Error('disk');
  });
  await expect(
    manageConnections(sources, { action: 'forget-host', hostId: 'a', confirm: true }, request()),
  ).rejects.toThrow('disk');
  expect(sources.getSnapshot().hosts.map((x) => x.host.hostId)).toEqual(['a', 'b']);
});

it('revokes a device and stops a route only through the selected target and explicit confirmation', async () => {
  const { sources } = fixture();
  const other = vi.spyOn(sources.client('b')!, 'api');
  const api = vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) => ({
    status: 200,
    body:
      path === '/api/botharness/devices'
        ? {
            host: { id: 'a', name: 'Studio' },
            devices: [{ id: 'device-a', name: 'Browser' }],
            lan: { state: 'listening' },
            privateTunnel: { state: 'connected' },
          }
        : { ok: true },
  }));
  expect(
    await manageConnections(sources, { action: 'inspect-host', hostId: 'a' }, request()),
  ).toMatchObject({
    hostId: 'a',
    devices: [{ id: 'device-a', current: true }],
    stops: ['lan', 'private-tunnel'],
  });
  await manageConnections(
    sources,
    {
      action: 'revoke-device',
      hostId: 'a',
      deviceId: 'device-a',
      confirm: true,
      confirmDisconnect: true,
    },
    request(),
  );
  expect(api).toHaveBeenLastCalledWith(
    '/api/botharness/devices/revoke',
    expect.objectContaining({ body: { deviceId: 'device-a', confirm: true } }),
  );
  await manageConnections(
    sources,
    { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
    request(),
  );
  expect(api).toHaveBeenLastCalledWith(
    '/api/botharness/devices/lan',
    expect.objectContaining({ body: { action: 'disable', confirm: true } }),
  );
  expect(other).not.toHaveBeenCalled();
  expect(sources.getSnapshot().hosts).toHaveLength(2);
});

it('refuses changed targets, stale requests and unavailable owner acknowledgements', async () => {
  const { sources } = fixture();
  const api = vi.spyOn(sources.client('a')!, 'api');
  await expect(
    manageConnections(sources, { action: 'hosts' }, { ...request(), expiresAt: 0 }),
  ).rejects.toThrow('connection-request-stale');
  api.mockResolvedValue({
    status: 200,
    body: { host: { id: 'b', name: 'Wrong target' }, devices: [] },
  });
  await expect(
    manageConnections(
      sources,
      { action: 'revoke-device', hostId: 'a', deviceId: 'device-a', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-host-mismatch');
  expect(api).toHaveBeenCalledTimes(1);
  api.mockResolvedValue({ status: 503, body: {} });
  await expect(
    manageConnections(sources, { action: 'inspect-host', hostId: 'a' }, request()),
  ).rejects.toThrow('connection-management-refused');
});

it('reports an unconfirmed outcome when stopping the active route loses the reply', async () => {
  const { sources } = fixture();
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) => {
    if (path === '/api/botharness/devices')
      return {
        status: 200,
        body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
      };
    throw Error('connection closed');
  });
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-management-unconfirmed');
  expect(sources.getSnapshot().hosts).toHaveLength(2);
});

it('blocks uncertain writes across reload until the exact owner confirms completion without replay', async () => {
  const { sources, storage, lock } = fixture();
  let stopped = false;
  let writes = 0;
  const owner = async (path: string) => {
    if (path === '/api/botharness/devices')
      return {
        status: 200,
        body: {
          host: { id: 'a', name: 'Studio' },
          devices: [],
          lan: { state: stopped ? 'off' : 'listening' },
        },
      };
    writes++;
    stopped = true;
    throw Error('acknowledgement lost');
  };
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(owner);
  const operation = { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true };
  await expect(manageConnections(sources, operation, request())).rejects.toThrow(
    'connection-management-unconfirmed',
  );
  const restored = createRemoteHosts({
    storage,
    carrier: new FakeHost().carrier,
    connectionOperationLock: lock,
  });
  vi.spyOn(restored.client('a')!, 'api').mockImplementation(owner);
  expect(restored.getSnapshot().hosts[0]!.host.pendingConnection?.operation).toEqual({
    action: 'stop-route',
    kind: 'lan',
  });
  await expect(manageConnections(restored, operation, request())).rejects.toThrow(
    'connection-management-unconfirmed',
  );
  expect(writes).toBe(1);
  await expect(
    manageConnections(restored, { action: 'read-operation', hostId: 'a' }, request()),
  ).resolves.toMatchObject({ hostId: 'a', outcome: 'completed' });
  expect(restored.getSnapshot().hosts[0]!.host.pendingConnection).toBeUndefined();
  expect(writes).toBe(1);
});

it('does not treat an unchanged owner value or a missing capability as permission to replay', async () => {
  const { sources } = fixture();
  const api = vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) => {
    if (path !== '/api/botharness/devices') throw Error('lost response');
    return {
      status: 200,
      body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
    };
  });
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-management-unconfirmed');
  await expect(
    manageConnections(sources, { action: 'read-operation', hostId: 'a' }, request()),
  ).resolves.toMatchObject({ outcome: 'unknown' });
  api.mockResolvedValue({ status: 200, body: { host: { id: 'a', name: 'Studio' }, devices: [] } });
  await expect(
    manageConnections(sources, { action: 'read-operation', hostId: 'a' }, request()),
  ).resolves.toMatchObject({ outcome: 'unknown' });
  expect(sources.getSnapshot().hosts[0]!.host.pendingConnection).toBeDefined();
});

it('requires a separate explicit self-disconnection confirmation before revoking this Client', async () => {
  const { sources } = fixture();
  const api = vi.spyOn(sources.client('a')!, 'api').mockResolvedValue({
    status: 200,
    body: {
      host: { id: 'a', name: 'Studio' },
      devices: [{ id: 'device-a', name: 'Browser' }],
    },
  });
  await expect(
    manageConnections(
      sources,
      {
        action: 'plan-operation',
        hostId: 'a',
        operation: { action: 'revoke-device', deviceId: 'device-a' },
      },
      request(),
    ),
  ).resolves.toEqual({ hostId: 'a', disconnects: true, alternatives: [] });
  await expect(
    manageConnections(
      sources,
      { action: 'revoke-device', hostId: 'a', deviceId: 'device-a', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-disconnect-confirmation-required');
  expect(api.mock.calls.every(([path]) => path === '/api/botharness/devices')).toBe(true);
});

it('stops only one explicitly selected private route and keeps the other owner and devices', async () => {
  const { sources } = fixture();
  const api = vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) => ({
    status: 200,
    body:
      path === '/api/botharness/devices'
        ? {
            host: { id: 'a', name: 'Studio' },
            devices: [{ id: 'phone', name: 'Independent phone' }],
            privateRoutes: [
              { id: 'quick', origin: 'https://test.trycloudflare.com', state: 'connected' },
              { id: 'custom', origin: 'https://private.example.com', state: 'connected' },
            ],
          }
        : { ok: true },
  }));
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', hostId: 'a', kind: 'private-tunnel', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-route-unknown');
  await manageConnections(
    sources,
    { action: 'stop-route', hostId: 'a', kind: 'private-tunnel', routeId: 'quick', confirm: true },
    request(),
  );
  expect(api).toHaveBeenLastCalledWith(
    '/api/botharness/devices/private-tunnel',
    expect.objectContaining({ body: { action: 'stop', routeId: 'quick', confirm: true } }),
  );
  expect(api.mock.calls.filter(([, init]) => init?.body)).toHaveLength(1);
});

it('refuses a destructive write when the uncertain-operation guard cannot be saved', async () => {
  const { sources, storage } = fixture();
  const api = vi.spyOn(sources.client('a')!, 'api').mockResolvedValue({
    status: 200,
    body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
  });
  vi.spyOn(storage, 'setItem').mockImplementation(() => {
    throw Error('disk full');
  });
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-operation-storage-unavailable');
  expect(api).toHaveBeenCalledTimes(1);
});

it('performs no write when a planned alternative was saved but never became the active connection', async () => {
  const active = 'https://active.trycloudflare.com';
  const alternate = 'https://other.ts.net';
  const { sources } = fixture([active, alternate]);
  const client = sources.client('a')!;
  vi.spyOn(client, 'getSnapshot').mockReturnValue({
    connection: { status: 'connected', route: active },
  });
  const snapshot = sources.getSnapshot();
  vi.spyOn(sources, 'getSnapshot').mockReturnValue({
    ...snapshot,
    hosts: snapshot.hosts.map((remote) =>
      remote.host.hostId === 'a' ? { ...remote, snapshot: client.getSnapshot() } : remote,
    ),
  });
  vi.spyOn(client, 'testRoute').mockResolvedValue(true);
  const abort = new AbortController();
  vi.spyOn(client, 'setRoutePreference').mockImplementation(async () => {
    abort.abort();
  });
  const api = vi.spyOn(client, 'api').mockResolvedValue({
    status: 200,
    body: {
      host: { id: 'a', name: 'Studio' },
      devices: [],
      privateRoutes: [{ id: 'quick', origin: active, state: 'connected' }],
    },
  });
  await expect(
    manageConnections(
      sources,
      {
        action: 'stop-route',
        hostId: 'a',
        kind: 'private-tunnel',
        routeId: 'quick',
        confirm: true,
        handover: alternate,
      },
      { expiresAt: Date.now() + 30_000, signal: abort.signal },
    ),
  ).rejects.toThrow('connection-handover-unconfirmed');
  expect(api).toHaveBeenCalledTimes(1);
  expect(api.mock.calls[0]?.[1]?.body).toBeUndefined();
});

it('signs out only through the selected Host account owner without revoking device grants', async () => {
  const { sources } = fixture();
  const api = vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) => ({
    status: 200,
    body:
      path === '/api/botharness/devices'
        ? {
            host: { id: 'a', name: 'Studio' },
            devices: [{ id: 'phone', name: 'Independent phone' }],
            connect: { account: { state: 'signed-in' } },
          }
        : { state: 'signed-out' },
  }));
  const other = vi.spyOn(sources.client('b')!, 'api');
  await manageConnections(sources, { action: 'sign-out', hostId: 'a', confirm: true }, request());
  expect(api).toHaveBeenLastCalledWith(
    '/api/botharness/devices/connect',
    expect.objectContaining({ body: { action: 'sign-out', confirm: true } }),
  );
  expect(api.mock.calls.filter(([, init]) => init?.body)).toHaveLength(1);
  expect(other).not.toHaveBeenCalled();
});

it('does not let an older readback clear a newer operation generation', async () => {
  const { sources } = fixture();
  const client = sources.client('a')!;
  const first = {
    generation: crypto.randomUUID(),
    hostKey: '11'.repeat(32),
    deviceId: 'device-a',
    operation: { action: 'stop-route', kind: 'lan' },
  } satisfies import('../../core/src/devices/connection-operation.js').PendingConnection;
  sources.setPendingConnection('a', client, first);
  let answer: ((value: Awaited<ReturnType<HostClient['api']>>) => void) | undefined;
  vi.spyOn(client, 'api').mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const reading = manageConnections(sources, { action: 'read-operation', hostId: 'a' }, request());
  await vi.waitFor(() => expect(answer).toBeDefined());
  const second = { ...first, generation: crypto.randomUUID() };
  sources.setPendingConnection('a', client, second, first.generation);
  answer?.({
    status: 200,
    body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'off' } },
  });
  await expect(reading).rejects.toThrow('connection-operation-changed');
  expect(sources.getSnapshot().hosts[0]!.host.pendingConnection?.generation).toBe(
    second.generation,
  );
});

it('releases only a matching guard after an explicit owner pre-write refusal', async () => {
  const { sources } = fixture();
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) =>
    path === '/api/botharness/devices'
      ? {
          status: 200,
          body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
        }
      : { status: 400, body: { code: 'confirm-required' } },
  );
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-management-refused');
  expect(sources.getSnapshot().hosts[0]!.host.pendingConnection).toBeUndefined();
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

it('retains Host content identity when execution-state storage is unreadable and explicitly recovers it', async () => {
  const { storage, lock } = fixture();
  storage.setItem('botharness.remoteHosts.operations.v1', 'invalid json');
  const sources = createRemoteHosts({
    storage,
    carrier: new FakeHost().carrier,
    connectionOperationLock: lock,
  });
  expect(sources.getSnapshot().hosts.map((entry) => entry.host.hostId)).toEqual(['a', 'b']);
  expect(sources.getSnapshot().hosts[0]!.host.connectionOperationUnavailable).toBe(true);
  const api = vi.spyOn(sources.client('a')!, 'api').mockResolvedValue({
    status: 200,
    body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
  });
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-operation-storage-unavailable');
  expect(api).not.toHaveBeenCalled();
  storage.removeItem('botharness.remoteHosts.operations.v1');
  await expect(
    manageConnections(sources, { action: 'read-operation', hostId: 'a' }, request()),
  ).resolves.toMatchObject({ outcome: 'none' });
  expect(sources.getSnapshot().hosts[0]!.host.connectionOperationUnavailable).toBeUndefined();
});

it('refuses new writes at the unresolved-fact limit without pruning old outcomes', async () => {
  const { sources, storage } = fixture();
  const index = Array.from({ length: 32 }, (_, n) => ({
    hostId: `older-host-${n}`,
    key: `unresolved-${n}`,
  }));
  for (const item of index)
    storage.setItem(
      item.key,
      JSON.stringify({
        generation: crypto.randomUUID(),
        hostKey: '11'.repeat(32),
        deviceId: 'previous',
        operation: { action: 'sign-out' },
      }),
    );
  storage.setItem('botharness.remoteHosts.operations.v1', JSON.stringify(index));
  const api = vi.spyOn(sources.client('a')!, 'api').mockResolvedValue({
    status: 200,
    body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
  });
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-operation-limit');
  expect(api).toHaveBeenCalledTimes(1);
  expect(JSON.parse(storage.getItem('botharness.remoteHosts.operations.v1')!)).toHaveLength(32);
  expect(index.every((item) => storage.getItem(item.key) !== null)).toBe(true);
});

it('refuses offline writes even if a separate owner inspection can still return loaded state', async () => {
  const { sources } = fixture();
  const client = sources.client('a')!;
  vi.spyOn(client, 'getSnapshot').mockReturnValue({
    connection: {
      status: 'unreachable',
      route: 'http://127.0.0.1:47001',
      attempt: 1,
      reason: 'offline',
    },
  });
  const api = vi.spyOn(client, 'api').mockResolvedValue({
    status: 200,
    body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
  });
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', hostId: 'a', kind: 'lan', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-host-offline');
  expect(api).toHaveBeenCalledTimes(1);
  expect(api.mock.calls[0]?.[1]?.body).toBeUndefined();
});

it('reports only public origins in a handover plan, excluding URL credentials and query values', async () => {
  const active = 'https://active.trycloudflare.com';
  const { sources } = fixture([
    active,
    'https://user:private-fixture@other.ts.net/path?ticket=private-fixture',
  ]);
  vi.spyOn(sources.client('a')!, 'api').mockResolvedValue({
    status: 200,
    body: {
      host: { id: 'a', name: 'Studio' },
      devices: [],
      privateRoutes: [{ id: 'quick', origin: active, state: 'connected' }],
    },
  });
  const result = await manageConnections(
    sources,
    {
      action: 'plan-operation',
      hostId: 'a',
      operation: { action: 'stop-route', kind: 'private-tunnel', routeId: 'quick' },
    },
    request(),
  );
  expect(result).toMatchObject({ alternatives: ['https://other.ts.net'] });
  expect(JSON.stringify(result)).not.toContain('private-fixture');
  expect(JSON.stringify(result)).not.toContain('ticket');
});

it.each(['stop-route', 'sign-out'])(
  'blocks a new grant from repeating an older unknown %s until canonical readback',
  async (action) => {
    const { sources, storage, lock } = fixture();
    const operation: ConnectionMutation =
      action === 'stop-route' ? { action: 'stop-route', kind: 'lan' } : { action: 'sign-out' };
    sources.setPendingConnection('a', sources.client('a')!, {
      generation: crypto.randomUUID(),
      hostKey: '11'.repeat(32),
      deviceId: 'device-a',
      operation,
    });
    storage.setItem(
      REMOTE_HOSTS_STORAGE_KEY,
      JSON.stringify([{ ...saved('a'), deviceId: 'new-grant' }, saved('b')]),
    );
    const fresh = createRemoteHosts({
      storage,
      carrier: new FakeHost().carrier,
      connectionOperationLock: lock,
    });
    const client = fresh.client('a')!;
    vi.spyOn(client, 'getSnapshot').mockReturnValue({
      connection: { status: 'connected', route: 'http://127.0.0.1:47001' },
    });
    let completed = false;
    let writes = 0;
    vi.spyOn(client, 'api').mockImplementation(async (path) => {
      if (path !== '/api/botharness/devices') {
        writes++;
        return { status: 200, body: { ok: true } };
      }
      return {
        status: 200,
        body: {
          host: { id: 'a', name: 'Studio' },
          devices: [{ id: 'another-test-device', name: 'Another test device' }],
          lan: { state: completed ? 'off' : 'listening' },
          connect: { account: { state: completed ? 'signed-out' : 'signed-in' } },
        },
      };
    });
    const repeat = () =>
      manageConnections(fresh, { ...operation, hostId: 'a', confirm: true }, request());
    await expect(repeat()).rejects.toThrow('connection-management-unconfirmed');
    await expect(
      manageConnections(fresh, { action: 'read-previous-operation', hostId: 'a' }, request()),
    ).resolves.toMatchObject({ outcome: 'unknown' });
    await expect(repeat()).rejects.toThrow('connection-management-unconfirmed');
    expect(writes).toBe(0);
    completed = true;
    await expect(
      manageConnections(fresh, { action: 'read-previous-operation', hostId: 'a' }, request()),
    ).resolves.toMatchObject({ outcome: 'completed' });
    expect(fresh.getSnapshot().hosts[0]!.host.connectionOwnerChanged).toBeUndefined();
    await manageConnections(
      fresh,
      { action: 'revoke-device', hostId: 'a', deviceId: 'another-test-device', confirm: true },
      request(),
    );
    expect(writes).toBe(1);
  },
);

it.each(['success', 'wrong-owner', 'route-changed'])(
  'verifies handover ordering and refuses stale owner/route before writing (%s)',
  async (mode) => {
    const active = 'https://active.trycloudflare.com';
    const alternate = 'https://other.ts.net';
    const { sources } = fixture([active, alternate]);
    const client = sources.client('a')!;
    let currentRoute = active;
    let preference: string | undefined;
    let activeObserved = false;
    const steps: string[] = [];
    vi.spyOn(client, 'getSnapshot').mockImplementation(() => {
      if (currentRoute === alternate && !activeObserved) {
        activeObserved = true;
        steps.push('active');
      }
      return {
        connection: { status: 'connected', route: currentRoute },
        ...(preference === undefined ? {} : { routePreference: preference }),
      };
    });
    sources.setPendingConnection('a', client, undefined);
    vi.spyOn(client, 'testRoute').mockImplementation(async () => {
      steps.push('verify');
      return true;
    });
    vi.spyOn(client, 'setRoutePreference').mockImplementation(async (route) => {
      steps.push('select');
      preference = route;
      currentRoute = route ?? active;
    });
    let reads = 0;
    const api = vi.spyOn(client, 'api').mockImplementation(async (path) => {
      if (path !== '/api/botharness/devices') {
        steps.push('post');
        return { status: 200, body: { ok: true } };
      }
      reads++;
      steps.push(`inspect-${reads}`);
      if (reads === 2 && mode === 'route-changed') currentRoute = active;
      return {
        status: 200,
        body: {
          host: { id: reads === 2 && mode === 'wrong-owner' ? 'b' : 'a', name: 'Studio' },
          devices: [],
          privateRoutes: [{ id: 'quick', origin: active, state: 'connected' }],
        },
      };
    });
    const result = manageConnections(
      sources,
      {
        action: 'stop-route',
        hostId: 'a',
        kind: 'private-tunnel',
        routeId: 'quick',
        confirm: true,
        handover: alternate,
      },
      request(),
    );
    if (mode === 'success') {
      await expect(result).resolves.toMatchObject({ accepted: true });
      expect(steps).toEqual(['inspect-1', 'verify', 'select', 'active', 'inspect-2', 'post']);
    } else {
      await expect(result).rejects.toThrow(
        mode === 'wrong-owner' ? 'connection-host-mismatch' : 'connection-handover-unconfirmed',
      );
      expect(api.mock.calls.every(([, init]) => init?.body === undefined)).toBe(true);
    }
  },
);

it('persists selection only for the selected browser Host and restores it through its existing store', async () => {
  const { sources, values, storage } = fixture();
  await manageConnections(
    sources,
    {
      action: 'select-route',
      hostId: 'a',
      route: 'http://127.0.0.1:47001',
      confirm: true,
    },
    request(),
  );
  const records = JSON.parse(values.get(REMOTE_HOSTS_STORAGE_KEY)!);
  expect(records.find((host: SavedHost) => host.hostId === 'a').routePreference).toBe(
    'http://127.0.0.1:47001',
  );
  expect(records.find((host: SavedHost) => host.hostId === 'b').routePreference).toBeUndefined();
  const restored = createRemoteHosts({ storage, carrier: new FakeHost().carrier });
  expect(restored.client('a')!.getSnapshot().routePreference).toBe('http://127.0.0.1:47001');
  await manageConnections(
    sources,
    { action: 'select-route', hostId: 'a', route: 'automatic', confirm: true },
    request(),
  );
  expect(sources.client('a')!.getSnapshot().routePreference).toBeUndefined();
  expect(JSON.parse(values.get(REMOTE_HOSTS_STORAGE_KEY)!)[0].routePreference).toBeUndefined();
});

it('keeps the prior browser policy when canonical persistence fails', async () => {
  const { sources, storage } = fixture();
  vi.spyOn(storage, 'setItem').mockImplementation(() => {
    throw Error('disk full');
  });
  await expect(
    manageConnections(
      sources,
      {
        action: 'select-route',
        hostId: 'a',
        route: 'http://127.0.0.1:47001',
        confirm: true,
      },
      request(),
    ),
  ).rejects.toThrow('connection-preference-not-saved');
  expect(sources.client('a')!.getSnapshot().routePreference).toBeUndefined();
  expect(sources.getSnapshot().hosts[0]!.host.routePreference).toBeUndefined();
});
