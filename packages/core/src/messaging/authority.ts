import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ToolApprovalActor } from '../workspaces/tool-approval-actor.js';
import { assertMessagingIdentity, type MessagingIdentity } from './identity.js';
import type { BotPairing, PairingCapability, PairingRequest } from './pairing.js';
import {
  isMessagingPlatform,
  messagingPlatform,
  type MessagingPlatformId,
} from './platforms/index.js';
import { messagingDefaults } from './defaults.js';
import type { ExternalSource } from './inbound-types.js';
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
          if (messagingDefaults(db, platform).groupInteractions === false) return undefined;
          const row = db
            .prepare(
              "SELECT e.payload_json FROM source_events e WHERE e.bot_slug = ? AND e.source_kind IN ('human-message', 'bridge-message') AND (e.channel_id = ? OR EXISTS (SELECT 1 FROM channel_placements p WHERE p.source_event_id = e.source_event_id AND p.channel_id = ?)) ORDER BY e.rowid DESC LIMIT 1",
            )
            .get(grant.botSlug, channelId, channelId) as
            | { payload_json: string | null }
            | undefined;
          const event = row?.payload_json
            ? (JSON.parse(row.payload_json) as { external?: ExternalSource }).external?.event
            : undefined;
          return event?.conversation.kind === 'group' &&
            event.channel === platform &&
            event.botId === identity.accountRef &&
            event.fingerprint === identity.fingerprint
            ? { kind: 'group' as const, conversationId: event.conversation.id, reply: event.reply }
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
