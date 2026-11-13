import { z } from 'zod';
import { relationshipObservationSchema } from './relationship-contract.js';
import { openNoiseSocket } from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { checkRoute } from '../../../../apps/mobile/src/host/route.js';
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
const peerSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
  name: z.string().max(120),
  publicKey: key,
  routes: z
    .array(
      z
        .string()
        .max(2048)
        .refine((route) => checkRoute(route).ok),
    )
    .max(8),
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
  now?: () => number;
  record?: (event: {
    phase: string;
    relationshipId: string;
    durationMs: number;
    outgoing: string;
    incoming: string;
  }) => void;
}) {
  const { relationships, pairing } = options;
  const active = new Set<AbortController>();
  let closed = false;
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
  const snapshot = (id: string) => ({ ...relationships.read(id), reachability: reachability(id) });
  const observe = (id: string, direction: 'outgoing' | 'incoming', value: Observation) => {
    observations.set(id, { ...reachability(id), [direction]: value });
  };
  const ownPeer = async (): Promise<RelationshipPeer> => ({
    ...pairing.host(),
    publicKey: (await options.identity.publicIdentity()).publicKey,
    routes: await options.routes(),
  });
  const requestOnce = async (
    peer: RelationshipPeer,
    command: Command,
    origin: string,
    timeout: number,
  ): Promise<Record<string, unknown>> => {
    if (closed) throw new RelationshipRefused('relationship-owner-closed');
    if (active.size >= 8) throw new RelationshipRefused('relationship-busy');
    if (!origin || !checkRoute(origin).ok)
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
  const request = async (peer: RelationshipPeer, command: Command) => {
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
          if (response['state'] !== 'disconnected')
            relationships.updateRoutes(
              command.id,
              peer.publicKey,
              [...new Set([origin, ...learned.routes])].slice(0, 8),
            );
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
    const relationship = relationships.read(relationshipId);
    try {
      await request(relationship.peer, {
        action: 'status',
        id: relationshipId,
        peer: await ownPeer(),
      });
      const value: Observation = { state: 'reachable', observedAt: now() };
      observe(relationshipId, 'outgoing', value);
      return value;
    } catch (error) {
      const value: Observation = {
        state: 'unavailable',
        observedAt: now(),
        refusal:
          error instanceof RelationshipRefused &&
          error.code === 'relationship-identity-verification-failed'
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
      if (!relationship.peerRevocationPending) return snapshot(relationshipId);
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
            peer: command.peer,
            direction: 'incoming',
            expiresAt: command.expiresAt,
            explicitReconnect: true,
          });
          return { ok: true, state: relationship.state, peer: await ownPeer() };
        }
        const relationship = relationships.read(command.id);
        if (relationship.peer.publicKey !== peerKey)
          throw new RelationshipRefused('relationship-identity-mismatch');
        if (command.action === 'status') {
          if (command.peer && relationship.state !== 'disconnected') {
            if (command.peer.id !== relationship.peer.id || command.peer.publicKey !== peerKey)
              throw new RelationshipRefused('relationship-identity-mismatch');
            relationships.updateRoutes(command.id, peerKey, command.peer.routes);
          }
          return { ok: true, state: relationship.state, peer: await ownPeer() };
        }
        if (command.action === 'verify-return')
          return { ok: true, observation: await verify(command.id) };
        if (command.action === 'activate')
          return { ok: true, state: relationships.activate(command.id, peerKey).state };
        if (command.action === 'disconnect') {
          observations.delete(command.id);
          return {
            ok: true,
            state: relationships.disconnect(
              command.id,
              peerKey,
              command.suppressAutomaticEnrollment ?? true,
            ).state,
          };
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
      });
      const relationship = relationships.propose({
        peer,
        direction: 'outgoing',
        expiresAt: Date.parse(parsed.payload.expiresAt),
        explicitReconnect: true,
      });
      try {
        await request(peer, {
          action: 'propose',
          id: relationship.id,
          peer: await ownPeer(),
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
        const relationship = relationships.read(relationshipId);
        if (relationship.state === 'disconnected') return revoke(relationshipId, true);
        let remote: Record<string, unknown>;
        try {
          remote = await request(relationship.peer, {
            action: 'status',
            id: relationshipId,
            peer: await ownPeer(),
          });
          observe(relationshipId, 'outgoing', { state: 'reachable', observedAt: now() });
        } catch (error) {
          observe(relationshipId, 'outgoing', {
            state: 'unavailable',
            observedAt: now(),
            refusal:
              error instanceof RelationshipRefused &&
              error.code === 'relationship-identity-verification-failed'
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
          return snapshot(relationshipId);
        }
        if (remote['state'] !== 'approved' && remote['state'] !== 'active')
          return snapshot(relationshipId);
        const verifiedPeer = relationships.read(relationshipId).peer;
        if (remote['state'] !== 'active')
          await request(verifiedPeer, { action: 'activate', id: relationshipId });
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
      const relationship = relationships.read(relationshipId);
      if (relationship.state !== 'active') throw new RelationshipRefused('relationship-inactive');
      const parsed = parsePairingLink(link);
      if (!parsed.ok) throw new RelationshipRefused('relationship-link-invalid');
      if (
        parsed.payload.host.id !== relationship.peer.id ||
        parsed.payload.encryption?.publicKey !== relationship.peer.publicKey
      )
        throw new RelationshipRefused('relationship-identity-mismatch');
      const peer = peerSchema.parse({ ...relationship.peer, routes: parsed.payload.routes });
      await request(peer, { action: 'status', id: relationshipId, peer: await ownPeer() });
      observe(relationshipId, 'outgoing', { state: 'reachable', observedAt: now() });
      return snapshot(relationshipId);
    },
    async enroll(relationshipId: string, publicKey: string, name: string) {
      const relationship = relationships.read(relationshipId);
      if (relationship.state !== 'active') throw new RelationshipRefused('relationship-inactive');
      const response = await request(relationship.peer, {
        action: 'enroll',
        id: relationshipId,
        publicKey,
        name,
      });
      if (relationships.read(relationshipId).state !== 'active')
        throw new RelationshipRefused('relationship-inactive');
      if (typeof response['offer'] !== 'string' || typeof response['expiresAt'] !== 'string')
        throw new RelationshipRefused('relationship-response-invalid');
      return {
        peer: relationship.peer,
        offer: response['offer'],
        expiresAt: response['expiresAt'],
      };
    },
    async disconnect(relationshipId: string) {
      observations.delete(relationshipId);
      relationships.disconnect(relationshipId);
      return revoke(relationshipId, true);
    },
    close() {
      closed = true;
      if (retryTimer !== undefined) clearInterval(retryTimer);
      for (const controller of active) controller.abort();
    },
  };
}

export type RelationshipControl = ReturnType<typeof createRelationshipControl>;
