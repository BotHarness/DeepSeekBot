import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials';
import type { PrivateAdmission } from '../../../apps/mobile/src/host/hosts.js';
import type { RelationshipCredentialProvider } from '../src/devices/relationship-admission.js';
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

async function host(
  name: string,
  clock: () => number = Date.now,
  options: {
    credentials?: RelationshipCredentialProvider;
    privateAdmission?: () => PrivateAdmission | undefined;
  } = {},
) {
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
  const advertisedRoutes = [...routes];
  const control = createRelationshipControl({
    relationships,
    pairing,
    identity,
    routes: async () => advertisedRoutes,
    now: clock,
    ...(options.credentials ? { credentials: () => options.credentials } : {}),
    ...(options.privateAdmission ? { privateAdmission: options.privateAdmission } : {}),
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
    routes,
    advertisedRoutes,
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
    expect(
      await b.control.receive(a.publicKey, { action: 'verify-return', id: relationship.id }),
    ).toEqual({ ok: false, code: 'relationship-inactive' });
    expect(b.control.list()).toHaveLength(1);
    expect(a.pairing.list()).toEqual([]);
    expect(b.pairing.list()).toEqual([]);
    expect((await a.control.sync(relationship.id)).state).toBe('pending');
    b.control.approve(relationship.id, a.publicKey);
    expect((await a.control.sync(relationship.id)).state).toBe('active');
    expect(b.control.list()[0]?.state).toBe('active');
    a.relationships.updateRoutes(relationship.id, b.publicKey, ['http://127.0.0.1:1', ...b.routes]);
    expect((await a.control.sync(relationship.id)).reachability.outgoing.state).toBe('reachable');
    expect(a.relationships.read(relationship.id).peer.routes[0]).toBe(b.routes[0]);
    for (const [source, target] of [
      [a, b],
      [b, a],
    ]) {
      const grant = await enrollRelationshipClient({
        relationshipId: relationship.id,
        expectedPeer: { id: target!.pairing.host().id, publicKey: target!.publicKey },
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

it('refuses route recovery after authenticated peer retirement instead of reporting a recovered active relationship', async () => {
  const a = await host('A');
  const b = await host('B');
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    b.relationships.disconnect(relationship.id);
    await expect(a.control.recoverRoute(relationship.id, await b.link())).rejects.toThrow(
      'relationship-disconnected',
    );
    expect(a.control.list()[0]).toMatchObject({
      state: 'disconnected',
      peerRevocationPending: false,
      reachability: { outgoing: { state: 'unverified' }, incoming: { state: 'unverified' } },
    });
    expect(a.pairing.list()).toEqual([]);
    expect(b.pairing.list()).toEqual([]);
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});

it('keeps an approved partial relationship and completes its real missing direction without new approval or grants', async () => {
  let clock = Date.now();
  const a = await host('A', () => clock);
  const b = await host('B', () => clock);
  const other = await host('Wrong Host');
  try {
    a.advertisedRoutes.length = 0;
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    const partial = await a.control.sync(relationship.id);
    expect(partial).toMatchObject({
      state: 'active',
      reachability: {
        outgoing: { state: 'reachable' },
        incoming: { state: 'unavailable', refusal: 'relationship-route-unavailable' },
      },
    });
    expect(b.control.list()[0]?.peer.routes).toEqual([]);
    const credential = await enrollRelationshipClient({
      relationshipId: relationship.id,
      name: 'Already authorized',
      expectedPeer: relationship.peer,
      carrier: nodeDeviceCarrier(),
      request: async (input) =>
        a.control.enroll(relationship.id, String(input['publicKey']), String(input['name'])),
    });
    expect(credential.ok).toBe(true);
    const grants = b.pairing.list().length;
    await expect(b.control.recoverRoute(relationship.id, await other.link())).rejects.toThrow(
      'relationship-identity-mismatch',
    );
    expect(b.control.list()[0]?.peer.publicKey).toBe(a.publicKey);
    a.advertisedRoutes.push(...a.routes);
    const recovered = await a.control.sync(relationship.id);
    expect(recovered).toMatchObject({
      id: relationship.id,
      state: 'active',
      reachability: { outgoing: { state: 'reachable' }, incoming: { state: 'reachable' } },
    });
    expect(b.control.list()[0]?.peer.routes).toEqual(a.routes);
    expect(b.pairing.list()).toHaveLength(grants);
    expect(a.control.list()).toHaveLength(1);
    await b.control.recoverRoute(relationship.id, await a.link());
    expect(b.control.list()).toHaveLength(1);
    clock += 30_001;
    expect(a.control.list()[0]?.reachability).toMatchObject({
      outgoing: { state: 'stale' },
      incoming: { state: 'stale' },
    });
    a.advertisedRoutes.length = 0;
    expect((await a.control.sync(relationship.id)).reachability.incoming.state).toBe('unavailable');
  } finally {
    await Promise.all([a.close(), b.close(), other.close()]);
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

it.each(['tailscale', 'private'] as const)(
  'redeems a %s route through pinned Noise without a plaintext pairing request',
  async (kind) => {
    const a = await host('A');
    const b = await host('B');
    const origin =
      kind === 'tailscale' ? 'https://peer.example.ts.net' : 'https://peer.private.example';
    const privateRelay = kind === 'private' ? { origin, token: 'ab'.repeat(32) } : undefined;
    try {
      const relationship = await a.control.initiate(await b.link(), b.publicKey);
      b.control.approve(relationship.id, a.publicKey);
      await a.control.sync(relationship.id);
      const raw = nodeDeviceCarrier();
      let sockets = 0;
      const result = await enrollRelationshipClient({
        relationshipId: relationship.id,
        expectedPeer: relationship.peer,
        name: kind,
        carrier: {
          ...raw,
          request: async () => {
            throw new Error('plaintext-pairing-forbidden');
          },
          openSocket(url, events, headers) {
            sockets++;
            expect(url).toBe(`${origin.replace('https:', 'wss:')}/botharness-device/channel`);
            if (privateRelay)
              expect(headers).toMatchObject({
                Authorization: `Bearer ${privateRelay.token}`,
                'X-BotHarness-Admission': privateRelay.token,
              });
            return raw.openSocket(
              url.replace(origin.replace('https:', 'wss:'), b.routes[0]!.replace('http:', 'ws:')),
              events,
            );
          },
        },
        request: async (input) => {
          const ticket = await a.control.enroll(
            relationship.id,
            String(input['publicKey']),
            String(input['name']),
          );
          return {
            ...ticket,
            peer: { ...ticket.peer, routes: [origin], ...(privateRelay ? { privateRelay } : {}) },
          };
        },
      });
      expect(result.ok).toBe(true);
      expect(sockets).toBeGreaterThan(0);
      if (result.ok) {
        expect(result.host.hostId).toBe(b.pairing.host().id);
        expect(result.host.routes).toEqual([origin]);
        expect(b.pairing.list().some((device) => device.id === result.host.deviceId)).toBe(true);
      }
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  },
);

it('does not retain a late admission or route update after an authenticated status races with acknowledged disconnect', async () => {
  const records = new Map<string, CredentialRecord>();
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const blocked = new Promise<void>((done) => {
    release = done;
  });
  const started = new Promise<void>((done) => {
    entered = done;
  });
  let delay = false;
  const credentials: RelationshipCredentialProvider = {
    readRecord: async (key) => records.get(key),
    modifyRecord: async (key, mutate) => {
      const next = await mutate(records.get(key));
      if (delay) {
        delay = false;
        entered!();
        await blocked;
      }
      if (next) records.set(key, next);
      else records.delete(key);
      return next;
    },
    deleteRecord: async (key) => {
      records.delete(key);
    },
  };
  let admission = { origin: 'https://return-a.invalid', token: 'ab'.repeat(32) };
  const a = await host('A', Date.now, { privateAdmission: () => admission });
  const b = await host('B', Date.now, { credentials });
  a.advertisedRoutes.splice(0, a.advertisedRoutes.length, admission.origin);
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    const priorRoutes = b.relationships.read(relationship.id).peer.routes;
    expect(records.size).toBe(1);
    const staleReference = [...records.entries()][0];
    if (!staleReference) throw new Error('missing admission fixture');
    admission = { origin: 'https://changed-a.invalid', token: 'ef'.repeat(32) };
    a.advertisedRoutes.splice(0, a.advertisedRoutes.length, admission.origin);
    delay = true;
    const late = a.control.sync(relationship.id);
    await started;
    b.relationships.disconnect(relationship.id, a.publicKey);
    const cleanup = b.control.cleanupAdmission(relationship.id);
    release!();
    await late;
    await cleanup;
    expect(records.size).toBe(0);
    expect(b.relationships.read(relationship.id).peer.routes).toEqual(priorRoutes);
    expect(
      await b.control.receive(a.publicKey, { action: 'verify-return', id: relationship.id }),
    ).toEqual({ ok: false, code: 'relationship-disconnected' });
    expect(JSON.stringify(b.control.list())).not.toContain(admission.token);
    records.set(staleReference[0], staleReference[1]);
    expect(await b.control.cleanupAcknowledgedAdmissions()).toEqual({ cleaned: 1, failed: 0 });
    expect(records.size).toBe(0);
  } finally {
    release?.();
    await Promise.all([a.close(), b.close()]);
  }
});

it('enrolls separate Clients under one approval and revokes only the selected grant', async () => {
  const a = await host('A');
  const b = await host('B');
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    const enroll = (name: string) =>
      enrollRelationshipClient({
        relationshipId: relationship.id,
        expectedPeer: { id: b.pairing.host().id, publicKey: b.publicKey },
        name,
        carrier: nodeDeviceCarrier(),
        request: (input) =>
          a.control.enroll(relationship.id, String(input['publicKey']), String(input['name'])),
      });
    const one = await enroll('Browser one');
    const two = await enroll('Browser two');
    if (!one.ok || !two.ok) throw new Error('enrollment failed');
    expect(one.host.deviceId).not.toBe(two.host.deviceId);
    expect(one.host.credential).not.toBe(two.host.credential);
    expect(one.host.encryption?.deviceKey).not.toBe(two.host.encryption?.deviceKey);
    expect(b.pairing.list().map((device) => device.name)).toEqual(
      expect.arrayContaining(['Browser one', 'Browser two']),
    );
    const independent = b.pairing.redeem({ offer: b.pairing.createOffer().offer });
    if (!independent.ok) throw new Error(independent.code);
    b.pairing.revoke(one.host.deviceId);
    expect(b.pairing.check(one.host.deviceId).ok).toBe(false);
    expect(b.pairing.check(two.host.deviceId).ok).toBe(true);
    expect(b.pairing.admit(`Device ${independent.credential}`).ok).toBe(true);
    expect(a.control.list()[0]?.state).toBe('active');
    await a.control.disconnect(relationship.id);
    const fresh = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(fresh.id, a.publicKey);
    await a.control.sync(fresh.id);
    await expect(enroll('Stale browser')).rejects.toThrow('relationship-inactive');
    expect(b.pairing.check(two.host.deviceId).ok).toBe(false);
    expect(b.pairing.admit(`Device ${independent.credential}`).ok).toBe(true);
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});

it('refuses changed targets, cancellation and disconnect during Client enrollment', async () => {
  const a = await host('A');
  const b = await host('B');
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    for (const mode of ['target', 'cancel', 'disconnect']) {
      const abort = new AbortController();
      const result = await enrollRelationshipClient({
        relationshipId: relationship.id,
        expectedPeer: { id: b.pairing.host().id, publicKey: b.publicKey },
        name: 'Browser',
        carrier: nodeDeviceCarrier(),
        signal: abort.signal,
        request: async (input) => {
          const ticket = await a.control.enroll(
            relationship.id,
            String(input['publicKey']),
            String(input['name']),
          );
          if (mode === 'cancel') abort.abort();
          if (mode === 'disconnect') await a.control.disconnect(relationship.id);
          return mode === 'target'
            ? { ...ticket, peer: { ...ticket.peer, id: 'wrong-host' } }
            : ticket;
        },
      });
      expect(result.ok).toBe(false);
      if (mode === 'target') expect(result).toEqual({ ok: false, code: 'host-key-changed' });
      if (mode === 'cancel') expect(result).toEqual({ ok: false, code: 'cancelled' });
      expect(b.pairing.list()).toHaveLength(0);
    }
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});
