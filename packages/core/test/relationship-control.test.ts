import { createHmac, randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { openNoiseSocket } from '@botharness/host-client/encrypted-carrier';
import {
  accountRelationshipVerifier,
  type AccountRelationshipProof,
} from '../src/devices/account-relationship-proof.js';
import type { AccountRelationshipSession } from '../src/devices/connect-account.js';
import { CONNECT_PROTOCOL } from '@botharness/host-protocol/noise/channel';
import { createRelationshipControl } from '../src/devices/relationship-control.js';
import { createRelationshipHttp } from '../src/devices/relationship-http.js';
import { enrollRelationshipClient } from '../src/devices/relationship-enrollment.js';
import { nodeDeviceCarrier } from '../src/devices/node-carrier.js';
import { parseSavedHost, serializeSavedHost } from '@botharness/host-client/hosts';
import { host } from './support/relationship-control.js';

it('qualifies the same manual relationship through pinned Noise proof before accepting account-enroll for a new independent Client', async () => {
  let account: ReturnType<NonNullable<Parameters<typeof createRelationshipControl>[0]['account']>>;
  const a = await host('A');
  const b = await host('B', Date.now, { account: () => account });
  const relayKey = randomBytes(32);
  const sign = (body: string) => createHmac('sha256', relayKey).update(body).digest('base64url');
  const localRegistrationId = 'hbbbbbbbbbbbb';
  const sourceRegistrationId = 'haaaaaaaaaaaa';
  const session: AccountRelationshipSession = {
    accountId: 'wire-test-account',
    registrationId: localRegistrationId,
    generation: 'wire-generation',
    current: () => true,
    hosts: async () => [],
    offer: async (registrationId, verifierHash) => {
      const selected = registrationId === localRegistrationId ? b : a;
      const body = JSON.stringify({ registrationId, verifierHash, accountId: 'wire-test-account' });
      return {
        host: selected.pairing.host(),
        hostname: `${registrationId}.deepseekbot.dev`,
        encryption: { protocol: CONNECT_PROTOCOL, publicKey: selected.publicKey },
        enrollment: { body, signature: sign(body) },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    },
  };
  account = {
    relationshipSession: async () => session,
    verifyOffer: async (body, signature) => {
      const payload = z
        .object({ registrationId: z.string(), verifierHash: z.string(), accountId: z.string() })
        .parse(JSON.parse(body));
      return signature === sign(body) &&
        payload.registrationId === localRegistrationId &&
        payload.accountId === session.accountId
        ? { ok: true, verifierHash: payload.verifierHash, accountAutoApprove: true }
        : { ok: false };
    },
  };
  const send = (command: Record<string, unknown>) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const channel = openNoiseSocket({
        origin: b.routes[0]!,
        hostId: b.pairing.host().id,
        encryption: {
          protocol: CONNECT_PROTOCOL,
          hostKey: b.publicKey,
          deviceKey: Buffer.from(a.retained.privateKey).toString('hex'),
        },
        raw: nodeDeviceCarrier(),
        message: (value) => {
          if (value['type'] !== 'relationship-result') return;
          clearTimeout(timer);
          resolve(value);
          channel.close();
        },
        closed: () => {
          clearTimeout(timer);
          reject(new Error('wire closed'));
        },
      });
      const timer = setTimeout(() => {
        channel.close();
        reject(new Error('wire deadline'));
      }, 5000);
      void channel.ready
        .then(() => channel.send({ type: 'relationship', command }))
        .catch((error) => {
          clearTimeout(timer);
          channel.close();
          reject(error instanceof Error ? error : new Error(String(error), { cause: error }));
        });
    });
  try {
    const relationship = await a.control.initiate(await b.link(), b.publicKey);
    b.control.approve(relationship.id, a.publicKey);
    await a.control.sync(relationship.id);
    const previous = b.relationships.read(relationship.id);
    expect(previous.accountOrigin).toBeNull();
    const independent = b.pairing.redeem({ offer: b.pairing.createOffer().offer });
    if (!independent.ok) throw new Error('fixture independent grant refused');
    const publicKey = randomBytes(32).toString('hex');
    const enroll = {
      action: 'account-enroll',
      id: relationship.id,
      publicKey,
      name: 'New account Client',
      expiresAt: Date.now() + 60_000,
    };
    expect(await send(enroll)).toMatchObject({
      ok: false,
      code: 'account-enrollment-origin-mismatch',
    });
    const proof: AccountRelationshipProof = {
      purpose: 'account-host-relationship-v1',
      relationshipId: relationship.id,
      source: {
        registrationId: sourceRegistrationId,
        hostId: a.pairing.host().id,
        publicKey: a.publicKey,
      },
      target: {
        registrationId: localRegistrationId,
        hostId: b.pairing.host().id,
        publicKey: b.publicKey,
      },
      expiresAt: Date.now() + 60_000,
      nonce: randomBytes(32).toString('base64url'),
    };
    const signed = await session.offer(
      localRegistrationId,
      accountRelationshipVerifier(proof),
      new AbortController().signal,
    );
    expect(
      await send({ action: 'account-propose', proof, enrollment: signed.enrollment }),
    ).toMatchObject({ ok: true, state: 'active' });
    const ticket = await send(enroll);
    expect(ticket['ok']).toBe(true);
    if (typeof ticket['offer'] !== 'string') throw new Error('missing real enrollment offer');
    const issued = b.pairing.redeem({ offer: ticket['offer'], publicKey });
    expect(issued.ok).toBe(true);
    const qualified = b.relationships.read(relationship.id);
    expect(qualified).toMatchObject({
      id: previous.id,
      state: previous.state,
      direction: previous.direction,
    });
    expect(qualified.peer.routes).toEqual(expect.arrayContaining(previous.peer.routes));
    expect(b.pairing.list().find((device) => device.id === independent.device.id)).toEqual(
      independent.device,
    );
    expect(b.pairing.list()).toHaveLength(2);
  } finally {
    await a.close();
    await b.close();
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
      if (grant.ok) {
        const { relationshipEnrollment: pending, ...saved } = grant.host;
        expect(pending.publicKey).toBe(grant.enrollmentPublicKey);
        expect(parseSavedHost(serializeSavedHost(grant.host))).toEqual(saved);
      }
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
