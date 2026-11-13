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
    const late = host.relationships.enrollment(relationship.id, peer.publicKey, client);
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
    expect(host.pairing.redeem({ offer: late.offer, publicKey: client.publicKey })).toEqual({
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
