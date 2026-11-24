import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ToolApprovalActor } from '../workspaces/tool-approval-actor.js';
import { assertMessagingIdentity, type MessagingIdentity } from './identity.js';
import type { BotPairing, PairingCapability, PairingRequest } from './pairing.js';
import {
  isMessagingPlatform,
  messagingPlatform,
  type MessagingPlatformId,
} from './platforms/index.js';
import { z } from 'zod';
import { MessagingError, type MessagingProvider, type MessagingReplyRoute } from './provider.js';

export interface InteractionGrant {
  botSlug: string;
  bindingId: string;
  pairingId: string;
  pairingRevision: number;
}

export interface InteractionSource {
  providerId: string;
  botId: string;
  fingerprint: string;
  actorId: string;
  conversationId: string;
  messageId: string;
}

export interface InteractionDestination {
  kind: 'group';
  conversationId: string;
  reply: MessagingReplyRoute;
}

export interface InteractionContext {
  identity: MessagingIdentity;
  platform: MessagingPlatformId;
  paired: PairingRequest;
  provider: MessagingProvider;
}

export interface InteractionAuthority {
  context(grant: InteractionGrant): InteractionContext;
  authorize(input: {
    grant: InteractionGrant;
    source: InteractionSource;
    capability: PairingCapability;
    expected: { conversationId: string; shared: boolean };
  }): ToolApprovalActor | undefined;
  groupDestination(grant: InteractionGrant, channelId: string): InteractionDestination | undefined;
}

const groupSourcePayload = z.object({
  external: z.object({
    event: z.object({
      channel: z.string(),
      botId: z.string(),
      fingerprint: z.string(),
      conversation: z.object({ kind: z.literal('group'), id: z.string().min(1) }),
      reply: z.object({
        messageId: z.string(),
        conversationId: z.string(),
        actorId: z.string(),
        threadId: z.string().optional(),
        rootId: z.string().optional(),
        parentId: z.string().optional(),
      }),
    }),
  }),
});

export function createInteractionAuthority(options: {
  database: OperationalDatabaseModulePort;
  pairing: BotPairing;
  provider(id: string): MessagingProvider;
  isBotActive(slug: string): boolean;
}): InteractionAuthority {
  const context = (grant: InteractionGrant): InteractionContext => {
    if (!options.isBotActive(grant.botSlug)) throw new MessagingError('bot-unavailable');
    const identity = options.database.read((db) => assertMessagingIdentity(db, grant.bindingId));
    const platform = identity.platform;
    if (
      identity.botSlug !== grant.botSlug ||
      !isMessagingPlatform(platform) ||
      !messagingPlatform(platform).features.interactions
    )
      throw new MessagingError('untrusted-source');
    const paired = options.pairing.list(grant.botSlug).find((item) => item.id === grant.pairingId);
    if (
      !paired ||
      paired.status !== 'approved' ||
      paired.bindingId !== identity.id ||
      paired.revision !== grant.pairingRevision
    )
      throw new MessagingError('pairing-unauthorized');
    return { identity, platform, paired, provider: options.provider(identity.providerId) };
  };
  return {
    context,
    groupDestination(grant, channelId) {
      try {
        const { identity, platform } = context(grant);
        return options.database.read((db) => {
          if (identity.groupInteractions === false) return undefined;
          const row = db
            .prepare(
              "SELECT e.payload_json FROM source_events e LEFT JOIN channel_placements p ON p.source_event_id = e.source_event_id AND p.channel_id = ? WHERE e.bot_slug = ? AND e.source_kind IN ('human-message', 'bridge-message') AND (p.channel_id IS NOT NULL OR e.channel_id = ?) AND json_extract(e.payload_json, '$.userQuestionResolution') IS NULL AND json_extract(e.payload_json, '$.toolApprovalDecision') IS NULL ORDER BY p.revision IS NULL, p.revision DESC, e.rowid DESC LIMIT 1",
            )
            .get(channelId, grant.botSlug, channelId) as
            | { payload_json: string | null }
            | undefined;
          const parsed = row?.payload_json
            ? groupSourcePayload.safeParse(JSON.parse(row.payload_json))
            : undefined;
          const event = parsed?.success ? parsed.data.external.event : undefined;
          return event &&
            event.channel === platform &&
            event.botId === identity.accountRef &&
            event.fingerprint === identity.fingerprint
            ? {
                kind: 'group' as const,
                conversationId: event.conversation.id,
                reply: event.reply as MessagingReplyRoute,
              }
            : undefined;
        });
      } catch {
        return undefined;
      }
    },
    authorize({ grant, source, capability, expected }) {
      try {
        const { identity, platform } = context(grant);
        const current = options.pairing.assert(
          grant.botSlug,
          identity.id,
          source.actorId,
          capability,
          expected.shared ? undefined : grant.pairingId,
        );
        if (
          identity.providerId !== source.providerId ||
          identity.accountRef !== source.botId ||
          identity.fingerprint !== source.fingerprint ||
          expected.conversationId !== source.conversationId ||
          (!expected.shared &&
            (current.revision !== grant.pairingRevision ||
              current.conversationId !== source.conversationId))
        )
          return undefined;
        return {
          platform,
          bindingId: identity.id,
          fingerprint: source.fingerprint,
          actorId: source.actorId,
          pairingId: current.id,
          pairingRevision: current.revision,
          conversationId: source.conversationId,
          messageId: source.messageId,
        };
      } catch {
        return undefined;
      }
    },
  };
}
