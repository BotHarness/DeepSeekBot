import { z } from 'zod';
import type { HostCarrier } from '../../../../apps/mobile/src/host/carrier.js';
import {
  keyBytes,
  keyHex,
  secureRandom,
} from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { redeemPairing } from '../../../../apps/mobile/src/host/pairing.js';
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
} from './relationship-contract.js';
import { noiseFingerprint, noisePublicKey } from './noise/xk.js';

const ticketSchema = z.object({
  peer: relationshipTransportPeerSchema.refine((peer) => peer.routes.length > 0),
  offer: z.string(),
  expiresAt: z.string(),
});

export function updateRelationshipClientRoute(options: {
  host: SavedHost;
  peer: ClientRelationship['peer'];
  privateRelay?: PrivateAdmission;
}): { ok: true; host: SavedHost } | { ok: false; code: string } {
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
  const next = parseSavedHost(
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
  signal?: AbortSignal;
}) {
  if (options.signal?.aborted) return { ok: false as const, code: 'cancelled' as const };
  const privateKey = secureRandom(options.carrier);
  try {
    const publicKey = keyHex(noisePublicKey(privateKey));
    const ticket = ticketSchema.parse(
      await options.request({
        action: 'enroll',
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
      ? privateRouteOrigins(privateRelay)
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
    return result.ok
      ? { ...result, host: { ...result.host, relationshipId: options.relationshipId } }
      : result;
  } finally {
    privateKey.fill(0);
  }
}
