import { expect, it } from 'vitest';
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials';
import type { RelationshipCredentialProvider } from '../src/devices/relationship-admission.js';
import { createRelationshipHttp } from '../src/devices/relationship-http.js';
import { enrollRelationshipClient } from '../src/devices/relationship-enrollment.js';
import { nodeDeviceCarrier } from '../src/devices/node-carrier.js';
import { parsePairingLink } from '@botharness/host-client/pairing';
import { host } from './support/relationship-control.js';

it('cleans an unknown committed grant by its exact Client key after lost paired reply, source restart and route recovery', async () => {
  let now = Date.now();
  const clock = () => now;
  let source = await host('A', clock);
  const target = await host('B', clock);
  const closed = new Set<object>();
  const close = async (item: Awaited<ReturnType<typeof host>>) => {
    if (closed.has(item)) return;
    closed.add(item);
    await item.close();
  };
  try {
    const outgoing = await source.control.initiate(await target.link(), target.publicKey);
    target.control.approve(outgoing.id, source.publicKey);
    await source.control.sync(outgoing.id);
    const keepKey = 'ef'.repeat(32);
    const keepOffer = target.relationships.enrollment(outgoing.id, source.publicKey, {
      publicKey: keepKey,
      name: 'Keep Client',
    });
    const keep = target.pairing.redeem({ offer: keepOffer.offer, publicKey: keepKey });
    const phone = target.pairing.redeem({ offer: target.pairing.createOffer().offer });
    if (!keep.ok || !phone.ok) throw new Error('fixture pairing refused');
    const abort = new AbortController();
    const redeem = target.pairing.redeem.bind(target.pairing);
    let mintedKey = '';
    target.pairing.redeem = (input) => {
      const result = redeem(input);
      if (result.ok && input.publicKey !== undefined) {
        mintedKey = input.publicKey;
        abort.abort();
        source.relationships.updateRoutes(outgoing.id, target.publicKey, []);
      }
      return result;
    };
    const result = await enrollRelationshipClient({
      relationshipId: outgoing.id,
      expectedPeer: outgoing.peer,
      name: 'Lost reply Client',
      carrier: nodeDeviceCarrier(),
      signal: abort.signal,
      request: async (body) => {
        if (
          body['action'] !== 'enroll' ||
          typeof body['publicKey'] !== 'string' ||
          typeof body['name'] !== 'string'
        )
          throw new Error('unexpected enrollment request');
        return source.control.enroll(outgoing.id, body['publicKey'], body['name']);
      },
      cleanupRequest: async (body) => {
        if (body['action'] !== 'cancel-enrollment' || typeof body['publicKey'] !== 'string')
          throw new Error('unexpected cleanup request');
        return source.control.cancelEnrollment(outgoing.id, body['publicKey']);
      },
    });
    expect(result.ok).toBe(false);
    const issued = target.pairing.list().find((device) => device.publicKey === mintedKey);
    if (!issued) throw new Error('missing committed unknown grant');
    expect(target.pairing.check(issued.id).ok).toBe(true);
    expect(
      source.relationships.enrollments.list().find((item) => item.publicKey === mintedKey),
    ).toMatchObject({ state: 'cleanup-pending' });
    const retained = source.retained;
    await close(source);
    source = await host('A', clock, { retained });
    await source.control.recoverRoute(outgoing.id, await target.link());
    now += 10_000;
    await source.control.retryPending();
    expect(
      source.relationships.enrollments.list().find((item) => item.publicKey === mintedKey),
    ).toMatchObject({ state: 'cleaned' });
    expect(target.pairing.check(issued.id)).toMatchObject({ ok: false, code: 'device-revoked' });
    expect(target.pairing.check(keep.device.id).ok).toBe(true);
    expect(target.pairing.check(phone.device.id).ok).toBe(true);
  } finally {
    await close(source);
    await close(target);
  }
}, 20_000);

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
