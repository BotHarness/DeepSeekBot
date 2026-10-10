import { sourceContentPurged } from '../purge/fence.js';
import {
  admissionBound,
  conversationName,
  hold,
  listHeld,
  readBlock,
  removeHeld,
} from './conversations.js';
import {
  DEFAULT_INGEST_WAKE,
  admitIngestMembers,
  channelIngests,
  deleteIngest,
  matchingIngests,
  readIngest,
  writeIngest,
  type ConversationIngest,
  type ConversationIngestInput,
  type ConversationIngestSnapshot,
} from './conversation-ingest.js';
import type { MessagingIdentity } from './identity.js';
import type { BotPairing, PairingRequest } from './pairing.js';
import {
  trustedSenderReference,
  readSenderPolicy,
  senderAdmissionAllowed,
  sourceSenderAllowed,
  type TrustedSenderReference,
} from './sender-access.js';
import { recordLocalReception } from './reception-history.js';
import { readMessagingIdentity } from './identity.js';
import {
  currentReceptionPaths,
  recordReceptionPath,
  pendingReceptionPaths,
  type ReceptionPath,
} from './reception-paths.js';
import {
  retainedContextPage,
  resolveRetainedQuote,
  type QuoteResolution,
  type RetainedCursor,
} from './retained-context.js';
import { fanoutMessagingConsumer } from './consumer-fanout.js';
import {
  commitThreadReceptionPolicy,
  threadReceptionPolicy,
  type ThreadReceptionInput,
  type ThreadReceptionPolicy,
  type ThreadReceptionView,
} from './thread-policy.js';
import {
  commitGroupReceptionPolicy,
  groupReceptionPolicy,
  initializeGroupReceptionPolicy,
  type GroupReceptionInput,
  type GroupReceptionPolicy,
} from './group-policy.js';
import type { BotSourcePolicyEditor } from '../runtime/source-policy.js';
import { bridgeChannel, humanBridgeChannel, placeBridgeSource } from './channel-target.js';
import { admitBridgeMembers } from './member-admission.js';
import { messagingDefaults } from './defaults.js';
import { assertMessagingIdentity } from './identity.js';
import {
  channelBridgeRoutes,
  channelBridgeInput,
  type ChannelBridgeInput,
} from './channel-bridge.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import type { ChannelRecord } from '../channels/channel.js';
import { createHash, randomUUID } from 'node:crypto';
import { relatedReport, recordReportEcho, type RelatedReport } from './report.js';
import type { DatabaseSync } from 'node:sqlite';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import type { BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { MessagingGrant } from './outbound.js';
import {
  MessagingError,
  type MessagingInboundEvent,
  type MessagingProvider,
  type MessagingContextScope,
  type MessagingReplyRoute,
} from './provider.js';

function threadRoute(
  platform: string,
  route: MessagingReplyRoute,
): route is MessagingReplyRoute & { threadId: string; rootId: string } {
  if (!route.threadId || !route.rootId) return false;
  if (platform === 'feishu') return !!route.parentId;
  return platform === 'slack' && route.rootId === route.threadId && route.parentId === undefined;
}

function ordinaryThreadReply(event: MessagingInboundEvent): boolean {
  return (
    !event.mentionedAccount &&
    threadRoute(event.channel, event.reply) &&
    event.reply.conversationId === event.conversation.id &&
    (event.channel !== 'slack' || event.messageId !== event.reply.threadId)
  );
}

export interface ExternalContextRead {
  at: string;
  sessionId: string;
  scope: MessagingContextScope;
  outcome: 'read' | 'refused';
  sourceEventIds: string[];
  omitted: number;
  incomplete: boolean;
  reason?: string;
  coverage?: ExternalContextResult['coverage'];
}
export interface ExternalContextResult {
  scope: MessagingContextScope;
  messages: {
    sourceEventId: string;
    messageId: string;
    senderId: string;
    senderName?: string;
    mentions?: MessagingInboundEvent['mentions'];
    at: string;
    text: string;
    threadId?: string;
  }[];
  omitted: number;
  incomplete: boolean;
  coverage: 'provider-visible-human-text' | 'retained-local-sources';
  nextCursor?: string;
  window?: { start: number; end: number };
  requiredCharacters?: number;
}
export interface ExternalContextQuery {
  scope: MessagingContextScope;
  cursor?: string;
  maxCharacters?: number;
  beforeCount?: number;
  afterCount?: number;
}
export interface ExternalSource {
  sender?: TrustedSenderReference;
  id: string;
  body: string;
  at: string;
  platform: string;
  accountName: string;
  conversationName: string;
  event: Omit<MessagingInboundEvent, 'text'>;
  grantId: string;
  grantRevision: number;
  ingestId?: string;
  ingestRevision?: number;
  defaultRevision?: number;
  receptionRevision?: number;
  bridgeRevision?: number;
  localChannelId?: string;
  receptionPaths?: ReceptionPath[];
  report?: RelatedReport;
  contextReads?: ExternalContextRead[];
  contextMessages?: ExternalContextResult['messages'];
  quote?: QuoteResolution;
}

export interface InboxSourceShare {
  sourceEventId: string;
  channelId: string;
  messageId: string;
  revision: number;
  alreadyShared: boolean;
}

export interface InboundMessaging {
  notifyPairing(request: PairingRequest): Promise<void>;
  register(provider: MessagingProvider): () => void;
  setEnabled(botSlug: string, grantId: string, enabled: boolean): Promise<void>;
  channelBridge(channelId: string, input: ChannelBridgeInput): Promise<void>;
  ingests(channelId: string): ConversationIngestSnapshot;
  ingest(channelId: string, input: ConversationIngestInput): Promise<void>;
  setChannelTarget(botSlug: string, grantId: string, channelId: string | null): Promise<void>;
  policy(botSlug: string, grantId: string): GroupReceptionPolicy;
  setPolicy(
    botSlug: string,
    grantId: string,
    input: GroupReceptionInput,
    editor: BotSourcePolicyEditor,
  ): Promise<GroupReceptionPolicy>;
  threads(botSlug: string, grantId: string): ThreadReceptionView[];
  setThread(
    botSlug: string,
    sourceEventId: string,
    input: ThreadReceptionInput,
    editor: BotSourcePolicyEditor,
  ): Promise<ThreadReceptionPolicy>;
  ordinaryDelivery(grantId: string): 'verified' | 'unverified';
  status(grantId: string): 'off' | 'connecting' | 'receiving' | 'unavailable';
  available(botSlug: string, sourceEventId: string): boolean;
  pendingPaths(
    botSlug: string,
    now: Date,
    context?: boolean,
  ): ReturnType<typeof pendingReceptionPaths>;
  sourceSignal(botSlug: string, sourceEventId: string): AbortSignal;
  read(botSlug: string, sourceEventId: string): ExternalSource;
  readShared(botSlug: string, sourceEventId: string): ExternalSource;
  share(botSlug: string, sourceEventId: string, channelId: string): InboxSourceShare;
  context(
    botSlug: string,
    sourceEventId: string,
    sessionId: string,
    query: ExternalContextQuery,
    signal?: AbortSignal,
  ): Promise<ExternalContextResult>;
  ensureReplyConsumer(botSlug: string, grantId: string, signal: AbortSignal): Promise<void>;
  pairingReception(bindingId: string): 'off' | 'connecting' | 'receiving' | 'unavailable';
  reconcileBinding(bindingId: string): Promise<void>;
  revoke(grantId: string): void;
  startEntry(grantId: string): void;
  endChannel(channelId: string): void;
  close(): void;
}

export function createInboundMessaging(options: {
  onApprovalAction?(
    providerId: string,
    event: import('./provider.js').MessagingApprovalAction,
    signal: AbortSignal,
  ): Promise<import('./provider.js').MessagingApprovalAck>;
  database: OperationalDatabaseModulePort;
  pairing?: BotPairing;
  bindingAvailable?(id: string): boolean;
  sourcePolicy: BotSourcePolicyStore;
  isBotActive(slug: string): boolean;
  onAdmitted(botSlug: string, sourceEventId: string): void;
  onAdmissionCommitted?(botSlug: string, sourceEventId: string): void;
  onReceptionChanged?(): void;
  onPlaced?(commit: ChannelMessageCommit): void;
  onShared?(botSlugs: string[]): void;
  onIngested?(channelId: string, messageId: string): void;
  warn?(message: string): void;
}): InboundMessaging {
  const { database } = options;
  const transaction = <T>(command: (db: DatabaseSync) => T, topics: string[] = []): T => {
    try {
      return database.transaction((db) => {
        const result = command(db);
        if (topics.includes('grants') || topics.includes('bindings'))
          recordLocalReception(db, new Date().toISOString(), options.isBotActive);
        return result;
      }, topics);
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.cause instanceof MessagingError)
        throw error.cause;
      throw error;
    }
  };
  const bounded = async <T>(pending: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new MessagingError('provider-unavailable')), 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const providers = new Map<
    string,
    { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
  >();
  const leases = new Map<
    string,
    {
      token: object;
      ordinaryVerified?: boolean;
      ordinaryThreads: Map<string, string>;
      revision: number;
      controller: AbortController;
      dispose: (() => void) | undefined;
    }
  >();
  const retries = new Map<string, { timer: ReturnType<typeof setTimeout>; token: object }>();
  const replyStarts = new Map<string, Promise<void>>();
  let closed = false;
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
    value: MessagingGrant | { ingest: ConversationIngest; botSlug: string },
    event: MessagingInboundEvent,
  ): string => {
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
        db.prepare('UPDATE source_events SET payload_json = ? WHERE source_event_id = ?').run(
          JSON.stringify(payload),
          id,
        );
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
              ...(event.conversation.kind === 'group'
                ? { receptionRevision: groupReceptionPolicy(db, value.id).revision }
                : {}),
              ...(value.channelBridge ? { bridgeRevision: value.channelBridge.revision } : {}),
              ...(!value.bridgeRoutes && value.receiveTargetChannelId
                ? { localChannelId: value.receiveTargetChannelId }
                : {}),
            };
      db.prepare(`INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at, payload_json)
        VALUES (?, 'bridge-message', ?, ?, ?, ?)`).run(
        id,
        value.botSlug,
        event.text,
        event.at,
        JSON.stringify({ author: { kind: 'bridged' }, external }),
      );
    }
    return id;
  };
  const admitDirect = (db: DatabaseSync, value: MessagingGrant, event: MessagingInboundEvent) => {
    const sourceEventId = persistSource(db, value, event);
    const policy = options.sourcePolicy.resolveIn(db, value.botSlug, 'human-dm');
    db.prepare(`INSERT OR IGNORE INTO inbox_admissions
    (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
     wake_policy_revision, wake_mode) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      sourceEventId,
      value.botSlug,
      'human-dm',
      policy.revision,
      value.muted ? 'silent' : policy.wake,
      policy.revision,
      value.muted ? 'silent' : policy.wake === 'immediate' ? 'all' : policy.wake,
    );
    return sourceEventId;
  };
  const admitMention = (db: DatabaseSync, value: MessagingGrant, event: MessagingInboundEvent) => {
    const reception = groupReceptionPolicy(db, value.id);
    const thread = event.reply.threadId
      ? threadReceptionPolicy(db, value.id, event.reply.threadId)
      : undefined;
    const sourceEventId = persistSource(db, value, event);
    const policy = options.sourcePolicy.resolveIn(db, value.botSlug, 'group-mention');
    db.prepare(`INSERT OR IGNORE INTO inbox_admissions
    (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
     wake_policy_revision, wake_mode, external_thread_policy_revision, external_default_revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
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
    ).map((row) => JSON.parse(row.body) as MessagingGrant);
  const grant = (id: string): MessagingGrant => {
    const row = database.read((db) =>
      db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(id),
    ) as { body: string } | undefined;
    if (!row) throw new MessagingError('grant-unavailable');
    return JSON.parse(row.body) as MessagingGrant;
  };
  const receptionChanged = () => {
    if (closed) return;
    try {
      options.onReceptionChanged?.();
    } catch {
      options.warn?.('messaging-reception-publication-failed');
    }
  };
  const stop = (id: string) => {
    clearTimeout(retries.get(id)?.timer);
    retries.delete(id);
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
      database.read((db) => bridgeChannel(db, value.receiveTargetChannelId!, value.botSlug));
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
      !closed &&
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
  const start = async (value: MessagingGrant, attempt = 0, replyOnly = false) => {
    stop(value.id);
    const entry = providers.get(value.providerId);
    if (
      closed ||
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
      const inspected = await inspectGrant(entry.provider, value);
      if (value.platform === 'qq' && !replyOnly) {
        await startControl(value.bindingId);
        const control = controls.get(value.bindingId);
        if (!control?.dispose || control.token !== entry.token)
          throw new MessagingError(
            controlRetries.has(value.bindingId) ? 'provider-unavailable' : 'consumer-unavailable',
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
        onEvent: async (event, signal) => {
          signal.throwIfAborted();
          lease.controller.signal.throwIfAborted();
          const latest = grant(value.id);
          if (
            closed ||
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
            return { accepted: true };
          if (!latest.receiveScope) return { accepted: true };
          if (
            event.conversation.kind !== latest.receiveScope.kind ||
            event.conversation.id !== value.receiveScope!.conversationId
          )
            return { accepted: true };
          if (!database.read((db) => senderAdmissionAllowed(db, value.botSlug, event)))
            return { accepted: true };
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
            if (id !== undefined)
              setImmediate(() => {
                options.onAdmissionCommitted?.(value.botSlug, id);
                if (!closed && valid(grant(value.id))) options.onAdmitted(value.botSlug, id);
              });
            return { accepted: true };
          }
          if (event.conversation.kind === 'group' && !event.mentionedAccount) {
            lease.ordinaryVerified = true;
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
                      bridgeChannel(db, route.channelId, value.botSlug, true);
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
                      db,
                      { ...source, body: event.text, localChannelId: route.channelId },
                      value.botSlug,
                    );
                    if (commit) placed.push(commit);
                    const channel = bridgeChannel(db, route.channelId, value.botSlug);
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
                  const wake =
                    event.conversation.kind === 'dm' || event.mentionedAccount
                      ? policy.wake
                      : thread?.wake || reception.inheritance === 'custom' || !policy.overrideActive
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
                  db.prepare(`INSERT OR IGNORE INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
                  wake_policy_revision, wake_mode, wake_count, wake_interval_ms, external_thread_policy_revision, external_default_revision)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                    id,
                    value.botSlug,
                    reason,
                    policy.revision,
                    wake,
                    reception.revision,
                    wake === 'immediate' ? 'all' : wake,
                    wake === 'immediate' ? 1 : count,
                    wake === 'immediate' ? 0 : seconds * 1000,
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
            if (id) {
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
                  if (!closed) options.onAdmitted(slug, id);
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
            return { accepted: true };
          if (!event.mentionedAccount && !lease.ordinaryVerified) {
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
          let placement: ChannelMessageCommit | undefined;
          const id = transaction(
            (db) => {
              signal.throwIfAborted();
              lease.controller.signal.throwIfAborted();
              if (value.receiveTargetChannelId)
                bridgeChannel(db, value.receiveTargetChannelId, value.botSlug);
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
              placement = placeBridgeSource(db, { ...source, body: event.text }, value.botSlug);
              if (!event.mentionedAccount && source.localChannelId && placement) {
                const channel = bridgeChannel(db, source.localChannelId, value.botSlug);
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
              const wake = event.mentionedAccount
                ? policy.wake
                : thread?.wake || reception.inheritance === 'custom' || !policy.overrideActive
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
              db.prepare(`INSERT OR IGNORE INTO inbox_admissions
              (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
               wake_policy_revision, wake_mode, wake_count, wake_interval_ms, external_thread_policy_revision, external_default_revision)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                id,
                value.botSlug,
                reason,
                policy.revision,
                wake,
                reception.revision,
                wake === 'immediate' ? 'all' : wake,
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
              return id;
            },
            ['source-event', 'channel', 'bot-inbox'],
          );
          if (id === undefined) return { accepted: true };
          options.onAdmissionCommitted?.(value.botSlug, id);
          if (placement) {
            try {
              options.onPlaced?.(placement);
            } catch {
              options.warn?.('bridge-channel-publication-failed');
            }
          }
          setImmediate(() => {
            if (closed) return;
            try {
              if (valid(grant(value.id))) options.onAdmitted(value.botSlug, id);
            } catch {
              stop(value.id);
            }
          });
          return { accepted: true };
        },
      });
      if (closed || leases.get(value.id) !== lease || lease.controller.signal.aborted) {
        dispose();
        return;
      }
      lease.dispose = dispose;
      receptionChanged();
      notifyPending(grant(value.id));
      options.warn?.(
        JSON.stringify({
          event: 'messaging-inbound',
          phase: value.receiveScope ? 'receiving' : 'reply-connection',
          grantId: value.id,
          durationMs: Date.now() - startedAt,
        }),
      );
    } catch (error) {
      lease.controller.abort();
      if (leases.get(value.id) === lease) {
        leases.delete(value.id);
        receptionChanged();
      }
      const reason = error instanceof MessagingError ? error.code : 'consumer-unavailable';
      const delays = [250, 1000, 3000];
      const delay = delays[attempt];
      if (
        reason === 'provider-unavailable' &&
        delay !== undefined &&
        !closed &&
        providers.get(value.providerId) === entry
      ) {
        const timer = setTimeout(() => {
          retries.delete(value.id);
          if (closed || providers.get(value.providerId) !== entry) return;
          try {
            const latest = grant(value.id);
            if (latest.revision === value.revision) void start(latest, attempt + 1, replyOnly);
          } catch {
            stop(value.id);
          }
        }, delay);
        timer.unref();
        retries.set(value.id, { timer, token: entry.token });
      }
      options.warn?.(
        JSON.stringify({
          event: 'messaging-inbound',
          phase: 'refused',
          grantId: value.id,
          reason,
          retryAttempt: attempt,
          durationMs: Date.now() - startedAt,
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
      db.prepare('SELECT 1 FROM messaging_source_paths WHERE source_event_id = ?').get(id),
    );
    const paths = database.read((db) =>
      currentReceptionPaths(db, botSlug, id, undefined, 'history'),
    );
    if (routed && !paths.length) throw new MessagingError('source-unavailable');
    if (!routed && grant(retained.grantId).botSlug !== botSlug)
      throw new MessagingError('source-unavailable');
    if (!routed && retained.localChannelId)
      database.read((db) => bridgeChannel(db, retained.localChannelId!, botSlug));
    const ownsContext = grant(retained.grantId).botSlug === botSlug;
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
    const value = grant(retained.grantId);
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
              valid(value),
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
      ...(routed
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
    if (!retained.ingestId && grant(retained.grantId).botSlug === botSlug) return read(botSlug, id);
    const channelId = database.read((db) => {
      const placements = db
        .prepare(
          'SELECT channel_id FROM channel_placements WHERE source_event_id = ? ORDER BY channel_id',
        )
        .all(id) as { channel_id: string }[];
      for (const placement of placements) {
        try {
          const channel = bridgeChannel(db, placement.channel_id, botSlug);
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
    const { contextReads: _reads, receptionPaths: _paths, ...shared } = retained;
    return { ...shared, body: row.body, localChannelId: channelId };
  };
  const controls = new Map<
    string,
    {
      controller: AbortController;
      token: object;
      startedAt: number;
      ready: Promise<void>;
      dispose?: (() => void) | undefined;
    }
  >();
  const controlRetries = new Map<string, ReturnType<typeof setTimeout>>();
  const stopControl = (id: string, reason = 'identity-reconciled') => {
    clearTimeout(controlRetries.get(id));
    controlRetries.delete(id);
    const value = controls.get(id);
    if (!value) return;
    value.controller.abort();
    value.dispose?.();
    controls.delete(id);
    options.warn?.(
      JSON.stringify({
        event: 'bot-pairing',
        phase: 'receiver-released',
        initiator: 'account-lifecycle',
        externalResource: 'checked-account-consumer',
        reason,
        durationMs: Math.max(0, Math.round(performance.now() - value.startedAt)),
      }),
    );
  };
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
  const placeIngests = (identity: MessagingIdentity, event: MessagingInboundEvent) => {
    if (event.conversation.kind !== 'group') return;
    const current = (db: DatabaseSync) =>
      matchingIngests(db, identity.providerId, identity.fingerprint, event.conversation).filter(
        (item) =>
          item.enabled &&
          item.accountRef === identity.accountRef &&
          Date.parse(event.at) >= Date.parse(item.intakeAfter),
      );
    if (!database.read(current).length) return;
    const placed: ChannelMessageCommit[] = [];
    const members = new Set<string>();
    transaction(
      (db) => {
        for (const ingest of current(db)) {
          let channel: ChannelRecord;
          try {
            channel = humanBridgeChannel(db, ingest.channelId);
          } catch (error) {
            if (!(error instanceof MessagingError)) throw error;
            continue;
          }
          if (channel.type !== 'group') continue;
          const id = persistSource(db, { ingest, botSlug: identity.botSlug }, event);
          const row = db
            .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
            .get(id) as { payload_json: string };
          const source = (JSON.parse(row.payload_json) as { external: ExternalSource }).external;
          const commit = placeBridgeSource(
            db,
            { ...source, body: event.text, localChannelId: ingest.channelId },
            undefined,
          );
          if (!commit) continue;
          placed.push(commit);
          for (const slug of admitIngestMembers(
            db,
            id,
            channel,
            ingest,
            options.sourcePolicy,
            options.isBotActive,
          ))
            members.add(slug);
          writeIngest(db, {
            ...ingest,
            conversation: { ...ingest.conversation, name: ingestName(ingest, event) },
            lastMessageAt: event.at,
          });
        }
      },
      ['source-event', 'channel', 'bot-inbox'],
    );
    for (const commit of placed) {
      try {
        options.onPlaced?.(commit);
      } catch {
        options.warn?.('ingest-channel-publication-failed');
      }
      try {
        options.onIngested?.(commit.channelId, commit.message.id);
      } catch {
        options.warn?.('ingest-admission-wake-failed');
      }
    }
    try {
      if (members.size) options.onShared?.([...members]);
    } catch {
      options.warn?.('ingest-share-wake-failed');
    }
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
      closed ||
      controls.get(id) !== lease ||
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
    if (!database.read((db) => senderAdmissionAllowed(db, identity.botSlug, event)))
      return { accepted: true };
    if (event.conversation.kind === 'group' && !event.mentionedAccount) {
      placeIngests(identity, event);
      return { accepted: true };
    }
    const result = await admitDefault(id, lease, identity, entry, event, signal);
    placeIngests(identity, event);
    return result;
  };
  const admitDefault = async (
    id: string,
    lease: { controller: AbortController; token: object },
    identity: MessagingIdentity,
    entry: NonNullable<ReturnType<typeof providers.get>>,
    event: MessagingInboundEvent,
    signal: AbortSignal,
  ): Promise<{ accepted: true }> => {
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
        if (entries.some((item) => item.origin !== 'implicit')) return undefined;
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
        return { value, created, sourceEventId };
      },
      ['grants', 'source-event', 'bot-inbox'],
    );
    if (!admitted) return { accepted: true };
    if ('held' in admitted) {
      receptionChanged();
      return { accepted: true };
    }
    const { value, created, sourceEventId } = admitted;
    const reception = created || !leases.has(value.id) ? start(value) : undefined;
    if (created) receptionChanged();
    if (sourceEventId !== undefined) {
      const committed = () => options.onAdmissionCommitted?.(value.botSlug, sourceEventId);
      if (reception) void reception.then(committed);
      else setImmediate(committed);
    }
    if (sourceEventId !== undefined && !value.muted)
      setImmediate(() => {
        if (closed) return;
        try {
          if (valid(grant(value.id))) options.onAdmitted(value.botSlug, sourceEventId);
        } catch {
          options.warn?.('messaging-default-traffic-wake-failed');
        }
      });
    return { accepted: true };
  };
  const startControl = async (id: string, attempt = 0) => {
    if (!options.pairing || closed) return;
    const identity = database.read((db) => readMessagingIdentity(db, id));
    if (!identity.enabled || identity.revokedAt || !options.isBotActive(identity.botSlug)) return;
    const entry = providers.get(identity.providerId);
    if (!entry?.consume || !entry.provider.reply || !entry.provider.inspectAccount) return;
    const prior = controls.get(id);
    if (prior?.token === entry.token) return prior.ready;
    stopControl(id, 'provider-replaced');
    const controller = new AbortController();
    const lease = {
      controller,
      token: entry.token,
      startedAt: performance.now(),
      ready: Promise.resolve(),
      dispose: undefined as (() => void) | undefined,
    };
    controls.set(id, lease);
    lease.ready = (async () => {
      try {
        const account = await bounded(entry.provider.inspectAccount!(identity.accountRef));
        controller.signal.throwIfAborted();
        if (account.fingerprint !== identity.fingerprint)
          throw new MessagingError('rebind-required');
        if (!account.connected) throw new MessagingError('provider-unavailable');
        if (identity.platform === 'qq')
          transaction((db) => {
            controller.signal.throwIfAborted();
            const latest = readMessagingIdentity(db, id);
            if (!latest.enabled || latest.revokedAt || controls.get(id) !== lease)
              throw new MessagingError('consumer-unavailable');
            db.prepare('UPDATE messaging_bindings SET receive_after = ? WHERE id = ?').run(
              new Date().toISOString(),
              id,
            );
          });
        lease.dispose = await bounded(
          entry.consume!({
            accountRef: identity.accountRef,
            fingerprint: identity.fingerprint,
            signal: controller.signal,
            onEvent: (event, signal) => defaultTraffic(id, lease, event, signal),
          }),
        );
        if (controller.signal.aborted || controls.get(id) !== lease) lease.dispose();
        else
          options.warn?.(
            JSON.stringify({
              event: 'bot-pairing',
              phase: 'receiver-ready',
              initiator: 'account-lifecycle',
              externalResource: 'checked-account-consumer',
              durationMs: Math.max(0, Math.round(performance.now() - lease.startedAt)),
            }),
          );
      } catch (error) {
        if (controls.get(id) !== lease) return;
        stopControl(id, 'receiver-acquisition-failed');
        const reason = error instanceof MessagingError ? error.code : 'consumer-unavailable';
        const delay = [250, 1000, 3000][attempt];
        if (
          reason === 'provider-unavailable' &&
          delay !== undefined &&
          !closed &&
          providers.get(identity.providerId) === entry
        ) {
          const timer = setTimeout(() => {
            controlRetries.delete(id);
            if (!closed && providers.get(identity.providerId) === entry)
              void startControl(id, attempt + 1);
          }, delay);
          timer.unref();
          controlRetries.set(id, timer);
        }
        options.warn?.(
          JSON.stringify({
            event: 'bot-pairing',
            phase: 'receiver-unavailable',
            initiator: 'account-lifecycle',
            externalResource: 'checked-account-consumer',
            durationMs: Math.max(0, Math.round(performance.now() - lease.startedAt)),
            reason,
            retryAttempt: attempt,
          }),
        );
      }
    })();
    return lease.ready;
  };
  const sendPairingNotice = async (
    request: PairingRequest,
    key: string,
    route: MessagingReplyRoute,
    signal?: AbortSignal,
    conversationKind = request.conversationKind ?? 'dm',
  ) => {
    if (!options.pairing || !options.pairing.notice(request.id, key)) return;
    let outcome: 'accepted' | 'unconfirmed' = 'unconfirmed';
    try {
      const identity = database.read((db) => assertMessagingIdentity(db, request.bindingId));
      const entry = providers.get(identity.providerId);
      const lease = controls.get(request.bindingId);
      if (!entry?.provider.reply || !lease || lease.controller.signal.aborted)
        throw new MessagingError('consumer-unavailable');
      const text = key.startsWith('approved:')
        ? 'Pairing approved. Please send your question again as a new message. Your earlier request will not run. / 配对已批准，请重新发送新问题。之前的请求不会执行。'
        : `Pairing request ${request.reference} is waiting for Human review and expires in 10 minutes. Your message will not run. / 配对申请 ${request.reference} 等待人工审核，10 分钟后过期。该消息不会执行。`;
      await bounded(
        entry.provider.reply({
          accountRef: identity.accountRef,
          fingerprint: identity.fingerprint,
          route,
          text,
          signal: AbortSignal.any([
            lease.controller.signal,
            AbortSignal.timeout(15000),
            ...(signal ? [signal] : []),
          ]),
          beforeSend: () => {
            try {
              const current = database.read((db) => assertMessagingIdentity(db, request.bindingId));
              const paired = options
                .pairing!.list(request.botSlug)
                .find((item) => item.id === request.id);
              return (
                !closed &&
                controls.get(request.bindingId) === lease &&
                providers.get(identity.providerId) === entry &&
                options.isBotActive(request.botSlug) &&
                options.bindingAvailable?.(request.bindingId) !== false &&
                current.fingerprint === identity.fingerprint &&
                paired?.revision === request.revision &&
                paired.status === request.status &&
                !database.read((db) =>
                  readBlock(db, request.botSlug, identity.fingerprint, {
                    kind: conversationKind,
                    id: route.conversationId,
                  }),
                )
              );
            } catch {
              return false;
            }
          },
        }),
      );
      outcome = 'accepted';
    } catch {}
    options.pairing.notice(request.id, key, outcome);
    options.warn?.(
      JSON.stringify({
        event: 'bot-pairing',
        phase: 'notification',
        initiator: key.startsWith('approved:') ? 'authenticated-web' : 'sender-intake',
        outcome,
        requestId: request.id,
      }),
    );
  };
  const controlIntake = async (
    provider: MessagingProvider,
    event: MessagingInboundEvent,
    signal: AbortSignal,
  ) => {
    if (!options.pairing || provider.id !== 'dsh-im/feishu' || event.channel !== 'feishu')
      return false;
    signal.throwIfAborted();
    const explicit = /^\/pair(?:\s|$)/.test(event.text.trim());
    const row = database.read((db) =>
      db
        .prepare(
          'SELECT id FROM messaging_bindings WHERE provider_id = ? AND account_ref = ? AND fingerprint = ? AND revoked_at IS NULL',
        )
        .get(provider.id, event.botId, event.fingerprint),
    ) as { id: string } | undefined;
    if (!row) return explicit;
    const lease = controls.get(row.id);
    if (!lease || lease.controller.signal.aborted) return explicit;
    const identity = database.read((db) => readMessagingIdentity(db, row.id));
    const restricted = database.read((db) => readSenderPolicy(db, identity.botSlug).restricted);
    const intentional = event.conversation.kind === 'dm' || event.mentionedAccount;
    if (restricted && intentional && !explicit) {
      const allowedConversation = database.read((db) => {
        if (readBlock(db, identity.botSlug, identity.fingerprint, event.conversation)) return false;
        const entries = conversationEntries(db, row.id, event.conversation);
        if (entries.length)
          return entries.some(
            (value) =>
              !value.revokedAt &&
              !value.suspendedReason &&
              targetAvailable(value) &&
              value.channelBridge?.enabled !== false &&
              (!value.bridgeRoutes || value.bridgeRoutes.some((route) => route.enabled)),
          );
        return (
          identity.newConversations === 'auto' &&
          admissionBound(db, row.id, new Date()) === undefined
        );
      });
      if (
        !allowedConversation ||
        !identity.enabled ||
        identity.revokedAt ||
        options.bindingAvailable?.(row.id) === false ||
        !options.isBotActive(identity.botSlug) ||
        (identity.receiveAfter && Date.parse(event.at) < Date.parse(identity.receiveAfter))
      )
        return true;
      if (!database.read((db) => senderAdmissionAllowed(db, identity.botSlug, event))) {
        try {
          const request = options.pairing.request(row.id, event, 'conversation');
          if (request.status === 'pending')
            setImmediate(() => {
              if (closed || signal.aborted || lease.controller.signal.aborted) return;
              void sendPairingNotice(
                request,
                `pending:${event.messageId}`,
                event.reply,
                signal,
                event.conversation.kind,
              ).catch(() => options.warn?.('pairing-notification-state-unconfirmed'));
            });
        } catch (error) {
          if (
            !(error instanceof MessagingError) ||
            !['pairing-rate-limited', 'pairing-capacity'].includes(error.code)
          )
            throw error;
          options.warn?.(
            JSON.stringify({
              event: 'bot-pairing',
              phase: 'request-refused',
              initiator: 'sender-intake',
              reason: error.code,
            }),
          );
        }
        return true;
      }
      return false;
    }
    if (!explicit) return false;
    if (
      event.conversation.kind !== 'dm' ||
      event.text.trim() !== '/pair' ||
      event.attachments?.length
    )
      return true;
    let text: string;
    try {
      const request = options.pairing.request(row.id, event);
      text =
        request.status === 'approved'
          ? 'This account is already paired with this Bot. / 此账号已与当前 Bot 配对。'
          : request.status === 'expired'
            ? 'This pairing request expired. Send a new /pair message to request review. / 配对申请已过期，请重新发送 /pair 申请审核。'
            : `Pairing request ${request.reference} is waiting for Web administrator review. It expires in 10 minutes and grants no permission until approved. / 配对申请 ${request.reference} 等待 Web 管理员审核，10 分钟后过期；审核前没有管理权限。`;
    } catch (error) {
      if (
        !(error instanceof MessagingError) ||
        !['pairing-rate-limited', 'pairing-capacity'].includes(error.code)
      )
        throw error;
      return true;
    }
    setImmediate(() => {
      if (
        closed ||
        signal.aborted ||
        lease.controller.signal.aborted ||
        controls.get(row.id) !== lease
      )
        return;
      void bounded(
        provider.reply!({
          accountRef: event.botId,
          fingerprint: event.fingerprint,
          route: event.reply,
          text,
          signal: AbortSignal.any([signal, lease.controller.signal]),
          beforeSend: () => {
            try {
              const current = database.read((db) => assertMessagingIdentity(db, row.id));
              return (
                current.fingerprint === event.fingerprint &&
                current.accountRef === event.botId &&
                options.isBotActive(current.botSlug)
              );
            } catch {
              return false;
            }
          },
        }),
      ).catch(() =>
        options.warn?.(
          JSON.stringify({
            event: 'bot-pairing',
            phase: 'reply-unconfirmed',
            initiator: 'control-intake',
          }),
        ),
      );
    });
    return true;
  };
  const service: InboundMessaging = {
    async notifyPairing(request) {
      if (request.purpose === 'conversation' && request.status === 'approved' && request.reply)
        await sendPairingNotice(request, `approved:${request.revision}`, request.reply);
    },
    readShared,
    register(provider) {
      const token = {};
      providers.set(provider.id, {
        provider,
        token,
        ...(provider.consume
          ? {
              consume: fanoutMessagingConsumer(
                provider.consume.bind(provider),
                (event, signal) => controlIntake(provider, event, signal),
                options.onApprovalAction
                  ? (event, signal) => options.onApprovalAction!(provider.id, event, signal)
                  : undefined,
              ),
            }
          : {}),
      });
      if (options.pairing) {
        const bindings = database.read((db) =>
          db
            .prepare(
              'SELECT id FROM messaging_bindings WHERE provider_id = ? AND revoked_at IS NULL',
            )
            .all(provider.id),
        ) as { id: string }[];
        for (const { id } of bindings) void startControl(id);
      }
      const rows = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE revoked_at IS NULL').all(),
      ) as { body: string }[];
      for (const row of rows) {
        const value = JSON.parse(row.body) as MessagingGrant;
        if (value.providerId === provider.id) void start(value);
      }
      return () => {
        if (providers.get(provider.id)?.token !== token) return;
        providers.delete(provider.id);
        for (const [id, control] of controls)
          if (control.token === token) stopControl(id, 'provider-disposed');
        for (const [id, lease] of leases) if (lease.token === token) stop(id);
        for (const [id, retry] of retries) if (retry.token === token) stop(id);
      };
    },
    ingests(channelId) {
      return database.read((db) => {
        humanBridgeChannel(db, channelId);
        const bindings = (
          db
            .prepare(
              "SELECT id FROM messaging_bindings WHERE revoked_at IS NULL AND platform <> 'weixin' ORDER BY created_at",
            )
            .all() as { id: string }[]
        ).map((row) => readMessagingIdentity(db, row.id));
        const state = (
          ingest: ConversationIngest,
        ): ConversationIngestSnapshot['ingests'][number]['state'] => {
          if (!ingest.enabled) return 'paused';
          const binding = bindings.find(
            (item) =>
              item.providerId === ingest.providerId &&
              item.fingerprint === ingest.fingerprint &&
              item.accountRef === ingest.accountRef,
          );
          if (!binding || service.pairingReception(binding.id) !== 'receiving')
            return 'unavailable';
          return ingest.lastMessageAt ? 'receiving' : 'waiting';
        };
        return {
          channelId,
          ingests: channelIngests(db, channelId).map((ingest) => {
            const binding = bindings.find(
              (item) =>
                item.providerId === ingest.providerId && item.fingerprint === ingest.fingerprint,
            );
            return {
              ...ingest,
              ...(binding ? { botSlug: binding.botSlug } : {}),
              state: state(ingest),
            };
          }),
          candidates: bindings.map((binding) => {
            const known = new Map<string, string>();
            for (const row of db
              .prepare(
                `SELECT body FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL
                AND json_extract(body, '$.receiveScope.kind') = 'group' ORDER BY created_at`,
              )
              .all(binding.id) as { body: string }[]) {
              const value = JSON.parse(row.body) as MessagingGrant;
              if (value.receiveScope)
                known.set(value.receiveScope.conversationId, value.targetName);
            }
            for (const held of listHeld(db, binding.id))
              if (held.conversation.kind === 'group' && !known.has(held.conversation.id))
                known.set(held.conversation.id, held.name);
            return {
              bindingId: binding.id,
              botSlug: binding.botSlug,
              platform: binding.platform,
              accountName: binding.name,
              conversations: [...known].map(([id, name]) => ({ kind: 'group' as const, id, name })),
            };
          }),
        };
      });
    },
    async ingest(channelId, input) {
      transaction(
        (db) => {
          const channel = humanBridgeChannel(db, channelId);
          if (channel.type !== 'group') throw new MessagingError('channel-unavailable');
          if (input.kind === 'add') {
            const identity = readMessagingIdentity(db, input.bindingId);
            if (identity.revokedAt || identity.platform === 'weixin')
              throw new MessagingError('identity-unavailable');
            const entry = conversationEntries(db, identity.id, input.conversation).find(
              (item) => item.receiveScope?.kind === 'group',
            );
            const held = listHeld(db, identity.id).find(
              (item) =>
                item.conversation.kind === 'group' &&
                item.conversation.id === input.conversation.id,
            );
            if (!entry && !held) throw new MessagingError('conversation-unavailable');
            if (
              matchingIngests(
                db,
                identity.providerId,
                identity.fingerprint,
                input.conversation,
              ).some((item) => item.channelId === channelId)
            )
              throw new MessagingError('ingest-exists');
            const at = new Date().toISOString();
            writeIngest(db, {
              id: randomUUID(),
              channelId,
              providerId: identity.providerId,
              accountRef: identity.accountRef,
              fingerprint: identity.fingerprint,
              platform: identity.platform,
              accountName: identity.name,
              conversation: {
                kind: 'group',
                id: input.conversation.id,
                name: entry?.targetName ?? held?.name ?? input.conversation.id,
              },
              revision: 1,
              enabled: true,
              intakeAfter: at,
              wake: input.wake ?? DEFAULT_INGEST_WAKE,
              createdAt: at,
            });
            return;
          }
          const value = readIngest(db, input.ingestId);
          if (value.channelId !== channelId) throw new MessagingError('ingest-unavailable');
          if (value.revision !== input.expectedRevision) throw new MessagingError('ingest-changed');
          if (input.kind === 'delete') {
            deleteIngest(db, value.id);
            return;
          }
          writeIngest(db, {
            ...value,
            revision: value.revision + 1,
            ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
            ...(input.enabled === true && !value.enabled
              ? { intakeAfter: new Date().toISOString() }
              : {}),
            ...(input.wake ? { wake: input.wake } : {}),
          });
        },
        ['grants'],
      );
      receptionChanged();
    },
    async channelBridge(channelId, rawInput) {
      const input = channelBridgeInput.parse(rawInput);
      const value = grant(input.grantId);
      const privateSource = value.platform === 'weixin';
      if (value.receiveScope?.kind === 'dm' && !privateSource)
        throw new MessagingError('capability-unavailable');
      if (
        privateSource &&
        input.kind !== 'delete' &&
        (input.collection !== 'all' || input.collectionInheritance === 'inherit')
      )
        throw new MessagingError('capability-unavailable');
      const channel = database.read((db) => bridgeChannel(db, channelId, value.botSlug, true));
      const target = input.delivery === 'inbox' ? null : channelId;
      if (target === null && channel.type !== 'dm') throw new MessagingError('channel-unavailable');
      if (value.platform === 'qq' && target !== null && channel.type !== 'group')
        throw new MessagingError('channel-unavailable');
      const routes = channelBridgeRoutes(value);
      const configuration = routes.find((route) =>
        input.routeId ? route.id === input.routeId : route.channelId === target,
      );
      if (
        value.revision !== input.expectedGrantRevision ||
        (input.kind !== 'add' &&
          (!configuration || configuration.revision !== input.expectedRevision))
      )
        throw new MessagingError('bridge-stale');
      if (
        input.kind === 'add'
          ? routes.some((route) => route.channelId === target)
          : configuration?.channelId !== target
      )
        throw new MessagingError('bridge-unavailable');
      let inspected: Awaited<ReturnType<MessagingProvider['inspect']>> | undefined;
      let entry: { provider: MessagingProvider; token: object } | undefined;
      if (input.kind === 'add' || (input.kind === 'update' && input.enabled)) {
        if (value.revokedAt || value.suspendedReason || !options.isBotActive(value.botSlug))
          throw new MessagingError('grant-unavailable');
        database.read((db) => assertMessagingIdentity(db, value.bindingId));
        entry = providers.get(value.providerId);
        if (!entry?.provider.consume || !entry.provider.reply)
          throw new MessagingError('provider-incompatible');
        inspected = await bounded(inspectGrant(entry.provider, value));
        if (
          providers.get(value.providerId) !== entry ||
          !inspected.account.connected ||
          inspected.account.ref !== value.accountRef ||
          inspected.account.platform !== value.platform ||
          inspected.account.fingerprint !== value.fingerprint ||
          inspected.target.ref !== value.targetRef ||
          inspected.target.digest !== value.targetDigest ||
          !inspected.target.receiveScope ||
          (privateSource && inspected.target.receiveScope.kind !== 'dm')
        )
          throw new MessagingError('rebind-required');
        if (
          !privateSource &&
          input.collectionInheritance !== 'inherit' &&
          input.collection === 'all' &&
          !leases.get(value.id)?.ordinaryVerified
        )
          throw new MessagingError('ordinary-delivery-unverified');
      }
      const updated = transaction(
        (db) => {
          const latest = grant(value.id);
          const currentRoutes = channelBridgeRoutes(latest);
          const current = currentRoutes.find((route) => route.id === configuration?.id);
          bridgeChannel(db, channelId, latest.botSlug, true);
          if (
            latest.revision !== input.expectedGrantRevision ||
            (input.kind !== 'add' && (!current || current.revision !== input.expectedRevision)) ||
            (input.kind === 'add' && currentRoutes.some((route) => route.channelId === target))
          )
            throw new MessagingError('bridge-stale');
          if (
            input.kind !== 'delete' &&
            input.expectedDefaultRevision !== undefined &&
            input.expectedDefaultRevision !== messagingDefaults(db, latest.platform).revision
          )
            throw new MessagingError('defaults-stale');
          if (entry) {
            assertMessagingIdentity(db, latest.bindingId);
            if (
              providers.get(latest.providerId) !== entry ||
              latest.revokedAt ||
              latest.suspendedReason ||
              !options.isBotActive(latest.botSlug)
            )
              throw new MessagingError('grant-unavailable');
          }
          const nextRoutes =
            input.kind === 'delete'
              ? currentRoutes.filter((route) => route.id !== current!.id)
              : [
                  ...currentRoutes.filter((route) => route.id !== current?.id),
                  {
                    id: current?.id ?? randomUUID(),
                    channelId: target,
                    name: input.name,
                    enabled: input.enabled,
                    collection: input.collection,
                    collectionInheritance: input.collectionInheritance ?? 'custom',
                    revision: (current?.revision ?? 0) + 1,
                    ...(input.kind === 'add' || (input.enabled && !current?.enabled)
                      ? { intakeAfter: new Date().toISOString() }
                      : current?.intakeAfter
                        ? { intakeAfter: current.intakeAfter }
                        : {}),
                  },
                ];
          const { channelBridge: _bridge, receiveTargetChannelId: _target, ...rest } = latest;
          const { receiveScope: priorScope, ...withoutScope } = rest;
          const next: MessagingGrant = {
            ...withoutScope,
            bridgeRoutes: nextRoutes,
            revision: nextRoutes.length ? latest.revision : latest.revision + 1,
            ...(nextRoutes.length && (inspected?.target.receiveScope ?? priorScope)
              ? { receiveScope: inspected?.target.receiveScope ?? priorScope }
              : {}),
          };
          db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
            JSON.stringify(next),
            next.revision,
            latest.id,
          );
          return next;
        },
        ['grants', 'channel', 'bot-inbox'],
      );
      if (!updated.receiveScope) stop(value.id);
      else if (!valid(updated)) await bounded(start(updated));
      options.warn?.(
        JSON.stringify({
          event: 'messaging-channel-bridge',
          phase: 'committed',
          initiator: 'human-profile',
          channelId,
          grantId: value.id,
          operation: input.kind,
          routeId: configuration?.id,
        }),
      );
    },
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
    async setChannelTarget(botSlug, id, channelId) {
      const updated = transaction(
        (db) => {
          const value = grant(id);
          if (
            value.botSlug !== botSlug ||
            value.revokedAt ||
            value.suspendedReason ||
            !options.isBotActive(botSlug)
          )
            throw new MessagingError('grant-unavailable');
          if (value.bridgeRoutes) throw new MessagingError('bridge-stale');
          if (channelId !== null && bridgeChannel(db, channelId, botSlug, true).type !== 'group')
            throw new MessagingError('channel-unavailable');
          const { receiveTargetChannelId: _old, channelBridge: _bridge, ...rest } = value;
          const next: MessagingGrant = {
            ...rest,
            revision: value.revision + 1,
            ...(channelId === null
              ? {}
              : {
                  receiveTargetChannelId: channelId,
                  channelBridge: {
                    name: value.targetName,
                    enabled: !!value.receiveScope,
                    collection: groupReceptionPolicy(db, id).collection,
                    revision: 1,
                  },
                }),
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
      stop(id);
      if (updated.receiveScope) await start(updated);
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
      const inspected = await entry.provider.inspect(value.accountRef, value.targetRef);
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
    ordinaryDelivery(id) {
      return valid(grant(id)) && leases.get(id)?.ordinaryVerified ? 'verified' : 'unverified';
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
    pendingPaths(botSlug, now, context = false) {
      return database.read((db) => pendingReceptionPaths(db, botSlug, now, valid, context));
    },
    endChannel(channelId) {
      transaction(
        (db) => {
          for (const row of db.prepare('SELECT id, body FROM messaging_grants').all()) {
            const value = JSON.parse(String(row.body)) as MessagingGrant;
            const routes = channelBridgeRoutes(value);
            if (!routes.some((route) => route.channelId === channelId)) continue;
            const next = {
              ...value,
              bridgeRoutes: routes.filter((route) => route.channelId !== channelId),
            };
            delete next.receiveTargetChannelId;
            db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
              JSON.stringify(next),
              String(row.id),
            );
          }
          for (const row of db
            .prepare('SELECT id, body FROM messaging_conversation_ingests WHERE channel_id = ?')
            .all(channelId)) {
            const value = JSON.parse(String(row.body));
            db.prepare(
              'UPDATE messaging_conversation_ingests SET body = ?, revision = revision + 1 WHERE id = ?',
            ).run(
              JSON.stringify({ ...value, enabled: false, revision: Number(value.revision) + 1 }),
              String(row.id),
            );
          }
          for (const row of db
            .prepare(`SELECT a.source_event_id, a.bot_slug FROM inbox_admissions a
          WHERE a.attempt_state IN ('pending', 'retryable', 'running') AND EXISTS
            (SELECT 1 FROM messaging_source_paths p WHERE p.source_event_id = a.source_event_id
              AND p.bot_slug = a.bot_slug AND p.channel_id = ?)`)
            .all(channelId)) {
            if (
              currentReceptionPaths(
                db,
                String(row.bot_slug),
                String(row.source_event_id),
                undefined,
                'reply',
              ).length
            )
              continue;
            db.prepare(
              "UPDATE inbox_admissions SET attempt_state = 'needs-repair', last_error = 'channel-ended' WHERE source_event_id = ? AND bot_slug = ?",
            ).run(String(row.source_event_id), String(row.bot_slug));
          }
        },
        ['channel', 'bot-inbox', 'messaging'],
      );
      options.onReceptionChanged?.();
    },
    available(botSlug, id) {
      try {
        if (!database.read((db) => sourceSenderAllowed(db, botSlug, id))) return false;
        const source = read(botSlug, id);
        const value = grant(source.grantId);
        if (source.receptionPaths)
          return database.read(
            (db) => currentReceptionPaths(db, botSlug, id, valid, 'reply').length > 0,
          );
        return (
          value.botSlug === botSlug &&
          valid(value) &&
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
      const value = grant(source.grantId);
      if (value.botSlug !== botSlug) throw new MessagingError('grant-unavailable');
      if (!valid(value)) throw new MessagingError('source-unavailable');
      return leases.get(value.id)!.controller.signal;
    },
    read,
    share(botSlug, sourceEventId, channelId) {
      let placement: ChannelMessageCommit | undefined;
      let admitted: string[] = [];
      const result = transaction(
        (db) => {
          if (!options.isBotActive(botSlug)) throw new MessagingError('bot-unavailable');
          const source = read(botSlug, sourceEventId);
          if (!service.available(botSlug, sourceEventId))
            throw new MessagingError('source-unavailable');
          if (source.localChannelId) throw new MessagingError('source-conflict');
          const channel = bridgeChannel(db, channelId, botSlug);
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
          placement = placeBridgeSource(db, { ...source, localChannelId: channelId }, botSlug);
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
      const source = read(botSlug, sourceEventId);
      const value = grant(source.grantId);
      const entry = providers.get(value.providerId);
      const lease = leases.get(value.id);
      if (
        value.botSlug !== botSlug ||
        !valid(value) ||
        !lease ||
        source.grantRevision !== value.revision ||
        source.event.fingerprint !== value.fingerprint ||
        source.event.conversation.id !== value.receiveScope?.conversationId
      )
        throw new MessagingError('source-unavailable');
      const assertCurrent = () => {
        if (
          !valid(grant(value.id)) ||
          grant(value.id).revision !== value.revision ||
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
            db.prepare('UPDATE source_events SET payload_json = ? WHERE source_event_id = ?').run(
              JSON.stringify(payload),
              sourceEventId,
            );
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
                  return read(botSlug, id, false, false);
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
            sourceEventId: sourceId(value, event),
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
              persistSource(db, value, event);
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
    pairingReception(bindingId) {
      const identity = database.read((db) => readMessagingIdentity(db, bindingId));
      if (!identity.enabled || identity.revokedAt || !options.isBotActive(identity.botSlug))
        return 'off';
      const lease = controls.get(bindingId);
      if (!lease || lease.controller.signal.aborted) return 'unavailable';
      return lease.dispose ? 'receiving' : 'connecting';
    },
    async reconcileBinding(bindingId) {
      stopControl(bindingId);
      await startControl(bindingId);
      const rows = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE binding_id = ?').all(bindingId),
      ) as { body: string }[];
      const values = rows.map((r) => JSON.parse(r.body) as MessagingGrant);
      for (const value of values) stop(value.id);
      await Promise.all(values.filter((v) => !v.revokedAt).map((value) => start(value)));
    },
    revoke: stop,
    startEntry(grantId) {
      const value = grant(grantId);
      if (value.revokedAt === undefined && !closed) void start(value);
      receptionChanged();
    },
    close() {
      closed = true;
      for (const id of new Set([...controls.keys(), ...controlRetries.keys()]))
        stopControl(id, 'host-shutdown');
      for (const id of new Set([...leases.keys(), ...retries.keys()])) stop(id);
      providers.clear();
    },
  };
  return service;
}
