import { afterEach, expect, it, vi } from 'vitest';
import type { HostCarrier } from '../../../apps/mobile/src/host/carrier.js';
import * as enrollment from '../../core/src/devices/relationship-enrollment.js';
import * as pairing from '../../../apps/mobile/src/host/pairing.js';
import {
  createRemoteHosts,
  REMOTE_HOSTS_STORAGE_KEY,
  type HostStorage,
} from '../src/client/remote-hosts.js';
import { withRemoteHostStorageLock } from '../src/client/remote-host-storage-lock.js';

function memoryStorage(): HostStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
const carrier: HostCarrier = {
  request: async () => ({ status: 503, text: async () => '{}' }),
  openSocket(_url, events) {
    queueMicrotask(() => events.closed('test-offline'));
    return { send() {}, close() {} };
  },
};
const relationship = (id = 'b') => ({
  id: id.repeat(32),
  peer: {
    id,
    name: id.toUpperCase(),
    publicKey: 'ab'.repeat(32),
    routes: ['https://hbbbbbbbbbbbb.deepseekbot.dev'],
  },
});
function grant(
  id = 'b',
): Extract<Awaited<ReturnType<typeof enrollment.enrollRelationshipClient>>, { ok: true }> {
  return {
    ok: true,
    enrollmentPublicKey: 'ef'.repeat(32),
    host: {
      hostId: id,
      hostName: id.toUpperCase(),
      deviceId: `device-${id}`,
      credential: `device-${id}.synthetic`,
      relationshipId: id.repeat(32),
      relationshipEnrollment: { publicKey: 'ef'.repeat(32) },
      routes: ['https://hbbbbbbbbbbbb.deepseekbot.dev'],
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: 'ab'.repeat(32),
        deviceKey: 'cd'.repeat(32),
      },
    },
  };
}
const releases: (() => void)[] = [];
afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reuses one saved Client grant when two owners of the same storage enroll the same Host concurrently', async () => {
  const storage = memoryStorage();
  const first = createRemoteHosts({ storage, carrier });
  const second = createRemoteHosts({ storage, carrier });
  const issue = vi.spyOn(enrollment, 'enrollRelationshipClient').mockResolvedValue(grant());
  vi.spyOn(enrollment, 'commitRelationshipEnrollment').mockResolvedValue('committed');
  const results = await Promise.all(
    [first, second].map((source) =>
      source.enrollRelationship(relationship(), 'Desktop', undefined, {
        accountGeneration: 'test-generation',
      }),
    ),
  );
  expect(results.every((result) => result.ok)).toBe(true);
  expect(issue).toHaveBeenCalledTimes(1);
  expect(first.getSnapshot().hosts[0]?.host.credential).toBe(
    second.getSnapshot().hosts[0]?.host.credential,
  );
  expect(JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
});

it('fresh-merges simultaneous different-Host enrollments rather than overwriting another saved credential', async () => {
  const storage = memoryStorage();
  const first = createRemoteHosts({ storage, carrier });
  const second = createRemoteHosts({ storage, carrier });
  vi.spyOn(enrollment, 'enrollRelationshipClient').mockImplementation(async (options) =>
    grant(options.expectedPeer.id),
  );
  vi.spyOn(enrollment, 'commitRelationshipEnrollment').mockResolvedValue('committed');
  await Promise.all([
    first.enrollRelationship(relationship('b'), 'Desktop', undefined, {
      accountGeneration: 'test',
    }),
    second.enrollRelationship(relationship('c'), 'Desktop', undefined, {
      accountGeneration: 'test',
    }),
  ]);
  expect(
    createRemoteHosts({ storage, carrier })
      .getSnapshot()
      .hosts.map((item) => item.host.hostId)
      .sort(),
  ).toEqual(['b', 'c']);
});

it('cancels while the credential lock is queued without a late persist, commit or attachment', async () => {
  const storage = memoryStorage();
  const source = createRemoteHosts({ storage, carrier });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = withRemoteHostStorageLock({ storage, name: 'credentials', run: () => gate });
  const issue = vi.spyOn(enrollment, 'enrollRelationshipClient').mockResolvedValue(grant());
  const commit = vi
    .spyOn(enrollment, 'commitRelationshipEnrollment')
    .mockResolvedValue('committed');
  const cancel = vi.spyOn(enrollment, 'cancelRelationshipEnrollment').mockResolvedValue(undefined);
  vi.spyOn(pairing, 'revokePairing').mockResolvedValue('revoked');
  const abort = new AbortController();
  const pending = source.enrollRelationship(relationship(), 'Desktop', abort.signal);
  await vi.waitFor(() => expect(issue).toHaveBeenCalled());
  abort.abort();
  release();
  await held;
  expect(await pending).toEqual({ ok: false, code: 'cancelled' });
  expect(commit).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledWith(
    expect.objectContaining({ relationshipId: 'b'.repeat(32), publicKey: 'ef'.repeat(32) }),
  );
  expect(source.getSnapshot().hosts).toEqual([]);
  expect(storage.values.has(REMOTE_HOSTS_STORAGE_KEY)).toBe(false);
});

it.each(['owner-disposed', 'account-changed'])(
  'retains a persisted, committed grant on %s without late attachment or revocation',
  async (reason) => {
    const storage = memoryStorage();
    const source = createRemoteHosts({ storage, carrier });
    vi.spyOn(enrollment, 'enrollRelationshipClient').mockResolvedValue(grant());
    let confirm: (state: 'committed') => void = () => {};
    const commit = vi.spyOn(enrollment, 'commitRelationshipEnrollment').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const cancel = vi
      .spyOn(enrollment, 'cancelRelationshipEnrollment')
      .mockResolvedValue(undefined);
    const revoke = vi.spyOn(pairing, 'revokePairing').mockResolvedValue('revoked');
    const abort = new AbortController();
    const pending = source.enrollRelationship(relationship(), 'Desktop', abort.signal);
    await vi.waitFor(() => expect(commit).toHaveBeenCalled());
    abort.abort(reason);
    confirm('committed');
    expect(await pending).toEqual({ ok: false, code: 'cancelled' });
    expect(cancel).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(source.getSnapshot().hosts).toEqual([]);
    expect(JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')[0]?.credential).toBe(
      'device-b.synthetic',
    );
  },
);

it('retries the same persisted confirmation after a Client restart before starting its Host connection', async () => {
  const storage = memoryStorage();
  storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([grant().host]));
  const request = vi.fn(carrier.request);
  const source = createRemoteHosts({ storage, carrier: { ...carrier, request } });
  const item = {
    ...relationship(),
    direction: 'outgoing',
    state: 'active',
    expiresAt: Date.now() + 60_000,
    peerRevocationPending: false,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ relationships: [item] })),
  );
  vi.spyOn(enrollment, 'commitRelationshipEnrollment').mockResolvedValue('committed');
  expect(request).not.toHaveBeenCalled();
  releases.push(source.subscribe(() => {}));
  await vi.waitFor(() =>
    expect(
      JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')[0]?.relationshipEnrollment,
    ).toBeUndefined(),
  );
  expect(source.getSnapshot().hosts[0]?.host.deviceId).toBe('device-b');
});
