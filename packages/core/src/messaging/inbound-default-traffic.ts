import { effectiveDmControls } from './dm-controls.js';
import { admissionBound, conversationName, hold, readBlock, removeHeld } from './conversations.js';
import type { ConversationIngest } from './conversation-ingest.js';
import type { MessagingIdentity } from './identity.js';
import { senderAdmissionAllowed } from './sender-access.js';
import { readMessagingIdentity } from './identity.js';
import { recordGrantReception } from './reception-paths.js';
import { threadReceptionPolicy } from './thread-policy.js';
import { groupReceptionPolicy, initializeGroupReceptionPolicy } from './group-policy.js';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { MessagingGrant } from './outbound.js';
import { MessagingError, type MessagingInboundEvent, type MessagingProvider } from './provider.js';
import type { StatementSync } from 'node:sqlite';
import type { InboundMessagingOptions } from './inbound.js';

export function createInboundDefaultTraffic(wiring: {
  persistSource: (
    db: DatabaseSync,
    value: MessagingGrant | { ingest: ConversationIngest; botSlug: string; bindingId: string },
    event: MessagingInboundEvent,
  ) => string;
  options: InboundMessagingOptions;
  database: OperationalDatabaseModulePort;
  providers: Map<
    string,
    { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
  >;
  closed: boolean;
  controls: Map<
    string,
    {
      controller: AbortController;
      token: object;
      startedAt: number;
      ready: Promise<void>;
      dispose?: (() => void) | undefined;
    }
  >;
  commandIntake: (
    provider: MessagingProvider,
    event: MessagingInboundEvent,
    signal: AbortSignal,
    defaultOnly?: boolean,
  ) => Promise<boolean>;
  placeIngests: (identity: MessagingIdentity, event: MessagingInboundEvent) => void;
  bounded: <T>(pending: Promise<T>) => Promise<T>;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  sourceId: (
    value: Pick<MessagingGrant, 'providerId' | 'fingerprint'>,
    event: MessagingInboundEvent,
  ) => string;
  receptionChanged: () => void;
  mirrorDm: (value: MessagingGrant, sourceEventId: string) => Promise<void>;
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
  start: (value: MessagingGrant, attempt?: number, replyOnly?: boolean) => Promise<void>;
  valid: (value: MessagingGrant, reception?: boolean) => boolean;
  grant: (id: string) => MessagingGrant;
  prepareDirectAdmissionInsert: (db: DatabaseSync) => StatementSync;
  prepareMentionAdmissionInsert: (db: DatabaseSync) => StatementSync;
  prepareCommandAdmissionHandled: (db: DatabaseSync) => StatementSync;
}) {
  const {
    persistSource,
    options,
    database,
    providers,
    bounded,
    transaction,
    sourceId,
    mirrorDm,
    leases,
    prepareDirectAdmissionInsert,
    prepareMentionAdmissionInsert,
    prepareCommandAdmissionHandled,
  } = wiring;

  const admitDirect = (db: DatabaseSync, value: MessagingGrant, event: MessagingInboundEvent) => {
    const sourceEventId = persistSource(db, value, event);
    const policy = options.sourcePolicy.resolveIn(db, value.botSlug, 'human-dm');
    const admission = prepareDirectAdmissionInsert(db).run(
      sourceEventId,
      value.botSlug,
      'human-dm',
      policy.revision,
      value.muted ? 'silent' : policy.wake,
      policy.revision,
      value.muted ? 'silent' : policy.wake === 'immediate' ? 'all' : policy.wake,
    );
    if (admission.changes) recordGrantReception(db, sourceEventId, value.botSlug);
    return sourceEventId;
  };

  const admitMention = (db: DatabaseSync, value: MessagingGrant, event: MessagingInboundEvent) => {
    const reception = groupReceptionPolicy(db, value.id);
    const thread = event.reply.threadId
      ? threadReceptionPolicy(db, value.id, event.reply.threadId)
      : undefined;
    const sourceEventId = persistSource(db, value, event);
    const policy = options.sourcePolicy.resolveIn(db, value.botSlug, 'group-mention');
    const admission = prepareMentionAdmissionInsert(db).run(
      sourceEventId,
      value.botSlug,
      'group-mention',
      policy.revision,
      value.muted ? 'silent' : policy.wake,
      reception.revision,
      value.muted ? 'silent' : policy.wake === 'immediate' ? 'all' : policy.wake,
      thread?.revision ?? null,
      reception.defaultRevision ?? null,
    );
    if (admission.changes) recordGrantReception(db, sourceEventId, value.botSlug);
    return sourceEventId;
  };

  const conversationEntries = (
    db: DatabaseSync,
    bindingId: string,
    conversation: MessagingInboundEvent['conversation'],
  ) =>
    (
      db
        .prepare(
          `SELECT body FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL
          AND json_extract(body, '$.receiveScope.kind') = ?
          AND json_extract(body, '$.receiveScope.conversationId') = ?`,
        )
        .all(bindingId, conversation.kind, conversation.id) as { body: string }[]
    ).map((row) =>
      database.read((db) => effectiveDmControls(db, JSON.parse(row.body) as MessagingGrant)),
    );

  const renameEntries = (
    db: DatabaseSync,
    entries: MessagingGrant[],
    event: MessagingInboundEvent,
  ): MessagingGrant[] => {
    const name = event.conversation.kind === 'group' ? event.conversation.name : event.actor.name;
    if (!name) return entries;
    return entries.map((item) => {
      if (
        item.targetName === name ||
        (event.conversation.kind === 'dm' && item.origin !== 'implicit')
      )
        return item;
      const renamed = { ...item, targetName: name };
      db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
        JSON.stringify(renamed),
        item.id,
      );
      return renamed;
    });
  };

  const defaultTraffic = async (
    id: string,
    lease: { controller: AbortController; token: object },
    event: MessagingInboundEvent,
    signal: AbortSignal,
  ): Promise<{ accepted: true }> => {
    signal.throwIfAborted();
    lease.controller.signal.throwIfAborted();
    const identity = database.read((db) => readMessagingIdentity(db, id));
    const entry = providers.get(identity.providerId);
    if (
      wiring.closed ||
      wiring.controls.get(id) !== lease ||
      entry?.token !== lease.token ||
      !identity.enabled ||
      identity.revokedAt ||
      options.bindingAvailable?.(id) === false ||
      !options.isBotActive(identity.botSlug)
    )
      throw new MessagingError('consumer-unavailable');
    if (event.fingerprint !== identity.fingerprint || event.botId !== identity.accountRef)
      throw new MessagingError('untrusted-source');
    if (identity.receiveAfter && Date.parse(event.at) < Date.parse(identity.receiveAfter))
      return { accepted: true };
    if (await wiring.commandIntake(entry.provider, event, signal, true)) return { accepted: true };
    if (event.conversation.kind === 'group' && !event.mentionedAccount) {
      wiring.placeIngests(identity, event);
      return { accepted: true };
    }
    if (!database.read((db) => senderAdmissionAllowed(db, identity.botSlug, event)))
      return { accepted: true };
    const result = await admitDefault(id, lease, identity, entry, event, signal);
    wiring.placeIngests(identity, event);
    return result;
  };

  const admitDefault = async (
    id: string,
    lease: { controller: AbortController; token: object },
    identity: MessagingIdentity,
    entry: NonNullable<ReturnType<typeof providers.get>>,
    event: MessagingInboundEvent,
    signal: AbortSignal,
    claimCommand = false,
  ): Promise<{ accepted: true; commandClaimed?: string }> => {
    if (
      identity.platform === 'weixin' &&
      (event.conversation.kind !== 'dm' ||
        !(await bounded(entry.provider.targets(identity.accountRef))).some(
          (target) =>
            target.receiveScope?.kind === 'dm' &&
            target.receiveScope.conversationId === event.conversation.id,
        ))
    )
      return { accepted: true };
    signal.throwIfAborted();
    const admitted = transaction(
      (db) => {
        signal.throwIfAborted();
        lease.controller.signal.throwIfAborted();
        const currentIdentity = readMessagingIdentity(db, id);
        if (
          currentIdentity.receiveAfter &&
          Date.parse(event.at) < Date.parse(currentIdentity.receiveAfter)
        )
          return undefined;
        const entries = renameEntries(db, conversationEntries(db, id, event.conversation), event);
        if (!claimCommand && entries.some((item) => item.origin !== 'implicit')) return undefined;
        let value: MessagingGrant | undefined = entries[0];
        if (
          identity.platform === 'weixin' &&
          value?.receiveAfter &&
          Date.parse(event.at) < Date.parse(value.receiveAfter)
        )
          return undefined;
        let created = false;
        if (value === undefined) {
          if (readBlock(db, identity.botSlug, identity.fingerprint, event.conversation))
            return undefined;
          const reason =
            readMessagingIdentity(db, id).newConversations !== 'auto'
              ? ('ask' as const)
              : admissionBound(db, id, new Date());
          if (reason !== undefined) {
            hold(db, id, event, reason, new Date().toISOString());
            return { held: true as const };
          }
          removeHeld(db, id, event.conversation);
          const priorRow = db
            .prepare(
              `SELECT g.body FROM messaging_grants g JOIN messaging_bindings b ON b.id = g.binding_id
               WHERE g.bot_slug = ? AND b.provider_id = ? AND b.fingerprint = ?
                 AND b.revoked_at IS NOT NULL
                 AND json_extract(g.body, '$.origin') = 'implicit'
                 AND json_extract(g.body, '$.receiveScope.kind') = ?
                 AND json_extract(g.body, '$.receiveScope.conversationId') = ?
               ORDER BY g.created_at DESC, g.rowid DESC LIMIT 1`,
            )
            .get(
              identity.botSlug,
              identity.providerId,
              identity.fingerprint,
              event.conversation.kind,
              event.conversation.id,
            ) as { body: string } | undefined;
          const prior = priorRow ? (JSON.parse(priorRow.body) as MessagingGrant) : undefined;
          if (prior && Date.parse(event.at) < Date.parse(identity.createdAt)) return undefined;
          value = {
            id: randomUUID(),
            bindingId: id,
            botSlug: identity.botSlug,
            providerId: identity.providerId,
            accountRef: identity.accountRef,
            accountName: identity.name,
            fingerprint: identity.fingerprint,
            platform: identity.platform,
            targetRef: '',
            targetName: conversationName(event),
            targetDigest: '',
            revision: 1,
            createdAt: new Date().toISOString(),
            ...(prior
              ? {
                  receiveAfter: identity.createdAt,
                  ...(prior.muted !== undefined ? { muted: prior.muted } : {}),
                  ...(prior.preferenceRevision !== undefined
                    ? { preferenceRevision: prior.preferenceRevision }
                    : {}),
                }
              : {}),
            receiveScope: { kind: event.conversation.kind, conversationId: event.conversation.id },
            origin: 'implicit',
          };
          db.prepare(
            'INSERT INTO messaging_grants (id, binding_id, bot_slug, revision, created_at, body) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(value.id, id, value.botSlug, 1, value.createdAt, JSON.stringify(value));
          if (event.conversation.kind === 'group') initializeGroupReceptionPolicy(db, value.id);
          created = true;
        }
        if (value.receiveAfter && Date.parse(event.at) < Date.parse(value.receiveAfter))
          return undefined;
        const existing = db
          .prepare('SELECT 1 FROM inbox_admissions WHERE source_event_id = ?')
          .get(sourceId(value, event));
        if (existing) return { value, created, sourceEventId: undefined };
        const sourceEventId =
          event.conversation.kind === 'dm'
            ? admitDirect(db, value, event)
            : admitMention(db, value, event);
        if (claimCommand)
          prepareCommandAdmissionHandled(db).run(
            new Date().toISOString(),
            sourceEventId,
            identity.botSlug,
          );
        return { value, created, sourceEventId };
      },
      ['grants', 'source-event', 'bot-inbox'],
    );
    if (!admitted) return { accepted: true };
    if ('held' in admitted) {
      wiring.receptionChanged();
      return { accepted: true };
    }
    const { value, created, sourceEventId } = admitted;
    if (claimCommand) {
      if (created) wiring.receptionChanged();
      return {
        accepted: true,
        ...(sourceEventId === undefined ? {} : { commandClaimed: sourceEventId }),
      };
    }
    if (sourceEventId !== undefined) await mirrorDm(value, sourceEventId);
    const reception = created || !leases.has(value.id) ? wiring.start(value) : undefined;
    if (created) wiring.receptionChanged();
    if (sourceEventId !== undefined) {
      const committed = () => options.onAdmissionCommitted?.(value.botSlug, sourceEventId);
      if (reception) void reception.then(committed);
      else setImmediate(committed);
    }
    if (sourceEventId !== undefined && !value.muted)
      setImmediate(() => {
        if (wiring.closed) return;
        try {
          if (wiring.valid(wiring.grant(value.id)))
            options.onAdmitted(value.botSlug, sourceEventId);
        } catch {
          options.warn?.('messaging-default-traffic-wake-failed');
        }
      });
    return { accepted: true };
  };

  return { admitDirect, conversationEntries, defaultTraffic, admitDefault };
}
