import { z } from 'zod';
import type { HostCarrier } from '../../../../apps/mobile/src/host/carrier.js';
import {
  keyBytes,
  keyHex,
  secureRandom,
} from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { redeemPairing } from '../../../../apps/mobile/src/host/pairing.js';
import { checkRoute, isEncryptedRoute } from '../../../../apps/mobile/src/host/route.js';
import { noiseFingerprint, noisePublicKey } from './noise/xk.js';

const ticketSchema = z.object({
  peer: z.object({
    id: z.string(),
    name: z.string(),
    publicKey: z.string().regex(/^[0-9a-f]{64}$/u),
    routes: z
      .array(z.string().refine((route) => checkRoute(route).ok))
      .min(1)
      .max(8),
  }),
  offer: z.string(),
  expiresAt: z.string(),
});

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
    const encryptedRoutes = ticket.peer.routes.filter((route) => isEncryptedRoute(route));
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
          ...(loopback ? { loopback: 'encrypted' as const } : {}),
        },
      },
    });
    return result;
  } finally {
    privateKey.fill(0);
  }
}
