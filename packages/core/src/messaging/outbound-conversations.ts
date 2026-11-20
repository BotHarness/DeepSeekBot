import { readIngest } from './conversation-ingest.js';
import { createPairingCards } from './pairing-cards.js';
import { createMessagingDirectory } from './directory.js';
import type { BotPairing } from './pairing.js';
import {
  changeSenderAccess,
  bumpSenderPolicy,
  readSourceSenderPermissions,
} from './sender-access.js';
import {
  assertMessagingIdentity,
  readMessagingIdentity,
  type MessagingIdentity,
} from './identity.js';
import { initializeGroupReceptionPolicy } from './group-policy.js';
import {
  admissionBound,
  readBlock,
  readHeld,
  removeBlock,
  removeHeld,
  writeBlock,
} from './conversations.js';
import { randomUUID } from 'node:crypto';
import type { InboundMessaging } from './inbound.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingError } from './provider.js';
import type { MessagingGrant, OutboundMessaging } from './outbound-types.js';
import type { OutboundMessagingOptions } from './outbound.js';

export function createOutboundConversations({
  active,
  transaction,
  options,
  pairingCards,
  binding,
  pairing,
  inbound,
  database,
  grant,
  now,
  revokePendingIntents,
  inFlight,
}: {
  active: (slug: string) => void;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  options: OutboundMessagingOptions;
  pairingCards: ReturnType<typeof createPairingCards>;
  binding: (id: string) => MessagingIdentity;
  pairing: BotPairing;
  inbound: InboundMessaging;
  database: OperationalDatabaseModulePort;
  grant: (slug: string, id: string) => MessagingGrant;
  now: () => string;
  revokePendingIntents: (db: DatabaseSync, grantId: string, at: string) => void;
  inFlight: Map<
    string,
    { providerId: string; token: object; controller: AbortController; fileGrantId?: string }
  >;
}): Pick<
  OutboundMessaging,
  | 'senderAccess'
  | 'toolRuleCreatorAuthorized'
  | 'senderPermissions'
  | 'directory'
  | 'reviewPairing'
  | 'conversation'
> {
  return {
    senderAccess(botSlug, input) {
      active(botSlug);
      transaction((db) => changeSenderAccess(db, botSlug, input), ['pairing', 'bot-inbox']);
      options.onAuthorizationChanged?.(botSlug);
      pairingCards.refresh(botSlug);
    },
    toolRuleCreatorAuthorized(botSlug, creator) {
      try {
        active(botSlug);
        const identity = binding(creator.bindingId);
        if (
          identity.botSlug !== botSlug ||
          identity.platform !== 'feishu' ||
          identity.fingerprint !== creator.fingerprint ||
          !identity.enabled ||
          identity.revokedAt
        )
          return false;
        pairing.assert(botSlug, creator.bindingId, creator.actorId, 'approve', creator.pairingId);
        pairing.assert(
          botSlug,
          creator.bindingId,
          creator.actorId,
          'save-rules',
          creator.pairingId,
        );
        return true;
      } catch (error) {
        if (!(error instanceof MessagingError)) throw error;
        return false;
      }
    },
    senderPermissions(botSlug, sourceEventId) {
      active(botSlug);
      if (typeof sourceEventId !== 'string' || !sourceEventId || sourceEventId.length > 200)
        throw new MessagingError('source-unavailable');
      const source = inbound.readShared(botSlug, sourceEventId);
      return database.read((db) => {
        if (source.ingestId) {
          let ingest;
          try {
            ingest = readIngest(db, source.ingestId);
          } catch (error) {
            if (!(error instanceof MessagingError)) throw error;
            return {
              queriedAt: new Date().toISOString(),
              status: 'unavailable',
              reason: 'source-unavailable',
            };
          }
          if (
            !db
              .prepare(
                'SELECT 1 FROM channel_placements WHERE source_event_id = ? AND channel_id = ?',
              )
              .get(source.id, ingest.channelId)
          )
            return {
              queriedAt: new Date().toISOString(),
              status: 'unavailable',
              reason: 'source-unavailable',
            };
          return readSourceSenderPermissions(db, botSlug, source.event, new Date(), {
            ingest,
            bindingId: source.ingressBindingId,
          });
        }
        const sourceGrant = db
          .prepare('SELECT body FROM messaging_grants WHERE id = ?')
          .get(source.grantId) as { body: string } | undefined;
        const authority = sourceGrant
          ? (JSON.parse(sourceGrant.body) as MessagingGrant)
          : undefined;
        return readSourceSenderPermissions(db, botSlug, source.event, new Date(), authority);
      });
    },
    directory(botSlug, query) {
      active(botSlug);
      return createMessagingDirectory(database, inbound.readShared)(botSlug, query);
    },
    async reviewPairing(botSlug, input) {
      const request = pairing.review(botSlug, input);
      pairingCards.refresh(botSlug);
      await inbound.notifyPairing(request);
      return pairing.list(botSlug).find((item) => item.id === request.id)!;
    },
    async conversation(botSlug, input) {
      active(botSlug);
      if (input.kind === 'open-group') {
        transaction(
          (db) => {
            const value = grant(botSlug, input.grantId);
            const identity = assertMessagingIdentity(db, value.bindingId);
            if (
              value.revokedAt ||
              value.suspendedReason ||
              value.platform !== 'feishu' ||
              value.receiveScope?.kind !== 'group' ||
              identity.botSlug !== botSlug ||
              !identity.enabled ||
              readBlock(db, botSlug, value.fingerprint, {
                kind: 'group',
                id: value.receiveScope.conversationId,
              })
            )
              throw new MessagingError('grant-unavailable');
            if ((value.preferenceRevision ?? 0) !== input.expectedRevision)
              throw new MessagingError('conversation-stale');
            db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
              JSON.stringify({
                ...value,
                openGroup: input.open,
                openGroupAfter: now(),
                preferenceRevision: input.expectedRevision + 1,
              }),
              value.id,
            );
            bumpSenderPolicy(db, botSlug);
          },
          ['grants'],
        );
        return;
      }
      if (input.kind === 'mute') {
        transaction(
          (db) => {
            const value = grant(botSlug, input.grantId);
            if (value.revokedAt !== undefined || !value.receiveScope)
              throw new MessagingError('grant-revoked');
            if ((value.preferenceRevision ?? 0) !== input.expectedRevision)
              throw new MessagingError('conversation-stale');
            const next: MessagingGrant = {
              ...value,
              muted: input.muted,
              preferenceRevision: input.expectedRevision + 1,
            };
            db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
              JSON.stringify(next),
              value.id,
            );
          },
          ['grants'],
        );
        inbound.startEntry(input.grantId);
        return;
      }
      if (input.kind === 'block') {
        transaction(
          (db) => {
            const value = grant(botSlug, input.grantId);
            if (value.revokedAt !== undefined || !value.receiveScope)
              throw new MessagingError('grant-revoked');
            if (value.revision !== input.expectedRevision)
              throw new MessagingError('conversation-stale');
            const at = now();
            const revision = value.revision + 1;
            db.prepare(
              'UPDATE messaging_grants SET body = ?, revoked_at = ?, revision = ? WHERE id = ?',
            ).run(JSON.stringify({ ...value, revokedAt: at, revision }), at, revision, value.id);
            revokePendingIntents(db, value.id, at);
            const conversation = {
              kind: value.receiveScope.kind,
              id: value.receiveScope.conversationId,
            };
            writeBlock(db, {
              botSlug,
              fingerprint: value.fingerprint,
              conversation,
              name: value.targetName,
              blockedAt: at,
            });
            removeHeld(db, value.bindingId, conversation);
          },
          ['grants', 'outbox'],
        );
        inbound.revoke(input.grantId);
        for (const attempt of inFlight.values())
          if (attempt.fileGrantId === input.grantId) attempt.controller.abort();
        inbound.startEntry(input.grantId);
        return;
      }
      const created = transaction(
        (db) => {
          const identity = readMessagingIdentity(db, input.bindingId);
          if (identity.botSlug !== botSlug || identity.revokedAt)
            throw new MessagingError('identity-unbound');
          const held = readHeld(db, input.bindingId, input.conversation);
          const blocked = readBlock(db, botSlug, identity.fingerprint, input.conversation);
          if (input.kind === 'block-held') {
            if (!held || held.revision !== input.expectedRevision)
              throw new MessagingError('conversation-stale');
            writeBlock(db, {
              botSlug,
              fingerprint: identity.fingerprint,
              conversation: input.conversation,
              name: held.name,
              blockedAt: now(),
            });
            removeHeld(db, input.bindingId, input.conversation);
            return undefined;
          }
          const source = input.from === 'held' ? held : blocked;
          if (!source || source.revision !== input.expectedRevision)
            throw new MessagingError('conversation-stale');
          if (!identity.enabled) throw new MessagingError('identity-paused');
          const existing = db
            .prepare(
              `SELECT 1 FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL
                AND json_extract(body, '$.receiveScope.kind') = ?
                AND json_extract(body, '$.receiveScope.conversationId') = ?`,
            )
            .get(input.bindingId, input.conversation.kind, input.conversation.id);
          if (existing) throw new MessagingError('conversation-stale');
          if (admissionBound(db, input.bindingId, new Date(now())) === 'active-limit')
            throw new MessagingError('conversation-limit');
          const at = now();
          const value: MessagingGrant = {
            id: randomUUID(),
            bindingId: identity.id,
            botSlug,
            providerId: identity.providerId,
            accountRef: identity.accountRef,
            accountName: identity.name,
            fingerprint: identity.fingerprint,
            platform: identity.platform,
            targetRef: '',
            targetName: source.name,
            targetDigest: '',
            revision: 1,
            createdAt: at,
            receiveAfter: at,
            receiveScope: { kind: input.conversation.kind, conversationId: input.conversation.id },
            origin: 'implicit',
          };
          db.prepare(
            'INSERT INTO messaging_grants (id, binding_id, bot_slug, revision, created_at, body) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(value.id, value.bindingId, botSlug, 1, at, JSON.stringify(value));
          if (input.conversation.kind === 'group') initializeGroupReceptionPolicy(db, value.id);
          removeHeld(db, input.bindingId, input.conversation);
          removeBlock(db, botSlug, identity.fingerprint, input.conversation);
          return value.id;
        },
        ['grants', 'bindings'],
      );
      if (created !== undefined) inbound.startEntry(created);
      else options.onReceptionChanged?.();
    },
  };
}
