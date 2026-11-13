import { z } from 'zod';
import {
  checkRoute,
  isPrivateRoute,
  hasPrivateOrigin,
} from '../../../../apps/mobile/src/host/route.js';
import type { PrivateAdmission } from '../../../../apps/mobile/src/host/hosts.js';

export function relationshipAdmissionForRoutes(
  admission: PrivateAdmission | undefined,
  routes: readonly string[],
): PrivateAdmission | undefined {
  if (!admission) return;
  const [origin, ...additionalOrigins] = [
    ...new Set(routes.filter((route) => hasPrivateOrigin(admission, route))),
  ];
  if (!origin) return;
  return {
    origin,
    token: admission.token,
    ...(additionalOrigins.length ? { additionalOrigins: additionalOrigins.slice(0, 1) } : {}),
  };
}

const privateOrigin = z
  .string()
  .max(2048)
  .refine((route) => {
    const checked = checkRoute(route, route);
    return isPrivateRoute(route) && checked.ok && checked.origin === route;
  });
export const relationshipRouteAdmissionSchema = z
  .object({
    origin: privateOrigin,
    token: z.string().regex(/^[a-f0-9]{64}$/u),
    additionalOrigins: z.array(privateOrigin).max(1).optional(),
  })
  .transform(({ origin, token, additionalOrigins }) => ({
    origin,
    token,
    ...(additionalOrigins?.length ? { additionalOrigins } : {}),
  }));

export const relationshipTransportPeerSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
    name: z.string().max(120),
    publicKey: z.string().regex(/^[0-9a-f]{64}$/u),
    routes: z.array(z.string().max(2048)).max(8),
    privateRelay: relationshipRouteAdmissionSchema.optional(),
  })
  .refine((peer) => peer.routes.every((route) => checkRoute(route, peer.privateRelay).ok));
export type RelationshipTransportPeer = z.infer<typeof relationshipTransportPeerSchema>;

export const relationshipObservationSchema = z.object({
  state: z.enum(['unverified', 'reachable', 'unavailable', 'stale']),
  observedAt: z.number().nullable(),
  refusal: z
    .enum([
      'relationship-identity-verification-failed',
      'relationship-route-unavailable',
      'relationship-request-incomplete',
      'relationship-route-secret-unavailable',
    ])
    .optional(),
});

export const relationshipSchema = z.object({
  id: z.string(),
  peer: z.object({
    id: z.string(),
    name: z.string(),
    publicKey: z.string().regex(/^[0-9a-f]{64}$/u),
    routes: z.array(z.string()),
  }),
  direction: z.enum(['incoming', 'outgoing']),
  state: z.enum(['pending', 'approved', 'active', 'disconnected']),
  expiresAt: z.number(),
  peerRevocationPending: z.boolean(),
  reachability: z
    .object({
      outgoing: relationshipObservationSchema,
      incoming: relationshipObservationSchema,
    })
    .optional(),
});
export const relationshipReplySchema = z.object({ relationship: relationshipSchema });
export const relationshipListSchema = z.object({ relationships: z.array(relationshipSchema) });
export const relationshipInitiatedSchema = z.object({
  relationship: relationshipSchema,
  local: z.object({ publicKey: z.string().regex(/^[0-9a-f]{64}$/u) }),
});
export type ClientRelationship = z.infer<typeof relationshipSchema>;
