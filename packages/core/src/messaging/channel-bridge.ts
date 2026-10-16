import { z } from 'zod';
import type { MessagingGrant, MessagingSnapshot } from './outbound.js';

export interface ChannelBridgeConfiguration {
  name: string;
  enabled: boolean;
  collection: 'mentions' | 'all';
  revision: number;
  collectionInheritance?: 'inherit' | 'custom';
  defaultRevision?: number;
  intakeAfter?: string;
}
export interface ChannelBridgeRoute extends ChannelBridgeConfiguration {
  id: string;
  channelId: string | null;
}
export function channelBridgeRoutes(grant: MessagingGrant): ChannelBridgeRoute[] {
  if (grant.bridgeRoutes) return grant.bridgeRoutes;
  if (!grant.receiveScope && !grant.channelBridge) return [];
  return [
    {
      ...channelBridgeConfiguration(grant),
      ...(grant.platform === 'weixin' && grant.receiveScope?.kind === 'dm'
        ? { collection: 'all' as const, collectionInheritance: 'custom' as const }
        : {}),
      id: grant.id,
      channelId: grant.receiveTargetChannelId ?? null,
    },
  ];
}
const fields = {
  grantId: z.string().uuid(),
  routeId: z.string().uuid().optional(),
  delivery: z.enum(['channel', 'inbox']).optional(),
  expectedGrantRevision: z.number().int().positive(),
};
const configuration = {
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  collection: z.enum(['mentions', 'all']),
  collectionInheritance: z.enum(['inherit', 'custom']).optional(),
  dmMirror: z.boolean().optional(),
  webToWeixin: z.boolean().optional(),
  expectedDefaultRevision: z.number().int().min(0).optional(),
};
export const channelBridgeInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('add'), ...fields, ...configuration }).strict(),
  z
    .object({
      kind: z.literal('update'),
      ...fields,
      expectedRevision: z.number().int().positive(),
      ...configuration,
    })
    .strict(),
  z
    .object({ kind: z.literal('delete'), ...fields, expectedRevision: z.number().int().positive() })
    .strict(),
]);
export type ChannelBridgeInput = z.infer<typeof channelBridgeInput>;
export interface ChannelBridgeSource {
  grantId: string;
  grantRevision: number;
  dmMirror?: boolean;
  webToWeixin?: boolean;
  webToWeixinAvailable?: boolean;
  botSlug: string;
  platform: string;
  accountName: string;
  conversationName: string;
  defaultRevision?: number;
  ordinaryDelivery: 'verified' | 'unverified';
}
export interface ChannelBridgeRow extends ChannelBridgeSource, ChannelBridgeConfiguration {
  routeId?: string;
  delivery?: 'channel' | 'inbox';
  availability: MessagingSnapshot['grants'][number]['availability'];
  reception: MessagingSnapshot['grants'][number]['reception'];
}
export interface ChannelBridgeSnapshot {
  channelId: string;
  bridges: ChannelBridgeRow[];
  canTargetInbox?: boolean;
  sources: ChannelBridgeSource[];
}
export function channelBridgeConfiguration(grant: MessagingGrant): ChannelBridgeConfiguration {
  return (
    grant.channelBridge ?? {
      name: grant.targetName,
      enabled: grant.receiveScope !== undefined,
      collection: 'mentions',
      revision: 1,
    }
  );
}
