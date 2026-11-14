import { z } from 'zod';
export const connectHealthStage = z.enum(['account', 'tunnel', 'relay', 'public']);
export const connectHealthCode = z.enum([
  'signed-out',
  'connector-unavailable',
  'relay-unavailable',
  'relay-offline',
  'relay-status-unknown',
  'dns',
  'tls',
  'timeout',
  'http',
  'handshake',
  'identity',
  'network',
]);
const completed = {
  checkedAt: z.string().datetime(),
  elapsedMs: z.number().nonnegative().finite(),
};
export const connectHealthSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({
    state: z.literal('checking'),
    stage: connectHealthStage,
    startedAt: z.string().datetime(),
  }),
  z.object({ state: z.literal('passed'), ...completed }),
  z.object({ state: z.literal('stale'), ...completed }),
  z.object({
    state: z.literal('failed'),
    ...completed,
    stage: connectHealthStage,
    code: connectHealthCode,
    httpStatus: z.number().int().min(100).max(599).optional(),
  }),
]);
export type ConnectHealthStage = z.infer<typeof connectHealthStage>;
export type ConnectHealthCode = z.infer<typeof connectHealthCode>;
export type ConnectHealthStatus = z.infer<typeof connectHealthSchema>;
