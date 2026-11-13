import { z } from 'zod';
import type { HostCarrier } from '../../../../apps/mobile/src/host/carrier.js';
import {
  keyBytes,
  keyHex,
  secureRandom,
} from '../../../../apps/mobile/src/host/encrypted-carrier.js';
import { redeemPairing, revokePairing } from '../../../../apps/mobile/src/host/pairing.js';
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
