import { acknowledgement, fixture, request, saved } from './connection-management-fixtures.js';
import { expect, it, vi } from 'vitest';
import { FakeHost } from '../../host-client/test/fake-host.js';
import type { SavedHost } from '@botharness/host-client/hosts';
import type { ConnectionMutation } from '../../core/src/devices/connection-operation.js';
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
import { createRemoteHosts, REMOTE_HOSTS_STORAGE_KEY } from '../src/client/remote-hosts.js';
import { manageConnections } from '../src/client/connection-management.js';

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
