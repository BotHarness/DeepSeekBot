import { createHmac, randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import { createAccountRelationships } from '../src/devices/account-relationships.js';
import {
  accountRelationshipVerifier,
  type AccountRelationshipProof,
} from '../src/devices/account-relationship-proof.js';
import type {
  AccountRelationshipSession,
  OfferVerification,
} from '../src/devices/connect-account.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture() {
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
  let signedIn = true;
  const relayKey = randomBytes(32);
  const sign = (body: string) => createHmac('sha256', relayKey).update(body).digest('base64url');
  let onOffer: ((id: string, signal: AbortSignal) => Promise<void>) | undefined;
  const offer = vi.fn(async (registrationId: string, verifierHash: string, signal: AbortSignal) => {
    await onOffer?.(registrationId, signal);
    const host = registrationId === 'hbbbbbbbbbbbb' ? local : source;
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
  const authority = createAccountRelationships({
    account: () => account,
    relationships,
    identity: async () => local,
    request: async () => {
      throw new Error('unexpected outgoing request');
    },
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
    signOut: () => {
      signedIn = false;
    },
    onOffer: (hook: typeof onOffer) => {
      onOffer = hook;
    },
  };
}

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
