import * as z from 'zod/mini';

export const toolEffectsSchema = z.object({
  changes: z.enum(['none', 'reversible', 'irreversible']),
  reach: z.enum(['local', 'memory', 'workspace', 'external']),
  personalData: z.boolean(),
  authority: z.optional(z.literal('management')),
  secrets: z.optional(z.boolean()),
});

export type ToolEffects = Readonly<z.infer<typeof toolEffectsSchema>>;

export function parseToolEffects(value: unknown): ToolEffects | undefined {
  const result = z.safeParse(toolEffectsSchema, value);
  if (!result.success) return undefined;
  const { authority, secrets, ...required } = result.data;
  return {
    ...required,
    ...(authority === undefined ? {} : { authority }),
    ...(secrets === undefined ? {} : { secrets }),
  };
}
