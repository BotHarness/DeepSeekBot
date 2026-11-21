import { fixture, request, saved } from './connection-management-fixtures.js';
import { expect, it, vi } from 'vitest';
import { FakeHost } from '../../host-client/test/fake-host.js';
import type { HostClient } from '@botharness/host-client/client';
import {
  connectionMutationSchema,
  connectionOperationIndexSchema,
  pendingConnectionSchema,
} from '../../core/src/devices/connection-operation.js';
import { withRemoteHostCredentialWrite } from '../src/client/remote-host-storage-lock.js';
import { createRemoteHosts, REMOTE_HOSTS_STORAGE_KEY } from '../src/client/remote-hosts.js';
import { manageConnections } from '../src/client/connection-management.js';

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
