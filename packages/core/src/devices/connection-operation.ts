import { z } from 'zod';

export const connectionMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('revoke-device'), deviceId: z.string().min(1).max(200) }),
  z.object({
    action: z.literal('stop-route'),
    kind: z.enum(['lan', 'private-tunnel']),
    routeId: z.enum(['quick', 'custom']).optional(),
  }),
  z.object({ action: z.literal('sign-out') }),
]);
export type ConnectionMutation = z.infer<typeof connectionMutationSchema>;

export const pendingConnectionSchema = z.object({
  generation: z.string().uuid(),
  hostKey: z.string().min(1),
  deviceId: z.string().min(1),
  operation: connectionMutationSchema,
});
export type PendingConnection = z.infer<typeof pendingConnectionSchema>;

export const connectionOperationIndexSchema = z
  .array(z.object({ hostId: z.string().min(1), key: z.string().min(1).max(800) }))
  .max(32);
