import { z } from 'zod';

export const relationshipAccountOriginSchema = z
  .object({
    accountId: z.string().min(1),
    localRegistrationId: z.string().regex(/^h[a-z2-7]{12}$/u),
    peerRegistrationId: z.string().regex(/^h[a-z2-7]{12}$/u),
  })
  .strict();
export type RelationshipAccountOrigin = z.infer<typeof relationshipAccountOriginSchema>;
export const automaticEnrollmentChoiceSchema = z
  .object({
    kind: z.literal('automatic-enrollment-suppressed'),
    hostId: z.string().min(1),
    publicKey: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
  })
  .strict();
export const pendingRelationshipEnrollmentSchema = z.object({
  relationshipEnrollment: z.object({ publicKey: z.string().regex(/^[a-f0-9]{64}$/u) }).optional(),
});

export const relationshipObservationSchema = z.object({
  state: z.enum(['unverified', 'reachable', 'unavailable', 'stale']),
  observedAt: z.number().nullable(),
  refusal: z
    .enum([
      'relationship-identity-verification-failed',
      'relationship-route-unavailable',
      'relationship-request-incomplete',
    ])
    .optional(),
});

export const relationshipSchema = z.object({
  accountOrigin: relationshipAccountOriginSchema.nullable().default(null),
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
  revocationAttempts: z.number().int().nonnegative().optional(),
  revocationRetryAt: z.number().nullable().optional(),
  automaticEnrollmentSuppressed: z.boolean().optional(),
  reachability: z
    .object({
      outgoing: relationshipObservationSchema,
      incoming: relationshipObservationSchema,
    })
    .optional(),
});
export const relationshipReplySchema = z.object({ relationship: relationshipSchema });
export const relationshipListSchema = z.object({ relationships: z.array(relationshipSchema) });
export const accountRelationshipStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('signed-out'), relationships: z.array(relationshipSchema) }),
  z.object({
    state: z.enum(['idle', 'running', 'complete', 'unavailable']),
    generation: z.string().min(1).max(128),
    relationships: z.array(relationshipSchema),
  }),
]);
export const relationshipInitiatedSchema = z.object({
  relationship: relationshipSchema,
  local: z.object({ publicKey: z.string().regex(/^[0-9a-f]{64}$/u) }),
});
export type ClientRelationship = z.infer<typeof relationshipSchema>;
