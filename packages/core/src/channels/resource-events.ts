import { z } from 'zod';

export const RESOURCE_CHANGED_EVENT = 'resource/changed';

export const liveResourceSchema = z.enum([
  'devices',
  'relationships',
  'private-inputs',
  'computer',
  'browser',
  'reachable-posts',
  'onboarding',
  'account',
  'model-providers',
]);

export const resourceChangeSchema = z.object({
  resource: liveResourceSchema,
  revision: z.number().int().nonnegative(),
});

export type LiveResource = z.infer<typeof liveResourceSchema>;

export const OWNER_ONLY_RESOURCES: ReadonlySet<LiveResource> = new Set([
  'devices',
  'relationships',
  'computer',
  'browser',
  'reachable-posts',
  'onboarding',
  'account',
]);
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

export type ObserveResource = (
  resource: LiveResource,
  refresh: () => void | Promise<void>,
) => () => void;

declare module '@deepseek-ai/cordis' {
  interface Context {
    botharnessResourceObserver: ObserveResource;
    botharnessResourcePublisher(resource: LiveResource): void;
  }
}
