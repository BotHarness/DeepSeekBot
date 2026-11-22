import { z } from 'zod';

export const RESOURCE_CHANGED_EVENT = 'resource/changed';

const unscopedResources = z.enum([
  'devices',
  'relationships',
  'private-inputs',
  'computer',
  'browser',
  'reachable-posts',
  'onboarding',
  'account',
  'model-providers',
  'engine-device-login',
]);

const cardResources = z.enum(['tool-approval', 'user-question']);
export const liveResourceSchema = z.enum([
  ...unscopedResources.options,
  ...cardResources.options,
  'bot-context',
]);

const revision = z.number().int().nonnegative();
export const resourceChangeSchema = z.discriminatedUnion('resource', [
  z.object({ resource: unscopedResources, revision }),
  z.object({ resource: cardResources, revision, channelId: z.string(), messageId: z.string() }),
  z.object({ resource: z.literal('bot-context'), revision, slug: z.string() }),
]);

export type LiveResource = z.infer<typeof liveResourceSchema>;

export const RESTRICTED_RESOURCES: ReadonlySet<LiveResource> = new Set([
  'devices',
  'relationships',
  'computer',
  'browser',
  'reachable-posts',
  'onboarding',
  'account',
  'model-providers',
  'engine-device-login',
]);
export type ResourceChange = z.infer<typeof resourceChangeSchema>;
export type UnscopedResource = z.infer<typeof unscopedResources>;
export type ScopedResource =
  | Omit<Extract<ResourceChange, { channelId: string }>, 'revision'>
  | Omit<Extract<ResourceChange, { slug: string }>, 'revision'>;

export function sameResource(left: ResourceChange, right: ResourceChange): boolean {
  if (left.resource !== right.resource) return false;
  if ('channelId' in left)
    return (
      'channelId' in right &&
      left.channelId === right.channelId &&
      left.messageId === right.messageId
    );
  if ('slug' in left) return 'slug' in right && left.slug === right.slug;
  return true;
}

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
    botharnessResourcePublisher(resource: UnscopedResource): void;
  }
}
