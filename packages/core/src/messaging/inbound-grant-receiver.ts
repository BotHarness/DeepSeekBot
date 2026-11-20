import { ReceiverRecovery } from './receiver-recovery.js';
import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import type { ConversationIngest } from './conversation-ingest.js';
import { senderAdmissionAllowed, senderContextAllowed } from './sender-access.js';
import { readMessagingIdentity } from './identity.js';
import { recordGrantReception, recordReceptionPath } from './reception-paths.js';
import { threadReceptionPolicy } from './thread-policy.js';
import { groupReceptionPolicy, initializeGroupReceptionPolicy } from './group-policy.js';
import { bridgeChannel, placeBridgeSource } from './channel-target.js';
import { admitBridgeMembers } from './member-admission.js';
import { exceedsBotWakeCeiling, messagingDefaults } from './defaults.js';
import { channelBridgeRoutes } from './channel-bridge.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import { recordReportEcho } from './report.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { MessagingGrant } from './outbound.js';
import { MessagingError, type MessagingInboundEvent, type MessagingProvider } from './provider.js';
import { ordinaryThreadReply, threadRoute } from './inbound-reception-policy.js';
import type { ExternalSource, InboundMessaging } from './inbound-contract.js';
import type { StatementSync } from 'node:sqlite';
import type { InboundMessagingOptions } from './inbound.js';

export function createInboundGrantReceiver(wiring: {
  receptionChanged: () => void;
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
  database: OperationalDatabaseModulePort;
  grant: (id: string) => MessagingGrant;
  closed: boolean;
  options: InboundMessagingOptions;
  providers: Map<
    string,
    { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
  >;
  controlRetries: ReceiverRecovery;
  startControl: (id: string, attempt?: number) => Promise<void>;
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
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  admitDirect: (db: DatabaseSync, value: MessagingGrant, event: MessagingInboundEvent) => string;
  mirrorDm: (value: MessagingGrant, sourceEventId: string) => Promise<void>;
  sourceId: (
    value: Pick<MessagingGrant, 'providerId' | 'fingerprint'>,
    event: MessagingInboundEvent,
  ) => string;
  persistSource: (
    db: DatabaseSync,
    value: MessagingGrant | { ingest: ConversationIngest; botSlug: string; bindingId: string },
    event: MessagingInboundEvent,
  ) => string;
  replyStarts: Map<string, Promise<void>>;
  bounded: <T>(pending: Promise<T>) => Promise<T>;
  prepareSubscribedAdmissionInsert: (db: DatabaseSync) => StatementSync;
  prepareBridgeAdmissionInsert: (db: DatabaseSync) => StatementSync;
}) {
  const {
    receptionChanged,
    leases,
    database,
    grant,
    options,
    providers,
    transaction,
    admitDirect,
    mirrorDm,
    sourceId,
    persistSource,
    replyStarts,
    bounded,
    prepareSubscribedAdmissionInsert,
    prepareBridgeAdmissionInsert,
  } = wiring;

  const retries = new ReceiverRecovery(receptionChanged);

  const stop = (id: string) => {
    retries.clear(id);
    const lease = leases.get(id);
    leases.delete(id);
    lease?.controller.abort();
    try {
      lease?.dispose?.();
    } finally {
      if (lease) receptionChanged();
    }
  };

  const targetAvailable = (value: MessagingGrant): boolean => {
    if (value.bridgeRoutes) return true;
    if (!value.receiveTargetChannelId) return true;
    try {
      database.read((db) =>
        bridgeChannel(OWNER_HUMAN_CONTEXT, db, value.receiveTargetChannelId!, value.botSlug),
      );
      return true;
    } catch (error) {
      if (error instanceof MessagingError) return false;
      throw error;
    }
  };

  const valid = (value: MessagingGrant, reception = true): boolean => {
    value = grant(value.id);
    const lease = leases.get(value.id);
    return (
      !wiring.closed &&
      (options.bindingAvailable?.(value.bindingId) ?? true) &&
      targetAvailable(value) &&
      options.isBotActive(value.botSlug) &&
      value.revokedAt === undefined &&
      value.suspendedReason === undefined &&
      (!reception || value.receiveScope !== undefined) &&
      lease !== undefined &&
      lease.dispose !== undefined &&
      !lease.controller.signal.aborted &&
      lease.revision === value.revision &&
      providers.get(value.providerId)?.token === lease.token
    );
  };

  const notifyPending = (value: MessagingGrant) => {
    if (!valid(value)) return;
    const rows = database.read((db) =>
      db
        .prepare(`
      SELECT e.source_event_id FROM source_events e JOIN inbox_admissions a USING(source_event_id)
      WHERE a.bot_slug = ? AND e.source_kind = 'bridge-message'
        AND a.attempt_state IN ('pending', 'retryable') AND e.observed_at IS NULL
        AND json_extract(e.payload_json, '$.external.grantId') = ?
        AND json_extract(e.payload_json, '$.external.grantRevision') = ?
      ORDER BY e.created_at LIMIT 20
    `)
        .all(value.botSlug, value.id, value.revision),
    ) as { source_event_id: string }[];
    for (const row of rows) options.onAdmitted(value.botSlug, row.source_event_id);
    const pending = database.read((db) =>
      db
        .prepare(`SELECT DISTINCT p.bot_slug FROM messaging_source_paths p
      JOIN inbox_admissions a ON a.source_event_id = p.source_event_id AND a.bot_slug = p.bot_slug
      WHERE p.grant_id = ? AND a.attempt_state IN ('pending', 'retryable') AND a.observed_at IS NULL`)
        .all(value.id),
    ) as { bot_slug: string }[];
    options.onShared?.(pending.map((row) => row.bot_slug));
  };

  const inspectGrant = async (provider: MessagingProvider, value: MessagingGrant) => {
    if (value.origin !== 'implicit') return provider.inspect(value.accountRef, value.targetRef);
    if (!provider.inspectAccount || !value.receiveScope)
      throw new MessagingError('capability-unavailable');
    const account = await provider.inspectAccount(value.accountRef);
    if (!account.connected) throw new MessagingError('provider-unavailable');
    return {
      account,
      target: {
        ref: value.targetRef,
        name: value.targetName,
        digest: value.targetDigest,
        receiveScope: value.receiveScope,
      },
    };
  };

  const traceInbound =
    (
      value: MessagingGrant,
      handle: (
        event: MessagingInboundEvent,
        signal: AbortSignal,
        skip: (reason: string) => { accepted: true },
      ) => Promise<{ accepted: true }>,
    ) =>
    async (event: MessagingInboundEvent, signal: AbortSignal): Promise<{ accepted: true }> => {
      const began = Date.now();
      let skipped: string | undefined;
      const skip = (reason: string) => {
        skipped = reason;
        return { accepted: true as const };
      };
      const trace = (phase: string, extra: Record<string, unknown>) => {
        try {
          options.warn?.(
            JSON.stringify({
              event: 'messaging-inbound',
              phase,
              platform: event.channel,
              conversation: event.conversation.kind,
              mentioned: event.mentionedAccount,
              grantId: value.id,
              durationMs: Date.now() - began,
              ...extra,
            }),
          );
        } catch {}
      };
      try {
        const result = await handle(event, signal, skip);
        trace(skipped === undefined ? 'handled' : 'skipped', {
          ...(skipped === undefined ? {} : { reason: skipped }),
        });
        return result;
      } catch (error) {
        trace('refused', {
          reason: error instanceof MessagingError ? error.code : 'internal-error',
        });
        throw error;
      }
    };

  const start = async (value: MessagingGrant, attempt = 0, replyOnly = false) => {
    stop(value.id);
    const entry = providers.get(value.providerId);
    if (
      wiring.closed ||
      options.bindingAvailable?.(value.bindingId) === false ||
      !entry?.provider.consume ||
      !entry.provider.reply ||
      (!value.receiveScope && !replyOnly) ||
      value.revokedAt ||
      value.suspendedReason ||
      !options.isBotActive(value.botSlug)
    )
      return;
    const lease = {
      ordinaryVerified: false,
      ordinaryThreads: new Map<string, string>(),
      token: entry.token,
      revision: value.revision,
      controller: new AbortController(),
      dispose: undefined as (() => void) | undefined,
    };
    leases.set(value.id, lease);
    receptionChanged();
    const startedAt = Date.now();
    try {
      const accountRecovery = wiring.controlRetries.state(value.bindingId);
      if (accountRecovery?.kind === 'action-required')
        throw new MessagingError(accountRecovery.reason);
      const inspected = await inspectGrant(entry.provider, value);
      if (value.platform === 'qq' && !replyOnly) {
        await wiring.startControl(value.bindingId);
        const control = wiring.controls.get(value.bindingId);
        if (!control?.dispose || control.token !== entry.token)
          throw new MessagingError(
            wiring.controlRetries.pending(value.bindingId)
              ? 'provider-unavailable'
              : 'consumer-unavailable',
          );
        lease.controller.signal.throwIfAborted();
      }
      if (
        inspected.account.fingerprint !== value.fingerprint ||
        inspected.target.digest !== value.targetDigest ||
        (value.receiveScope
          ? inspected.target.receiveScope?.kind !== value.receiveScope.kind ||
            inspected.target.receiveScope?.conversationId !== value.receiveScope.conversationId
          : !inspected.target.receiveScope)
      )
        throw new MessagingError('rebind-required');
      if (value.receiveScope?.kind === 'group')
        transaction((db) => initializeGroupReceptionPolicy(db, value.id));
      const dispose = await entry.consume!({
        accountRef: value.accountRef,
        fingerprint: value.fingerprint,
        signal: lease.controller.signal,
        onEcho: async (event, signal) => {
          signal.throwIfAborted();
          lease.controller.signal.throwIfAborted();
          if (
            !valid(value, false) ||
            leases.get(value.id) !== lease ||
            providers.get(value.providerId)?.token !== entry.token
          )
            throw new MessagingError('consumer-unavailable');
          transaction(
            (db) =>
              recordReportEcho(
                db,
                inspected.target.receiveScope
                  ? { ...value, receiveScope: inspected.target.receiveScope }
                  : value,
                event,
              ),
            ['outbox'],
          );
          return { accepted: true };
        },
        onEvent: traceInbound(value, async (event, signal, skip) => {
          signal.throwIfAborted();
          lease.controller.signal.throwIfAborted();
          const latest = grant(value.id);
          if (
            wiring.closed ||
            leases.get(value.id) !== lease ||
            providers.get(value.providerId)?.token !== entry.token ||
            latest.revision !== value.revision ||
            latest.revokedAt ||
            latest.suspendedReason ||
            options.bindingAvailable?.(latest.bindingId) === false ||
            !options.isBotActive(value.botSlug)
          )
            throw new MessagingError('consumer-unavailable');
          if (event.fingerprint !== value.fingerprint || event.botId !== value.accountRef)
            throw new MessagingError('untrusted-source');
          const identity = database.read((db) => readMessagingIdentity(db, value.bindingId));
          if (identity.receiveAfter && Date.parse(event.at) < Date.parse(identity.receiveAfter))
            return skip('before-identity-receive-after');
          if (!latest.receiveScope) return skip('no-receive-scope');
          if (
            event.conversation.kind !== latest.receiveScope.kind ||
            event.conversation.id !== value.receiveScope!.conversationId
          )
            return skip('other-conversation');
          if (!database.read((db) => senderContextAllowed(db, value.botSlug, event)))
            return skip('sender-not-allowed');
          if (latest.receiveAfter && Date.parse(event.at) < Date.parse(latest.receiveAfter))
            return skip('before-grant-receive-after');
          if (event.conversation.kind === 'dm' && !latest.bridgeRoutes) {
            if (latest.receiveTargetChannelId || latest.channelBridge || latest.bridgeRoutes)
              throw new MessagingError('capability-unavailable');
            const id = transaction(
              (db) => {
                signal.throwIfAborted();
                lease.controller.signal.throwIfAborted();
                if (latest.receiveAfter && Date.parse(event.at) < Date.parse(latest.receiveAfter))
                  return undefined;
                return admitDirect(db, latest, event);
              },
              ['source-event', 'bot-inbox'],
            );
            if (id !== undefined) {
              setImmediate(() => {
                options.onAdmissionCommitted?.(value.botSlug, id);
                if (!wiring.closed && valid(grant(value.id))) options.onAdmitted(value.botSlug, id);
              });
              await mirrorDm(latest, id);
            }
            return { accepted: true };
          }
          if (event.conversation.kind === 'group' && !event.mentionedAccount) {
            if (!lease.ordinaryVerified) {
              lease.ordinaryVerified = true;
              options.warn?.(
                JSON.stringify({
                  event: 'messaging-inbound',
                  phase: 'ordinary-delivery-verified',
                  grantId: value.id,
                }),
              );
            }
            if (ordinaryThreadReply(event))
              lease.ordinaryThreads.set(event.reply.threadId!, event.reply.rootId!);
          }
          if (latest.bridgeRoutes) {
            const placed: ChannelMessageCommit[] = [];
            const members = new Set<string>();
            const id = transaction(
              (db) => {
                signal.throwIfAborted();
                lease.controller.signal.throwIfAborted();
                if (latest.receiveAfter && Date.parse(event.at) < Date.parse(latest.receiveAfter))
                  return undefined;
                const reception = groupReceptionPolicy(db, value.id);
                const thread = event.reply.threadId
                  ? threadReceptionPolicy(db, value.id, event.reply.threadId)
                  : undefined;
                if (
                  thread &&
                  (thread.fingerprint !== value.fingerprint ||
                    thread.conversationId !== event.conversation.id ||
                    thread.rootId !== event.reply.rootId)
                )
                  throw new MessagingError('thread-route-mismatch');
                if (
                  !event.mentionedAccount &&
                  thread?.mode === 'follow' &&
                  !threadRoute(value.platform, event.reply)
                )
                  throw new MessagingError('thread-route-mismatch');
                const routes = channelBridgeRoutes(latest).filter((route) => {
                  if (
                    !route.enabled ||
                    (route.intakeAfter && Date.parse(event.at) < Date.parse(route.intakeAfter))
                  )
                    return false;
                  if (
                    event.conversation.kind === 'group' &&
                    !event.mentionedAccount &&
                    (thread?.mode === 'exclude' ||
                      (thread?.mode !== 'follow' &&
                        (route.collectionInheritance === 'inherit'
                          ? messagingDefaults(db, latest.platform).collection
                          : route.collection) !== 'all'))
                  )
                    return false;
                  if (route.channelId) {
                    try {
                      bridgeChannel(OWNER_HUMAN_CONTEXT, db, route.channelId, value.botSlug, true);
                    } catch {
                      return false;
                    }
                  }
                  return true;
                });
                if (!routes.length) return undefined;
                const candidate = sourceId(latest, event);
                const existing = db
                  .prepare(`SELECT 1 FROM messaging_source_paths WHERE source_event_id = ?
                    UNION ALL SELECT 1 FROM inbox_admissions WHERE source_event_id = ?
                    UNION ALL SELECT 1 FROM channel_placements WHERE source_event_id = ?
                    LIMIT 1`)
                  .get(candidate, candidate, candidate);
                const implicitDefault =
                  latest.origin === 'implicit' &&
                  (event.conversation.kind === 'dm' || event.mentionedAccount);
                const id = persistSource(db, latest, event);
                if (existing && !implicitDefault) return id;
                const row = db
                  .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
                  .get(id) as { payload_json: string };
                const source = (JSON.parse(row.payload_json) as { external: ExternalSource })
                  .external;
                for (const route of routes) {
                  if (route.channelId) {
                    const commit = placeBridgeSource(
                      OWNER_HUMAN_CONTEXT,
                      db,
                      { ...source, body: event.text, localChannelId: route.channelId },
                      value.botSlug,
                    );
                    if (commit) placed.push(commit);
                    const channel = bridgeChannel(
                      OWNER_HUMAN_CONTEXT,
                      db,
                      route.channelId,
                      value.botSlug,
                    );
                    if (
                      !event.mentionedAccount &&
                      !(event.conversation.kind === 'dm' && channel.type === 'dm')
                    ) {
                      for (const slug of admitBridgeMembers(
                        db,
                        id,
                        channel,
                        options.sourcePolicy,
                        options.isBotActive,
                        thread?.mode === 'follow' && thread.wake
                          ? { botSlug: value.botSlug, wake: thread.wake, revision: thread.revision }
                          : undefined,
                        {
                          grant: latest,
                          route,
                          ...(event.reply.threadId ? { threadId: event.reply.threadId } : {}),
                        },
                      ))
                        members.add(slug);
                      continue;
                    }
                  }
                  if (implicitDefault) continue;
                  const reason =
                    event.conversation.kind === 'dm'
                      ? 'human-dm'
                      : event.mentionedAccount
                        ? 'group-mention'
                        : 'group-ordinary';
                  const policy = options.sourcePolicy.resolveIn(db, value.botSlug, reason);
                  const ordinary =
                    thread?.mode === 'follow' && thread.wake ? thread.wake : reception;
                  const passive = !senderAdmissionAllowed(db, value.botSlug, event);
                  const wake = passive
                    ? 'context'
                    : event.conversation.kind === 'dm' || event.mentionedAccount
                      ? policy.wake
                      : (thread?.wake ||
                            reception.inheritance === 'custom' ||
                            !policy.overrideActive) &&
                          (thread?.wake || !exceedsBotWakeCeiling(ordinary.wake, policy))
                        ? ordinary.wake
                        : policy.wake;
                  const count =
                    event.conversation.kind === 'dm'
                      ? (policy.digestCount ?? 1)
                      : reception.inheritance !== 'custom' && !thread?.wake && policy.overrideActive
                        ? (policy.digestCount ?? ordinary.count)
                        : ordinary.count;
                  const seconds =
                    event.conversation.kind === 'dm'
                      ? (policy.digestIntervalSeconds ?? 30)
                      : reception.inheritance !== 'custom' && !thread?.wake && policy.overrideActive
                        ? (policy.digestIntervalSeconds ?? ordinary.intervalSeconds)
                        : ordinary.intervalSeconds;
                  prepareSubscribedAdmissionInsert(db).run(
                    id,
                    value.botSlug,
                    reason,
                    policy.revision,
                    wake,
                    reception.revision,
                    passive ? 'silent' : wake === 'immediate' ? 'all' : wake,
                    passive ? null : wake === 'immediate' ? 1 : count,
                    passive ? null : wake === 'immediate' ? 0 : seconds * 1000,
                    thread?.revision ?? null,
                    reception.defaultRevision ?? null,
                  );
                  recordReceptionPath(db, id, value.botSlug, latest, route, {
                    reason,
                    mode: wake,
                    count,
                    intervalMs: seconds * 1000,
                    policyRevision: reception.revision,
                    sourceRevision: policy.revision,
                    defaultRevision: reception.defaultRevision ?? 0,
                    ...(thread?.mode === 'follow'
                      ? { threadRevision: thread.revision, threadId: event.reply.threadId }
                      : {}),
                  });
                  members.add(value.botSlug);
                }
                return id;
              },
              ['source-event', 'channel', 'bot-inbox'],
            );
            if (!id) return skip('not-admitted');
            {
              await mirrorDm(latest, id);
              options.onAdmissionCommitted?.(value.botSlug, id);
              for (const commit of placed) {
                try {
                  options.onPlaced?.(commit);
                } catch {
                  options.warn?.('bridge-channel-publication-failed');
                }
              }
              try {
                options.onShared?.([...members]);
              } catch {
                options.warn?.('bridge-share-wake-failed');
              }
              for (const slug of members)
                setImmediate(() => {
                  if (!wiring.closed) options.onAdmitted(slug, id);
                });
            }
            return { accepted: true };
          }
          if (
            !targetAvailable(latest) ||
            latest.channelBridge?.enabled === false ||
            (latest.channelBridge?.intakeAfter !== undefined &&
              Date.parse(event.at) < Date.parse(latest.channelBridge.intakeAfter))
          )
            return skip('channel-bridge-closed');
          if (ordinaryThreadReply(event))
            lease.ordinaryThreads.set(event.reply.threadId!, event.reply.rootId!);
          let placement: ChannelMessageCommit | undefined;
          const id = transaction(
            (db) => {
              signal.throwIfAborted();
              lease.controller.signal.throwIfAborted();
              if (value.receiveTargetChannelId)
                bridgeChannel(OWNER_HUMAN_CONTEXT, db, value.receiveTargetChannelId, value.botSlug);
              if (latest.receiveAfter && Date.parse(event.at) < Date.parse(latest.receiveAfter))
                return undefined;
              const reception = groupReceptionPolicy(db, value.id);
              const thread = event.reply.threadId
                ? threadReceptionPolicy(db, value.id, event.reply.threadId)
                : undefined;
              if (
                thread &&
                (thread.fingerprint !== value.fingerprint ||
                  thread.conversationId !== event.conversation.id ||
                  thread.rootId !== event.reply.rootId)
              )
                throw new MessagingError('thread-route-mismatch');
              if (
                !event.mentionedAccount &&
                (thread?.mode === 'exclude' ||
                  (thread?.mode !== 'follow' &&
                    (latest.channelBridge?.collectionInheritance === 'inherit'
                      ? messagingDefaults(db, value.platform).collection
                      : (latest.channelBridge?.collection ?? reception.collection)) !== 'all'))
              )
                return undefined;
              if (
                !event.mentionedAccount &&
                thread?.mode === 'follow' &&
                !threadRoute(value.platform, event.reply)
              )
                throw new MessagingError('thread-route-mismatch');
              const ordinary = thread?.mode === 'follow' && thread.wake ? thread.wake : reception;
              const id = persistSource(db, latest, event);
              const row = db
                .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
                .get(id) as { payload_json: string };
              const source = (JSON.parse(row.payload_json) as { external: ExternalSource })
                .external;
              placement = placeBridgeSource(
                OWNER_HUMAN_CONTEXT,
                db,
                { ...source, body: event.text },
                value.botSlug,
              );
              if (!event.mentionedAccount && source.localChannelId && placement) {
                const channel = bridgeChannel(
                  OWNER_HUMAN_CONTEXT,
                  db,
                  source.localChannelId,
                  value.botSlug,
                );
                admitBridgeMembers(
                  db,
                  id,
                  channel,
                  options.sourcePolicy,
                  options.isBotActive,
                  thread?.mode === 'follow' && thread.wake
                    ? { botSlug: value.botSlug, wake: thread.wake, revision: thread.revision }
                    : undefined,
                );
              }
              if (!event.mentionedAccount && source.localChannelId) return id;
              const reason = event.mentionedAccount ? 'group-mention' : 'group-ordinary';
              const policy = options.sourcePolicy.resolveIn(db, value.botSlug, reason);
              const passive = !senderAdmissionAllowed(db, value.botSlug, event);
              const wake = passive
                ? 'context'
                : event.mentionedAccount
                  ? policy.wake
                  : (thread?.wake ||
                        reception.inheritance === 'custom' ||
                        !policy.overrideActive) &&
                      (thread?.wake || !exceedsBotWakeCeiling(ordinary.wake, policy))
                    ? ordinary.wake
                    : policy.wake;
              const count =
                reception.inheritance !== 'custom' && !thread?.wake && policy.overrideActive
                  ? (policy.digestCount ?? ordinary.count)
                  : ordinary.count;
              const seconds =
                reception.inheritance !== 'custom' && !thread?.wake && policy.overrideActive
                  ? (policy.digestIntervalSeconds ?? ordinary.intervalSeconds)
                  : ordinary.intervalSeconds;
              const admission = prepareBridgeAdmissionInsert(db).run(
                id,
                value.botSlug,
                reason,
                policy.revision,
                wake,
                reception.revision,
                passive ? 'silent' : wake === 'immediate' ? 'all' : wake,
                !event.mentionedAccount && (wake === 'immediate' || wake === 'digest')
                  ? wake === 'immediate'
                    ? 1
                    : count
                  : null,
                !event.mentionedAccount && (wake === 'immediate' || wake === 'digest')
                  ? wake === 'immediate'
                    ? 0
                    : seconds * 1000
                  : null,
                thread?.revision ?? null,
                reception.defaultRevision ?? null,
              );
              if (admission.changes) recordGrantReception(db, id, value.botSlug);
              return id;
            },
            ['source-event', 'channel', 'bot-inbox'],
          );
          if (id === undefined) return skip('not-admitted');
          options.onAdmissionCommitted?.(value.botSlug, id);
          if (placement) {
            try {
              options.onPlaced?.(placement);
            } catch {
              options.warn?.('bridge-channel-publication-failed');
            }
          }
          setImmediate(() => {
            if (wiring.closed) return;
            try {
              if (valid(grant(value.id))) options.onAdmitted(value.botSlug, id);
            } catch {
              stop(value.id);
            }
          });
          return { accepted: true };
        }),
      });
      if (wiring.closed || leases.get(value.id) !== lease || lease.controller.signal.aborted) {
        dispose();
        return;
      }
      lease.dispose = dispose;
      receptionChanged();
      notifyPending(grant(value.id));
      const mirrored = grant(value.id);
      if (mirrored.dmMirror && mirrored.dmMirrorEpoch) {
        let cursor = 0;
        for (;;) {
          if (wiring.closed || !valid(grant(value.id))) break;
          const missing = database.read((db) =>
            db
              .prepare(`SELECT rowid AS position, source_event_id FROM source_events e
            WHERE rowid > ? AND json_extract(payload_json, '$.external.grantId') = ?
            AND json_extract(payload_json, '$.external.dmMirrorEpoch') = ?
            AND NOT EXISTS (SELECT 1 FROM channel_placements p WHERE p.source_event_id = e.source_event_id AND p.channel_id = ?)
            ORDER BY rowid ASC LIMIT 100`)
              .all(cursor, value.id, mirrored.dmMirrorEpoch!, 'dm-' + value.botSlug),
          );
          for (const row of missing) {
            cursor = Number(row.position);
            await mirrorDm(mirrored, String(row.source_event_id));
          }
          if (missing.length < 100) break;
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
      options.onProjectionReady?.(value.providerId);
      options.warn?.(
        JSON.stringify({
          event: 'messaging-inbound',
          phase: value.receiveScope ? 'receiving' : 'reply-connection',
          grantId: value.id,
          durationMs: Date.now() - startedAt,
        }),
      );
    } catch (error) {
      if (leases.get(value.id) !== lease) return;
      lease.controller.abort();
      if (leases.get(value.id) === lease) {
        leases.delete(value.id);
        receptionChanged();
      }
      const reason = error instanceof MessagingError ? error.code : 'consumer-unavailable';
      if (!wiring.closed && providers.get(value.providerId) === entry) {
        retries.fail(value.id, entry.token, reason, attempt, () => {
          if (wiring.closed || providers.get(value.providerId) !== entry) return;
          try {
            const latest = grant(value.id);
            if (latest.revision === value.revision) void start(latest, attempt + 1, replyOnly);
          } catch {
            stop(value.id);
          }
        });
      }
      options.warn?.(
        JSON.stringify({
          event: 'messaging-inbound',
          phase: 'refused',
          grantId: value.id,
          reason,
          retryAttempt: attempt,
          recovery: retries.state(value.id),
          botSlug: value.botSlug,
          bindingId: value.bindingId,
          durationMs: Date.now() - startedAt,
        }),
      );
    }
  };

  const methods: Pick<
    InboundMessaging,
    'ordinaryDelivery' | 'recovery' | 'status' | 'ensureReplyConsumer' | 'startEntry'
  > = {
    ordinaryDelivery(id) {
      return valid(grant(id)) && leases.get(id)?.ordinaryVerified ? 'verified' : 'unverified';
    },
    recovery(id) {
      return retries.state(id);
    },
    status(id) {
      const value = grant(id);
      if (
        !value.receiveScope ||
        value.revokedAt ||
        value.channelBridge?.enabled === false ||
        (value.bridgeRoutes && !value.bridgeRoutes.some((route) => route.enabled))
      )
        return 'off';
      if (!targetAvailable(value)) return 'unavailable';
      const lease = leases.get(id);
      if (valid(value)) return 'receiving';
      return lease && !lease.controller.signal.aborted ? 'connecting' : 'unavailable';
    },
    async ensureReplyConsumer(botSlug, id, signal) {
      signal.throwIfAborted();
      const value = grant(id);
      if (value.botSlug !== botSlug) throw new MessagingError('grant-unavailable');
      if (!valid(value, false)) {
        const token = providers.get(value.providerId)?.token;
        let pending = replyStarts.get(id);
        if (!pending) {
          pending = bounded(start(value, 0, true));
          replyStarts.set(id, pending);
        }
        try {
          await pending;
        } catch (error) {
          const lease = leases.get(id);
          if (lease?.revision === value.revision && lease.token === token) stop(id);
          throw error;
        } finally {
          if (replyStarts.get(id) === pending) replyStarts.delete(id);
        }
      }
      signal.throwIfAborted();
      if (!valid(value, false)) throw new MessagingError('consumer-unavailable');
    },
    startEntry(grantId) {
      const value = grant(grantId);
      if (value.revokedAt === undefined && !wiring.closed) void start(value);
      receptionChanged();
    },
  };

  return { retries, stop, targetAvailable, valid, inspectGrant, start, methods };
}
