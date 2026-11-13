import { z } from 'zod';
import type { HostCarrier } from '../../../../apps/mobile/src/host/carrier.js';
import {
  keyBytes,
  keyHex,
  secureRandom,
} from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { redeemPairing, revokePairing } from '../../../../apps/mobile/src/host/pairing.js';
import {
  checkRoute,
  isEncryptedRoute,
  isTailscaleRoute,
  isLoopbackRoute,
  privateRouteOrigins,
} from '../../../../apps/mobile/src/host/route.js';
import {
  parseSavedHost,
  serializeSavedHost,
  type SavedHost,
  type PrivateAdmission,
} from '../../../../apps/mobile/src/host/hosts.js';
import {
  relationshipTransportPeerSchema,
  relationshipAdmissionForRoutes,
  type ClientRelationship,
  pendingRelationshipEnrollmentSchema,
} from './relationship-contract.js';
import { noiseFingerprint, noisePublicKey } from './noise/xk.js';
export type RelationshipSavedHost = SavedHost & z.infer<typeof pendingRelationshipEnrollmentSchema>;
export function parseRelationshipSavedHost(input: unknown): RelationshipSavedHost | undefined {
  const host = parseSavedHost(input);
  if (!host) return undefined;
  const parsed = pendingRelationshipEnrollmentSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const pending = parsed.data.relationshipEnrollment;
  return pending ? { ...host, relationshipEnrollment: pending } : host;
}

export function relationshipClientPublicKey(host: SavedHost): string | undefined {
  if (!host.relationshipId || !host.encryption) return undefined;
  const key = keyBytes(host.encryption.deviceKey);
  try {
    return keyHex(noisePublicKey(key));
  } finally {
    key.fill(0);
  }
}

const ticketSchema = z.object({
  peer: relationshipTransportPeerSchema.refine((peer) => peer.routes.length > 0),
  offer: z.string(),
  expiresAt: z.string(),
});

const enrollmentStateSchema = z.object({
  enrollment: z
    .object({
      state: z.enum(['unconfirmed', 'committed', 'cleanup-pending', 'cleaned', 'cancelled']),
    })
    .nullable(),
});

export async function commitRelationshipEnrollment(options: {
  relationshipId: string;
  publicKey: string;
  request(body: Record<string, unknown>): Promise<unknown>;
}): Promise<'committed' | 'pending' | 'cancelled'> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = enrollmentStateSchema.parse(
        await options.request({
          action: 'commit-enrollment',
          id: options.relationshipId,
          publicKey: options.publicKey,
        }),
      );
      if (result.enrollment?.state === 'committed') return 'committed';
    } catch {}
    try {
      const result = enrollmentStateSchema.parse(
        await options.request({
          action: 'enrollment-status',
          id: options.relationshipId,
          publicKey: options.publicKey,
        }),
      );
      if (result.enrollment?.state === 'committed') return 'committed';
      if (result.enrollment?.state !== 'unconfirmed') return 'cancelled';
    } catch {
      return 'pending';
    }
  }
  return 'pending';
}

export async function cancelRelationshipEnrollment(options: {
  relationshipId: string;
  publicKey: string;
  request(body: Record<string, unknown>): Promise<unknown>;
}): Promise<void> {
  try {
    await options.request({
      action: 'cancel-enrollment',
      id: options.relationshipId,
      publicKey: options.publicKey,
    });
  } catch {
    /* The owning Host retains unconfirmed issuance until its cleanup deadline. */
  }
}

export function updateRelationshipClientRoute(options: {
  host: SavedHost;
  peer: ClientRelationship['peer'];
  privateRelay?: PrivateAdmission;
}): { ok: true; host: RelationshipSavedHost } | { ok: false; code: string } {
  const { host, peer } = options;
  if (host.hostId !== peer.id || host.encryption?.hostKey !== peer.publicKey)
    return { ok: false, code: 'host-key-changed' };
  const admission = relationshipAdmissionForRoutes(
    options.privateRelay ?? host.encryption.privateRelay,
    peer.routes,
  );
  const routes = admission
    ? privateRouteOrigins(admission)
    : peer.routes.filter((route) => checkRoute(route).ok);
  if (!routes.length) return { ok: false, code: 'relationship-route-admission-required' };
  if (host.routePreference && !routes.includes(host.routePreference))
    return { ok: false, code: 'relationship-route-preference-unavailable' };
  const { privateRelay: _privateRelay, loopback: _loopback, ...encryption } = host.encryption;
  const next = parseRelationshipSavedHost(
    serializeSavedHost({
      ...host,
      routes,
      encryption: {
        ...encryption,
        ...(admission ? { privateRelay: admission } : {}),
        ...(routes.length === 1 && isLoopbackRoute(routes[0]!)
          ? { loopback: 'encrypted' as const }
          : {}),
      },
    }),
  );
  return next ? { ok: true, host: next } : { ok: false, code: 'relationship-route-invalid' };
}

export async function enrollRelationshipClient(options: {
  relationshipId: string;
  expectedPeer: { id: string; publicKey: string };
  name: string;
  carrier: HostCarrier;
  request(body: Record<string, unknown>): Promise<unknown>;
  cleanupRequest?(body: Record<string, unknown>): Promise<unknown>;
  signal?: AbortSignal;
  accountGeneration?: string;
}) {
  if (options.signal?.aborted) return { ok: false as const, code: 'cancelled' as const };
  const privateKey = secureRandom(options.carrier);
  const publicKey = keyHex(noisePublicKey(privateKey));
  let delivered = false;
  try {
    const ticket = ticketSchema.parse(
      await options.request({
        action: options.accountGeneration === undefined ? 'enroll' : 'enroll-account',
        ...(options.accountGeneration === undefined
          ? {}
          : { generation: options.accountGeneration }),
        id: options.relationshipId,
        publicKey,
        name: options.name,
      }),
    );
    if (
      ticket.peer.id !== options.expectedPeer.id ||
      ticket.peer.publicKey !== options.expectedPeer.publicKey
    )
      return { ok: false as const, code: 'host-key-changed' as const };
    if (options.signal?.aborted) return { ok: false as const, code: 'cancelled' as const };
    const privateRelay = relationshipAdmissionForRoutes(
      ticket.peer.privateRelay,
      ticket.peer.routes,
    );
    const encryptedRoutes = privateRelay
      ? [privateRelay.origin]
      : ticket.peer.routes.filter((route) => isEncryptedRoute(route) || isTailscaleRoute(route));
    const loopback =
      encryptedRoutes.length === 0 &&
      ticket.peer.routes.length === 1 &&
      /^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u.test(ticket.peer.routes[0]!);
    if (!encryptedRoutes.length && !loopback)
      return { ok: false as const, code: 'unreachable' as const };
    const result = await redeemPairing({
      deviceKey: keyHex(privateKey),
      deviceName: options.name,
      carrier: options.carrier,
      ...(options.signal ? { signal: options.signal } : {}),
      confirmFingerprint: async (fingerprint) =>
        fingerprint === noiseFingerprint(keyBytes(ticket.peer.publicKey)),
      payload: {
        host: { id: ticket.peer.id, name: ticket.peer.name },
        offer: ticket.offer,
        expiresAt: ticket.expiresAt,
        routes: loopback ? ticket.peer.routes : encryptedRoutes,
        encryption: {
          protocol: 'connect-noise-xk-v1',
          publicKey: ticket.peer.publicKey,
          ...(privateRelay ? { privateRelay } : {}),
          ...(loopback ? { loopback: 'encrypted' as const } : {}),
        },
      },
    });
    if (result.ok && options.accountGeneration !== undefined) {
      try {
        if (options.signal?.aborted) throw new Error('cancelled');
        await options.request({
          action: 'check-account-enrollment',
          id: options.relationshipId,
          generation: options.accountGeneration,
        });
        if (options.signal?.aborted) throw new Error('cancelled');
      } catch {
        await revokePairing({ host: result.host, carrier: options.carrier });
        return { ok: false as const, code: 'cancelled' as const };
      }
    }
    delivered = result.ok;
    return result.ok
      ? {
          ...result,
          enrollmentPublicKey: publicKey,
          host: {
            ...result.host,
            relationshipId: options.relationshipId,
            relationshipEnrollment: { publicKey },
          },
        }
      : result;
  } finally {
    if (!delivered)
      await cancelRelationshipEnrollment({
        relationshipId: options.relationshipId,
        publicKey,
        request: options.cleanupRequest ?? options.request,
      });
    privateKey.fill(0);
  }
}
