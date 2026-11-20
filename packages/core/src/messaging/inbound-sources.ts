import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { pendingExternalReception } from './external-reception.js';
import { effectiveDmControls } from './dm-controls.js';
import { sourceContentPurged } from '../purge/fence.js';
import type { ConversationIngest } from './conversation-ingest.js';
import { trustedSenderReference, sourceSenderAllowed } from './sender-access.js';
import { currentReceptionPaths, grantReception } from './reception-paths.js';
import { resolveRetainedQuote } from './retained-context.js';
import { groupReceptionPolicy } from './group-policy.js';
import { bridgeChannel, placeBridgeSource } from './channel-target.js';
import { admitBridgeMembers } from './member-admission.js';
import { messagingDefaults } from './defaults.js';
import { channelBridgeRoutes } from './channel-bridge.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import { createHash } from 'node:crypto';
import { relatedReport } from './report.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { MessagingGrant } from './outbound.js';
import { MessagingError, type MessagingInboundEvent } from './provider.js';
import type {
  ExternalSource,
  ExternalContextResult,
  InboundMessaging,
} from './inbound-contract.js';
import type { StatementSync } from 'node:sqlite';
import type { InboundMessagingOptions } from './inbound.js';

export function createInboundSources(wiring: {
  options: InboundMessagingOptions;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  grant: (id: string) => MessagingGrant;
  valid: (value: MessagingGrant, reception?: boolean) => boolean;
  database: OperationalDatabaseModulePort;
  service: InboundMessaging;
  leases: Map<
    string,
    {
      token: object;
      ordinaryVerified?: boolean;
      ordinaryThreads: Map<string, string>;
      revision: number;
      controller: AbortController;
      dispose: (() => void) | undefined;
    }
  >;
  prepareSourcePayloadUpdate: (db: DatabaseSync) => StatementSync;
  prepareExternalSourceInsert: (db: DatabaseSync) => StatementSync;
}) {
  const {
    options,
    transaction,
    database,
    leases,
    prepareSourcePayloadUpdate,
    prepareExternalSourceInsert,
  } = wiring;

  const sourceId = (
    value: Pick<MessagingGrant, 'providerId' | 'fingerprint'>,
    event: MessagingInboundEvent,
  ) =>
    'im-' +
    createHash('sha256')
      .update(
        JSON.stringify([
          value.providerId,
          value.fingerprint,
          event.conversation.id,
          event.messageId,
        ]),
      )
      .digest('hex');

  const ingestName = (ingest: ConversationIngest, event: MessagingInboundEvent) =>
    event.conversation.name || ingest.conversation.name;

  const persistSource = (
    db: DatabaseSync,
    value: MessagingGrant | { ingest: ConversationIngest; botSlug: string; bindingId: string },
    event: MessagingInboundEvent,
  ): string => {
    if (!('ingest' in value)) value = effectiveDmControls(db, value);
    const id = sourceId('ingest' in value ? value.ingest : value, event);
    if (sourceContentPurged(db, id)) throw new MessagingError('content-purged');
    const existing = db
      .prepare('SELECT body, payload_json FROM source_events WHERE source_event_id = ?')
      .get(id) as { body: string; payload_json: string } | undefined;
    if (existing) {
      const previous = (JSON.parse(existing.payload_json) as { external: ExternalSource }).external;
      if (
        existing.body !== event.text ||
        previous.event.actor.id !== event.actor.id ||
        previous.event.actor.kind !== event.actor.kind ||
        JSON.stringify(previous.event.cloudWork ?? null) !==
          JSON.stringify(event.cloudWork ?? null) ||
        JSON.stringify(previous.event.reply) !== JSON.stringify(event.reply) ||
        JSON.stringify(previous.event.attachments ?? []) !==
          JSON.stringify(event.attachments ?? []) ||
        JSON.stringify(previous.event.contentParts ?? null) !==
          JSON.stringify(event.contentParts ?? null) ||
        JSON.stringify(previous.event.voice ?? null) !== JSON.stringify(event.voice ?? null) ||
        JSON.stringify(previous.event.video ?? null) !== JSON.stringify(event.video ?? null) ||
        JSON.stringify(previous.event.quote ?? null) !== JSON.stringify(event.quote ?? null)
      )
        throw new MessagingError('source-conflict');
      const mentions = previous.event.mentions.map((mention) => {
        const current = event.mentions.find(
          (item) => item.id === mention.id && item.key === mention.key,
        );
        return current?.name ? { ...mention, name: current.name } : mention;
      });
      if (
        event.actor.name ||
        mentions.some((item, index) => item.name !== previous.event.mentions[index]?.name)
      ) {
        const payload = JSON.parse(existing.payload_json) as { external: ExternalSource };
        payload.external.event.actor = {
          ...previous.event.actor,
          ...(event.actor.name ? { name: event.actor.name } : {}),
        };
        payload.external.event.mentions = mentions;
        prepareSourcePayloadUpdate(db).run(JSON.stringify(payload), id);
      }
    } else {
      const { text: _text, ...evidence } = event;
      const external: Omit<ExternalSource, 'body'> =
        'ingest' in value
          ? {
              id,
              at: event.at,
              platform: event.channel,
              accountName: value.ingest.accountName,
              conversationName: ingestName(value.ingest, event),
              event: evidence,
              grantId: '',
              grantRevision: 0,
              ingressBindingId: value.bindingId,
              ingestId: value.ingest.id,
              ingestRevision: value.ingest.revision,
              defaultRevision: messagingDefaults(db, value.ingest.platform).revision,
            }
          : {
              id,
              at: event.at,
              platform: event.channel,
              accountName: value.accountName,
              conversationName:
                (event.conversation.kind === 'group' && event.conversation.name) ||
                value.targetName,
              event: evidence,
              grantId: value.id,
              grantRevision: value.revision,
              defaultRevision: messagingDefaults(db, value.platform).revision,
              ...(value.dmMirror === true && value.dmMirrorEpoch
                ? { dmMirrorEpoch: value.dmMirrorEpoch }
                : {}),
              ...(event.conversation.kind === 'group'
                ? { receptionRevision: groupReceptionPolicy(db, value.id).revision }
                : {}),
              ...(value.channelBridge ? { bridgeRevision: value.channelBridge.revision } : {}),
              ...(!value.bridgeRoutes && value.receiveTargetChannelId
                ? { localChannelId: value.receiveTargetChannelId }
                : {}),
            };
      prepareExternalSourceInsert(db).run(
        id,
        value.botSlug,
        event.text,
        event.at,
        JSON.stringify({ author: { kind: 'bridged' }, external }),
      );
    }
    return id;
  };

  const mirrorDm = async (value: MessagingGrant, sourceEventId: string): Promise<void> => {
    if (value.platform !== 'weixin' || value.receiveScope?.kind !== 'dm' || value.dmMirror !== true)
      return;
    try {
      const channel = options.channels?.getOrCreateDm(OWNER_HUMAN_CONTEXT, value.botSlug);
      if (!channel) throw new MessagingError('channel-unavailable');
      const commit = transaction(
        (db) => {
          const latest = wiring.grant(value.id);
          if (
            latest.dmMirror !== true ||
            !channelBridgeRoutes(latest).some((route) => route.enabled) ||
            latest.revokedAt ||
            latest.suspendedReason ||
            latest.bindingId !== value.bindingId ||
            !wiring.valid(latest) ||
            sourceContentPurged(db, sourceEventId)
          )
            return;
          const row = db
            .prepare('SELECT body, payload_json FROM source_events WHERE source_event_id = ?')
            .get(sourceEventId) as { body: string; payload_json: string } | undefined;
          if (!row) return;
          const source = (JSON.parse(row.payload_json) as { external: ExternalSource }).external;
          if (!source.dmMirrorEpoch || source.dmMirrorEpoch !== latest.dmMirrorEpoch) return;
          if (
            db
              .prepare(
                'SELECT 1 FROM channel_placements WHERE source_event_id = ? AND channel_id = ?',
              )
              .get(sourceEventId, channel.id)
          )
            return;
          const mirrored = { ...source, dmMirrorChannelId: channel.id };
          prepareSourcePayloadUpdate(db).run(
            JSON.stringify({ ...JSON.parse(row.payload_json), external: mirrored }),
            sourceEventId,
          );
          return placeBridgeSource(
            OWNER_HUMAN_CONTEXT,
            db,
            { ...mirrored, body: row.body, localChannelId: channel.id },
            value.botSlug,
          );
        },
        ['channel'],
      );
      if (commit) options.onPlaced?.(commit);
    } catch {
      options.warn?.(
        JSON.stringify({
          event: 'weixin-dm-mirror',
          phase: 'failed',
          grantId: value.id,
          sourceEventId,
        }),
      );
    }
  };

  const read = (
    botSlug: string,
    id: string,
    includeQuote = true,
    includeContext = true,
  ): ExternalSource => {
    if (database.read((db) => sourceContentPurged(db, id)))
      throw new MessagingError('content-purged');
    const row = database.read((db) =>
      db
        .prepare(`SELECT e.payload_json, e.body FROM source_events e
      JOIN inbox_admissions a USING(source_event_id)
      WHERE e.source_event_id = ? AND a.bot_slug = ? AND e.source_kind = 'bridge-message'`)
        .get(id, botSlug),
    ) as { payload_json: string; body: string } | undefined;
    if (!row) throw new MessagingError('source-unavailable');
    const retained = (JSON.parse(row.payload_json) as { external: ExternalSource }).external;
    if (retained.ingestId) throw new MessagingError('source-unavailable');
    const routed = database.read((db) =>
      db
        .prepare(
          "SELECT 1 FROM messaging_source_paths WHERE source_event_id = ? AND json_extract(body, '$.kind') IS NOT 'grant'",
        )
        .get(id),
    );
    const paths = database.read((db) =>
      currentReceptionPaths(db, botSlug, id, undefined, 'history'),
    );
    const reception = database.read((db) => grantReception(db, id, botSlug));
    const grantBacked = !!reception || !routed;
    if (!grantBacked && !paths.length) throw new MessagingError('source-unavailable');
    if (grantBacked && wiring.grant(retained.grantId).botSlug !== botSlug)
      throw new MessagingError('source-unavailable');
    if (grantBacked && retained.localChannelId)
      database.read((db) =>
        bridgeChannel(OWNER_HUMAN_CONTEXT, db, retained.localChannelId!, botSlug),
      );
    const ownsContext = wiring.grant(retained.grantId).botSlug === botSlug;
    const { contextReads, ...sharedSource } = retained;
    const latest =
      ownsContext && includeContext
        ? contextReads?.filter((item) => item.outcome === 'read').at(-1)
        : undefined;
    const contextMessages: ExternalContextResult['messages'] = [];
    for (const sourceEventId of latest?.sourceEventIds ?? []) {
      const context = database.read((db) =>
        db
          .prepare('SELECT body, payload_json FROM source_events WHERE source_event_id = ?')
          .get(sourceEventId),
      ) as { body: string; payload_json: string } | undefined;
      if (!context || database.read((db) => sourceContentPurged(db, sourceEventId))) continue;
      if (latest?.coverage === 'retained-local-sources') {
        try {
          read(botSlug, sourceEventId, false, false);
        } catch (error) {
          if (!(error instanceof MessagingError)) throw error;
          continue;
        }
      }
      const item = (JSON.parse(context.payload_json) as { external: ExternalSource }).external;
      contextMessages.push({
        sourceEventId,
        messageId: item.event.messageId,
        senderId: item.event.actor.id,
        ...(item.event.actor.name ? { senderName: item.event.actor.name } : {}),
        ...(item.event.mentions.length ? { mentions: item.event.mentions } : {}),
        at: item.at,
        text: context.body,
        ...(item.event.reply.threadId ? { threadId: item.event.reply.threadId } : {}),
      });
    }
    const value = wiring.grant(retained.grantId);
    const quote =
      includeQuote && retained.event.quote
        ? database.read((db) =>
            resolveRetainedQuote(
              db,
              value,
              retained,
              (candidate) => {
                try {
                  return read(botSlug, candidate, false, false);
                } catch (error) {
                  if (!(error instanceof MessagingError)) throw error;
                  return undefined;
                }
              },
              wiring.valid(value),
            ),
          )
        : undefined;
    const report = database.read((db) => relatedReport(db, value, retained.event.reply));
    const sender = database.read((db) => trustedSenderReference(db, botSlug, retained.event));
    return {
      ...(sender ? { sender } : {}),
      ...(report ? { report } : {}),
      ...(quote ? { quote } : {}),
      ...(contextMessages.length === 0 ? {} : { contextMessages }),
      ...sharedSource,
      ...(ownsContext && contextReads ? { contextReads } : {}),
      ...(reception ? { reception } : {}),
      ...(!grantBacked
        ? {
            receptionPaths: paths,
            ...(paths.find((path) => path.channelId)?.channelId
              ? { localChannelId: paths.find((path) => path.channelId)!.channelId! }
              : {}),
          }
        : {}),
      body: row.body,
    };
  };

  const readShared = (botSlug: string, id: string): ExternalSource => {
    if (database.read((db) => sourceContentPurged(db, id)))
      throw new MessagingError('content-purged');
    const row = database.read((db) =>
      db
        .prepare(
          "SELECT payload_json, body FROM source_events WHERE source_event_id = ? AND source_kind = 'bridge-message'",
        )
        .get(id),
    ) as { payload_json: string; body: string } | undefined;
    if (!row) throw new MessagingError('source-unavailable');
    const retained = (JSON.parse(row.payload_json) as { external: ExternalSource }).external;
    if (!retained.ingestId && wiring.grant(retained.grantId).botSlug === botSlug)
      return read(botSlug, id);
    const channelId = database.read((db) => {
      const placements = db
        .prepare(
          'SELECT channel_id FROM channel_placements WHERE source_event_id = ? ORDER BY channel_id',
        )
        .all(id) as { channel_id: string }[];
      for (const placement of placements) {
        try {
          const channel = bridgeChannel(OWNER_HUMAN_CONTEXT, db, placement.channel_id, botSlug);
          if (channel.type === 'group') return channel.id;
        } catch (error) {
          if (!(error instanceof MessagingError)) throw error;
        }
      }
      return undefined;
    });
    if (
      !channelId ||
      (retained.event.conversation.kind !== 'group' &&
        !(retained.platform === 'weixin' && retained.event.conversation.kind === 'dm'))
    )
      throw new MessagingError('source-unavailable');
    const {
      contextReads: _reads,
      receptionPaths: _paths,
      reception: _reception,
      ...shared
    } = retained;
    return { ...shared, body: row.body, localChannelId: channelId };
  };

  const methods: Pick<
    InboundMessaging,
    'pendingExternal' | 'available' | 'sourceSignal' | 'share'
  > = {
    pendingExternal(botSlug, now, context = false) {
      return database.read((db) =>
        pendingExternalReception(
          db,
          botSlug,
          now,
          wiring.valid,
          (id) => wiring.service.available(botSlug, id),
          context,
        ),
      );
    },
    available(botSlug, id, context = false) {
      try {
        if (!database.read((db) => sourceSenderAllowed(db, botSlug, id, context))) return false;
        const source = read(botSlug, id);
        const value = wiring.grant(source.grantId);
        if (source.receptionPaths)
          return database.read(
            (db) => currentReceptionPaths(db, botSlug, id, wiring.valid, 'reply').length > 0,
          );
        return (
          value.botSlug === botSlug &&
          wiring.valid(value) &&
          source.grantRevision === value.revision &&
          source.event.fingerprint === value.fingerprint &&
          source.event.conversation.id === value.receiveScope?.conversationId
        );
      } catch {
        return false;
      }
    },
    sourceSignal(botSlug, sourceEventId) {
      const source = read(botSlug, sourceEventId);
      const value = wiring.grant(source.grantId);
      if (value.botSlug !== botSlug) throw new MessagingError('grant-unavailable');
      if (!wiring.valid(value)) throw new MessagingError('source-unavailable');
      return leases.get(value.id)!.controller.signal;
    },
    share(botSlug, sourceEventId, channelId) {
      let placement: ChannelMessageCommit | undefined;
      let admitted: string[] = [];
      const result = transaction(
        (db) => {
          if (!options.isBotActive(botSlug)) throw new MessagingError('bot-unavailable');
          const source = read(botSlug, sourceEventId);
          if (!wiring.service.available(botSlug, sourceEventId))
            throw new MessagingError('source-unavailable');
          if (source.localChannelId) throw new MessagingError('source-conflict');
          const channel = bridgeChannel(OWNER_HUMAN_CONTEXT, db, channelId, botSlug);
          const prior = db
            .prepare(
              'SELECT channel_id, revision FROM channel_placements WHERE source_event_id = ?',
            )
            .get(sourceEventId) as { channel_id: string; revision: number } | undefined;
          if (prior && prior.channel_id !== channelId) throw new MessagingError('source-conflict');
          if (prior)
            return {
              sourceEventId,
              channelId,
              messageId: sourceEventId,
              revision: prior.revision,
              alreadyShared: true,
            };
          placement = placeBridgeSource(
            OWNER_HUMAN_CONTEXT,
            db,
            { ...source, localChannelId: channelId },
            botSlug,
          );
          if (!placement) throw new MessagingError('source-conflict');
          admitted = admitBridgeMembers(
            db,
            sourceEventId,
            channel,
            options.sourcePolicy,
            options.isBotActive,
          );
          return {
            sourceEventId,
            channelId,
            messageId: sourceEventId,
            revision: placement.revision,
            alreadyShared: false,
          };
        },
        ['source-event', 'channel', 'bot-inbox'],
      );
      if (placement) {
        try {
          options.onPlaced?.(placement);
        } catch {
          options.warn?.('bridge-share-publication-failed');
        }
        try {
          options.onShared?.(admitted);
        } catch {
          options.warn?.('bridge-share-wake-failed');
        }
      }
      options.warn?.(
        JSON.stringify({
          event: 'messaging-inbox-share',
          phase: 'committed',
          initiator: botSlug,
          sourceEventId,
          channelId,
          revision: result.revision,
          alreadyShared: result.alreadyShared,
        }),
      );
      return result;
    },
  };

  return { sourceId, ingestName, persistSource, mirrorDm, read, readShared, methods };
}
