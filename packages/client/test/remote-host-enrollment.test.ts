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
import { startAccountEnvironments } from '../src/client/account-environments.js';

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

it.each(['enroll', 'route'] as const)(
  'renews %s cooldowns at capacity and releases retired relationship slots',
  async (mode) => {
    vi.useFakeTimers();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(0);
    const fresh = 'https://hcccccccccccc.deepseekbot.dev';
    const make = (index: number) => ({
      ...relationship(),
      id: index.toString(16).padStart(32, '0'),
      peer: { ...relationship().peer, id: `peer-${index}`, routes: [fresh] },
      state: 'active',
      direction: 'incoming',
      expiresAt: 600_000,
      peerRevocationPending: false,
      accountOrigin: {
        accountId: 'account',
        localRegistrationId: 'haaaaaaaaaaaa',
        peerRegistrationId: 'hcccccccccccc',
        officialOrigin: fresh,
      },
    });
    let relationships = Array.from({ length: 32 }, (_, index) => make(index));
    const storage = memoryStorage();
    if (mode === 'route')
      storage.setItem(
        REMOTE_HOSTS_STORAGE_KEY,
        JSON.stringify(
          relationships.map((item) => {
            const { relationshipEnrollment: _pending, ...saved } = grant(item.peer.id).host;
            return { ...saved, relationshipId: item.id };
          }),
        ),
      );
    const source = createRemoteHosts({ storage, carrier });
    const attempts: string[] = [];
    vi.spyOn(source, 'enrollRelationship').mockImplementation(async (item) => {
      attempts.push(item.peer.id);
      return { ok: false, code: 'unreachable' };
    });
    vi.spyOn(source, 'learnRelationshipRoutes').mockImplementation(async (peer) => {
      attempts.push(peer.id);
      throw new Error('route-update-refused');
    });
    const stop = startAccountEnvironments({
      sources: source,
      clientName: 'Desktop',
      request: async () => ({ state: 'complete', generation: 'account', relationships }),
    });
    try {
      await vi.advanceTimersByTimeAsync(40_000);
      expect(attempts).toEqual(relationships.map((item) => item.peer.id));
      clock.mockReturnValue(30_000);
      await vi.advanceTimersByTimeAsync(2500);
      expect(attempts.slice(-2)).toEqual(['peer-0', 'peer-1']);
      await vi.advanceTimersByTimeAsync(2500);
      expect(attempts.slice(-2)).toEqual(['peer-2', 'peer-3']);
      relationships = [make(33)];
      await vi.advanceTimersByTimeAsync(2500);
      expect(attempts.at(-1)).toBe('peer-33');
      const count = attempts.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(attempts).toHaveLength(count);
    } finally {
      stop();
      clock.mockRestore();
      vi.useRealTimers();
    }
  },
);

it('keeps other enrollment work moving around an unavailable Host and cancels pending work on sign-out', async () => {
  vi.useFakeTimers();
  const source = createRemoteHosts({ storage: memoryStorage(), carrier });
  const relationships = ['b', 'c', 'd'].map((id) => ({
    ...relationship(id),
    state: 'active',
    direction: 'incoming',
    expiresAt: Date.now() + 60_000,
    peerRevocationPending: false,
    accountOrigin: {
      accountId: 'account',
      localRegistrationId: 'haaaaaaaaaaaa',
      peerRegistrationId: 'hbbbbbbbbbbbb',
    },
  }));
  let signedOut = false;
  const request = vi.fn(async () =>
    signedOut
      ? { state: 'signed-out', relationships: [] }
      : { state: 'complete', generation: 'current-account', relationships },
  );
  let pendingSignal: AbortSignal | undefined;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const enroll = vi
    .spyOn(source, 'enrollRelationship')
    .mockImplementation(async (item, _name, signal) => {
      if (item.peer.id === 'b') {
        pendingSignal = signal;
        await held;
      }
      return { ok: false, code: 'unreachable' };
    });
  const stop = startAccountEnvironments({ sources: source, clientName: 'Desktop', request });
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(enroll.mock.calls.map(([item]) => item.peer.id)).toEqual(['b', 'c']);
    await vi.advanceTimersByTimeAsync(2500);
    expect(enroll.mock.calls.map(([item]) => item.peer.id)).toEqual(['b', 'c', 'd']);
    signedOut = true;
    await vi.advanceTimersByTimeAsync(2500);
    expect(pendingSignal?.aborted).toBe(true);
    expect(pendingSignal?.reason).toBe('account-changed');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(enroll).toHaveBeenCalledTimes(3);
  } finally {
    stop();
    release();
    await held;
    vi.useRealTimers();
  }
});

it('preserves independent routes committed while verified route learning waits for credential coordination', async () => {
  const storage = memoryStorage();
  const { relationshipEnrollment: _pending, ...saved } = grant().host;
  storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([saved]));
  const source = createRemoteHosts({ storage, carrier });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = withRemoteHostStorageLock({ storage, name: 'credentials', run: () => gate });
  const fresh = 'https://hcccccccccccc.deepseekbot.dev';
  const learning = source.learnRelationshipRoutes(
    { ...relationship().peer, routes: [fresh] },
    undefined,
    'merge-existing',
  );
  const concurrent = 'https://independent.ts.net';
  storage.setItem(
    REMOTE_HOSTS_STORAGE_KEY,
    JSON.stringify([
      { ...saved, routes: [...saved.routes, concurrent], routePreference: concurrent },
    ]),
  );
  release();
  await held;
  await learning;
  expect(source.getSnapshot().hosts[0]?.host).toMatchObject({
    deviceId: saved.deviceId,
    credential: saved.credential,
    routePreference: concurrent,
    routes: [fresh, ...saved.routes, concurrent],
    encryption: saved.encryption,
  });
});

it('refuses a queued route update after another writer replaces the saved Client Noise key', async () => {
  const storage = memoryStorage();
  const { relationshipEnrollment: _pending, ...saved } = grant().host;
  storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([saved]));
  const source = createRemoteHosts({ storage, carrier });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = withRemoteHostStorageLock({ storage, name: 'credentials', run: () => gate });
  const learning = source.learnRelationshipRoutes(
    { ...relationship().peer, routes: ['https://hcccccccccccc.deepseekbot.dev'] },
    undefined,
    'merge-existing',
  );
  const changed = JSON.stringify([
    { ...saved, encryption: { ...saved.encryption!, deviceKey: 'de'.repeat(32) } },
  ]);
  storage.setItem(REMOTE_HOSTS_STORAGE_KEY, changed);
  const refused = expect(learning).rejects.toThrow('connection-host-changed');
  release();
  await held;
  await refused;
  expect(storage.getItem(REMOTE_HOSTS_STORAGE_KEY)).toBe(changed);
});

it.each(['independent', 'official-looking'] as const)(
  'refuses additive official-route overflow without guessing the provenance of %s routes',
  async (mode) => {
    const storage = memoryStorage();
    const { relationshipEnrollment: _pending, ...saved } = grant().host;
    const routes = Array.from({ length: 8 }, (_, index) => `https://independent-${index}.ts.net`);
    if (mode === 'official-looking') routes[0] = saved.routes[0]!;
    const host = { ...saved, routes, routePreference: routes[0] };
    const original = JSON.stringify([host]);
    storage.setItem(REMOTE_HOSTS_STORAGE_KEY, original);
    const source = createRemoteHosts({ storage, carrier });
    await expect(
      source.learnRelationshipRoutes(
        { ...relationship().peer, routes: ['https://hcccccccccccc.deepseekbot.dev'] },
        undefined,
        'merge-existing',
      ),
    ).rejects.toThrow('relationship-route-limit');
    expect(storage.getItem(REMOTE_HOSTS_STORAGE_KEY)).toBe(original);
    expect(source.getSnapshot().hosts[0]?.host).toEqual(host);
  },
);

it.each(['public', 'private', 'wrong-pin'] as const)(
  'learns a verified fresh official route without minting over an existing %s Client',
  async (mode) => {
    const storage = memoryStorage();
    const { relationshipEnrollment: _pending, ...saved } = grant().host;
    const independent = 'https://independent.ts.net';
    const fresh = 'https://hcccccccccccc.deepseekbot.dev';
    const privateRelay = { origin: 'https://private.trycloudflare.com', token: 'af'.repeat(32) };
    const host = {
      ...saved,
      routes: mode === 'private' ? [privateRelay.origin] : [...saved.routes, independent],
      routePreference: mode === 'private' ? privateRelay.origin : independent,
      encryption: { ...saved.encryption!, ...(mode === 'private' ? { privateRelay } : {}) },
    };
    storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([host]));
    const source = createRemoteHosts({ storage, carrier });
    source.select('local');
    const issue = vi.spyOn(enrollment, 'enrollRelationshipClient');
    const learn = vi.spyOn(source, 'learnRelationshipRoutes');
    const request = vi.fn(async () => ({
      state: 'complete',
      generation: 'current-account',
      relationships: [
        {
          ...relationship(),
          peer: {
            ...relationship().peer,
            routes: [fresh],
            publicKey: mode === 'wrong-pin' ? 'ef'.repeat(32) : saved.encryption!.hostKey,
          },
          state: 'active',
          direction: 'incoming',
          expiresAt: Date.now() + 60_000,
          peerRevocationPending: false,
          accountOrigin: {
            accountId: 'account',
            localRegistrationId: 'haaaaaaaaaaaa',
            peerRegistrationId: 'hcccccccccccc',
            officialOrigin: fresh,
          },
        },
      ],
    }));
    const stop = startAccountEnvironments({ sources: source, clientName: 'Desktop', request });
    try {
      await vi.waitFor(() => expect(request).toHaveBeenCalled());
      if (mode === 'public')
        await vi.waitFor(() => expect(source.getSnapshot().hosts[0]?.host.routes).toContain(fresh));
      else await new Promise<void>((resolve) => setImmediate(resolve));
      expect(issue).not.toHaveBeenCalled();
      expect(learn).toHaveBeenCalledTimes(mode === 'public' ? 1 : 0);
      const actual = source.getSnapshot();
      expect(actual.tab).toBe('local');
      expect(actual.open).toBeUndefined();
      expect(actual.hosts[0]?.host).toMatchObject({
        deviceId: host.deviceId,
        credential: host.credential,
        routePreference: host.routePreference,
        encryption: { hostKey: host.encryption.hostKey, deviceKey: host.encryption.deviceKey },
      });
    } finally {
      stop();
    }
  },
);

it.each(['cancel', 'new-choice'] as const)(
  'keeps Human automatic suppression when a manual enrollment ends with %s',
  async (mode) => {
    const storage = memoryStorage();
    const oldChoice = {
      kind: 'automatic-enrollment-suppressed',
      hostId: 'b',
      publicKey: 'ab'.repeat(32),
      generation: 'old',
    };
    storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([oldChoice]));
    const source = createRemoteHosts({ storage, carrier });
    const abort = new AbortController();
    vi.spyOn(enrollment, 'enrollRelationshipClient').mockResolvedValue(grant());
    vi.spyOn(enrollment, 'cancelRelationshipEnrollment').mockResolvedValue(undefined);
    vi.spyOn(pairing, 'revokePairing').mockResolvedValue('revoked');
    const newChoice = { ...oldChoice, generation: 'new' };
    vi.spyOn(enrollment, 'commitRelationshipEnrollment').mockImplementation(async () => {
      if (mode === 'cancel') abort.abort();
      else {
        const rows: unknown[] = JSON.parse(storage.getItem(REMOTE_HOSTS_STORAGE_KEY) ?? '[]');
        storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([rows[0], newChoice]));
      }
      return 'committed';
    });
    expect(await source.enrollRelationship(relationship(), 'Manual', abort.signal)).toEqual({
      ok: false,
      code: 'cancelled',
    });
    expect(source.getSnapshot().hosts).toEqual([]);
    expect(JSON.parse(storage.getItem(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')).toEqual([
      mode === 'cancel' ? oldChoice : newChoice,
    ]);
  },
);

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
  const openSocket = vi.fn(carrier.openSocket);
  const source = createRemoteHosts({ storage, carrier: { ...carrier, request, openSocket } });
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
  let confirm: (state: 'committed') => void = () => {};
  const commit = vi.spyOn(enrollment, 'commitRelationshipEnrollment').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  expect(request).not.toHaveBeenCalled();
  releases.push(source.subscribe(() => {}));
  await vi.waitFor(() => expect(commit).toHaveBeenCalled());
  expect(request).not.toHaveBeenCalled();
  expect(openSocket).not.toHaveBeenCalled();
  confirm('committed');
  await vi.waitFor(() =>
    expect(
      JSON.parse(storage.values.get(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')[0]?.relationshipEnrollment,
    ).toBeUndefined(),
  );
  expect(source.getSnapshot().hosts[0]?.host.deviceId).toBe('device-b');
  await vi.waitFor(() => expect(openSocket).toHaveBeenCalled());
});

it.each(['same-provider', 'other-tab', 'none'] as const)(
  'keeps replacement credentials during cancelled enrollment cleanup: %s',
  async (replacementMode) => {
    const storage = memoryStorage();
    storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([grant().host]));
    const source = createRemoteHosts({ storage, carrier });
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
    vi.spyOn(enrollment, 'commitRelationshipEnrollment')
      .mockResolvedValueOnce('cancelled')
      .mockResolvedValue('committed');
    let finishRevoke = () => {};
    const revocation = new Promise<'revoked'>((resolve) => {
      finishRevoke = () => resolve('revoked');
    });
    const revoke = vi
      .spyOn(pairing, 'revokePairing')
      .mockImplementationOnce(() => revocation)
      .mockResolvedValue('revoked');
    const stop = source.subscribe(() => {});
    releases.push(stop);
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
    const target =
      replacementMode === 'other-tab' ? createRemoteHosts({ storage, carrier }) : source;
    let replacementClient: ReturnType<typeof target.client>;
    if (replacementMode !== 'none') {
      await target.forgetLocal('b');
      const replacement = grant();
      replacement.host.deviceId = 'replacement-b';
      replacement.host.credential = 'replacement-b.synthetic';
      if (!replacement.host.encryption) throw new Error('missing fixture encryption');
      replacement.host.encryption.deviceKey = 'ac'.repeat(32);
      vi.spyOn(enrollment, 'enrollRelationshipClient').mockResolvedValue(replacement);
      expect((await target.enrollRelationship(relationship(), 'Replacement')).ok).toBe(true);
      replacementClient = target.client('b');
      expect(replacementClient).toBeDefined();
    }
    finishRevoke();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const persisted = JSON.parse(storage.getItem(REMOTE_HOSTS_STORAGE_KEY) ?? '[]').filter(
      (host: { credential?: string }) => host.credential !== undefined,
    );
    if (replacementMode === 'none') {
      expect(persisted).toEqual([]);
      expect(source.getSnapshot().hosts).toEqual([]);
    } else {
      expect(persisted).toHaveLength(1);
      expect(persisted[0].credential).toBe('replacement-b.synthetic');
      expect(target.client('b')).toBe(replacementClient);
      expect(target.getSnapshot().hosts[0]?.host.deviceId).toBe('replacement-b');
    }
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke.mock.calls[0]?.[0].host.credential).toBe('device-b.synthetic');
  },
);

it('preserves a replacement persisted before cancelled cleanup obtains the credential lock', async () => {
  const storage = memoryStorage();
  storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([grant().host]));
  const source = createRemoteHosts({ storage, carrier });
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
  vi.spyOn(enrollment, 'commitRelationshipEnrollment').mockResolvedValue('cancelled');
  let finishRevoke = () => {};
  const revoke = vi.spyOn(pairing, 'revokePairing').mockImplementation(
    () =>
      new Promise<'revoked'>((resolve) => {
        finishRevoke = () => resolve('revoked');
      }),
  );
  releases.push(source.subscribe(() => {}));
  await vi.waitFor(() => expect(revoke).toHaveBeenCalledOnce());
  const { relationshipEnrollment: _pending, ...replacement } = grant().host;
  replacement.deviceId = 'replacement-b';
  replacement.credential = 'replacement-b.synthetic';
  let releaseWriter = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseWriter = resolve;
  });
  const writer = withRemoteHostStorageLock({
    storage,
    name: 'credentials',
    run: async () => {
      await gate;
      storage.setItem(REMOTE_HOSTS_STORAGE_KEY, JSON.stringify([replacement]));
    },
  });
  finishRevoke();
  await new Promise<void>((resolve) => setImmediate(resolve));
  releaseWriter();
  await writer;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(JSON.parse(storage.getItem(REMOTE_HOSTS_STORAGE_KEY) ?? '[]')).toEqual([replacement]);
  expect(createRemoteHosts({ storage, carrier }).getSnapshot().hosts[0]?.host.deviceId).toBe(
    'replacement-b',
  );
  expect(revoke).toHaveBeenCalledOnce();
});
