import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { isChannelNotice } from '../channels/channel-notice.js';
import { sourceContentPurged } from '../purge/fence.js';
import { effectiveDmControls } from './dm-controls.js';
import type { MessagingIdentity } from './identity.js';
import { bridgeChannel } from './channel-target.js';
import { dmChannelId, type ChannelMessage } from '../channels/channel.js';
import { channelBridgeRoutes } from './channel-bridge.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingError, type MessagingAccount, type MessagingTarget } from './provider.js';
import type {
  MessagingGrant,
  ProviderRegistration,
  AccountReader,
  OutboundMessaging,
} from './outbound-contract.js';
import type { StoredIntent } from './outbound-outbox-store.js';
import type { StatementSync } from 'node:sqlite';
import type { OutboundMessagingOptions } from './outbound.js';

export function createOutboundDmMirror(context: {
  database: OperationalDatabaseModulePort;
  options: OutboundMessagingOptions;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  readIntent: (id: string) => StoredIntent;
  grant: (slug: string, id: string) => MessagingGrant;
  binding: (id: string) => MessagingIdentity;
  closed: boolean;
  providers: Map<string, ProviderRegistration>;
  provider: (id: string) => ProviderRegistration;
  check: (
    value: MessagingGrant,
    readAccount?: AccountReader,
  ) => Promise<
    ProviderRegistration & {
      inspected: { account: MessagingAccount; target: MessagingTarget };
      identityRevision: number;
    }
  >;
  service: OutboundMessaging;
  prepareOutboundDmSourceInsert: (db: DatabaseSync) => StatementSync;
  prepareOutboundDmPlacementInsert: (db: DatabaseSync) => StatementSync;
}) {
  const {
    database,
    options,
    transaction,
    readIntent,
    grant,
    binding,
    providers,
    provider,
    check,
    prepareOutboundDmSourceInsert,
    prepareOutboundDmPlacementInsert,
  } = context;

  const mirrorChoice = (value: MessagingGrant, conversationId: string | undefined) =>
    database.read((db) => {
      if (value.platform !== 'weixin' || !conversationId) return undefined;
      for (const row of db
        .prepare('SELECT body FROM messaging_grants WHERE binding_id = ?')
        .all(value.bindingId)) {
        const receiver = effectiveDmControls(db, JSON.parse(String(row.body)) as MessagingGrant);
        if (
          !receiver.revokedAt &&
          !receiver.suspendedReason &&
          receiver.dmMirror === true &&
          receiver.dmMirrorEpoch &&
          receiver.receiveScope?.kind === 'dm' &&
          receiver.receiveScope.conversationId === conversationId &&
          channelBridgeRoutes(receiver).some((route) => route.enabled)
        )
          return { epoch: receiver.dmMirrorEpoch, bindingId: receiver.bindingId, conversationId };
      }
      return undefined;
    });

  const mirrorAccepted = async (accepted: StoredIntent): Promise<void> => {
    try {
      if (accepted.requestId.startsWith('web-mirror-') || !accepted.dmMirror) return;
      const channel = options.channels?.getOrCreateDm(OWNER_HUMAN_CONTEXT, accepted.botSlug);
      if (!channel) return;
      const commit = transaction(
        (db) => {
          const value = readIntent(accepted.id);
          const currentGrant = grant(value.botSlug, value.grantId);
          const choice = mirrorChoice(currentGrant, value.dmMirror?.conversationId);
          const sourceId = 'dm-mirror-' + value.id;
          if (
            value.state !== 'provider-accepted' ||
            !choice ||
            choice.epoch !== value.dmMirror?.epoch ||
            choice.bindingId !== value.dmMirror.bindingId ||
            currentGrant.revokedAt ||
            currentGrant.suspendedReason ||
            !options.isBotActive(value.botSlug) ||
            !binding(choice.bindingId).enabled ||
            binding(choice.bindingId).revokedAt ||
            sourceContentPurged(db, sourceId) ||
            (value.sourceEventId && sourceContentPurged(db, value.sourceEventId))
          )
            return;
          if (value.sourceEventId) {
            const original = db
              .prepare(
                "SELECT json_extract(payload_json, '$.external.dmMirrorEpoch') AS epoch FROM source_events WHERE source_event_id = ?",
              )
              .get(value.sourceEventId);
            if (
              original?.epoch === choice.epoch &&
              !db
                .prepare(
                  'SELECT 1 FROM channel_placements WHERE source_event_id = ? AND channel_id = ?',
                )
                .get(value.sourceEventId, channel.id)
            )
              return;
          }
          bridgeChannel(OWNER_HUMAN_CONTEXT, db, channel.id, value.botSlug);
          if (db.prepare('SELECT 1 FROM source_events WHERE source_event_id = ?').get(sourceId))
            return;
          const message: ChannelMessage = {
            id: sourceId,
            at: value.settledAt!,
            body: value.file?.name ?? value.text,
            format: 'text',
            author: { kind: 'bot', slug: value.botSlug },
            bridgeOrigin: {
              sourceEventId: sourceId,
              platform: currentGrant.platform,
              accountRef: currentGrant.accountRef,
              accountName: currentGrant.accountName,
              conversationId: choice.conversationId,
              conversationName: currentGrant.targetName,
              messageId: value.receipt?.messageId ?? value.id,
              senderId: currentGrant.accountRef,
              senderName: value.botSlug,
            },
          };
          const { body, ...envelope } = message;
          const revision = Number(
            db
              .prepare(
                'SELECT COALESCE(MAX(revision), 0) + 1 AS n FROM channel_placements WHERE channel_id = ?',
              )
              .get(channel.id)!.n,
          );
          prepareOutboundDmSourceInsert(db).run(
            sourceId,
            value.botSlug,
            channel.id,
            sourceId,
            body,
            message.at,
            JSON.stringify({
              ...envelope,
              outboxOrigin: { intentId: value.id, sourceEventId: value.sourceEventId },
            }),
          );
          prepareOutboundDmPlacementInsert(db).run(channel.id, revision, sourceId, sourceId);
          return {
            channelId: channel.id,
            revision,
            message: { ...message, channelRevision: revision },
          };
        },
        ['source-event', 'channel'],
      );
      if (commit) options.onPlaced?.(commit);
    } catch {
      options.warn?.(
        JSON.stringify({ event: 'weixin-dm-mirror', phase: 'failed', intentId: accepted.id }),
      );
    }
  };

  const recovering = new Set<string>();

  const recoveryPending = new Set<string>();

  const recoverMirrors = async (providerId: string) => {
    if (recovering.has(providerId)) {
      recoveryPending.add(providerId);
      return;
    }
    recovering.add(providerId);
    try {
      do {
        recoveryPending.delete(providerId);
        let cursor = 0;
        for (;;) {
          if (context.closed || !providers.has(providerId)) return;
          const rows = database.read((db) =>
            db
              .prepare(`SELECT o.rowid AS position, o.id FROM messaging_outbox o
          JOIN messaging_grants g ON g.id = o.grant_id
          WHERE o.rowid > ? AND o.state = 'provider-accepted' AND json_extract(g.body, '$.providerId') = ?
          AND json_extract(o.body, '$.dmMirror.epoch') IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM source_events e WHERE e.source_event_id = 'dm-mirror-' || o.id)
          ORDER BY o.rowid ASC LIMIT 100`)
              .all(cursor, providerId),
          );
          for (const row of rows) {
            cursor = Number(row.position);
            await mirrorAccepted(readIntent(String(row.id)));
          }
          if (rows.length < 100) break;
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      } while (recoveryPending.has(providerId));
    } finally {
      recovering.delete(providerId);
      recoveryPending.delete(providerId);
    }
  };

  const webDmText = (message: ChannelMessage): string | undefined => {
    if (
      message.author.kind === 'bridged' ||
      message.author.kind === 'system' ||
      isChannelNotice(message) ||
      message.toolApprovalRequest ||
      message.toolApprovalDecision ||
      message.userQuestionRequest ||
      message.userQuestionResolution ||
      message.privateInputRequest ||
      message.privateInputResolution ||
      message.takeoverResolution ||
      message.sessionFailure ||
      message.grantRequest ||
      message.grantRequestResolution ||
      message.onboardingWelcome ||
      message.memberDeparture ||
      message.turnStop ||
      message.modelSwitch ||
      message.voiceCallRecord ||
      message.toolAutoApprovalOverride
    )
      return undefined;
    const text = [message.body, ...(message.attachments ?? []).map((item) => item.name)]
      .filter((line) => line.trim() !== '')
      .join('\n');
    if (text === '') return undefined;
    return message.author.kind === 'bot' ? text : `【网页】我：${text}`;
  };

  const forwardingSources = new Map<string, string>();

  const forwardingFences = new Map<string, () => void>();

  const forwardWebDm = async (commit: ChannelMessageCommit): Promise<void> => {
    const warn = (error: unknown, grantId?: string) => {
      options.warn?.(
        JSON.stringify({
          event: 'weixin-web-mirror',
          phase: 'failed',
          grantId,
          messageId: commit.message.id,
          reason: error instanceof MessagingError ? error.code : 'provider-unavailable',
        }),
      );
    };
    try {
      const message = commit.message;
      if (message.id.startsWith('dm-mirror-')) return;
      const channel = options.channels?.get(commit.channelId);
      const botSlug = channel?.botSlug;
      if (
        channel === undefined ||
        channel.type !== 'dm' ||
        botSlug === undefined ||
        channel.id !== dmChannelId(botSlug)
      )
        return;
      if (message.author.kind === 'bot' && message.author.slug !== botSlug) return;
      const text = webDmText(message);
      if (text === undefined) return;
      const origin = database.read((db) =>
        db
          .prepare(
            'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
          )
          .get(commit.channelId, message.id),
      );
      const sourceId = origin ? String(origin.source_event_id) : undefined;
      const rows = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE bot_slug = ?').all(botSlug),
      ) as { body: string }[];
      const grants = rows
        .map((row) =>
          database.read((db) => effectiveDmControls(db, JSON.parse(row.body) as MessagingGrant)),
        )
        .filter(
          (value) =>
            value.platform === 'weixin' &&
            value.revokedAt === undefined &&
            value.suspendedReason === undefined,
        );
      const visited = new Set<string>();
      for (const receiver of grants) {
        if (
          receiver.receiveScope?.kind !== 'dm' ||
          receiver.dmForward !== true ||
          (receiver.dmForwardAfter !== undefined && message.at < receiver.dmForwardAfter) ||
          !channelBridgeRoutes(receiver).some((route) => route.enabled)
        )
          continue;
        const conversationId = receiver.receiveScope.conversationId;
        const scope = receiver.bindingId + ':' + conversationId;
        if (visited.has(scope)) continue;
        visited.add(scope);
        const routes = channelBridgeRoutes(receiver);
        const assertForwarding = () => {
          if (sourceId && database.read((db) => sourceContentPurged(db, sourceId)))
            throw new MessagingError('content-purged');
          const latest = grant(botSlug, receiver.id);
          if (
            latest.dmForward !== true ||
            latest.revokedAt ||
            latest.suspendedReason ||
            latest.bindingId !== receiver.bindingId ||
            latest.revision !== receiver.revision ||
            latest.receiveScope?.kind !== 'dm' ||
            latest.receiveScope.conversationId !== conversationId ||
            !channelBridgeRoutes(latest).some(
              (route) =>
                route.enabled &&
                routes.some(
                  (prior) =>
                    prior.enabled && prior.id === route.id && prior.revision === route.revision,
                ),
            )
          )
            throw new MessagingError('grant-revoked');
        };
        try {
          let sender: MessagingGrant | undefined;
          for (const candidate of grants) {
            if (
              candidate.bindingId !== receiver.bindingId ||
              (candidate.receiveScope &&
                candidate.id !== receiver.id &&
                candidate.dmForward !== true)
            )
              continue;
            if (
              candidate.origin === 'implicit' &&
              !provider(candidate.providerId).provider.postConversation
            )
              continue;
            const checked = await check(candidate);
            assertForwarding();
            if (
              checked.inspected.account.postSupported !== false &&
              checked.inspected.target.receiveScope?.kind === 'dm' &&
              checked.inspected.target.receiveScope.conversationId === conversationId
            ) {
              sender = candidate;
              break;
            }
          }
          if (!sender) continue;
          let offset = 0;
          let part = 0;
          while (offset < text.length) {
            assertForwarding();
            let end = Math.min(offset + 4000, text.length);
            if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
            const base = 'web-mirror-' + sender.id + '-' + message.id;
            const requestId = text.length > 4000 ? base + '-' + (part + 1) : base;
            forwardingFences.set(requestId, assertForwarding);
            if (sourceId) forwardingSources.set(requestId, sourceId);
            try {
              const intent = await context.service.post(
                botSlug,
                sender.id,
                requestId,
                text.slice(offset, end),
              );
              if (intent.state !== 'provider-accepted') break;
            } finally {
              forwardingFences.delete(requestId);
              forwardingSources.delete(requestId);
            }
            part++;
            offset = end;
          }
        } catch (error) {
          warn(error, receiver.id);
        }
      }
    } catch (error) {
      warn(error);
    }
  };

  return {
    mirrorChoice,
    mirrorAccepted,
    recoverMirrors,
    forwardingSources,
    forwardingFences,
    forwardWebDm,
  };
}
