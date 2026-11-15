import { expect, it, vi } from 'vitest';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import type { SavedHost } from '../../../apps/mobile/src/host/hosts.js';
import type { HostClient } from '../../../apps/mobile/src/host/client.js';
import type { ConnectionMutation } from '../../core/src/devices/connection-operation.js';
import {
  connectionMutationSchema,
  connectionOperationIndexSchema,
  pendingConnectionSchema,
} from '../../core/src/devices/connection-operation.js';
import { withRemoteHostCredentialWrite } from '../src/client/remote-host-storage-lock.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
} from '../../core/src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../../core/src/database/schema-plan.js';
import { createDevicePairing } from '../../core/src/devices/pairing.js';
import { createDevicesHttp } from '../../core/src/devices/http.js';
import { createPrivateTunnel } from '../../core/src/devices/private-tunnel.js';
import { detectPhoneRoutes } from '../../core/src/devices/routes.js';
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
function acknowledgement(path: string, input: unknown) {
  const body = typeof input === 'object' && input !== null ? input : {};
  if (path.endsWith('/revoke'))
    return {
      revoked: true,
      closedStreams: 0,
      device: { id: 'deviceId' in body ? body.deviceId : undefined, name: 'Browser' },
    };
  if (path.endsWith('/private-tunnel'))
    return {
      ok: true,
      status: { state: 'off' },
      routeId: 'routeId' in body ? body.routeId : undefined,
      expectedRevision: 'expectedRevision' in body ? body.expectedRevision : undefined,
    };
  return { state: path.endsWith('/lan') ? 'off' : 'signed-out' };
}
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

it('binds the preview revision through confirmation instead of adopting a replacement configuration', async () => {
  const { sources } = fixture();
  let revision = 'configuration-a';
  const post = vi.fn();
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path, input) => {
    if (path === '/api/botharness/devices')
      return {
        status: 200,
        body: {
          host: { id: 'a', name: 'Host' },
          devices: [],
          privateRoutes: [
            { id: 'custom', state: 'connected', origin: 'https://private.example.com', revision },
          ],
        },
      };
    post(input?.body);
    return {
      status: 200,
      body: { ok: true, routeId: 'custom', expectedRevision: revision, status: { state: 'off' } },
    };
  });
  const operation = { action: 'stop-route', kind: 'private-tunnel', routeId: 'custom' };
  await expect(
    manageConnections(sources, { action: 'plan-operation', hostId: 'a', operation }, request()),
  ).resolves.toMatchObject({ expectedRevision: 'configuration-a' });
  revision = 'configuration-b';
  await expect(
    manageConnections(
      sources,
      { ...operation, hostId: 'a', expectedRevision: 'configuration-a', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-route-changed');
  expect(post).not.toHaveBeenCalled();
  expect(sources.getSnapshot().hosts[0]?.host.pendingConnection).toBeUndefined();
  sources.close();
});

it.each([undefined, 'configuration-a', 'configuration-b'])(
  'resolves an off private route only for the exact journal revision %s',
  async (expectedRevision) => {
    const { sources } = fixture();
    const client = sources.client('a')!;
    const operation = {
      action: 'stop-route' as const,
      kind: 'private-tunnel' as const,
      routeId: 'custom' as const,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    };
    const pending = {
      generation: crypto.randomUUID(),
      hostKey: '11'.repeat(32),
      deviceId: 'device-a',
      operation,
    };
    sources.setPendingConnection('a', client, pending);
    vi.spyOn(client, 'api').mockResolvedValue({
      status: 200,
      body: {
        host: { id: 'a', name: 'Host' },
        devices: [],
        privateRoutes: [{ id: 'custom', state: 'off', revision: 'configuration-b' }],
      },
    });
    const completed = expectedRevision === 'configuration-b';
    await expect(
      manageConnections(sources, { action: 'read-operation', hostId: 'a' }, request()),
    ).resolves.toMatchObject({ outcome: completed ? 'completed' : 'unknown' });
    expect(sources.getSnapshot().hosts[0]?.host.pendingConnection?.generation).toBe(
      completed ? undefined : pending.generation,
    );
    sources.close();
  },
);

it('requires an identity-bound private stop ACK and preserves unknown on a mismatched ACK', async () => {
  const { sources } = fixture();
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path, input) => {
    if (path === '/api/botharness/devices')
      return {
        status: 200,
        body: {
          host: { id: 'a', name: 'Host' },
          devices: [],
          privateRoutes: [
            {
              id: 'custom',
              state: 'connected',
              origin: 'https://private.example.com',
              revision: 'configuration-a',
            },
          ],
        },
      };
    expect(input?.body).toMatchObject({ expectedRevision: 'configuration-a' });
    return {
      status: 200,
      body: {
        ok: true,
        routeId: 'custom',
        expectedRevision: 'configuration-b',
        status: { state: 'off' },
      },
    };
  });
  await expect(
    manageConnections(
      sources,
      {
        action: 'stop-route',
        kind: 'private-tunnel',
        routeId: 'custom',
        hostId: 'a',
        confirm: true,
        expectedRevision: 'configuration-a',
      },
      request(),
    ),
  ).rejects.toThrow('connection-management-unconfirmed');
  expect(sources.getSnapshot().hosts[0]?.host.pendingConnection?.operation).toMatchObject({
    expectedRevision: 'configuration-a',
  });
  sources.close();
});

it.each(['credential-wait', 'handover'])(
  'keeps the original revision across %s and lets the Host CAS reject a late replacement',
  async (stage) => {
    type Credentials = NonNullable<
      ReturnType<Parameters<typeof createPrivateTunnel>[0]['credentials']>
    >;
    const records = new Map<string, Awaited<ReturnType<Credentials['readRecord']>>>();
    const owner = createPrivateTunnel({
      port: () => 1,
      credentials: () => ({
        readRecord: async (key) => records.get(key),
        modifyRecord: async (key, mutate) => {
          const record = await mutate(records.get(key));
          if (record) records.set(key, record);
          else records.delete(key);
          return record;
        },
        deleteRecord: async (key) => {
          records.delete(key);
        },
      }),
    });
    await owner.add({ mode: 'ingress', origin: 'https://private.example.com' });
    const expectedRevision = owner.statuses()[0]!.revision;
    const lan = 'http://127.0.0.1:47001';
    const { sources, storage } = fixture(
      stage === 'handover' ? ['https://private.example.com', lan] : [lan],
    );
    const database = trackTestOwner(
      mountOperationalDatabase({
        dshHome: createTempRoot('connection-private-cas-'),
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      }),
    );
    const pairing = createDevicePairing({
      database: attachOperationalModule(database, 'device-pairing'),
      hostName: 'CAS target',
    });
    const http = createDevicesHttp({
      pairing,
      privateTunnel: owner,
      routes: () => detectPhoneRoutes({ port: 4100, run: async () => '' }),
    });
    const client = sources.client('a')!;
    let route = stage === 'handover' ? 'https://private.example.com' : lan;
    let preference: string | undefined;
    vi.spyOn(client, 'getSnapshot').mockImplementation(() => ({
      connection: { status: 'connected', route },
      ...(preference === undefined ? {} : { routePreference: preference }),
    }));
    vi.spyOn(client, 'testRoute').mockResolvedValue(true);
    vi.spyOn(client, 'setRoutePreference').mockImplementation(async (next) => {
      route = next ?? route;
      preference = next;
      await owner.replace('custom', { mode: 'ingress', origin: 'https://replacement.example.com' });
    });
    let release!: () => void;
    let queued: Promise<unknown> | undefined;
    let posts = 0;
    vi.spyOn(client, 'api').mockImplementation(async (path, input) => {
      if (path === '/api/botharness/devices') {
        const body = {
          host: { id: 'a', name: 'Host' },
          devices: [],
          privateRoutes: owner.statuses(),
        };
        if (stage === 'credential-wait')
          queued = withRemoteHostCredentialWrite({
            storage,
            run: () =>
              new Promise<void>((resolve) => {
                release = resolve;
              }),
          });
        return { status: 200, body };
      }
      posts++;
      expect(input?.body).toMatchObject({ expectedRevision });
      const response = await http(
        new Request(`http://localhost${path}`, {
          method: 'POST',
          body: JSON.stringify(input?.body),
        }),
      );
      return { status: response.status, body: await response.json() };
    });
    try {
      const operation = manageConnections(
        sources,
        {
          action: 'stop-route',
          kind: 'private-tunnel',
          routeId: 'custom',
          hostId: 'a',
          confirm: true,
          expectedRevision,
          ...(stage === 'handover' ? { handover: lan } : {}),
        },
        request(),
      );
      const check = expect(operation).rejects.toThrow(
        stage === 'handover' ? 'connection-route-changed' : 'connection-management-refused',
      );
      if (stage === 'credential-wait') {
        await vi.waitFor(() => expect(release).toBeDefined());
        await owner.replace('custom', {
          mode: 'ingress',
          origin: 'https://replacement.example.com',
        });
        release();
        await queued;
      }
      await check;
      expect(posts).toBe(stage === 'handover' ? 0 : 1);
      expect(owner.statuses()[0]).toMatchObject({
        enabled: true,
        origin: 'https://replacement.example.com',
      });
      expect(sources.getSnapshot().hosts[0]?.host.pendingConnection).toBeUndefined();
    } finally {
      sources.close();
      await owner.close();
    }
  },
);

it('review: resolves a public origin back to the exact saved route for test, selection and handover', async () => {
  const active = 'https://active.trycloudflare.com';
  const alternate = 'https://OTHER.ts.net/';
  const { sources } = fixture([active, alternate]);
  const client = sources.client('a')!;
  let route = active;
  let preference: string | undefined;
  vi.spyOn(client, 'getSnapshot').mockImplementation(() => ({
    connection: { status: 'connected', route },
    ...(preference === undefined ? {} : { routePreference: preference }),
  }));
  const test = vi
    .spyOn(client, 'testRoute')
    .mockImplementation(async (value) => value === alternate);
  const select = vi.spyOn(client, 'setRoutePreference').mockImplementation(async (value) => {
    if (value !== active && value !== alternate) throw Error('connection-route-unknown');
    route = value;
    preference = value;
  });
  vi.spyOn(client, 'api').mockImplementation(async (path) => ({
    status: 200,
    body:
      path === '/api/botharness/devices'
        ? {
            host: { id: 'a', name: 'Studio' },
            devices: [],
            privateRoutes: [
              { id: 'quick', revision: 'quick-revision', origin: active, state: 'connected' },
            ],
          }
        : {
            ok: true,
            status: { state: 'off' },
            routeId: 'quick',
            expectedRevision: 'quick-revision',
          },
  }));
  const operation = {
    action: 'stop-route',
    kind: 'private-tunnel',
    routeId: 'quick',
    expectedRevision: 'quick-revision',
  };
  await expect(
    manageConnections(sources, { action: 'plan-operation', hostId: 'a', operation }, request()),
  ).resolves.toMatchObject({ alternatives: ['https://other.ts.net'] });
  await expect(
    manageConnections(
      sources,
      { action: 'test-route', hostId: 'a', route: 'https://other.ts.net' },
      request(),
    ),
  ).resolves.toMatchObject({ verified: true });
  await manageConnections(
    sources,
    { action: 'select-route', hostId: 'a', route: 'https://other.ts.net', confirm: true },
    request(),
  );
  expect(test).toHaveBeenCalledWith(alternate);
  expect(select).toHaveBeenLastCalledWith(alternate);
  route = active;
  await expect(
    manageConnections(
      sources,
      { ...operation, hostId: 'a', handover: 'https://other.ts.net', confirm: true },
      request(),
    ),
  ).resolves.toMatchObject({ accepted: true });
  expect(test).toHaveBeenLastCalledWith(alternate);
  expect(select).toHaveBeenLastCalledWith(alternate);
});

it.each([
  { action: 'revoke-device', deviceId: 'phone' },
  { action: 'stop-route', kind: 'lan' },
  {
    action: 'stop-route',
    kind: 'private-tunnel',
    routeId: 'quick',
    expectedRevision: 'quick-revision',
  },
  { action: 'sign-out' },
])('review: retains an unknown $action result for a non-contract 200 reply', async (operation) => {
  for (const reply of ['<html>login</html>', {}, { ok: true }]) {
    const { sources } = fixture();
    let writes = 0;
    vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) => {
      if (path === '/api/botharness/devices')
        return {
          status: 200,
          body: {
            host: { id: 'a', name: 'Studio' },
            devices: [{ id: 'phone', name: 'Phone' }],
            lan: { state: 'listening' },
            privateRoutes: [{ id: 'quick', revision: 'quick-revision', state: 'connected' }],
            connect: { account: { state: 'signed-in' } },
          },
        };
      writes++;
      return { status: 200, body: reply };
    });
    const input = { ...operation, hostId: 'a', confirm: true, confirmDisconnect: true };
    await expect(manageConnections(sources, input, request())).rejects.toThrow(
      'connection-management-unconfirmed',
    );
    expect(sources.getSnapshot().hosts[0]?.host.pendingConnection).toBeDefined();
    await expect(manageConnections(sources, input, request())).rejects.toThrow(
      'connection-management-unconfirmed',
    );
    expect(writes).toBe(1);
    sources.close();
  }
});

it('review: an older Client managing another Host cannot strip a new inline unknown record', () => {
  const { sources, storage } = fixture();
  const pending = {
    generation: crypto.randomUUID(),
    hostKey: '11'.repeat(32),
    deviceId: 'device-b',
    operation: { action: 'sign-out' as const },
  };
  sources.setPendingConnection('b', sources.client('b')!, pending);
  const before = storage.getItem('botharness.remoteHosts.operations.v1');
  const write = vi.spyOn(storage, 'setItem');
  const oldClientPrepareA = () => {
    const index = connectionOperationIndexSchema.parse(
      JSON.parse(storage.getItem('botharness.remoteHosts.operations.v1')!),
    );
    const key = `botharness.remoteHosts.operation.v1:${JSON.stringify(['a', '11'.repeat(32), 'device-a'])}`;
    storage.setItem(
      'botharness.remoteHosts.operations.v1',
      JSON.stringify([...index, { hostId: 'a', key }]),
    );
    storage.setItem(key, JSON.stringify({ ...pending, deviceId: 'device-a' }));
  };
  expect(oldClientPrepareA).toThrow();
  expect(write).not.toHaveBeenCalled();
  expect(storage.getItem('botharness.remoteHosts.operations.v1')).toBe(before);
  const restored = createRemoteHosts({ storage, carrier: new FakeHost().carrier });
  expect(
    restored.getSnapshot().hosts.find((host) => host.host.hostId === 'b')?.host.pendingConnection,
  ).toEqual(pending);
  restored.close();
  sources.close();
});

it('prevents the old153 cross-Host index writer from stripping a new pending revision', () => {
  const { sources, storage } = fixture();
  const pending = {
    generation: crypto.randomUUID(),
    hostKey: '11'.repeat(32),
    deviceId: 'device-b',
    operation: {
      action: 'stop-route' as const,
      kind: 'private-tunnel' as const,
      routeId: 'custom' as const,
      expectedRevision: 'configuration-a',
    },
  };
  sources.setPendingConnection('b', sources.client('b')!, pending);
  const before = storage.getItem('botharness.remoteHosts.operations.v1')!;
  const oldMutation = connectionMutationSchema.options[1].omit({ expectedRevision: true });
  const oldPending = pendingConnectionSchema.extend({ operation: oldMutation });
  const oldEntries = connectionOperationIndexSchema.element
    .extend({ record: oldPending.nullable().optional() })
    .array()
    .max(32);
  const oldRead = (raw: string) => {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) return oldEntries.parse(value);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('version' in value) ||
      value.version !== 2 ||
      !('entries' in value)
    )
      throw new Error('connection-operation-storage-unavailable');
    return oldEntries.parse(value.entries);
  };
  const downgrade = { ...JSON.parse(before), version: 2 };
  expect(oldRead(JSON.stringify(downgrade))[0]?.record?.operation).not.toHaveProperty(
    'expectedRevision',
  );
  const write = vi.spyOn(storage, 'setItem');
  const oldPrepareA = () => {
    const index = oldRead(storage.getItem('botharness.remoteHosts.operations.v1')!);
    storage.setItem(
      'botharness.remoteHosts.operations.v1',
      JSON.stringify({
        version: 2,
        entries: [
          ...index,
          {
            hostId: 'a',
            key: `botharness.remoteHosts.operation.v1:${JSON.stringify(['a', '11'.repeat(32), 'device-a'])}`,
          },
        ],
      }),
    );
  };
  expect(oldPrepareA).toThrow('connection-operation-storage-unavailable');
  expect(write).not.toHaveBeenCalled();
  expect(storage.getItem('botharness.remoteHosts.operations.v1')).toBe(before);
  const restored = createRemoteHosts({ storage, carrier: new FakeHost().carrier });
  expect(
    restored.getSnapshot().hosts.find((entry) => entry.host.hostId === 'b')?.host.pendingConnection,
  ).toEqual(pending);
  sources.setPendingConnection('b', sources.client('b')!, undefined, pending.generation);
  expect(oldRead(storage.getItem('botharness.remoteHosts.operations.v1')!)).toEqual([]);
  restored.close();
  sources.close();
});

it('reads an existing version2 pending without inventing identity and upgrades the next write to version3', () => {
  const { sources, storage } = fixture();
  const legacy = {
    generation: crypto.randomUUID(),
    hostKey: '11'.repeat(32),
    deviceId: 'device-b',
    operation: {
      action: 'stop-route' as const,
      kind: 'private-tunnel' as const,
      routeId: 'custom' as const,
    },
  };
  sources.setPendingConnection('b', sources.client('b')!, legacy);
  const document = JSON.parse(storage.getItem('botharness.remoteHosts.operations.v1')!);
  storage.setItem(
    'botharness.remoteHosts.operations.v1',
    JSON.stringify({ ...document, version: 2 }),
  );
  const restored = createRemoteHosts({ storage, carrier: new FakeHost().carrier });
  expect(
    restored.getSnapshot().hosts.find((entry) => entry.host.hostId === 'b')?.host.pendingConnection,
  ).toEqual(legacy);
  sources.setPendingConnection('a', sources.client('a')!, {
    ...legacy,
    deviceId: 'device-a',
    operation: { action: 'sign-out' },
  });
  expect(JSON.parse(storage.getItem('botharness.remoteHosts.operations.v1')!).version).toBe(3);
  expect(
    sources.getSnapshot().hosts.find((entry) => entry.host.hostId === 'b')?.host.pendingConnection,
  ).toEqual(legacy);
  restored.close();
  sources.close();
});

it.each(['before-lock', 'inspect', 'handover', 'missing', 'unreadable'] as const)(
  'review: refuses stale persisted ownership without a storage event (%s)',
  async (stage) => {
    const active = 'https://active.trycloudflare.com';
    const alternate = 'https://other.ts.net';
    const { sources, storage } = fixture([active, alternate]);
    const client = sources.client('a')!;
    const replace = async () => {
      if (stage === 'unreadable') {
        vi.spyOn(storage, 'getItem').mockImplementation(() => {
          throw Error('storage unavailable');
        });
      } else
        await withRemoteHostCredentialWrite({
          storage,
          run: () =>
            storage.setItem(
              REMOTE_HOSTS_STORAGE_KEY,
              JSON.stringify(
                stage === 'missing'
                  ? [saved('b')]
                  : [
                      { ...saved('a'), deviceId: 'replacement', credential: 'replacement.secret' },
                      saved('b'),
                    ],
              ),
            ),
        });
    };
    let current = active;
    vi.spyOn(client, 'getSnapshot').mockImplementation(() => ({
      connection: { status: 'connected', route: current },
      routePreference: current,
    }));
    vi.spyOn(client, 'testRoute').mockImplementation(async () => {
      await replace();
      return true;
    });
    vi.spyOn(client, 'setRoutePreference').mockImplementation(async (value) => {
      current = value ?? active;
    });
    let writes = 0;
    const api = vi.spyOn(client, 'api').mockImplementation(async (path) => {
      if (path !== '/api/botharness/devices') {
        writes++;
        return { status: 200, body: { state: 'off' } };
      }
      if (stage !== 'before-lock' && stage !== 'handover') await replace();
      return {
        status: 200,
        body: {
          host: { id: 'a', name: 'Studio' },
          devices: [],
          lan: { state: 'listening' },
          privateRoutes: [
            { id: 'quick', revision: 'quick-revision', origin: active, state: 'connected' },
          ],
        },
      };
    });
    if (stage === 'before-lock') await replace();
    await expect(
      manageConnections(
        sources,
        stage === 'handover'
          ? {
              action: 'stop-route',
              kind: 'private-tunnel',
              routeId: 'quick',
              expectedRevision: 'quick-revision',
              hostId: 'a',
              confirm: true,
              handover: alternate,
            }
          : { action: 'stop-route', kind: 'lan', hostId: 'a', confirm: true },
        request(),
      ),
    ).rejects.toThrow(
      stage === 'unreadable'
        ? 'connection-operation-storage-unavailable'
        : 'connection-host-changed',
    );
    expect(writes).toBe(0);
    if (stage === 'before-lock') expect(api).not.toHaveBeenCalled();
    sources.close();
  },
);

it('review: recovers a failed second guard write before dispatch without replay or an indexed-missing trap', async () => {
  const { sources, storage } = fixture();
  const set = storage.setItem.bind(storage);
  let failed = false;
  vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
    if (key.startsWith('botharness.remoteHosts.operation.v1:') && !failed) {
      failed = true;
      throw Error('single storage failure');
    }
    set(key, value);
  });
  let writes = 0;
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) =>
    path === '/api/botharness/devices'
      ? {
          status: 200,
          body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
        }
      : (writes++, { status: 200, body: { state: 'off' } }),
  );
  const input = { action: 'stop-route', kind: 'lan', hostId: 'a', confirm: true };
  const first = manageConnections(sources, input, request());
  await first.catch(() => {});
  const before = writes;
  if (failed) expect(before).toBe(0);
  await expect(manageConnections(sources, input, request())).resolves.toMatchObject({
    accepted: true,
  });
  expect(writes).toBe(before + 1);
  sources.close();
});

it('review: a failed atomic prepare leaves no guard and a later explicit execution can proceed', async () => {
  const { sources, storage } = fixture();
  const set = storage.setItem.bind(storage);
  let fail = true;
  vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
    if (key === 'botharness.remoteHosts.operations.v1' && fail) {
      fail = false;
      throw Error('single prepare failure');
    }
    set(key, value);
  });
  let writes = 0;
  vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) =>
    path === '/api/botharness/devices'
      ? {
          status: 200,
          body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
        }
      : (writes++, { status: 200, body: { state: 'off' } }),
  );
  const input = { action: 'stop-route', kind: 'lan', hostId: 'a', confirm: true };
  await expect(manageConnections(sources, input, request())).rejects.toThrow(
    'connection-operation-storage-unavailable',
  );
  expect(writes).toBe(0);
  expect(storage.getItem('botharness.remoteHosts.operations.v1')).toBeNull();
  await expect(
    manageConnections(sources, { action: 'read-operation', hostId: 'a' }, request()),
  ).resolves.toMatchObject({ outcome: 'none' });
  await expect(manageConnections(sources, input, request())).resolves.toMatchObject({
    accepted: true,
  });
  expect(writes).toBe(1);
  sources.close();
});

it('review: preserves recoverable same-generation uncertainty when acknowledgement clear fails', async () => {
  const { sources, storage } = fixture();
  const set = storage.setItem.bind(storage);
  let writes = 0;
  let failed = false;
  vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
    if (writes && !failed) {
      failed = true;
      throw Error('single clear failure');
    }
    set(key, value);
  });
  const api = vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) =>
    path === '/api/botharness/devices'
      ? {
          status: 200,
          body: {
            host: { id: 'a', name: 'Studio' },
            devices: [],
            lan: { state: writes ? 'off' : 'listening' },
          },
        }
      : (writes++, { status: 200, body: { state: 'off' } }),
  );
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', kind: 'lan', hostId: 'a', confirm: true },
      request(),
    ),
  ).rejects.toThrow();
  const pending = sources.getSnapshot().hosts[0]?.host.pendingConnection;
  expect(pending?.generation).toEqual(expect.any(String));
  const restored = createRemoteHosts({
    storage,
    carrier: new FakeHost().carrier,
    connectionOperationLock: async (_name, run) => run(),
  });
  expect(restored.getSnapshot().hosts[0]?.host.pendingConnection).toEqual(pending);
  vi.spyOn(restored.client('a')!, 'api').mockImplementation(api.getMockImplementation()!);
  await expect(
    manageConnections(restored, { action: 'read-operation', hostId: 'a' }, request()),
  ).resolves.toMatchObject({ outcome: 'completed' });
  expect(restored.getSnapshot().hosts[0]?.host.pendingConnection).toBeUndefined();
  expect(
    connectionOperationIndexSchema.parse(
      JSON.parse(storage.getItem('botharness.remoteHosts.operations.v1')!),
    ),
  ).toEqual([]);
  expect(writes).toBe(1);
  restored.close();
  sources.close();
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

it.each(['remove', 'compact'] as const)(
  'review: legacy clear recovers a separate %s failure without losing unknown rows',
  async (fault) => {
    const { sources, storage } = fixture();
    const key = `botharness.remoteHosts.operation.v1:${JSON.stringify(['a', '11'.repeat(32), 'device-a'])}`;
    const pending = {
      generation: crypto.randomUUID(),
      hostKey: '11'.repeat(32),
      deviceId: 'device-a',
      operation: { action: 'stop-route', kind: 'lan' },
    };
    storage.setItem(key, JSON.stringify(pending));
    storage.setItem('botharness.remoteHosts.operations.v1', JSON.stringify([{ hostId: 'a', key }]));
    const remove = storage.removeItem.bind(storage);
    let failed = false;
    const set = storage.setItem.bind(storage);
    let indexWrites = 0;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (
        key === 'botharness.remoteHosts.operations.v1' &&
        ++indexWrites === 2 &&
        fault === 'compact'
      )
        throw Error('legacy compaction failure');
      set(key, value);
    });
    vi.spyOn(storage, 'removeItem').mockImplementation((value) => {
      if (value === key && !failed && fault === 'remove') {
        failed = true;
        throw Error('legacy cleanup failure');
      }
      remove(value);
    });
    let stopped = true;
    let writes = 0;
    vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) =>
      path === '/api/botharness/devices'
        ? {
            status: 200,
            body: {
              host: { id: 'a', name: 'Studio' },
              devices: [],
              lan: { state: stopped ? 'off' : 'listening' },
            },
          }
        : (writes++, { status: 200, body: { state: 'off' } }),
    );
    await expect(
      manageConnections(sources, { action: 'read-operation', hostId: 'a' }, request()),
    ).resolves.toMatchObject({ outcome: 'completed' });
    expect(storage.getItem(key)).toBe(fault === 'remove' ? JSON.stringify(pending) : null);
    expect(() =>
      connectionOperationIndexSchema.parse(
        JSON.parse(storage.getItem('botharness.remoteHosts.operations.v1')!),
      ),
    ).toThrow();
    expect(sources.getSnapshot().hosts[0]?.host.pendingConnection).toBeUndefined();
    const restored = createRemoteHosts({ storage, carrier: new FakeHost().carrier });
    expect(restored.getSnapshot().hosts[0]?.host.pendingConnection).toBeUndefined();
    await expect(
      manageConnections(sources, { action: 'read-operation', hostId: 'a' }, request()),
    ).resolves.toMatchObject({ outcome: 'none' });
    expect(
      connectionOperationIndexSchema.parse(
        JSON.parse(storage.getItem('botharness.remoteHosts.operations.v1')!),
      ),
    ).toEqual([]);
    stopped = false;
    await expect(
      manageConnections(
        sources,
        { action: 'stop-route', kind: 'lan', hostId: 'a', confirm: true },
        request(),
      ),
    ).resolves.toMatchObject({ accepted: true });
    expect(writes).toBe(1);
    expect(storage.getItem(key)).toBeNull();
    restored.close();
    sources.close();
  },
);

it.each([
  REMOTE_HOSTS_STORAGE_KEY,
  'botharness.remoteHosts.operation.v1:invalid',
  `botharness.remoteHosts.operation.v1:${JSON.stringify(['b', '11'.repeat(32), 'device-a'])}`,
  `botharness.remoteHosts.operation.v1:${JSON.stringify(['a', null, 'device-a'])}`,
])('review: refuses a corrupt completed-tombstone key before GC or dispatch (%s)', async (key) => {
  const { sources, storage } = fixture();
  const credentials = storage.getItem(REMOTE_HOSTS_STORAGE_KEY);
  const index = JSON.stringify([{ hostId: 'a', key, record: null }]);
  storage.setItem('botharness.remoteHosts.operations.v1', index);
  const remove = vi.spyOn(storage, 'removeItem');
  const api = vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path) =>
    path === '/api/botharness/devices'
      ? {
          status: 200,
          body: { host: { id: 'a', name: 'Studio' }, devices: [], lan: { state: 'listening' } },
        }
      : { status: 200, body: { state: 'off' } },
  );
  await expect(
    manageConnections(
      sources,
      { action: 'stop-route', kind: 'lan', hostId: 'a', confirm: true },
      request(),
    ),
  ).rejects.toThrow('connection-operation-storage-unavailable');
  expect(storage.getItem(REMOTE_HOSTS_STORAGE_KEY)).toBe(credentials);
  expect(storage.getItem('botharness.remoteHosts.operations.v1')).toBe(index);
  expect(remove).not.toHaveBeenCalled();
  expect(api).not.toHaveBeenCalled();
  sources.close();
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
  const api = vi.spyOn(sources.client('a')!, 'api').mockImplementation(async (path, init) => ({
    status: 200,
    body:
      path === '/api/botharness/devices'
        ? {
            host: { id: 'a', name: 'Studio' },
            devices: [{ id: 'phone', name: 'Independent phone' }],
            privateRoutes: [
              {
                id: 'quick',
                revision: 'quick-revision',
                origin: 'https://test.trycloudflare.com',
                state: 'connected',
              },
              { id: 'custom', origin: 'https://private.example.com', state: 'connected' },
            ],
          }
        : acknowledgement(path, init?.body),
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
    {
      action: 'stop-route',
      hostId: 'a',
      kind: 'private-tunnel',
      routeId: 'quick',
      expectedRevision: 'quick-revision',
      confirm: true,
    },
    request(),
  );
  expect(api).toHaveBeenLastCalledWith(
    '/api/botharness/devices/private-tunnel',
    expect.objectContaining({
      body: { action: 'stop', routeId: 'quick', expectedRevision: 'quick-revision', confirm: true },
    }),
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
      privateRoutes: [
        { id: 'quick', revision: 'quick-revision', origin: active, state: 'connected' },
      ],
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
        expectedRevision: 'quick-revision',
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
    key: `botharness.remoteHosts.operation.v1:${JSON.stringify([`older-host-${n}`, '11'.repeat(32), 'previous'])}`,
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
      privateRoutes: [
        { id: 'quick', revision: 'quick-revision', origin: active, state: 'connected' },
      ],
    },
  });
  const result = await manageConnections(
    sources,
    {
      action: 'plan-operation',
      hostId: 'a',
      operation: {
        action: 'stop-route',
        kind: 'private-tunnel',
        routeId: 'quick',
        expectedRevision: 'quick-revision',
      },
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
    vi.spyOn(client, 'api').mockImplementation(async (path, init) => {
      if (path !== '/api/botharness/devices') {
        writes++;
        return { status: 200, body: acknowledgement(path, init?.body) };
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
    const api = vi.spyOn(client, 'api').mockImplementation(async (path, init) => {
      if (path !== '/api/botharness/devices') {
        steps.push('post');
        return { status: 200, body: acknowledgement(path, init?.body) };
      }
      reads++;
      steps.push(`inspect-${reads}`);
      if (reads === 2 && mode === 'route-changed') currentRoute = active;
      return {
        status: 200,
        body: {
          host: { id: reads === 2 && mode === 'wrong-owner' ? 'b' : 'a', name: 'Studio' },
          devices: [],
          privateRoutes: [
            { id: 'quick', revision: 'quick-revision', origin: active, state: 'connected' },
          ],
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
        expectedRevision: 'quick-revision',
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
