import { commitThreadReceptionPolicy, threadReceptionPolicy } from './thread-policy.js';
import { commitGroupReceptionPolicy, groupReceptionPolicy } from './group-policy.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { MessagingGrant } from './outbound.js';
import {
  MessagingError,
  type MessagingInboundEvent,
  type MessagingProvider,
  type MessagingReplyRoute,
} from './provider.js';
import type { ExternalSource, InboundMessaging } from './inbound-contract.js';
import type { InboundMessagingOptions } from './inbound.js';

export function threadRoute(
  platform: string,
  route: MessagingReplyRoute,
): route is MessagingReplyRoute & { threadId: string; rootId: string } {
  if (!route.threadId || !route.rootId) return false;
  if (platform === 'feishu') return !!route.parentId;
  return platform === 'slack' && route.rootId === route.threadId && route.parentId === undefined;
}

export function ordinaryThreadReply(event: MessagingInboundEvent): boolean {
  return (
    !event.mentionedAccount &&
    threadRoute(event.channel, event.reply) &&
    event.reply.conversationId === event.conversation.id &&
    (event.channel !== 'slack' || event.messageId !== event.reply.threadId)
  );
}

export function createInboundReceptionPolicy({
  grant,
  options,
  providers,
  database,
  start,
  stop,
  valid,
  inspectGrant,
  leases,
  transaction,
  read,
}: {
  grant: (id: string) => MessagingGrant;
  options: InboundMessagingOptions;
  providers: Map<
    string,
    { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
  >;
  database: OperationalDatabaseModulePort;
  start: (value: MessagingGrant, attempt?: number, replyOnly?: boolean) => Promise<void>;
  stop: (id: string) => void;
  valid: (value: MessagingGrant, reception?: boolean) => boolean;
  inspectGrant: (
    provider: MessagingProvider,
    value: MessagingGrant,
  ) => Promise<{
    account: import('./provider.js').MessagingAccount;
    target: import('./provider.js').MessagingTarget;
  }>;
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
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  read: (
    botSlug: string,
    id: string,
    includeQuote?: boolean,
    includeContext?: boolean,
  ) => ExternalSource;
}): Pick<InboundMessaging, 'setEnabled' | 'policy' | 'setPolicy' | 'threads' | 'setThread'> {
  return {
    async setEnabled(botSlug, id, enabled) {
      const value = grant(id);
      if (value.origin === 'implicit') throw new MessagingError('capability-unavailable');
      if (
        value.botSlug !== botSlug ||
        value.revokedAt ||
        value.suspendedReason ||
        !options.isBotActive(botSlug)
      )
        throw new MessagingError('grant-unavailable');
      let scope: MessagingGrant['receiveScope'];
      if (enabled) {
        const entry = providers.get(value.providerId);
        if (!entry?.provider.consume || !entry.provider.reply)
          throw new MessagingError('provider-incompatible');
        const inspected = await entry.provider.inspect(value.accountRef, value.targetRef);
        if (
          providers.get(value.providerId) !== entry ||
          inspected.account.fingerprint !== value.fingerprint ||
          inspected.target.digest !== value.targetDigest
        )
          throw new MessagingError('rebind-required');
        scope = inspected.target.receiveScope;
        if (!scope) throw new MessagingError('group-required');
        if (
          scope.kind === 'dm' &&
          (value.receiveTargetChannelId || value.channelBridge || value.bridgeRoutes)
        )
          throw new MessagingError('capability-unavailable');
      }
      const updated = database.transaction(
        (db) => {
          const latest = grant(id);
          if (
            latest.revision !== value.revision ||
            latest.revokedAt ||
            latest.suspendedReason ||
            options.bindingAvailable?.(latest.bindingId) === false ||
            !options.isBotActive(botSlug)
          )
            throw new MessagingError('grant-unavailable');
          const { receiveScope: _prior, ...rest } = latest;
          const next = {
            ...rest,
            revision: latest.revision + 1,
            ...(scope ? { receiveScope: scope } : {}),
            ...(latest.channelBridge
              ? {
                  channelBridge: {
                    ...latest.channelBridge,
                    enabled,
                    revision: latest.channelBridge.revision + 1,
                  },
                }
              : {}),
          };
          db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
            JSON.stringify(next),
            next.revision,
            id,
          );
          return next;
        },
        ['grants', 'bindings', 'bot-inbox'],
      );
      if (enabled) await start(updated);
      else stop(id);
    },
    policy(botSlug, id) {
      const value = grant(id);
      if (
        value.botSlug !== botSlug ||
        value.revokedAt ||
        value.suspendedReason ||
        !options.isBotActive(botSlug)
      )
        throw new MessagingError('grant-unavailable');
      return database.read((db) => groupReceptionPolicy(db, id));
    },
    async setPolicy(botSlug, id, input, editor) {
      const value = grant(id);
      if (
        value.botSlug !== botSlug ||
        !valid(value) ||
        (editor.kind === 'bot' && editor.botSlug !== botSlug)
      )
        throw new MessagingError('grant-unavailable');
      const entry = providers.get(value.providerId)!;
      const inspected = await inspectGrant(entry.provider, value);
      if (
        providers.get(value.providerId) !== entry ||
        inspected.account.fingerprint !== value.fingerprint ||
        inspected.target.digest !== value.targetDigest ||
        inspected.target.receiveScope?.conversationId !== value.receiveScope?.conversationId
      )
        throw new MessagingError('rebind-required');
      if (
        input.inheritance !== 'inherit' &&
        input.collection === 'all' &&
        !leases.get(id)?.ordinaryVerified
      )
        throw new MessagingError('ordinary-delivery-unverified');
      const policy = transaction(
        (db) => {
          if (!valid(grant(id)) || grant(id).revision !== value.revision)
            throw new MessagingError('grant-unavailable');
          const policy = commitGroupReceptionPolicy(db, id, input, editor);
          const latest = grant(id);
          if (
            latest.channelBridge &&
            (latest.channelBridge.collection !== input.collection ||
              (latest.channelBridge.collectionInheritance ?? 'custom') !==
                (input.inheritance ?? 'custom'))
          ) {
            db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
              JSON.stringify({
                ...latest,
                channelBridge: {
                  ...latest.channelBridge,
                  collection: input.collection,
                  collectionInheritance: input.inheritance ?? 'custom',
                  revision: latest.channelBridge.revision + 1,
                },
              }),
              id,
            );
          }
          return policy;
        },
        ['grants', 'bot-inbox'],
      );
      options.warn?.(
        JSON.stringify({
          event: 'messaging-group-policy',
          phase: 'committed',
          grantId: id,
          revision: policy.revision,
          editor: editor.kind,
        }),
      );
      return policy;
    },
    threads(botSlug, id) {
      const value = grant(id);
      if (
        value.botSlug !== botSlug ||
        value.revokedAt ||
        value.suspendedReason ||
        !options.isBotActive(botSlug)
      )
        throw new MessagingError('grant-unavailable');
      if (value.platform !== 'feishu' && value.platform !== 'slack') return [];
      return database.read((db) => {
        const rows = db
          .prepare(`WITH candidates AS (
          SELECT s.source_event_id, s.payload_json, s.body, s.created_at,
            row_number() OVER (PARTITION BY json_extract(s.payload_json, '$.external.event.reply.threadId') ORDER BY s.created_at DESC, s.source_event_id DESC) AS rank
          FROM source_events s JOIN inbox_admissions a ON a.source_event_id = s.source_event_id
          WHERE a.bot_slug = ? AND s.source_kind = 'bridge-message'
            AND json_extract(s.payload_json, '$.external.grantId') = ?
            AND json_extract(s.payload_json, '$.external.grantRevision') = ?
            AND json_extract(s.payload_json, '$.external.event.reply.threadId') IS NOT NULL
        ) SELECT source_event_id, payload_json, body FROM candidates WHERE rank = 1 ORDER BY created_at DESC LIMIT 50`)
          .all(botSlug, id, value.revision) as {
          source_event_id: string;
          payload_json: string;
          body: string;
        }[];
        const seen = new Set<string>();
        return rows
          .flatMap((row) => {
            const source = (JSON.parse(row.payload_json) as { external: ExternalSource }).external;
            const route = source.event.reply;
            if (
              source.grantId !== id ||
              source.grantRevision !== value.revision ||
              !threadRoute(value.platform, route) ||
              seen.has(route.threadId)
            )
              return [];
            seen.add(route.threadId);
            const policy = threadReceptionPolicy(db, id, route.threadId) ?? {
              threadId: route.threadId,
              conversationId: route.conversationId,
              rootId: route.rootId,
              anchorSourceEventId: row.source_event_id,
              fingerprint: value.fingerprint,
              mode: 'inherit' as const,
              wake: null,
              revision: 0,
              changedAt: '',
              editor: { kind: 'built-in' as const },
            };
            return [
              {
                ...policy,
                preview: source.event.mentions
                  .reduce(
                    (text, mention) =>
                      text.replaceAll(mention.key, '@' + (mention.name ?? mention.id)),
                    row.body,
                  )
                  .slice(0, 120),
                anchorSourceEventId: row.source_event_id,
                ordinaryDelivery:
                  valid(value) &&
                  leases.get(id)?.ordinaryThreads.get(route.threadId) === route.rootId
                    ? ('verified' as const)
                    : ('unverified' as const),
              },
            ];
          })
          .slice(0, 50);
      });
    },
    async setThread(botSlug, sourceEventId, input, editor) {
      const source = read(botSlug, sourceEventId);
      const value = grant(source.grantId);
      if (
        value.botSlug !== botSlug ||
        !valid(value) ||
        source.grantRevision !== value.revision ||
        (editor.kind === 'bot' && editor.botSlug !== botSlug)
      )
        throw new MessagingError('grant-unavailable');
      const route = source.event.reply;
      if (
        !threadRoute(value.platform, route) ||
        route.conversationId !== value.receiveScope?.conversationId ||
        source.event.fingerprint !== value.fingerprint
      )
        throw new MessagingError('thread-unavailable');
      const entry = providers.get(value.providerId)!;
      const lease = leases.get(value.id)!;
      const inspected = await entry.provider.inspect(value.accountRef, value.targetRef);
      if (
        providers.get(value.providerId) !== entry ||
        inspected.account.fingerprint !== value.fingerprint ||
        inspected.target.digest !== value.targetDigest ||
        inspected.target.receiveScope?.conversationId !== route.conversationId
      )
        throw new MessagingError('rebind-required');
      if (input.mode === 'follow' && lease.ordinaryThreads.get(route.threadId) !== route.rootId)
        throw new MessagingError('thread-delivery-unverified');
      const policy = transaction(
        (db) => {
          if (
            !valid(grant(value.id)) ||
            grant(value.id).revision !== value.revision ||
            leases.get(value.id) !== lease
          )
            throw new MessagingError('grant-unavailable');
          return commitThreadReceptionPolicy(
            db,
            value.id,
            {
              threadId: route.threadId!,
              conversationId: route.conversationId,
              rootId: route.rootId!,
              anchorSourceEventId: sourceEventId,
              fingerprint: value.fingerprint,
            },
            input,
            editor,
          );
        },
        ['grants', 'bot-inbox'],
      );
      options.warn?.(
        JSON.stringify({
          event: 'messaging-thread-policy',
          phase: 'committed',
          grantId: value.id,
          revision: policy.revision,
          editor: editor.kind,
          mode: policy.mode,
        }),
      );
      return policy;
    },
  };
}
