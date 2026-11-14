import { z } from 'zod';

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
});
export const relationshipReplySchema = z.object({ relationship: relationshipSchema });
export const relationshipListSchema = z.object({ relationships: z.array(relationshipSchema) });
export const relationshipInitiatedSchema = z.object({
  relationship: relationshipSchema,
  local: z.object({ publicKey: z.string().regex(/^[0-9a-f]{64}$/u) }),
});
export type ClientRelationship = z.infer<typeof relationshipSchema>;
