import { z } from 'zod';
export const spaceAudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('everyone') }).strict(),
  z.object({ kind: z.literal('roles'), roleIds: z.array(z.string().min(1)).max(1000) }).strict(),
  z.object({ kind: z.literal('members'), humanIds: z.array(z.string().min(1)).max(1000) }).strict(),
]);
export type SpaceAudience = z.infer<typeof spaceAudienceSchema>;
