import { describe, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import {
  createHostRelationships,
  RELATIONSHIP_APPROVAL_TTL_MS,
} from '../src/devices/relationships.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const peer = {
  id: 'other-host',
  name: 'Other Host',
  publicKey: 'ab'.repeat(32),
  routes: ['http://127.0.0.1:31002'],
};
const client = { publicKey: 'cd'.repeat(32), name: 'Desktop A' };
function fixture() {
  const home = createTempRoot('relationship-');
  let clock = Date.now();
  const open = () => {
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const pairing = createDevicePairing({
      database: attachOperationalModule(owner, 'device-pairing'),
      hostName: 'A',
      now: () => clock,
    });
    const relationships = createHostRelationships({
      database: attachOperationalModule(owner, 'host-relationships'),
      pairing,
      now: () => clock,
    });
    return { owner, pairing, relationships };
  };
  return {
    open,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('Host relationship authorization', () => {
  it('keeps accepting a Client after more than 1,024 expired and revoked enrollment cycles', () => {
    const test = fixture();
    const host = test.open();
    const relationship = host.relationships.propose({ peer, direction: 'incoming' });
    host.relationships.approve(relationship.id, peer.publicKey);
    host.relationships.activate(relationship.id, peer.publicKey);
    for (let index = 0; index < 1025; index++) {
      const publicKey = index.toString(16).padStart(64, '0');
      const offer = host.relationships.enrollment(relationship.id, peer.publicKey, {
        publicKey,
        name: 'Retired Client',
      });
      if (index % 2 === 0) {
        const issued = host.pairing.redeem({ offer: offer.offer, publicKey });
        if (!issued.ok) throw new Error(issued.code);
        host.pairing.revoke(issued.device.id);
      }
      test.advance(RELATIONSHIP_APPROVAL_TTL_MS + 60_001);
    }
    const offer = host.relationships.enrollment(relationship.id, peer.publicKey, client);
    expect(host.pairing.redeem({ offer: offer.offer, publicKey: client.publicKey }).ok).toBe(true);
    expect(host.relationships.enrollments.list()).toHaveLength(1);
  }, 30_000);
  it('refuses a cancelled enrollment before an offer arrives and after an offer was prepared', () => {
    const test = fixture();
    const host = test.open();
    const relationship = host.relationships.propose({ peer, direction: 'incoming' });
    host.relationships.approve(relationship.id, peer.publicKey);
    host.relationships.activate(relationship.id, peer.publicKey);
    host.relationships.enrollments.cancelIncoming(
      relationship.id,
      client.publicKey,
      relationship.expiresAt,
    );
    expect(() => host.relationships.enrollment(relationship.id, peer.publicKey, client)).toThrow(
      'cancelled',
    );
    const other = { publicKey: 'ef'.repeat(32), name: 'Other Client' };
    const offer = host.relationships.enrollment(relationship.id, peer.publicKey, other);
    host.relationships.enrollments.cancelIncoming(
      relationship.id,
      other.publicKey,
      relationship.expiresAt,
    );
    expect(host.pairing.redeem({ offer: offer.offer, publicKey: other.publicKey })).toMatchObject({
      ok: false,
    });
    expect(host.pairing.list()).toEqual([]);
  });
  it('revokes an issued enrollment by its exact relationship and public key when the paired reply was lost', () => {
    const test = fixture();
    const host = test.open();
    const relationship = host.relationships.propose({ peer, direction: 'incoming' });
    host.relationships.approve(relationship.id, peer.publicKey);
    host.relationships.activate(relationship.id, peer.publicKey);
    const first = host.relationships.enrollment(relationship.id, peer.publicKey, client);
    const issued = host.pairing.redeem({ offer: first.offer, publicKey: client.publicKey });
    const otherKey = 'ef'.repeat(32);
    const second = host.relationships.enrollment(relationship.id, peer.publicKey, {
      name: 'Keep',
      publicKey: otherKey,
    });
    const keep = host.pairing.redeem({ offer: second.offer, publicKey: otherKey });
    const independent = host.pairing.redeem({ offer: host.pairing.createOffer().offer });
    if (!issued.ok || !keep.ok || !independent.ok) throw new Error('fixture pairing refused');
    let closed = 0;
    host.pairing.attachStream(issued.device.id, () => {
      closed++;
    });
    expect(
      host.relationships.enrollments.cancelIncoming(
        relationship.id,
        client.publicKey,
        relationship.expiresAt,
      ),
    ).toEqual({ revoked: 1 });
    expect(closed).toBe(1);
    expect(host.pairing.admit(`Device ${issued.credential}`).ok).toBe(false);
    expect(host.pairing.admit(`Device ${keep.credential}`).ok).toBe(true);
    expect(host.pairing.admit(`Device ${independent.credential}`).ok).toBe(true);
    expect(() => host.relationships.enrollment(relationship.id, peer.publicKey, client)).toThrow(
      'cancelled',
    );
  });
  it('retains unconfirmed cleanup and idempotent committed enrollment across restart', () => {
    const test = fixture();
    const first = test.open();
    const relationship = first.relationships.propose({ peer, direction: 'outgoing' });
    first.relationships.activate(relationship.id, peer.publicKey);
    first.relationships.enrollments.beginOutgoing(relationship.id, client.publicKey);
    const committedKey = 'ef'.repeat(32);
    first.relationships.enrollments.beginOutgoing(relationship.id, committedKey);
    first.relationships.enrollments.commit(relationship.id, committedKey);
    first.owner.close();
    test.advance(RELATIONSHIP_APPROVAL_TTL_MS + 1);
    const restored = test.open();
    expect(restored.relationships.enrollments.commit(relationship.id, committedKey).state).toBe(
      'committed',
    );
    expect(() =>
      restored.relationships.enrollments.commit(relationship.id, client.publicKey),
    ).toThrow('expired');
    expect(restored.relationships.enrollments.dueCleanup()).toMatchObject([
      { relationshipId: relationship.id, publicKey: client.publicKey, state: 'cleanup-pending' },
    ]);
    expect(() =>
      restored.relationships.enrollments.beginOutgoing(
        relationship.id,
        '12'.repeat(32),
        'new-account-generation',
      ),
    ).toThrow('cleanup-pending');
    for (let attempt = 1; attempt <= 8; attempt++) {
      restored.relationships.enrollments.beginCleanupAttempt(relationship.id, client.publicKey);
      test.advance(60_000);
    }
    expect(restored.relationships.enrollments.dueCleanup()).toEqual([]);
    expect(
      restored.relationships.enrollments.list().find((item) => item.publicKey === client.publicKey),
    ).toMatchObject({ state: 'cleanup-pending', cleanupAttempts: 8, retryAt: null });
  });
  it('retains offline retry budget and reconnect suppression after restart without letting a stale acknowledgement retire a new generation', () => {
    const test = fixture();
    const first = test.open();
    const old = first.relationships.propose({ peer, direction: 'incoming' });
    first.relationships.approve(old.id, peer.publicKey);
    first.relationships.activate(old.id, peer.publicKey);
    first.relationships.disconnect(old.id);
    first.relationships.beginRevocationAttempt(old.id);
    first.owner.close();
    const restored = test.open();
    expect(restored.relationships.read(old.id)).toMatchObject({
      state: 'disconnected',
      peerRevocationPending: true,
      revocationAttempts: 1,
      automaticEnrollmentSuppressed: true,
    });
    expect(() => restored.relationships.beginRevocationAttempt(old.id)).toThrow(
      'relationship-retry-not-due',
    );
    expect(() => restored.relationships.propose({ peer, direction: 'incoming' })).toThrow(
      'relationship-reconnect-required',
    );
    const fresh = restored.relationships.propose({
      peer,
      direction: 'incoming',
      explicitReconnect: true,
    });
    restored.relationships.approve(fresh.id, peer.publicKey);
    restored.relationships.activate(fresh.id, peer.publicKey);
    const offer = restored.relationships.enrollment(fresh.id, peer.publicKey, client);
    const grant = restored.pairing.redeem({ offer: offer.offer, publicKey: client.publicKey });
    if (!grant.ok) throw new Error(grant.code);
    restored.relationships.acknowledgeDisconnect(old.id, peer.publicKey);
    expect(restored.relationships.read(fresh.id).state).toBe('active');
    expect(restored.pairing.check(grant.device.id).ok).toBe(true);
    expect(() => restored.relationships.activate(old.id, peer.publicKey)).toThrow(
      'relationship-disconnected',
    );
  });

  it('stops automatic retirement retries at eight attempts while keeping pending inspection and manual retry available', () => {
    const test = fixture();
    const host = test.open();
    const relationship = host.relationships.propose({ peer, direction: 'incoming' });
    host.relationships.disconnect(relationship.id);
    for (let attempt = 1; attempt <= 8; attempt++) {
      expect(host.relationships.beginRevocationAttempt(relationship.id).revocationAttempts).toBe(
        attempt,
      );
      test.advance(60_000);
    }
    expect(host.relationships.read(relationship.id)).toMatchObject({
      peerRevocationPending: true,
      revocationRetryAt: null,
    });
    expect(() => host.relationships.beginRevocationAttempt(relationship.id)).toThrow(
      'relationship-retry-not-due',
    );
    expect(
      host.relationships.beginRevocationAttempt(relationship.id, true).revocationAttempts,
    ).toBe(1);
  });
  it('does not suppress automatic discovery after internal failed-initiation rollback and refuses bounded history overflow', () => {
    const host = fixture().open();
    for (let index = 0; index < 256; index++) {
      const relationship = host.relationships.propose({ peer, direction: 'outgoing' });
      host.relationships.disconnect(relationship.id, undefined, false);
      expect(host.relationships.read(relationship.id).automaticEnrollmentSuppressed).toBe(false);
    }
    expect(() => host.relationships.propose({ peer, direction: 'outgoing' })).toThrow(
      'relationship-history-limit',
    );
    expect(host.relationships.list()).toHaveLength(256);
  });
  it('persists recovered routes under the same approved relationship and refuses changed identity', () => {
    const test = fixture();
    const first = test.open();
    const relationship = first.relationships.propose({ peer, direction: 'incoming' });
    first.relationships.approve(relationship.id, peer.publicKey);
    first.relationships.activate(relationship.id, peer.publicKey);
    expect(() =>
      first.relationships.updateRoutes(relationship.id, 'ff'.repeat(32), [
        'http://127.0.0.1:31003',
      ]),
    ).toThrow('relationship-identity-mismatch');
    first.relationships.updateRoutes(relationship.id, peer.publicKey, ['http://127.0.0.1:31003']);
    first.owner.close();
    const restarted = test.open();
    expect(restarted.relationships.list()).toMatchObject([
      {
        id: relationship.id,
        state: 'active',
        peer: { publicKey: peer.publicKey, routes: ['http://127.0.0.1:31003'] },
      },
    ]);
    expect(restarted.pairing.list()).toEqual([]);
  });
  it('requires exact approval, persists it and issues independently revocable grants through pairing', () => {
    const test = fixture();
    const first = test.open();
    const relationship = first.relationships.propose({ peer, direction: 'incoming' });
    expect(() => first.relationships.activate(relationship.id, peer.publicKey)).toThrow(
      'relationship-approval-required',
    );
    expect(() => first.relationships.approve(relationship.id, 'ef'.repeat(32))).toThrow(
      'relationship-identity-mismatch',
    );
    first.relationships.approve(relationship.id, peer.publicKey);
    first.owner.close();
    const host = test.open();
    expect(host.relationships.read(relationship.id).state).toBe('approved');
    host.relationships.activate(relationship.id, peer.publicKey);
    const offer = host.relationships.enrollment(relationship.id, peer.publicKey, client);
    const paired = host.pairing.redeem({ offer: offer.offer, publicKey: client.publicKey });
    if (!paired.ok) throw new Error(paired.code);
    expect(host.pairing.admitKey(`Device ${paired.credential}`, client.publicKey).ok).toBe(true);
    const phone = host.pairing.redeem({ offer: host.pairing.createOffer().offer });
    if (!phone.ok) throw new Error(phone.code);
    const lateClient = { ...client, publicKey: 'ef'.repeat(32) };
    const late = host.relationships.enrollment(relationship.id, peer.publicKey, lateClient);
    let closed = false;
    host.pairing.attachStream(paired.device.id, () => {
      closed = true;
    });
    host.relationships.disconnect(relationship.id);
    expect(closed).toBe(true);
    expect(host.pairing.admitKey(`Device ${paired.credential}`, client.publicKey)).toEqual({
      ok: false,
      code: 'device-revoked',
    });
    expect(host.pairing.redeem({ offer: late.offer, publicKey: lateClient.publicKey })).toEqual({
      ok: false,
      code: 'relationship-inactive',
    });
    expect(host.pairing.admit(`Device ${phone.credential}`).ok).toBe(true);
    host.owner.close();
    const restored = test.open();
    expect(restored.relationships.read(relationship.id)).toMatchObject({
      state: 'disconnected',
      peerRevocationPending: true,
    });
    expect(restored.pairing.admit(`Device ${phone.credential}`).ok).toBe(true);
    expect(restored.pairing.admit(`Device ${paired.credential}`).ok).toBe(false);
  });

  it('refuses expired or cancelled approval and never silently changes a pinned identity', () => {
    const test = fixture();
    const host = test.open();
    const relationship = host.relationships.propose({ peer, direction: 'incoming' });
    test.advance(RELATIONSHIP_APPROVAL_TTL_MS);
    expect(() => host.relationships.approve(relationship.id, peer.publicKey)).toThrow(
      'relationship-expired',
    );
    host.relationships.disconnect(relationship.id);
    expect(() => host.relationships.activate(relationship.id, peer.publicKey)).toThrow(
      'relationship-disconnected',
    );
    expect(() =>
      host.relationships.propose({
        peer: { ...peer, publicKey: 'ef'.repeat(32) },
        direction: 'incoming',
      }),
    ).toThrow('relationship-identity-mismatch');
    expect(host.pairing.list()).toEqual([]);
  });
});
