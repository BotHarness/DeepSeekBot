import { createHmac, randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import {
  createAccountRelationships,
  type AccountRelationshipProposal,
} from '../src/devices/account-relationships.js';
import type { RelationshipPeer } from '../src/devices/relationships.js';
import {
  accountRelationshipVerifier,
  type AccountRelationshipProof,
} from '../src/devices/account-relationship-proof.js';
import type {
  AccountRelationshipSession,
  OfferVerification,
} from '../src/devices/connect-account.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture(relayKey = randomBytes(32)) {
  const home = createTempRoot('account-relationships-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: 'B',
  });
  const relationships = createHostRelationships({
    database: attachOperationalModule(owner, 'host-relationships'),
    pairing,
  });
  const source = {
    id: 'remote-a',
    name: 'A',
    publicKey: 'ab'.repeat(32),
    routes: ['https://haaaaaaaaaaaa.deepseekbot.dev'],
  };
  const local = {
    ...pairing.host(),
    publicKey: 'cd'.repeat(32),
    routes: ['https://hbbbbbbbbbbbb.deepseekbot.dev'],
  };
  const peers = new Map<string, RelationshipPeer>([['haaaaaaaaaaaa', source]]);
  let signedIn = true;
  const sign = (body: string) => createHmac('sha256', relayKey).update(body).digest('base64url');
  let onOffer: ((id: string, signal: AbortSignal) => Promise<void>) | undefined;
  const offer = vi.fn(async (registrationId: string, verifierHash: string, signal: AbortSignal) => {
    await onOffer?.(registrationId, signal);
    const host =
      registrationId === session.registrationId ? local : (peers.get(registrationId) ?? source);
    const body = JSON.stringify({
      hostId: registrationId,
      account: 'test-account',
      verifierHash,
      issuedAt: new Date().toISOString(),
    });
    return {
      host: { id: host.id, name: host.name },
      hostname: `${registrationId}.deepseekbot.dev`,
      enrollment: { body, signature: sign(body) },
      encryption: { protocol: 'connect-noise-xk-v1' as const, publicKey: host.publicKey },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  });
  const session: AccountRelationshipSession = {
    accountId: 'test-account',
    registrationId: 'hbbbbbbbbbbbb',
    generation: 'generation-1',
    current: () => signedIn,
    hosts: async () => [],
    offer,
  };
  const account = {
    relationshipSession: async () => (signedIn ? session : undefined),
    async verifyOffer(body: string, signature: string | undefined): Promise<OfferVerification> {
      if (!signedIn || signature !== sign(body)) return { ok: false };
      const parsed: { hostId: string; account: string; verifierHash: string } = JSON.parse(body);
      return parsed.hostId === session.registrationId && parsed.account === session.accountId
        ? { ok: true, verifierHash: parsed.verifierHash, accountAutoApprove: true }
        : { ok: false };
    },
  };
  const request = vi.fn(
    async (
      _peer: RelationshipPeer,
      _command: AccountRelationshipProposal | { action: 'activate'; id: string },
    ): Promise<Record<string, unknown>> => {
      throw new Error('unexpected outgoing request');
    },
  );
  const authority = createAccountRelationships({
    account: () => account,
    relationships,
    identity: async () => local,
    request,
  });
  const proof: AccountRelationshipProof = {
    purpose: 'account-host-relationship-v1',
    relationshipId: 'a'.repeat(32),
    source: { registrationId: 'haaaaaaaaaaaa', hostId: source.id, publicKey: source.publicKey },
    target: {
      registrationId: session.registrationId,
      hostId: local.id,
      publicKey: local.publicKey,
    },
    expiresAt: Date.now() + 540_000,
    nonce: randomBytes(32).toString('base64url'),
  };
  const proposal = async () => ({
    action: 'account-propose' as const,
    proof,
    enrollment: (
      await offer(
        session.registrationId,
        accountRelationshipVerifier(proof),
        new AbortController().signal,
      )
    ).enrollment,
  });
  return {
    home,
    owner,
    relationships,
    pairing,
    source,
    local,
    session,
    authority,
    proof,
    proposal,
    offer,
    peers,
    request,
    signOut: () => {
      signedIn = false;
    },
    onOffer: (hook: typeof onOffer) => {
      onOffer = hook;
    },
  };
}

it('lets the smaller Host discover in the background with no Client and converges both discovery directions on one relationship', async () => {
  const key = randomBytes(32);
  const a = fixture(key);
  const b = fixture(key);
  a.session.registrationId = 'haaaaaaaaaaaa';
  b.local.publicKey = 'ef'.repeat(32);
  a.peers.set(b.session.registrationId, b.local);
  b.peers.set(a.session.registrationId, a.local);
  const listed = [a, b].map((test) => ({
    id: test.session.registrationId,
    name: 'Host',
    hostname: `${test.session.registrationId}.deepseekbot.dev`,
    createdAt: new Date().toISOString(),
    current: false,
    sessionKnown: true,
  }));
  a.session.hosts = b.session.hosts = async () => listed;
  a.request.mockImplementation(async (_peer, command) =>
    command.action === 'account-propose'
      ? b.authority.receive(a.local.publicKey, command)
      : { ok: true, state: b.relationships.activate(command.id, a.local.publicKey).state },
  );
  try {
    a.authority.start();
    await b.authority.discover();
    await vi.waitFor(() => expect(a.relationships.list()[0]?.state).toBe('active'));
    expect(b.relationships.list()[0]?.state).toBe('active');
    await Promise.all([a.authority.discover(), b.authority.discover()]);
    expect(a.relationships.list()).toHaveLength(1);
    expect(b.relationships.list()).toHaveLength(1);
    expect(a.relationships.list()[0]?.id).toBe(b.relationships.list()[0]?.id);
  } finally {
    a.authority.close();
    b.authority.close();
  }
});

function manualActive(test: ReturnType<typeof fixture>) {
  const item = test.relationships.propose({
    id: test.proof.relationshipId,
    peer: test.source,
    direction: 'incoming',
  });
  test.relationships.approve(item.id, test.source.publicKey);
  return test.relationships.activate(item.id, test.source.publicKey);
}

it('qualifies an existing manual relationship only after bilateral proof and retries a lost confirmation without replacing its grants', async () => {
  const key = randomBytes(32);
  const a = fixture(key);
  const b = fixture(key);
  a.session.registrationId = 'haaaaaaaaaaaa';
  b.local.publicKey = 'ef'.repeat(32);
  a.peers.set(b.session.registrationId, b.local);
  b.peers.set(a.session.registrationId, a.local);
  const id = a.proof.relationshipId;
  const manualRoute = 'https://independent.ts.net';
  const left = a.relationships.propose({
    id,
    peer: { ...b.local, routes: [manualRoute] },
    direction: 'outgoing',
  });
  a.relationships.activate(id, b.local.publicKey);
  b.relationships.propose({
    id,
    peer: { ...a.local, routes: [manualRoute] },
    direction: 'incoming',
  });
  b.relationships.approve(id, a.local.publicKey);
  b.relationships.activate(id, a.local.publicKey);
  const priorKey = randomBytes(32).toString('hex');
  const priorOffer = b.relationships.enrollment(id, a.local.publicKey, {
    publicKey: priorKey,
    name: 'Existing Client',
  });
  expect(b.pairing.redeem({ offer: priorOffer.offer, publicKey: priorKey }).ok).toBe(true);
  expect(b.pairing.redeem({ offer: b.pairing.createOffer().offer }).ok).toBe(true);
  const priorDevices = b.pairing.list();
  const listed = [a, b].map((test) => ({
    id: test.session.registrationId,
    name: 'Host',
    hostname: `${test.session.registrationId}.deepseekbot.dev`,
    createdAt: new Date().toISOString(),
    current: false,
    sessionKnown: true,
  }));
  a.session.hosts = b.session.hosts = async () => listed;
  let loseReply = true;
  a.request.mockImplementation(async (_peer, command) => {
    if (command.action !== 'account-propose')
      throw new Error('must not reactivate manual approval');
    const answer = await b.authority.receive(a.local.publicKey, command);
    if (loseReply) {
      loseReply = false;
      throw new Error('confirmation lost');
    }
    return answer;
  });
  try {
    expect((await a.authority.status()).relationships).toEqual([]);
    await expect(a.authority.authorize(id)).rejects.toThrow('origin-mismatch');
    await a.authority.discover();
    expect(a.relationships.read(id).accountOrigin).toBeNull();
    expect(b.relationships.read(id).accountOrigin).not.toBeNull();
    a.session.generation = 'retry-generation';
    await a.authority.discover();
    for (const test of [a, b]) {
      const qualified = test.relationships.read(id);
      expect(qualified.state).toBe('active');
      expect(qualified.peer.routes).toContain(manualRoute);
      expect(qualified.automaticEnrollmentSuppressed).toBe(false);
      expect((await test.authority.status()).relationships.map((item) => item.id)).toEqual([id]);
      expect(test.relationships.list()).toHaveLength(1);
      const authorization = await test.authority.authorize(id);
      expect(authorization.check().id).toBe(id);
    }
    expect(a.relationships.read(id).direction).toBe(left.direction);
    expect(b.relationships.read(id).direction).toBe('incoming');
    expect(b.pairing.list()).toEqual(priorDevices);
    const newKey = randomBytes(32).toString('hex');
    const newOffer = b.relationships.enrollment(id, a.local.publicKey, {
      publicKey: newKey,
      name: 'New account Client',
    });
    expect(b.pairing.redeem({ offer: newOffer.offer, publicKey: newKey }).ok).toBe(true);
    expect(b.pairing.list()).toHaveLength(priorDevices.length + 1);
  } finally {
    a.authority.close();
    b.authority.close();
  }
});

it.each([
  'wrong-account',
  'wrong-pin',
  'expired',
  'expires-during-lookup',
  'sign-out',
  'disconnect',
  'stale-null',
] as const)('does not qualify an existing manual relationship for %s', async (mode) => {
  const test = fixture();
  const previous = manualActive(test);
  const pinned = test.source.publicKey;
  const proposal = await test.proposal();
  if (mode === 'wrong-account') test.session.accountId = 'different-account';
  if (mode === 'wrong-pin') test.source.publicKey = 'ef'.repeat(32);
  if (mode === 'expired') proposal.proof.expiresAt = Date.now() - 1;
  let expectedOrigin = previous.accountOrigin;
  test.onOffer(async (registrationId) => {
    if (registrationId !== test.proof.source.registrationId) return;
    if (mode === 'sign-out') test.signOut();
    if (mode === 'disconnect') test.relationships.disconnect(previous.id);
    if (mode === 'expires-during-lookup')
      vi.spyOn(Date, 'now').mockReturnValue(proposal.proof.expiresAt + 1);
    if (mode === 'stale-null') {
      expectedOrigin = {
        accountId: test.session.accountId,
        localRegistrationId: test.session.registrationId,
        peerRegistrationId: 'haaaaaaaaacca',
        officialOrigin: 'https://haaaaaaaaacca.deepseekbot.dev',
      };
      test.relationships.refreshAccountOrigin({
        id: previous.id,
        peer: test.source,
        expectedOrigin: null,
        origin: expectedOrigin,
      });
    }
  });
  try {
    await expect(test.authority.receive(pinned, proposal)).rejects.toThrow();
    const after = test.relationships.read(previous.id);
    expect(after.accountOrigin).toEqual(expectedOrigin);
    if (mode !== 'stale-null') expect(after.peer.routes).toEqual(previous.peer.routes);
    if (mode === 'disconnect') expect(after.automaticEnrollmentSuppressed).toBe(true);
    expect(test.relationships.list()).toHaveLength(1);
  } finally {
    vi.restoreAllMocks();
    test.authority.close();
  }
});

it('never converts pending manual approval into automatic account approval', async () => {
  const test = fixture();
  const previous = test.relationships.propose({
    id: test.proof.relationshipId,
    peer: test.source,
    direction: 'incoming',
  });
  try {
    await expect(
      test.authority.receive(test.source.publicKey, await test.proposal()),
    ).rejects.toThrow('origin-mismatch');
    expect(test.relationships.read(previous.id)).toMatchObject({
      state: 'pending',
      accountOrigin: null,
    });
    expect((await test.authority.status()).relationships).toEqual([]);
  } finally {
    test.authority.close();
  }
});

it('refuses first account qualification and the new official route atomically at the route limit', async () => {
  const test = fixture();
  const previous = manualActive(test);
  const routes = Array.from({ length: 8 }, (_, index) => `https://manual-${index}.ts.net`);
  test.relationships.updateRoutes(previous.id, test.source.publicKey, routes);
  try {
    await expect(
      test.authority.receive(test.source.publicKey, await test.proposal()),
    ).rejects.toThrow('route-limit');
    expect(test.relationships.read(previous.id)).toMatchObject({
      state: 'active',
      accountOrigin: null,
      peer: { routes },
    });
  } finally {
    test.authority.close();
  }
});

it('does not fetch offers while signed out or after the background owner closes', async () => {
  const test = fixture();
  test.signOut();
  test.authority.start();
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  expect(test.offer).not.toHaveBeenCalled();
  test.authority.close();
  test.authority.start();
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  expect(test.offer).not.toHaveBeenCalled();
});

it('bounds all account operations to two while serving a queued receiver', async () => {
  const test = fixture();
  const proposal = await test.proposal();
  let active = 0;
  let maximum = 0;
  test.onOffer(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
  });
  try {
    const answers = await Promise.all(
      Array.from({ length: 3 }, () => test.authority.receive(test.source.publicKey, proposal)),
    );
    expect(answers.every((answer) => answer.state === 'approved')).toBe(true);
    expect(maximum).toBe(2);
    expect(test.relationships.list()).toHaveLength(1);
  } finally {
    test.authority.close();
  }
});

it('rotates discovery beyond an active and unavailable prefix larger than one batch', async () => {
  const test = fixture();
  test.session.registrationId = 'haaaaaaaaaaaa';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const registration = (index: number) => {
    let digits = '';
    do {
      digits = alphabet[index % 32] + digits;
      index = Math.floor(index / 32);
    } while (index > 0);
    return `hb${digits.padStart(11, 'a')}`;
  };
  const hosts = Array.from({ length: 70 }, (_, index) => ({
    id: registration(index),
    name: `Peer ${index}`,
    hostname: `${registration(index)}.deepseekbot.dev`,
    createdAt: new Date().toISOString(),
    current: false,
    sessionKnown: true,
  }));
  hosts.forEach((host, index) =>
    test.peers.set(host.id, {
      ...test.source,
      id: `peer-${index}`,
      name: host.name,
      routes: [`https://${host.hostname}`],
    }),
  );
  test.session.hosts = async () => hosts;
  for (let index = 0; index < 10; index++) {
    const peer = test.peers.get(registration(index));
    if (!peer) throw new Error('missing fixture peer');
    const relation = test.relationships.propose({
      peer,
      direction: 'outgoing',
      accountOrigin: {
        accountId: test.session.accountId,
        localRegistrationId: test.session.registrationId,
        peerRegistrationId: registration(index),
      },
    });
    test.relationships.activate(relation.id, peer.publicKey);
  }
  test.onOffer(async (id) => {
    if (
      id !== test.session.registrationId &&
      !hosts.slice(0, 10).some((host) => host.id === id) &&
      id !== registration(69)
    )
      throw new Error('unavailable peer');
  });
  test.request.mockImplementation(async (_peer, command) => ({
    ok: true,
    state: command.action === 'activate' ? 'active' : 'approved',
  }));
  try {
    for (
      let attempt = 0;
      attempt < 4 &&
      !test.relationships
        .list()
        .some((item) => item.peer.id === 'peer-69' && item.state === 'active');
      attempt++
    )
      await test.authority.discover();
    expect(test.relationships.list().find((item) => item.peer.id === 'peer-69')).toMatchObject({
      state: 'active',
    });
  } finally {
    test.authority.close();
  }
});

it('refreshes a signed-in registration on the same active pinned relationship and rejects a stale origin overwrite', async () => {
  const test = fixture();
  try {
    await test.authority.receive(test.source.publicKey, await test.proposal());
    test.relationships.activate(test.proof.relationshipId, test.source.publicKey);
    test.relationships.updateRoutes(test.proof.relationshipId, test.source.publicKey, [
      ...test.source.routes,
      'https://independent.ts.net',
    ]);
    const prior = test.relationships.read(test.proof.relationshipId).accountOrigin!;
    test.peers.delete(test.proof.source.registrationId);
    test.proof.source.registrationId = 'haaaaaaaaabba';
    test.peers.set(test.proof.source.registrationId, test.source);
    expect(
      await test.authority.receive(test.source.publicKey, await test.proposal()),
    ).toMatchObject({ ok: true, state: 'active' });
    const refreshed = test.relationships.read(test.proof.relationshipId);
    expect(refreshed.accountOrigin?.peerRegistrationId).toBe('haaaaaaaaabba');
    expect(refreshed.peer.routes).toEqual([
      'https://haaaaaaaaabba.deepseekbot.dev',
      'https://independent.ts.net',
    ]);
    expect(refreshed.state).toBe('active');
    expect(test.relationships.list()).toHaveLength(1);
    expect(() =>
      test.relationships.refreshAccountOrigin({
        id: refreshed.id,
        peer: test.source,
        expectedOrigin: prior,
        origin: prior,
      }),
    ).toThrow('origin-stale');
  } finally {
    test.authority.close();
  }
});

it.each(['wrong-account', 'wrong-pin', 'expired', 'stale-proof'] as const)(
  'does not replace an active official route for %s',
  async (mode) => {
    const test = fixture();
    const pinned = test.source.publicKey;
    try {
      await test.authority.receive(pinned, await test.proposal());
      test.relationships.activate(test.proof.relationshipId, pinned);
      const previous = test.relationships.read(test.proof.relationshipId);
      test.proof.source.registrationId = 'haaaaaaaaabba';
      test.peers.set(test.proof.source.registrationId, test.source);
      if (mode === 'wrong-account') test.session.accountId = 'different-account';
      if (mode === 'wrong-pin') test.source.publicKey = 'ef'.repeat(32);
      if (mode === 'expired') test.proof.expiresAt = Date.now() - 1;
      let expectedRoutes = previous.peer.routes;
      if (mode === 'stale-proof')
        test.onOffer(async (id) => {
          if (id !== test.proof.source.registrationId) return;
          const officialOrigin = 'https://haaaaaaaaacca.deepseekbot.dev';
          const refreshed = test.relationships.refreshAccountOrigin({
            id: previous.id,
            peer: test.source,
            expectedOrigin: previous.accountOrigin!,
            origin: {
              ...previous.accountOrigin!,
              peerRegistrationId: 'haaaaaaaaacca',
              officialOrigin,
            },
          });
          expectedRoutes = refreshed.peer.routes;
        });
      await expect(test.authority.receive(pinned, await test.proposal())).rejects.toThrow();
      expect(test.relationships.read(previous.id).peer.routes).toEqual(expectedRoutes);
    } finally {
      test.authority.close();
    }
  },
);

it('records verified account provenance atomically and reuses the same canonical proposal', async () => {
  const test = fixture();
  try {
    const proposal = await test.proposal();
    expect(await test.authority.receive(test.source.publicKey, proposal)).toEqual({
      ok: true,
      state: 'approved',
    });
    expect(await test.authority.receive(test.source.publicKey, proposal)).toEqual({
      ok: true,
      state: 'approved',
    });
    expect(test.relationships.list()).toHaveLength(1);
    expect(test.relationships.read(test.proof.relationshipId).accountOrigin).toEqual({
      accountId: 'test-account',
      localRegistrationId: 'hbbbbbbbbbbbb',
      peerRegistrationId: 'haaaaaaaaaaaa',
      officialOrigin: 'https://haaaaaaaaaaaa.deepseekbot.dev',
    });
    expect(test.offer.mock.calls.some(([id]) => id === 'haaaaaaaaaaaa')).toBe(true);
    expect(test.pairing.list()).toEqual([]);
  } finally {
    test.authority.close();
  }
});

it.each(['signature', 'transcript', 'peer-key', 'target-key', 'expired'] as const)(
  'refuses %s mismatch without creating an account relationship',
  async (mode) => {
    const test = fixture();
    try {
      const proposal = await test.proposal();
      if (mode === 'signature') proposal.enrollment.signature = 'wrong';
      if (mode === 'transcript') proposal.proof.nonce = randomBytes(32).toString('base64url');
      if (mode === 'target-key') proposal.proof.target.publicKey = 'ef'.repeat(32);
      if (mode === 'expired') proposal.proof.expiresAt = Date.now() - 1;
      await expect(
        test.authority.receive(
          mode === 'peer-key' ? 'ef'.repeat(32) : test.source.publicKey,
          proposal,
        ),
      ).rejects.toThrow();
      expect(test.relationships.list()).toEqual([]);
    } finally {
      test.authority.close();
    }
  },
);

it('keeps explicit-disconnect suppression authoritative for a correctly signed account proposal', async () => {
  const test = fixture();
  try {
    const prior = test.relationships.propose({ peer: test.source, direction: 'incoming' });
    test.relationships.disconnect(prior.id);
    await expect(
      test.authority.receive(test.source.publicKey, await test.proposal()),
    ).rejects.toThrow('suppressed');
    expect(test.relationships.list()).toHaveLength(1);
    expect(test.relationships.read(prior.id).automaticEnrollmentSuppressed).toBe(true);
  } finally {
    test.authority.close();
  }
});

it('rejects a late authenticated source lookup after sign-out', async () => {
  const test = fixture();
  const proposal = await test.proposal();
  let release = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = vi.fn();
  test.onOffer(async (id) => {
    if (id === 'haaaaaaaaaaaa') {
      entered();
      await blocked;
    }
  });
  const result = test.authority.receive(test.source.publicKey, proposal);
  await vi.waitFor(() => expect(entered).toHaveBeenCalled());
  test.signOut();
  release();
  await expect(result).rejects.toThrow('cancelled');
  expect(test.relationships.list()).toEqual([]);
  test.authority.close();
});

it('cancels the discovery setup lookup on owner disposal', async () => {
  const test = fixture();
  const entered = vi.fn();
  test.onOffer(
    (_id, signal) =>
      new Promise<void>((_resolve, reject) => {
        entered();
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  );
  const discovery = test.authority.discover();
  await vi.waitFor(() => expect(entered).toHaveBeenCalled());
  test.authority.close();
  await expect(discovery).rejects.toThrow('aborted');
  expect(test.relationships.list()).toEqual([]);
});
