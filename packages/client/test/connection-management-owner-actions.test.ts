import { acknowledgement, fixture, request, saved } from './connection-management-fixtures.js';
import { expect, it, vi } from 'vitest';
import { FakeHost } from '../../host-client/test/fake-host.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
} from '../../core/src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../../core/src/database/schema-plan.js';
import { createDevicePairing } from '../../core/src/devices/pairing.js';
import { createDevicesHttp } from '../../core/src/devices/http.js';
import { createTempRoot, trackTestOwner } from '../../core/test/helpers.js';
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

it('review: validates a real owning HTTP revocation acknowledgement without an ok envelope', async () => {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('connection-ack-contract-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'Studio',
  });
  const browser = pairing.redeem({ offer: pairing.createOffer().offer, name: 'Browser' });
  const phone = pairing.redeem({ offer: pairing.createOffer().offer, name: 'Independent phone' });
  if (!browser.ok || !phone.ok) throw Error('pairing fixture failed');
  const hostId = pairing.host().id;
  const record = { ...saved(hostId), deviceId: browser.device.id, credential: browser.credential };
  const values = new Map([[REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([record])]]);
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
    connectionOperationLock: async (_name, run) => run(),
  });
  const client = sources.client(hostId)!;
  vi.spyOn(client, 'getSnapshot').mockReturnValue({
    connection: { status: 'connected', route: record.routes[0]! },
  });
  const http = createDevicesHttp({
    pairing,
    routes: async () => ({ routes: [], tailscale: 'missing', serveCommand: '' }),
  });
  vi.spyOn(client, 'api').mockImplementation(async (path, init) => {
    const response = await http(
      new Request(
        'http://fixture' + path,
        init?.body ? { method: 'POST', body: JSON.stringify(init.body) } : undefined,
      ),
    );
    return { status: response.status, body: await response.json() };
  });
  try {
    await expect(
      manageConnections(
        sources,
        { action: 'revoke-device', hostId, deviceId: phone.device.id, confirm: true },
        request(),
      ),
    ).resolves.toMatchObject({ accepted: true });
    expect(pairing.list().find((device) => device.id === phone.device.id)?.revokedAt).toEqual(
      expect.any(String),
    );
    expect(pairing.check(browser.device.id).ok).toBe(true);
    expect(sources.getSnapshot().hosts[0]?.host.pendingConnection).toBeUndefined();
  } finally {
    sources.close();
    owner.close();
  }
});

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
  const api = vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path, init) => ({
    status: 200,
    body:
      path === '/api/botharness/devices'
        ? {
            host: { id: 'a', name: 'Studio' },
            devices: [{ id: 'device-a', name: 'Browser' }],
            lan: { state: 'listening' },
            privateTunnel: { state: 'connected' },
          }
        : acknowledgement(path, init?.body),
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
