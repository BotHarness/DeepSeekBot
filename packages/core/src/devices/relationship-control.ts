import { z } from 'zod';
import { openNoiseSocket } from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { checkRoute } from '../../../../apps/mobile/src/host/route.js';
import { parsePairingLink } from '../../../../apps/mobile/src/host/pairing.js';
import { nodeDeviceCarrier } from './node-carrier.js';
import type { DevicePairing } from './pairing.js';
import type { EncryptionIdentity } from './noise-identity.js';
import {
  RelationshipRefused,
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
    .min(1)
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
  z.object({ action: z.literal('status'), id }),
  z.object({ action: z.literal('activate'), id }),
  z.object({ action: z.literal('disconnect'), id }),
  z.object({ action: z.literal('enroll'), id, publicKey: key, name: z.string().max(60) }),
]);
type Command = z.infer<typeof commandSchema>;

export function createRelationshipControl(options: {
  relationships: HostRelationships;
  pairing: DevicePairing;
  identity: { key(): Promise<Uint8Array>; publicIdentity(): Promise<EncryptionIdentity> };
  routes(): Promise<string[]>;
}) {
  const { relationships, pairing } = options;
  const active = new Set<AbortController>();
  let closed = false;
  const ownPeer = async (): Promise<RelationshipPeer> => ({
    ...pairing.host(),
    publicKey: (await options.identity.publicIdentity()).publicKey,
    routes: await options.routes(),
  });
  const request = async (
    peer: RelationshipPeer,
    command: Command,
  ): Promise<Record<string, unknown>> => {
    if (closed) throw new RelationshipRefused('relationship-owner-closed');
    if (active.size >= 8) throw new RelationshipRefused('relationship-busy');
    const origin = peer.routes[0];
    if (!origin || !checkRoute(origin).ok)
      throw new RelationshipRefused('relationship-route-unavailable');
    const abort = new AbortController();
    active.add(abort);
    let channel: ReturnType<typeof openNoiseSocket> | undefined;
    let secret: Uint8Array | undefined;
    const timer = setTimeout(() => abort.abort(), 10_000);
    try {
      secret = await options.identity.key();
      if (abort.signal.aborted || closed) throw new RelationshipRefused('relationship-cancelled');
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const stop = () => reject(new RelationshipRefused('relationship-request-incomplete'));
        abort.signal.addEventListener('abort', stop, { once: true });
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
  return {
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
          });
          return { ok: true, state: relationship.state };
        }
        const relationship = relationships.read(command.id);
        if (relationship.peer.publicKey !== peerKey)
          throw new RelationshipRefused('relationship-identity-mismatch');
        if (command.action === 'status') return { ok: true, state: relationship.state };
        if (command.action === 'activate')
          return { ok: true, state: relationships.activate(command.id, peerKey).state };
        if (command.action === 'disconnect')
          return { ok: true, state: relationships.disconnect(command.id, peerKey).state };
        const offer = relationships.enrollment(command.id, peerKey, command);
        return { ok: true, offer: offer.offer, expiresAt: offer.expiresAt };
      } catch (error) {
        if (error instanceof RelationshipRefused) return { ok: false, code: error.code };
        throw error;
      }
    },
    list: () => relationships.list(),
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
        relationships.disconnect(relationship.id);
        try {
          await request(peer, { action: 'disconnect', id: relationship.id });
          relationships.acknowledgeDisconnect(relationship.id, peer.publicKey);
        } catch {}
        throw error;
      }
      return relationships.read(relationship.id);
    },
    approve: (relationshipId: string, confirmedKey: string) =>
      relationships.approve(relationshipId, confirmedKey),
    async sync(relationshipId: string) {
      const relationship = relationships.read(relationshipId);
      if (relationship.state === 'disconnected')
        throw new RelationshipRefused('relationship-disconnected');
      const remote = await request(relationship.peer, { action: 'status', id: relationshipId });
      if (remote['state'] === 'disconnected')
        return relationships.disconnect(relationshipId, relationship.peer.publicKey);
      if (remote['state'] !== 'approved' && remote['state'] !== 'active')
        return relationships.read(relationshipId);
      await request(relationship.peer, { action: 'activate', id: relationshipId });
      return relationships.activate(relationshipId, relationship.peer.publicKey);
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
      const relationship = relationships.disconnect(relationshipId);
      try {
        await request(relationship.peer, { action: 'disconnect', id: relationshipId });
        return relationships.acknowledgeDisconnect(relationshipId, relationship.peer.publicKey);
      } catch {
        return relationships.read(relationshipId);
      }
    },
    close() {
      closed = true;
      for (const controller of active) controller.abort();
    },
  };
}

export type RelationshipControl = ReturnType<typeof createRelationshipControl>;
