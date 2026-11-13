import { z } from 'zod';
import {
  relationshipObservationSchema,
  relationshipTransportPeerSchema,
  type RelationshipTransportPeer,
} from './relationship-contract.js';
import {
  createRelationshipAdmissions,
  type RelationshipCredentialProvider,
} from './relationship-admission.js';
import type { PrivateAdmission } from '../../../../apps/mobile/src/host/hosts.js';
import { openNoiseSocket } from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { checkRoute, isPrivateRoute } from '../../../../apps/mobile/src/host/route.js';
import { parsePairingLink } from '../../../../apps/mobile/src/host/pairing.js';
import { nodeDeviceCarrier } from './node-carrier.js';
import type { DevicePairing } from './pairing.js';
import type { EncryptionIdentity } from './noise-identity.js';
import {
  RelationshipRefused,
  MAX_REVOCATION_ATTEMPTS,
  type HostRelationships,
  type RelationshipPeer,
} from './relationships.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{32}$/u);
const key = z.string().regex(/^[0-9a-f]{64}$/u);
const peerSchema = relationshipTransportPeerSchema;
const publicPeer = (peer: RelationshipTransportPeer): RelationshipPeer => ({
  id: peer.id,
  name: peer.name,
  publicKey: peer.publicKey,
  routes: peer.routes,
});
const commandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('propose'),
    id,
    peer: peerSchema,
    offer: z.string().max(128),
    expiresAt: z.number().int(),
  }),
  z.object({ action: z.literal('status'), id, peer: peerSchema.optional() }),
  z.object({ action: z.literal('verify-return'), id }),
  z.object({ action: z.literal('activate'), id }),
  z.object({
    action: z.literal('disconnect'),
    id,
    suppressAutomaticEnrollment: z.boolean().optional(),
  }),
  z.object({ action: z.literal('enroll'), id, publicKey: key, name: z.string().max(60) }),
]);
type Command = z.infer<typeof commandSchema>;

export function createRelationshipControl(options: {
  relationships: HostRelationships;
  pairing: DevicePairing;
  identity: { key(): Promise<Uint8Array>; publicIdentity(): Promise<EncryptionIdentity> };
  routes(): Promise<string[]>;
  privateAdmission?: () => PrivateAdmission | undefined;
  credentials?: () => RelationshipCredentialProvider | undefined;
  now?: () => number;
  record?: (event: {
    phase: string;
    relationshipId: string;
    durationMs: number;
    outgoing: string;
    incoming: string;
    refusal?: string;
  }) => void;
}) {
  const { relationships, pairing } = options;
  const admissions = createRelationshipAdmissions({
    relationships,
    credentials: options.credentials ?? (() => undefined),
    isOpen: () => !closed,
  });
  const active = new Set<AbortController>();
  let closed = false;
  const checkOpen = () => {
    if (closed) throw new RelationshipRefused('relationship-owner-closed');
  };
  const readRelationship = (id: string) => {
    checkOpen();
    return relationships.read(id);
  };
  const checkRelationship = (id: string, peerKey: string) => {
    checkOpen();
    return relationships.check(id, peerKey);
  };
  const now = options.now ?? Date.now;
  type Observation = z.infer<typeof relationshipObservationSchema>;
  const observations = new Map<string, { outgoing: Observation; incoming: Observation }>();
  const running = new Map<string, Promise<ReturnType<typeof snapshot>>>();
  const revoking = new Map<string, Promise<ReturnType<typeof snapshot>>>();
  let retryTimer: ReturnType<typeof setInterval> | undefined;
  const unknown = (): Observation => ({ state: 'unverified', observedAt: null });
  const fresh = (value: Observation): Observation =>
    value.observedAt !== null && now() - value.observedAt > 30_000
      ? { ...value, state: 'stale' }
      : value;
  const reachability = (id: string) => {
    const value = observations.get(id);
    return {
      outgoing: fresh(value?.outgoing ?? unknown()),
      incoming: fresh(value?.incoming ?? unknown()),
    };
  };
  const snapshot = (id: string) => ({ ...readRelationship(id), reachability: reachability(id) });
  const activeRelationship = (id: string, peerKey?: string) => {
    const relationship = readRelationship(id);
    const current = checkRelationship(id, peerKey ?? relationship.peer.publicKey);
    if (current.state !== 'active') throw new RelationshipRefused('relationship-inactive');
    return current;
  };
  const observe = (id: string, direction: 'outgoing' | 'incoming', value: Observation) => {
    if (closed || readRelationship(id).state === 'disconnected') return;
    observations.set(id, { ...reachability(id), [direction]: value });
  };
  const ownPeer = async (): Promise<RelationshipPeer> => ({
    ...pairing.host(),
    publicKey: (await options.identity.publicIdentity()).publicKey,
    routes: await options.routes(),
  });
  const wirePeer = async (): Promise<RelationshipTransportPeer> => {
    const privateRelay = options.privateAdmission?.();
    const parsed = peerSchema.safeParse({
      ...(await ownPeer()),
      ...(privateRelay ? { privateRelay } : {}),
    });
    if (!parsed.success) throw new RelationshipRefused('relationship-route-secret-unavailable');
    return parsed.data;
  };
  const requestOnce = async (
    peer: RelationshipTransportPeer,
    command: Command,
    origin: string,
    timeout: number,
  ): Promise<Record<string, unknown>> => {
    if (closed) throw new RelationshipRefused('relationship-owner-closed');
    if (active.size >= 8) throw new RelationshipRefused('relationship-busy');
    const privateRelay = isPrivateRoute(origin)
      ? (peer.privateRelay ?? (await admissions.read(command.id)))
      : undefined;
    if (!origin || !checkRoute(origin, privateRelay).ok)
      throw new RelationshipRefused('relationship-route-unavailable');
    const abort = new AbortController();
    active.add(abort);
    let channel: ReturnType<typeof openNoiseSocket> | undefined;
    let secret: Uint8Array | undefined;
    const timer = setTimeout(() => abort.abort(), timeout);
    try {
      secret = await options.identity.key();
      if (abort.signal.aborted || closed) throw new RelationshipRefused('relationship-cancelled');
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const stop = (reason?: unknown) =>
          reject(
            new RelationshipRefused(
              typeof reason === 'string' && reason.includes('authentication')
                ? 'relationship-identity-verification-failed'
                : 'relationship-request-incomplete',
            ),
          );
        abort.signal.addEventListener('abort', () => stop(), { once: true });
        channel = openNoiseSocket({
          origin,
          hostId: peer.id,
          encryption: {
            protocol: 'connect-noise-xk-v1',
            hostKey: peer.publicKey,
            deviceKey: Buffer.from(secret!).toString('hex'),
            ...(privateRelay ? { privateRelay } : {}),
          },
          raw: nodeDeviceCarrier(),
          message(value) {
            if (value['type'] !== 'relationship-result') return;
            if (value['ok'] !== true)
              reject(
                new RelationshipRefused(
                  typeof value['code'] === 'string'
                    ? value['code']
                    : 'relationship-request-refused',
                ),
              );
            else resolve(value);
          },
          closed: stop,
        });
        void channel.ready
          .then(() => {
            if (abort.signal.aborted) return stop();
            if (command.action !== 'disconnect') checkRelationship(command.id, peer.publicKey);
            if (command.action === 'enroll' || command.action === 'verify-return')
              activeRelationship(command.id, peer.publicKey);
            channel!.send({ type: 'relationship', command });
          })
          .catch(reject);
      });
    } finally {
      clearTimeout(timer);
      active.delete(abort);
      channel?.close();
      secret?.fill(0);
    }
  };
  const request = async (peer: RelationshipTransportPeer, command: Command) => {
    if (command.action !== 'disconnect') checkRelationship(command.id, peer.publicKey);
    let failure: unknown = new RelationshipRefused('relationship-route-unavailable');
    for (const origin of peer.routes) {
      try {
        const response = await requestOnce(
          peer,
          command,
          origin,
          command.action === 'verify-return'
            ? 6000
            : command.action === 'status' || command.action === 'disconnect'
              ? Math.min(2500, 4000 / peer.routes.length)
              : command.action === 'activate'
                ? 2500
                : 10_000,
        );
        if (command.action === 'status') {
          const learned = peerSchema.parse(response['peer']);
          if (learned.id !== peer.id || learned.publicKey !== peer.publicKey)
            throw new RelationshipRefused('relationship-identity-verification-failed');
          if (response['state'] !== 'disconnected') {
            await admissions.remember(command.id, learned);
            checkRelationship(command.id, peer.publicKey);
            relationships.updateRoutes(
              command.id,
              peer.publicKey,
              [
                ...new Set([
                  ...(checkRoute(origin, learned.privateRelay).ok ? [origin] : []),
                  ...learned.routes,
                ]),
              ].slice(0, 8),
            );
          }
        }
        return response;
      } catch (error) {
        failure = error;
        if (
          !['status', 'disconnect'].includes(command.action) ||
          (error instanceof RelationshipRefused &&
            !['relationship-request-incomplete', 'relationship-route-unavailable'].includes(
              error.code,
            ))
        )
          throw error;
      }
    }
    throw failure;
  };
  const verify = async (relationshipId: string) => {
    const relationship = activeRelationship(relationshipId);
    try {
      await request(relationship.peer, {
        action: 'status',
        id: relationshipId,
        peer: await wirePeer(),
      });
      activeRelationship(relationshipId, relationship.peer.publicKey);
      const value: Observation = { state: 'reachable', observedAt: now() };
      observe(relationshipId, 'outgoing', value);
      return value;
    } catch (error) {
      const value: Observation = {
        state: 'unavailable',
        observedAt: now(),
        refusal:
          error instanceof RelationshipRefused &&
          (error.code === 'relationship-identity-verification-failed' ||
            error.code === 'relationship-route-secret-unavailable')
            ? error.code
            : relationship.peer.routes.length
              ? 'relationship-request-incomplete'
              : 'relationship-route-unavailable',
      };
      observe(relationshipId, 'outgoing', value);
      return value;
    }
  };
  const revoke = async (relationshipId: string, manual: boolean) => {
    if (closed) throw new RelationshipRefused('relationship-owner-closed');
    const existing = revoking.get(relationshipId);
    if (existing) return existing;
    const operation = (async () => {
      const relationship = relationships.beginRevocationAttempt(relationshipId, manual);
      if (!relationship.peerRevocationPending) {
        await admissions.forget(relationshipId);
        return closed ? { ...relationship, reachability: reachability(relationshipId) } : snapshot(relationshipId);
      }
      const started = now();
      try {
        const response = await request(relationship.peer, {
          action: 'disconnect',
          id: relationshipId,
          suppressAutomaticEnrollment: relationship.automaticEnrollmentSuppressed,
        });
        if (closed) return { ...relationship, reachability: reachability(relationshipId) };
        if (response['state'] !== 'disconnected')
          throw new RelationshipRefused('relationship-response-invalid');
        relationships.acknowledgeDisconnect(relationshipId, relationship.peer.publicKey);
        await admissions.forget(relationshipId);
      } catch {
      } finally {
        if (!closed)
          options.record?.({
            phase: relationships.read(relationshipId).peerRevocationPending
              ? 'revocation-pending'
              : 'revocation-acknowledged',
            relationshipId,
            durationMs: now() - started,
            outgoing: 'disconnected',
            incoming: 'disconnected',
          });
      }
      return closed
        ? { ...relationship, reachability: reachability(relationshipId) }
        : snapshot(relationshipId);
    })();
    revoking.set(relationshipId, operation);
    try {
      return await operation;
    } finally {
      revoking.delete(relationshipId);
    }
  };
  let sweeping = false;
  const retryPending = async () => {
    if (closed || sweeping) return;
    sweeping = true;
    try {
      for (const item of relationships.list()) {
        if (closed) break;
        if (
          item.state !== 'disconnected' ||
          !item.peerRevocationPending ||
          item.revocationAttempts >= MAX_REVOCATION_ATTEMPTS ||
          item.revocationRetryAt === null ||
          item.revocationRetryAt > now()
        )
          continue;
        await revoke(item.id, false).catch(() => {});
      }
    } finally {
      sweeping = false;
    }
  };
  return {
    start() {
      if (closed || retryTimer !== undefined) return;
      retryTimer = setInterval(() => {
        void retryPending();
      }, 1000);
      retryTimer.unref?.();
      void retryPending();
    },
    retryPending,
    identity: ownPeer,
    async receive(peerKey: string, input: unknown): Promise<Record<string, unknown>> {
      if (closed) return { ok: false, code: 'relationship-owner-closed' };
      const parsed = commandSchema.safeParse(input);
      if (!parsed.success) return { ok: false, code: 'relationship-input-invalid' };
      const command = parsed.data;
      try {
        if (command.action === 'propose') {
          if (command.peer.publicKey !== peerKey)
            throw new RelationshipRefused('relationship-identity-mismatch');
          const existing = relationships.list().find((entry) => entry.id === command.id);
          if (!existing && !pairing.claimRelationshipOffer(command.offer))
            throw new RelationshipRefused('offer-invalid');
          const relationship = relationships.propose({
            id: command.id,
            peer: publicPeer(command.peer),
            direction: 'incoming',
            expiresAt: command.expiresAt,
            explicitReconnect: true,
          });
          await admissions.remember(relationship.id, command.peer);
          return { ok: true, state: checkRelationship(relationship.id, peerKey).state };
        }
        const relationship = readRelationship(command.id);
        if (relationship.peer.publicKey !== peerKey)
          throw new RelationshipRefused('relationship-identity-mismatch');
        if (command.action === 'status') {
          if (command.peer && relationship.state !== 'disconnected') {
            if (command.peer.id !== relationship.peer.id || command.peer.publicKey !== peerKey)
              throw new RelationshipRefused('relationship-identity-mismatch');
            await admissions.remember(command.id, command.peer);
            checkRelationship(command.id, peerKey);
            relationships.updateRoutes(command.id, peerKey, command.peer.routes);
          }
          if (relationship.state === 'disconnected')
            return { ok: true, state: 'disconnected', peer: { ...(await ownPeer()), routes: [] } };
          const peer = await wirePeer();
          return { ok: true, state: checkRelationship(command.id, peerKey).state, peer };
        }
        if (command.action === 'verify-return') {
          activeRelationship(command.id, peerKey);
          const observation = await verify(command.id);
          activeRelationship(command.id, peerKey);
          return { ok: true, observation };
        }
        if (command.action === 'activate')
          return { ok: true, state: relationships.activate(command.id, peerKey).state };
        if (command.action === 'disconnect') {
          const disconnected = relationships.disconnect(command.id, peerKey, command.suppressAutomaticEnrollment ?? true);
          observations.delete(command.id);
          if (!disconnected.peerRevocationPending) await admissions.forget(command.id);
          return { ok: true, state: disconnected.state };
        }
        const offer = relationships.enrollment(command.id, peerKey, command);
        return { ok: true, offer: offer.offer, expiresAt: offer.expiresAt };
      } catch (error) {
        if (error instanceof RelationshipRefused) return { ok: false, code: error.code };
        throw error;
      }
    },
    list: () => relationships.list().map((item) => snapshot(item.id)),
    async initiate(link: string, confirmedKey: string) {
      const parsed = parsePairingLink(link);
      if (!parsed.ok) throw new RelationshipRefused('relationship-link-invalid');
      const encryption = parsed.payload.encryption;
      if (!encryption || encryption.publicKey !== confirmedKey)
        throw new RelationshipRefused('relationship-identity-mismatch');
      const peer = peerSchema.parse({
        ...parsed.payload.host,
        publicKey: encryption.publicKey,
        routes: parsed.payload.routes,
        ...(encryption.privateRelay ? { privateRelay: encryption.privateRelay } : {}),
      });
      const relationship = relationships.propose({
        peer: publicPeer(peer),
        direction: 'outgoing',
        expiresAt: Date.parse(parsed.payload.expiresAt),
        explicitReconnect: true,
      });
      try {
        await admissions.remember(relationship.id, peer);
        await request(peer, {
          action: 'propose',
          id: relationship.id,
          peer: await wirePeer(),
          offer: parsed.payload.offer,
          expiresAt: relationship.expiresAt,
        });
      } catch (error) {
        relationships.disconnect(relationship.id, undefined, false);
        try {
          await request(peer, {
            action: 'disconnect',
            id: relationship.id,
            suppressAutomaticEnrollment: false,
          });
          relationships.acknowledgeDisconnect(relationship.id, peer.publicKey);
          await admissions.forget(relationship.id);
        } catch {}
        throw error;
      }
      return snapshot(relationship.id);
    },
    approve: (relationshipId: string, confirmedKey: string) =>
      relationships.approve(relationshipId, confirmedKey),
    async sync(relationshipId: string) {
      const existing = running.get(relationshipId);
      if (existing) return existing;
      const started = now();
      const operation = (async () => {
        const relationship = readRelationship(relationshipId);
        if (relationship.state === 'disconnected') return revoke(relationshipId, true);
        let remote: Record<string, unknown>;
        try {
          remote = await request(relationship.peer, {
            action: 'status',
            id: relationshipId,
            peer: await wirePeer(),
          });
          observe(relationshipId, 'outgoing', { state: 'reachable', observedAt: now() });
        } catch (error) {
          observe(relationshipId, 'outgoing', {
            state: 'unavailable',
            observedAt: now(),
            refusal:
              error instanceof RelationshipRefused &&
              (error.code === 'relationship-identity-verification-failed' ||
                error.code === 'relationship-route-secret-unavailable')
                ? error.code
                : relationship.peer.routes.length
                  ? 'relationship-request-incomplete'
                  : 'relationship-route-unavailable',
          });
          return snapshot(relationshipId);
        }
        if (remote['state'] === 'disconnected') {
          observations.delete(relationshipId);
          relationships.disconnect(relationshipId, relationship.peer.publicKey);
          await admissions.forget(relationshipId);
          return snapshot(relationshipId);
        }
        if (remote['state'] !== 'approved' && remote['state'] !== 'active')
          return snapshot(relationshipId);
        const verifiedPeer = readRelationship(relationshipId).peer;
        if (remote['state'] !== 'active')
          await request(verifiedPeer, { action: 'activate', id: relationshipId });
        checkOpen();
        relationships.activate(relationshipId, relationship.peer.publicKey);
        try {
          const returned = await request(verifiedPeer, {
            action: 'verify-return',
            id: relationshipId,
          });
          const observation = relationshipObservationSchema.parse(returned['observation']);
          observe(relationshipId, 'incoming', { ...observation, observedAt: now() });
        } catch {
          observe(relationshipId, 'incoming', {
            state: 'unavailable',
            observedAt: now(),
            refusal: 'relationship-request-incomplete',
          });
        }
        return snapshot(relationshipId);
      })();
      running.set(relationshipId, operation);
      try {
        return await operation;
      } finally {
        running.delete(relationshipId);
        const state = reachability(relationshipId);
        if (!closed)
          options.record?.({
            phase: 'directions-checked',
            relationshipId,
            durationMs: now() - started,
            outgoing: state.outgoing.state,
            incoming: state.incoming.state,
          });
      }
    },
    async recoverRoute(relationshipId: string, link: string) {
      const relationship = readRelationship(relationshipId);
      if (relationship.state !== 'active') throw new RelationshipRefused('relationship-inactive');
      const parsed = parsePairingLink(link);
      if (!parsed.ok) throw new RelationshipRefused('relationship-link-invalid');
      if (
        parsed.payload.host.id !== relationship.peer.id ||
        parsed.payload.encryption?.publicKey !== relationship.peer.publicKey
      )
        throw new RelationshipRefused('relationship-identity-mismatch');
      const peer = peerSchema.parse({
        ...relationship.peer,
        routes: parsed.payload.routes,
        ...(parsed.payload.encryption.privateRelay
          ? { privateRelay: parsed.payload.encryption.privateRelay }
          : {}),
      });
      const response = await request(peer, {
        action: 'status',
        id: relationshipId,
        peer: await wirePeer(),
      });
      if (response['state'] === 'disconnected') {
        checkOpen();
        relationships.disconnect(relationshipId, relationship.peer.publicKey);
        observations.delete(relationshipId);
        await admissions.forget(relationshipId);
        throw new RelationshipRefused('relationship-disconnected');
      }
      activeRelationship(relationshipId, relationship.peer.publicKey);
      observe(relationshipId, 'outgoing', { state: 'reachable', observedAt: now() });
      return snapshot(relationshipId);
    },
    async enroll(relationshipId: string, publicKey: string, name: string) {
      const relationship = readRelationship(relationshipId);
      if (relationship.state !== 'active') throw new RelationshipRefused('relationship-inactive');
      const response = await request(relationship.peer, {
        action: 'enroll',
        id: relationshipId,
        publicKey,
        name,
      });
      if (readRelationship(relationshipId).state !== 'active')
        throw new RelationshipRefused('relationship-inactive');
      if (typeof response['offer'] !== 'string' || typeof response['expiresAt'] !== 'string')
        throw new RelationshipRefused('relationship-response-invalid');
      const privateRelay = await admissions.read(relationshipId);
      const current = activeRelationship(relationshipId, relationship.peer.publicKey);
      return {
        peer: { ...current.peer, ...(privateRelay ? { privateRelay } : {}) },
        offer: response['offer'],
        expiresAt: response['expiresAt'],
      };
    },
    async disconnect(relationshipId: string) {
      checkOpen();
      observations.delete(relationshipId);
      relationships.disconnect(relationshipId);
      return revoke(relationshipId, true);
    },
    cleanupAdmission: admissions.forget,
    async cleanupAcknowledgedAdmissions() {
      if (closed) return { cleaned: 0, failed: 0 };
      let cleaned = 0;
      let failed = 0;
      for (const relationship of relationships.list()) {
        if (closed) break;
        if (relationship.state !== 'disconnected' || relationship.peerRevocationPending) continue;
        const started = now();
        try {
          await admissions.forget(relationship.id);
          cleaned++;
        } catch (error) {
          failed++;
          if (closed) break;
          options.record?.({
            phase: 'route-admission-cleanup-failed',
            relationshipId: relationship.id,
            durationMs: now() - started,
            outgoing: 'unverified',
            incoming: 'unverified',
            refusal:
              error instanceof RelationshipRefused
                ? error.code
                : 'relationship-route-secret-unavailable',
          });
        }
      }
      return { cleaned, failed };
    },
    close() {
      closed = true;
      if (retryTimer !== undefined) clearInterval(retryTimer);
      for (const controller of active) controller.abort();
    },
  };
}

export type RelationshipControl = ReturnType<typeof createRelationshipControl>;
