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
import { createRelationshipHttp } from '../src/devices/relationship-http.js';
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
    retained?: { home: string; privateKey: Uint8Array; port: number };
    beforeReceive?: () => Promise<void>;
    beforeReply?: (input: unknown, response: Record<string, unknown>) => Promise<void>;
  } = {},
) {
  const retained = options.retained;
  const home = retained?.home ?? createTempRoot('relationship-wire-');
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: home,
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
    now: clock,
  });
  const privateKey = retained ? Buffer.from(retained.privateKey) : randomBytes(32);
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
  await new Promise<void>((resolve) => server.listen(retained?.port ?? 0, '127.0.0.1', resolve));
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
    relationship: async (peerKey, input) => {
      await options.beforeReceive?.();
      const response = await control.receive(peerKey, input);
      await options.beforeReply?.(input, response);
      return response;
    },
  });
  server.on('upgrade', (request, socket, head) => {
    void gateway.upgrade(request, socket, head);
  });
  return {
    disposeAuthority: () => owner.close(),
    retained: { home, privateKey: Uint8Array.from(privateKey), port },
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
      owner.close();
    },
  };
}

it('aborts an in-flight retirement before disposing its authority without late reads or an unhandled rejection', async () => {
  let gate: Promise<void> | undefined;
  let release = () => {};
  let arrived = () => {};
  const a = await host('A');
  const b = await host('B', Date.now, {
    beforeReceive: async () => {
      if (gate) {
        arrived();
        await gate;
      }
    },
  });
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    gate = new Promise((resolve) => {
      release = resolve;
    });
    const received = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const pending = a.control.disconnect(relationship.id);
    await received;
    a.control.close();
    a.disposeAuthority();
    expect(await pending).toMatchObject({ state: 'disconnected', peerRevocationPending: true });
    release();
  } finally {
    release();
    await a.close();
    await b.close();
  }
});

it('acknowledges simultaneous retirements before cleaning only their admission references', async () => {
  const deleted: [string[], string[]] = [[], []];
  const credentials = (index: 0 | 1): RelationshipCredentialProvider => ({
    readRecord: async () => undefined,
    modifyRecord: async (_key, mutate) => {
      await mutate(undefined);
    },
    deleteRecord: async (key) => {
      deleted[index].push(key);
    },
  });
  const a = await host('A', Date.now, { credentials: credentials(0) });
  const b = await host('B', Date.now, { credentials: credentials(1) });
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    const outcomes = await Promise.all([
      a.control.disconnect(relationship.id),
      b.control.disconnect(relationship.id),
    ]);
    expect(
      outcomes.every((item) => item.state === 'disconnected' && !item.peerRevocationPending),
    ).toBe(true);
    expect(deleted.map((keys) => keys.length)).toEqual([1, 1]);
    expect(deleted.flat().every((key) => key.includes('relationship-route-'))).toBe(true);
  } finally {
    await a.close();
    await b.close();
  }
});

it('persists offline retirement across both Host restarts and retries the exact generation through the encrypted gateway', async () => {
  let clock = Date.now();
  let a = await host('A', () => clock);
  let b = await host('B', () => clock);
  let aOpen = true;
  let bOpen = true;
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    const grant = await enrollRelationshipClient({
      relationshipId: relationship.id,
      expectedPeer: relationship.peer,
      name: 'Browser',
      carrier: nodeDeviceCarrier(),
      request: (input) =>
        a.control.enroll(relationship.id, String(input['publicKey']), String(input['name'])),
    });
    if (!grant.ok) throw new Error(grant.code);
    const phone = b.pairing.redeem({ offer: b.pairing.createOffer().offer });
    if (!phone.ok) throw new Error(phone.code);
    const aState = a.retained;
    const bState = b.retained;
    await b.close();
    bOpen = false;
    expect(await a.control.disconnect(relationship.id)).toMatchObject({
      state: 'disconnected',
      peerRevocationPending: true,
      revocationAttempts: 1,
    });
    await a.close();
    aOpen = false;
    a = await host('A', () => clock, { retained: aState });
    aOpen = true;
    expect(a.control.list()[0]).toMatchObject({
      state: 'disconnected',
      peerRevocationPending: true,
      automaticEnrollmentSuppressed: true,
      revocationAttempts: 1,
    });
    await expect(a.control.enroll(relationship.id, 'cd'.repeat(32), 'Late')).rejects.toThrow(
      'relationship-inactive',
    );
    b = await host('B', () => clock, { retained: bState });
    bOpen = true;
    expect(b.pairing.check(grant.host.deviceId).ok).toBe(true);
    clock += 3000;
    await a.control.retryPending();
    expect(a.control.list()[0]).toMatchObject({
      state: 'disconnected',
      peerRevocationPending: false,
    });
    expect(b.control.list()[0]).toMatchObject({
      state: 'disconnected',
      automaticEnrollmentSuppressed: true,
    });
    expect(b.pairing.check(grant.host.deviceId).ok).toBe(false);
    expect(b.pairing.admit(`Device ${phone.credential}`).ok).toBe(true);
    const fresh = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(fresh.id, a.publicKey);
    await a.control.sync(fresh.id);
    expect(
      await b.control.receive(a.publicKey, { action: 'disconnect', id: relationship.id }),
    ).toMatchObject({ ok: true, state: 'disconnected' });
    expect(b.relationships.read(fresh.id).state).toBe('active');
    expect(b.relationships.read(relationship.id).automaticEnrollmentSuppressed).toBe(false);
    expect(a.relationships.read(fresh.id).state).toBe('active');
  } finally {
    if (aOpen) await a.close();
    if (bOpen) await b.close();
  }
});

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

it('retires an unapproved proposal through pending-only cleanup', async () => {
  const a = await host('A');
  const b = await host('B');
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    const response = await createRelationshipHttp(a.control)(
      new Request('http://localhost/api/botharness/relationships', {
        method: 'POST',
        body: JSON.stringify({
          action: 'cancel',
          id: relationship.id,
          confirm: true,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(a.control.list()).toMatchObject([
      { state: 'disconnected', peerRevocationPending: false },
    ]);
    expect(b.control.list()).toMatchObject([
      { state: 'disconnected', peerRevocationPending: false },
    ]);
    expect(a.relationships.read(relationship.id).automaticEnrollmentSuppressed).toBe(false);
    expect(b.relationships.read(relationship.id).automaticEnrollmentSuppressed).toBe(false);
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});

it('preserves an activated relationship when stale pending cleanup arrives after a lost sync reply', async () => {
  const a = await host('A');
  const b = await host('B');
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    const before = [a.relationships.read(relationship.id), b.relationships.read(relationship.id)];
    const response = await createRelationshipHttp(a.control)(
      new Request('http://localhost/api/botharness/relationships', {
        method: 'POST',
        body: JSON.stringify({
          action: 'cancel',
          id: relationship.id,
          confirm: true,
        }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'relationship-already-active' });
    expect(a.control.list()).toMatchObject([{ state: 'active', peerRevocationPending: false }]);
    expect(b.control.list()).toMatchObject([{ state: 'active', peerRevocationPending: false }]);
    expect([a.relationships.read(relationship.id), b.relationships.read(relationship.id)]).toEqual(
      before,
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

it('keeps recovered routes when an older authenticated status reply arrives later', async () => {
  let hold = false;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const a = await host('A');
  const b = await host('B', Date.now, {
    beforeReply: async (input) => {
      if (
        hold &&
        typeof input === 'object' &&
        input !== null &&
        'action' in input &&
        input.action === 'status'
      ) {
        hold = false;
        entered();
        await blocked;
      }
    },
  });
  try {
    b.advertisedRoutes.push('http://127.0.0.1:1');
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    hold = true;
    const older = a.control.sync(relationship.id);
    await started;
    b.advertisedRoutes.splice(1, 1, 'http://127.0.0.1:2');
    const recovered = await a.control.recoverRoute(relationship.id, await b.link());
    expect(recovered.peer.routes).toContain('http://127.0.0.1:2');
    release();
    await older;
    expect(a.control.list()[0]?.peer.routes).toEqual(recovered.peer.routes);
    expect(a.control.list()[0]?.peer.routes).not.toContain('http://127.0.0.1:1');
  } finally {
    release();
    await Promise.all([a.close(), b.close()]);
  }
});

it('retires local authorization when a return probe discovers authenticated peer retirement', async () => {
  const a = await host('A');
  const b = await host('B');
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    const client = await enrollRelationshipClient({
      relationshipId: relationship.id,
      expectedPeer: relationship.peer,
      name: 'Existing Client',
      carrier: nodeDeviceCarrier(),
      request: (input) =>
        a.control.enroll(relationship.id, String(input['publicKey']), String(input['name'])),
    });
    if (!client.ok) throw new Error(client.code);
    expect(b.pairing.admit(`Device ${client.host.credential}`).ok).toBe(true);
    a.relationships.disconnect(relationship.id);
    expect(
      await b.control.receive(a.publicKey, { action: 'verify-return', id: relationship.id }),
    ).toEqual({ ok: false, code: 'relationship-disconnected' });
    expect(b.control.list()[0]).toMatchObject({
      state: 'disconnected',
      peerRevocationPending: false,
      reachability: { outgoing: { state: 'unverified' }, incoming: { state: 'unverified' } },
    });
    expect(b.pairing.admit(`Device ${client.host.credential}`)).toMatchObject({
      ok: false,
      code: 'device-revoked',
    });
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

it.each(['tailscale', 'private', 'private-fallback'] as const)(
  'redeems a %s route through pinned Noise without a plaintext pairing request',
  async (kind) => {
    const a = await host('A');
    const b = await host('B');
    const origin =
      kind === 'tailscale' ? 'https://peer.example.ts.net' : 'https://peer.private.example';
    const backup = 'https://peer.backup.example';
    const privateRelay =
      kind !== 'tailscale'
        ? {
            origin,
            token: 'ab'.repeat(32),
            ...(kind === 'private-fallback' ? { additionalOrigins: [backup] } : {}),
          }
        : undefined;
    try {
      const relationship = await a.control.initiate(await b.link(), b.publicKey);
      b.control.approve(relationship.id, a.publicKey);
      await a.control.sync(relationship.id);
      const raw = nodeDeviceCarrier();
      let sockets = 0;
      const attempted: string[] = [];
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
            attempted.push(url);
            if (privateRelay)
              expect(headers).toMatchObject({
                Authorization: `Bearer ${privateRelay.token}`,
                'X-BotHarness-Admission': privateRelay.token,
              });
            if (kind === 'private-fallback' && url.startsWith(origin.replace('https:', 'wss:'))) {
              queueMicrotask(() => events.closed('socket-unreachable'));
              return { send() {}, close() {} };
            }
            const reachable = kind === 'private-fallback' ? backup : origin;
            expect(url).toBe(`${reachable.replace('https:', 'wss:')}/botharness-device/channel`);
            return raw.openSocket(
              url.replace(
                reachable.replace('https:', 'wss:'),
                b.routes[0]!.replace('http:', 'ws:'),
              ),
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
            peer: {
              ...ticket.peer,
              routes: kind === 'private-fallback' ? [origin, backup] : [origin],
              ...(privateRelay ? { privateRelay } : {}),
            },
          };
        },
      });
      expect(result.ok).toBe(true);
      expect(sockets).toBeGreaterThan(0);
      if (result.ok) {
        expect(result.host.hostId).toBe(b.pairing.host().id);
        expect(result.host.routes).toEqual(
          kind === 'private-fallback' ? [backup, origin] : [origin],
        );
        if (kind === 'private-fallback')
          expect(attempted).toEqual([
            `${origin.replace('https:', 'wss:')}/botharness-device/channel`,
            `${backup.replace('https:', 'wss:')}/botharness-device/channel`,
          ]);
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
