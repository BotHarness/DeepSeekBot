import { expect, it, vi } from 'vitest';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import type { SavedHost } from '../../../apps/mobile/src/host/hosts.js';
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
const fixture = () => {
  const values = new Map([[REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([saved('a'), saved('b')])]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const sources = createRemoteHosts({ storage, carrier: new FakeHost().carrier });
  return { sources, values, storage };
};

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
  expect(JSON.parse(values.get(REMOTE_HOSTS_STORAGE_KEY)!)).toHaveLength(1);
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
    { action: 'revoke-device', hostId: 'a', deviceId: 'device-a', confirm: true },
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
