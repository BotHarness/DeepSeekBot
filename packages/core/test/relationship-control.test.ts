import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { createNoiseIdentity } from '../src/devices/noise-identity.js';
import { noiseFingerprint, noisePublicKey, NOISE_PROTOCOL } from '../src/devices/noise/xk.js';
import { CONNECT_PROTOCOL } from '../src/devices/noise/channel.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import { createRelationshipControl } from '../src/devices/relationship-control.js';
import { enrollRelationshipClient } from '../src/devices/relationship-enrollment.js';
import { nodeDeviceCarrier } from '../src/devices/node-carrier.js';
import { createEncryptedGateway } from '../src/devices/encrypted-gateway.js';
import { pairingLink } from '../src/devices/http.js';
import { parsePairingLink } from '../../../apps/mobile/src/host/pairing.js';
import { parseSavedHost, serializeSavedHost } from '../../../apps/mobile/src/host/hosts.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

async function host(name: string) {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('relationship-wire-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const pairing = createDevicePairing({
    database: attachOperationalModule(owner, 'device-pairing'),
    hostName: name,
  });
  const relationships = createHostRelationships({
    database: attachOperationalModule(owner, 'host-relationships'),
    pairing,
  });
  const privateKey = randomBytes(32);
  const publicKey = noisePublicKey(privateKey);
  const identity: Pick<ReturnType<typeof createNoiseIdentity>, 'key' | 'publicIdentity'> = {
    key: async () => Uint8Array.from(privateKey),
    publicIdentity: async () => ({
      protocol: CONNECT_PROTOCOL,
      noise: NOISE_PROTOCOL,
      required: true,
      publicKey: Buffer.from(publicKey).toString('hex'),
      fingerprint: noiseFingerprint(publicKey),
    }),
  };
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const routes = [`http://127.0.0.1:${port}`];
  const control = createRelationshipControl({
    relationships,
    pairing,
    identity,
    routes: async () => routes,
  });
  const gateway = createEncryptedGateway({
    pairing,
    key: identity.key,
    port: () => port,
    relationship: control.receive,
  });
  server.on('upgrade', (request, socket, head) => {
    void gateway.upgrade(request, socket, head);
  });
  return {
    pairing,
    relationships,
    control,
    publicKey: Buffer.from(publicKey).toString('hex'),
    async link() {
      const offer = pairing.createOffer();
      return pairingLink({
        v: 2,
        encryption: { ...(await identity.publicIdentity()), loopback: 'encrypted' },
        host: pairing.host(),
        offer: offer.offer,
        expiresAt: offer.expiresAt,
        routes,
      });
    },
    async close() {
      control.close();
      gateway.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      privateKey.fill(0);
    },
  };
}

it('establishes exact reciprocal authorization over real Noise sockets and retires only derived grants', async () => {
  const a = await host('A');
  const b = await host('B');
  try {
    const link = await b.link();
    await expect(a.control.initiate(link, 'aa'.repeat(32))).rejects.toThrow(
      'relationship-identity-mismatch',
    );
    const relationship = await a.control.initiate(link, b.publicKey);
    expect(b.control.list()).toHaveLength(1);
    expect(a.pairing.list()).toEqual([]);
    expect(b.pairing.list()).toEqual([]);
    expect((await a.control.sync(relationship.id)).state).toBe('pending');
    b.control.approve(relationship.id, a.publicKey);
    expect((await a.control.sync(relationship.id)).state).toBe('active');
    expect(b.control.list()[0]?.state).toBe('active');
    for (const [source, target] of [
      [a, b],
      [b, a],
    ]) {
      const grant = await enrollRelationshipClient({
        relationshipId: relationship.id,
        name: 'Desktop',
        carrier: nodeDeviceCarrier(),
        request: async (input) =>
          source!.control.enroll(
            relationship.id,
            String(input['publicKey']),
            String(input['name']),
          ),
      });
      expect(grant.ok).toBe(true);
      if (grant.ok) expect(parseSavedHost(serializeSavedHost(grant.host))).toEqual(grant.host);
      expect(target!.pairing.list()).toHaveLength(1);
    }
    const phone = b.pairing.redeem({ offer: b.pairing.createOffer().offer });
    if (!phone.ok) throw new Error(phone.code);
    const disconnected = await a.control.disconnect(relationship.id);
    expect(disconnected).toMatchObject({ state: 'disconnected', peerRevocationPending: false });
    expect(a.pairing.list().every((device) => device.revokedAt !== undefined)).toBe(true);
    expect(b.pairing.admit(`Device ${phone.credential}`).ok).toBe(true);
    await expect(b.control.enroll(relationship.id, 'cd'.repeat(32), 'Late')).rejects.toThrow(
      'relationship-inactive',
    );
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});

it('retires refused initiation so a fresh verified invitation can be used', async () => {
  const a = await host('A');
  const b = await host('B');
  try {
    const usedLink = await b.link();
    const parsed = parsePairingLink(usedLink);
    if (!parsed.ok) throw new Error(parsed.code);
    expect(b.pairing.claimRelationshipOffer(parsed.payload.offer)).toBe(true);
    await expect(a.control.initiate(usedLink, b.publicKey)).rejects.toThrow('offer-invalid');
    expect(a.control.list()).toMatchObject([{ state: 'disconnected' }]);
    expect(b.control.list()).toEqual([]);
    const fresh = await a.control.initiate(await b.link(), b.publicKey);
    expect(fresh.state).toBe('pending');
    b.control.approve(fresh.id, a.publicKey);
    expect((await a.control.sync(fresh.id)).state).toBe('active');
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});
