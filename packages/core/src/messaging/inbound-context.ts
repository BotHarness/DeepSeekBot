import type { ConversationIngest } from './conversation-ingest.js';
import { retainedContextPage, type RetainedCursor } from './retained-context.js';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { MessagingGrant } from './outbound.js';
import {
  MessagingError,
  type MessagingInboundEvent,
  type MessagingProvider,
  type MessagingContextScope,
} from './provider.js';
import type {
  ExternalSource,
  ExternalContextRead,
  ExternalContextResult,
  InboundMessaging,
} from './inbound-contract.js';
import type { StatementSync } from 'node:sqlite';

export function createInboundContext(wiring: {
  read: (
    botSlug: string,
    id: string,
    includeQuote?: boolean,
    includeContext?: boolean,
  ) => ExternalSource;
  grant: (id: string) => MessagingGrant;
  providers: Map<
    string,
    { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
  >;
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
  valid: (value: MessagingGrant, reception?: boolean) => boolean;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  database: OperationalDatabaseModulePort;
  sourceId: (
    value: Pick<MessagingGrant, 'providerId' | 'fingerprint'>,
    event: MessagingInboundEvent,
  ) => string;
  persistSource: (
    db: DatabaseSync,
    value: MessagingGrant | { ingest: ConversationIngest; botSlug: string; bindingId: string },
    event: MessagingInboundEvent,
  ) => string;
  prepareSourcePayloadUpdate: (db: DatabaseSync) => StatementSync;
}): Pick<InboundMessaging, 'context'> {
  const { providers, leases, transaction, database, prepareSourcePayloadUpdate } = wiring;

  const cursors = new Map<
    string,
    {
      botSlug: string;
      sourceEventId: string;
      revision: number;
      scope: MessagingContextScope;
      providerCursor?: string | undefined;
      offset: number;
      digest: string;
      expiresAt: number;
      counts: string;
    }
  >();

  const retainedCursors = new Map<string, RetainedCursor>();

  return {
    async context(botSlug, sourceEventId, sessionId, query, callerSignal) {
      if (!['group', 'nearby', 'thread', 'retained', 'retained-nearby'].includes(query.scope))
        throw new MessagingError('invalid-history-query');
      const maxCharacters = query.maxCharacters ?? 12000;
      if (!Number.isInteger(maxCharacters) || maxCharacters < 1000 || maxCharacters > 24000)
        throw new MessagingError('invalid-history-budget');
      const beforeCount = query.beforeCount ?? 10;
      const afterCount = query.afterCount ?? 5;
      if (
        (!['nearby', 'retained-nearby'].includes(query.scope) &&
          (query.beforeCount !== undefined || query.afterCount !== undefined)) ||
        ![beforeCount, afterCount].every(
          (count) => Number.isInteger(count) && count >= 0 && count <= 20,
        )
      )
        throw new MessagingError('invalid-history-query');
      const counts = ['nearby', 'retained-nearby'].includes(query.scope)
        ? `${beforeCount}:${afterCount}`
        : '';
      const source = wiring.read(botSlug, sourceEventId);
      const value = wiring.grant(source.grantId);
      const entry = providers.get(value.providerId);
      const lease = leases.get(value.id);
      if (
        value.botSlug !== botSlug ||
        !wiring.valid(value) ||
        !lease ||
        source.grantRevision !== value.revision ||
        source.event.fingerprint !== value.fingerprint ||
        source.event.conversation.id !== value.receiveScope?.conversationId
      )
        throw new MessagingError('source-unavailable');
      const assertCurrent = () => {
        if (
          !wiring.valid(wiring.grant(value.id)) ||
          wiring.grant(value.id).revision !== value.revision ||
          providers.get(value.providerId) !== entry
        )
          throw new MessagingError('source-unavailable');
      };
      const audit = (record: ExternalContextRead) =>
        transaction(
          (db) => {
            assertCurrent();
            const row = db
              .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
              .get(sourceEventId) as { payload_json: string };
            const payload = JSON.parse(row.payload_json) as { external: ExternalSource };
            payload.external.contextReads = [
              ...(payload.external.contextReads ?? []).slice(-19),
              record,
            ];
            prepareSourcePayloadUpdate(db).run(JSON.stringify(payload), sourceEventId);
          },
          ['source-event'],
        );
      const signal = AbortSignal.any([
        lease.controller.signal,
        AbortSignal.timeout(15000),
        ...(callerSignal ? [callerSignal] : []),
      ]);
      const at = new Date().toISOString();
      const cancellable = async <T>(request: Promise<T>): Promise<T> => {
        let abort!: () => void;
        const interrupted = new Promise<never>((_, reject) => {
          abort = () => reject(new MessagingError('history-cancelled'));
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
        try {
          return await Promise.race([request, interrupted]);
        } finally {
          signal.removeEventListener('abort', abort);
        }
      };
      try {
        signal.throwIfAborted();
        if (query.scope === 'retained' || query.scope === 'retained-nearby') {
          if (source.platform !== 'weixin')
            throw new MessagingError('history-capability-unavailable');
          if (!entry) throw new MessagingError('provider-unavailable');
          const inspected = await cancellable(
            entry.provider.inspect(value.accountRef, value.targetRef),
          );
          signal.throwIfAborted();
          assertCurrent();
          if (
            inspected.account.fingerprint !== value.fingerprint ||
            inspected.target.digest !== value.targetDigest ||
            inspected.target.receiveScope?.conversationId !== source.event.conversation.id
          )
            throw new MessagingError('rebind-required');
          const result = database.read((db) =>
            retainedContextPage(db, {
              botSlug,
              source,
              value,
              query,
              maxCharacters,
              beforeCount,
              afterCount,
              cursors: retainedCursors,
              read: (id) => {
                try {
                  return wiring.read(botSlug, id, false, false);
                } catch (error) {
                  if (!(error instanceof MessagingError)) throw error;
                  return undefined;
                }
              },
            }),
          );
          signal.throwIfAborted();
          assertCurrent();
          audit({
            at,
            sessionId,
            scope: query.scope,
            outcome: 'read',
            sourceEventIds: result.messages.map((item) => item.sourceEventId),
            omitted: result.omitted,
            incomplete: result.incomplete,
            coverage: result.coverage,
          });
          return result;
        }
        if (!entry?.provider.history) throw new MessagingError('history-capability-unavailable');
        if (query.scope === 'thread' && !source.event.reply.threadId)
          throw new MessagingError('thread-unavailable');
        for (const [key, cursor] of cursors) if (cursor.expiresAt < Date.now()) cursors.delete(key);
        const cursor = query.cursor === undefined ? undefined : cursors.get(query.cursor);
        if (
          query.cursor !== undefined &&
          (!cursor ||
            cursor.botSlug !== botSlug ||
            cursor.sourceEventId !== sourceEventId ||
            cursor.revision !== value.revision ||
            cursor.scope !== query.scope ||
            cursor.counts !== counts)
        )
          throw new MessagingError('history-cursor-unavailable');
        const inspected = await cancellable(
          entry.provider.inspect(value.accountRef, value.targetRef),
        );
        signal.throwIfAborted();
        assertCurrent();
        if (
          inspected.account.fingerprint !== value.fingerprint ||
          inspected.target.digest !== value.targetDigest ||
          inspected.target.receiveScope?.conversationId !== value.receiveScope?.conversationId
        )
          throw new MessagingError('rebind-required');
        const request = entry.provider.history({
          accountRef: value.accountRef,
          fingerprint: value.fingerprint,
          route: source.event.reply,
          query: {
            scope: query.scope,
            limit: 20,
            ...(query.scope === 'nearby' ? { beforeCount, afterCount } : {}),
            ...(cursor?.providerCursor === undefined ? {} : { cursor: cursor.providerCursor }),
          },
          signal,
        });
        const page = await cancellable(request);
        signal.throwIfAborted();
        assertCurrent();
        if (
          page.hasMore &&
          cursor?.providerCursor !== undefined &&
          page.nextCursor === cursor.providerCursor
        )
          throw new MessagingError('untrusted-source');
        const digest = createHash('sha256')
          .update(JSON.stringify({ ...page, nextCursor: undefined }))
          .digest('hex');
        if (cursor?.digest && cursor.digest !== digest)
          throw new MessagingError('history-cursor-stale');
        const result: ExternalContextResult = {
          scope: query.scope,
          messages: [],
          omitted: page.omitted,
          incomplete: page.hasMore || page.omitted > 0,
          coverage: page.coverage,
          ...(page.window ? { window: page.window } : {}),
        };
        let offset = cursor?.offset ?? 0;
        for (; offset < page.events.length; ++offset) {
          const event = page.events[offset]!;
          const message = {
            sourceEventId: wiring.sourceId(value, event),
            messageId: event.messageId,
            senderId: event.actor.id,
            ...(event.actor.name ? { senderName: event.actor.name } : {}),
            ...(event.mentions.length ? { mentions: event.mentions } : {}),
            at: event.at,
            text: event.text,
            ...(event.reply.threadId ? { threadId: event.reply.threadId } : {}),
          };
          const required =
            JSON.stringify({ ...result, messages: [...result.messages, message] }).length + 200;
          if (required > maxCharacters) {
            result.incomplete = true;
            if (result.messages.length === 0) result.requiredCharacters = required;
            break;
          }
          result.messages.push(message);
        }
        if (offset < page.events.length || page.hasMore) {
          const key = randomUUID();
          if (cursors.size >= 100) cursors.delete(cursors.keys().next().value!);
          cursors.set(key, {
            botSlug,
            sourceEventId,
            revision: value.revision,
            scope: query.scope,
            ...(offset < page.events.length
              ? { providerCursor: cursor?.providerCursor, offset, digest }
              : { providerCursor: page.nextCursor, offset: 0, digest: '' }),
            counts,
            expiresAt: Date.now() + 1800000,
          });
          result.nextCursor = key;
        }
        transaction(
          (db) => {
            signal.throwIfAborted();
            assertCurrent();
            for (const event of page.events.slice(cursor?.offset ?? 0, offset))
              wiring.persistSource(db, value, event);
          },
          ['source-event'],
        );
        audit({
          at,
          sessionId,
          scope: query.scope,
          outcome: 'read',
          sourceEventIds: result.messages.map((item) => item.sourceEventId),
          omitted: page.omitted,
          incomplete: result.incomplete,
        });
        if (query.cursor) cursors.delete(query.cursor);
        return result;
      } catch (error) {
        if (!signal.aborted) {
          try {
            audit({
              at,
              sessionId,
              scope: query.scope,
              outcome: 'refused',
              sourceEventIds: [],
              omitted: 0,
              incomplete: true,
              reason: error instanceof MessagingError ? error.code : 'history-unavailable',
            });
          } catch {}
        }
        throw error;
      }
    },
  };
}
