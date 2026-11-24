import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ToolApprovalActor } from '../workspaces/tool-approval-actor.js';
import { assertMessagingIdentity, type MessagingIdentity } from './identity.js';
import type { BotPairing, PairingCapability, PairingRequest } from './pairing.js';
import {
  isMessagingPlatform,
  messagingPlatform,
  type MessagingPlatformId,
} from './platforms/index.js';
import { MessagingError, type MessagingProvider } from './provider.js';

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

export interface InteractionContext {
  identity: MessagingIdentity;
  platform: MessagingPlatformId;
  paired: PairingRequest;
  provider: MessagingProvider;
}

export interface InteractionAuthority {
  context(grant: InteractionGrant): InteractionContext;
  authorize(
    grant: InteractionGrant,
    source: InteractionSource,
    capability: PairingCapability,
    conversationId: string,
  ): ToolApprovalActor | undefined;
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
    authorize(grant, source, capability, conversationId) {
      try {
        const { identity, platform } = context(grant);
        const current = options.pairing.assert(
          grant.botSlug,
          identity.id,
          source.actorId,
          capability,
          grant.pairingId,
        );
        if (
          identity.providerId !== source.providerId ||
          identity.accountRef !== source.botId ||
          identity.fingerprint !== source.fingerprint ||
          current.revision !== grant.pairingRevision ||
          current.conversationId !== source.conversationId ||
          conversationId !== source.conversationId
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
