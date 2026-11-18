import { z } from 'zod';

export const RESOURCE_CHANGED_EVENT = 'resource/changed';

export const liveResourceSchema = z.enum(['devices', 'relationships']);

export const resourceChangeSchema = z.object({
  resource: liveResourceSchema,
  revision: z.number().int().nonnegative(),
});

export type LiveResource = z.infer<typeof liveResourceSchema>;
export type ResourceChange = z.infer<typeof resourceChangeSchema>;

export function parseResourceChange(value: unknown): ResourceChange | undefined {
  try {
    const parsed = resourceChangeSchema.safeParse(
      typeof value === 'string' ? JSON.parse(value) : value,
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
