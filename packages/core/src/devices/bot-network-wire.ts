import { z } from 'zod';
const keySchema = z.string().regex(/^[0-9a-f]{64}$/u);
export const hostId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u);
const slug = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
export const contactSchema = z.object({
  hostId,
  botSlug: slug,
  displayName: z.string().max(128),
  description: z.string().max(1000).optional(),
  device: z.object({
    model: z.string().max(128).nullable(),
    platform: z.string().max(128).nullable(),
  }),
  capabilities: z.array(z.string().max(48)).max(8),
});
export const pageSchema = z.object({
  hostId,
  publicKey: keySchema,
  contacts: z.array(contactSchema).max(50),
  next: z.number().int().positive().optional(),
});
export const messageSchema = z
  .object({
    id: z.string().min(1).max(128),
    at: z.iso.datetime(),
    senderBotSlug: slug,
    recipientBotSlug: slug,
    body: z.string().min(1).max(20_000),
    causation: z.object({
      rootSourceEventId: z.string().min(1).max(128),
      parentSourceEventId: z.string().min(1).max(128),
      hop: z.number().int().positive().max(1000),
    }),
  })
  .strict();
