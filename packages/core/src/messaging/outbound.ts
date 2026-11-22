import { createFailureAlerts } from './failure-alerts.js';
import { createApprovalMessaging } from './approval-messaging.js';
import { createPairingCards } from './pairing-cards.js';
import { createQuestionMessaging } from './question-messaging.js';
import { createBotPairing } from './pairing.js';
import { assertMessagingIdentity, readMessagingIdentity } from './identity.js';
import { recordLocalReception, stopReceptionHistory } from './reception-history.js';
import type { ChannelMessageCommit, ChannelStore } from '../channels/store.js';
import type { AttachmentStore } from '../attachments/store.js';
import { createChannelMediaAccess } from './channel-media.js';
import { randomUUID } from 'node:crypto';
import { createInboundMessaging } from './inbound.js';
import { createMessagingTyping } from './typing.js';
import { createMessagingFeedback } from './feedback.js';
import { createBotSourcePolicyStore, type BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { DatabaseSync } from 'node:sqlite';
import { CONNECTOR_TYPES as TELEMETRY_CONNECTOR_TYPES } from '../telemetry/events.js';
import type { TelemetryCapture } from '../telemetry/service.js';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingError } from './provider.js';
import type { ProviderRegistration, OutboundMessaging } from './outbound-types.js';
import { createOutboxStore } from './outbound-outbox-store.js';
import { createOutboundDelivery } from './outbound-delivery.js';
import { createOutboundDmMirror } from './outbound-dm-mirror.js';
import { createOutboundGrants } from './outbound-grants.js';
import { createOutboundReplies } from './outbound-replies.js';
import { createOutboundMedia } from './outbound-media.js';
import { createOutboundBinding } from './outbound-binding.js';
import { createOutboundConversations } from './outbound-conversations.js';
import { createOutboundSnapshot } from './outbound-snapshot.js';
export type {
  MessagingGrant,
  OutboxState,
  ReportOrigin,
  ReplyOrigin,
  OutboxIntent,
  MessagingApp,
  MessagingReadMode,
  MessagingSnapshot,
  OutboundMessaging,
} from './outbound-types.js';
export type OutboundMessagingOptions = {
  database: OperationalDatabaseModulePort;
  channels?: Pick<ChannelStore, 'get' | 'getOrCreateDm'>;
  attachments?: AttachmentStore;
  isBotActive(slug: string): boolean;
  ownsFailure?(slug: string, sessionId: string, role: 'orchestrator' | 'assignment'): boolean;
  sourcePolicy?: BotSourcePolicyStore;
  onDefaultsChanged?: () => void;
  onReceptionChanged?: () => void;
  onAuthorizationChanged?: (botSlug: string) => void;
  onAdmitted?(botSlug: string, sourceEventId: string): void;
  onPlaced?(commit: ChannelMessageCommit): void;
  onShared?(botSlugs: string[]): void;
  onIngested?(channelId: string, messageId: string): void;
  imCommands?(): import('./im-commands.js').ImCommandServices | undefined;
  timeoutMs?: number;
  recover?: boolean;
  now?: () => Date;
  warn?: (message: string) => void;
  capture?: TelemetryCapture;
};

const CONNECTOR_TYPES = new Set<string>(
  TELEMETRY_CONNECTOR_TYPES.filter((type) => type !== 'other'),
);

export function connectorType(platform: string): string {
  const normalized = platform.trim().toLowerCase();
  return CONNECTOR_TYPES.has(normalized) ? normalized : 'other';
}

function prepareOutboxStateUpdate(db: DatabaseSync) {
  return db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?');
}

function prepareOutboxIntentInsert(db: DatabaseSync) {
  return db.prepare(
    'INSERT INTO messaging_outbox (id, bot_slug, grant_id, request_id, state, created_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
}

function prepareOutboundDmSourceInsert(db: DatabaseSync) {
  return db.prepare(`INSERT INTO source_events (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
          VALUES (?, 'bot-message', ?, ?, ?, ?, ?, ?)`);
}

function prepareOutboundDmPlacementInsert(db: DatabaseSync) {
  return db.prepare(
    'INSERT INTO channel_placements (channel_id, revision, source_event_id, message_id) VALUES (?, ?, ?, ?)',
  );
}

export function createOutboundMessaging(options: OutboundMessagingOptions): OutboundMessaging {
  const { database } = options;
  const connectorEnabled = (platform: string): void => {
    try {
      options.capture?.('im:connector_enable', { type: connectorType(platform) });
    } catch {
      return;
    }
  };
  const transaction = <T>(command: (db: DatabaseSync) => T, topics: string[] = []): T => {
    try {
      return database.transaction((db) => {
        const result = command(db);
        if (topics.includes('grants') || topics.includes('bindings'))
          recordLocalReception(
            db,
            (options.now?.() ?? new Date()).toISOString(),
            options.isBotActive,
          );
        return result;
      }, topics);
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.cause instanceof MessagingError)
        throw error.cause;
      throw error;
    }
  };
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const receptionHostId = randomUUID();
  if (options.recover !== false)
    database.transaction((db) => recordLocalReception(db, now(), options.isBotActive, 'observed'));
  const providers = new Map<string, ProviderRegistration>();
  const privateReplies = new Map<
    string,
    Set<import('../credentials/im-origin.js').PrivateReplyAuthority>
  >();
  const privateNotices = new Map<
    string,
    import('../credentials/im-origin.js').PrivateReplyAuthority
  >();
  const privateReplyKey = (botSlug: string, sourceEventId: string) =>
    JSON.stringify([botSlug, sourceEventId]);
  const inFlight = new Map<
    string,
    { providerId: string; token: object; controller: AbortController; fileGrantId?: string }
  >();
  let closed = false;
  const active = (slug: string) => {
    if (closed || !options.isBotActive(slug)) throw new MessagingError('bot-unavailable');
  };
  const provider = (id: string) => {
    const entry = providers.get(id);
    if (closed || entry === undefined) throw new MessagingError('provider-unavailable');
    return entry;
  };
  const current = (id: string, token: object) => {
    if (provider(id).token !== token) throw new MessagingError('provider-unavailable');
  };
  const binding = (id: string) => database.read((db) => readMessagingIdentity(db, id));
  const {
    revokePendingIntents,
    readIntent,
    postRequest,
    settle,
    history,
    checkPostLimit,
    methods: outboxStoreMethods,
  } = createOutboxStore({
    database,
    get grant() {
      return grant;
    },
    transaction,
    now,
    get mirrorAccepted() {
      return mirrorAccepted;
    },
    prepareOutboxStateUpdate,
  });
  const enabledBinding = (id: string, revision?: number) =>
    database.read((db) => assertMessagingIdentity(db, id, revision));
  const bounded = async <T>(work: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new MessagingError('provider-timeout')),
            options.timeoutMs ?? 15000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const { inspectIdentity, methods: outboundBinding } = createOutboundBinding({
    provider,
    bounded,
    current,
    database,
    get service() {
      return service;
    },
    transaction,
    options,
    get inbound() {
      return inbound;
    },
    get typing() {
      return typing;
    },
    active,
    now,
    connectorEnabled,
    binding,
    enabledBinding,
  });
  const {
    grant,
    assertConversationAllowed,
    savedDmGrant,
    check,
    methods: outboundGrants,
  } = createOutboundGrants({
    database,
    transaction,
    bounded,
    provider,
    active,
    enabledBinding,
    current,
    get service() {
      return service;
    },
    options,
    get inbound() {
      return inbound;
    },
    now,
    connectorEnabled,
    revokePendingIntents,
    get typing() {
      return typing;
    },
    inFlight,
  });
  const {
    mirrorChoice,
    mirrorAccepted,
    recoverMirrors,
    forwardingSources,
    forwardingFences,
    forwardWebDm,
  } = createOutboundDmMirror({
    database,
    options,
    transaction,
    readIntent,
    grant,
    binding,
    get closed() {
      return closed;
    },
    providers,
    provider,
    check,
    get service() {
      return service;
    },
    prepareOutboundDmSourceInsert,
    prepareOutboundDmPlacementInsert,
  });
  if (options.recover !== false)
    transaction(
      (db) => {
        const rows = db
          .prepare("SELECT id FROM messaging_outbox WHERE state IN ('pending', 'in-flight')")
          .all() as unknown as { id: string }[];
        for (const row of rows) {
          const value = readIntent(row.id);
          const reason = value.state === 'in-flight' ? 'host-interrupted' : 'dispatch-interrupted';
          const state = value.state === 'in-flight' ? 'unknown-outcome' : 'cancelled';
          const record = { ...value, state, settledAt: now(), reason };
          db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
            state,
            JSON.stringify(record),
            row.id,
          );
          db.prepare(
            'UPDATE messaging_outbox_attempts SET state = ?, finished_at = ?, reason = ? WHERE intent_id = ?',
          ).run(state, record.settledAt, reason, row.id);
        }
      },
      ['outbox'],
    );
  const pairing = createBotPairing(
    database,
    options.isBotActive,
    options.now,
    options.onAuthorizationChanged,
  );
  const approvals = createApprovalMessaging({
    database,
    pairing,
    ...(options.recover === undefined ? {} : { recover: options.recover }),
    provider: (id) => provider(id).provider,
    isBotActive: options.isBotActive,
    ...(options.warn ? { warn: options.warn } : {}),
  });
  const pairingCards = createPairingCards({
    ...(options.recover === undefined ? {} : { recover: options.recover }),
    database,
    pairing,
    provider(id) {
      const entry = provider(id);
      return { provider: entry.provider, assertCurrent: () => current(id, entry.token) };
    },
    isBotActive: options.isBotActive,
    notifyApplicant: (request) => inbound.notifyPairing(request),
    routeAvailable: (request) => inbound.pairingRouteAvailable(request),
    ...(options.warn ? { warn: options.warn } : {}),
  });
  const failureAlerts = createFailureAlerts({
    database,
    approvals,
    isBotActive: options.isBotActive,
    ownsFailure: options.ownsFailure ?? (() => false),
    ...(options.recover === undefined ? {} : { recover: options.recover }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const questions = createQuestionMessaging({
    database,
    pairing,
    approvals,
    provider: (id) => provider(id).provider,
    isBotActive: options.isBotActive,
    ...(options.recover === undefined ? {} : { recover: options.recover }),
    ...(options.warn ? { warn: options.warn } : {}),
  });
  const inbound = createInboundMessaging({
    onQuestionAction: (providerId, event, signal) => questions.action(providerId, event, signal),
    onQuestionText: (providerId, event, signal) => questions.text(providerId, event, signal),
    onApprovalAction: (providerId, event, signal) =>
      event.kind === 'pairing'
        ? pairingCards.action(providerId, event, signal)
        : approvals.action(providerId, event, signal),
    onPairingRequest: (request) => pairingCards.notify(request),
    pairing,
    database,
    ...(options.channels ? { channels: options.channels } : {}),
    bindingAvailable(id) {
      try {
        enabledBinding(id);
        return true;
      } catch {
        return false;
      }
    },
    sourcePolicy: options.sourcePolicy ?? createBotSourcePolicyStore(database),
    isBotActive: options.isBotActive,
    async replyCommand(botSlug, sourceEventId, text) {
      let part = 0;
      for (let offset = 0; offset < text.length;) {
        let end = Math.min(offset + 4000, text.length);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
        const result = await routedReply(
          botSlug,
          sourceEventId,
          text.slice(offset, end),
          `im-command-${sourceEventId}-${part++}`,
        );
        if (result.state !== 'provider-accepted') throw new MessagingError(result.state);
        offset = end;
      }
    },
    onAdmissionCommitted(botSlug, sourceEventId) {
      feedback.notify(botSlug, sourceEventId, 'received');
    },
    onAdmitted: options.onAdmitted ?? (() => undefined),
    ...(options.onReceptionChanged ? { onReceptionChanged: options.onReceptionChanged } : {}),
    ...(options.onPlaced ? { onPlaced: options.onPlaced } : {}),
    onProjectionReady: (providerId) => {
      void recoverMirrors(providerId);
    },
    ...(options.onShared ? { onShared: options.onShared } : {}),
    ...(options.onIngested ? { onIngested: options.onIngested } : {}),
    ...(options.imCommands === undefined ? {} : { imCommands: options.imCommands }),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const {
    sourceForReply,
    qualifyReply,
    routedReply,
    methods: outboundReplies,
  } = createOutboundReplies({
    inbound,
    database,
    grant,
    check,
    current,
    get service() {
      return service;
    },
    get feedback() {
      return feedback;
    },
    provider,
    bounded,
    privateNotices,
  });
  const channelMedia = options.attachments
    ? createChannelMediaAccess({
        database,
        attachments: options.attachments,
        active: options.isBotActive,
        prepareAudio: (botSlug, sourceEventId, attachmentId, signal) =>
          service.prepareAudio(botSlug, sourceEventId, attachmentId, signal),
        provider(id) {
          const entry = provider(id);
          return { provider: entry.provider, assertCurrent: () => current(id, entry.token) };
        },
        ...(options.warn ? { warn: options.warn } : {}),
      })
    : undefined;
  const typing = createMessagingTyping({
    ...(options.warn ? { warn: options.warn } : {}),
    candidate(botSlug, sourceEventId) {
      if (!inbound.available(botSlug, sourceEventId)) return undefined;
      const source = inbound.read(botSlug, sourceEventId);
      if (source.platform !== 'weixin' || source.event.conversation.kind !== 'dm') return undefined;
      const value = grant(botSlug, source.grantId);
      if (!value.bindingId || value.botSlug !== botSlug) return undefined;
      const identity = enabledBinding(value.bindingId);
      if (!identity.typingEnabled) return undefined;
      const entry = provider(value.providerId);
      if (!entry.provider.beginTyping) return undefined;
      return {
        bindingId: identity.id,
        grantId: value.id,
        providerId: value.providerId,
        provider: entry.provider,
        token: entry.token,
        accountRef: value.accountRef,
        fingerprint: value.fingerprint,
        route: source.event.reply,
        signal: inbound.sourceSignal(botSlug, sourceEventId),
        validate() {
          active(botSlug);
          current(value.providerId, entry.token);
          const currentIdentity = enabledBinding(identity.id, identity.revision);
          const latest = grant(botSlug, value.id);
          return (
            currentIdentity.typingEnabled === true &&
            !latest.revokedAt &&
            !latest.suspendedReason &&
            latest.revision === value.revision &&
            latest.fingerprint === value.fingerprint &&
            latest.bindingId === identity.id &&
            inbound.available(botSlug, sourceEventId)
          );
        },
      };
    },
  });
  const feedback = createMessagingFeedback({
    database,
    ...(options.warn ? { warn: options.warn } : {}),
    candidate(botSlug, sourceEventId) {
      if (!inbound.available(botSlug, sourceEventId)) return undefined;
      const source = inbound.read(botSlug, sourceEventId);
      if (!['feishu', 'slack'].includes(source.platform)) return undefined;
      const value = grant(botSlug, source.grantId);
      if (value.botSlug !== botSlug) return undefined;
      if (source.platform === 'slack' && value.muted) return undefined;
      const identity = enabledBinding(value.bindingId);
      const entry = provider(value.providerId);
      return {
        provider: entry.provider,
        signal: inbound.sourceSignal(botSlug, sourceEventId),
        input: {
          accountRef: value.accountRef,
          fingerprint: value.fingerprint,
          route: source.event.reply,
          beforeSend() {
            try {
              active(botSlug);
              current(value.providerId, entry.token);
              enabledBinding(value.bindingId, identity.revision);
              const latest = grant(botSlug, value.id);
              return (
                !latest.revokedAt &&
                !latest.suspendedReason &&
                !(source.platform === 'slack' && latest.muted) &&
                latest.revision === value.revision &&
                inbound.available(botSlug, sourceEventId)
              );
            } catch {
              return false;
            }
          },
        },
      };
    },
  });
  const delivery = createOutboundDelivery({
    active,
    postRequest,
    enabledBinding,
    provider,
    bounded,
    database,
    get service() {
      return service;
    },
    transaction,
    current,
    now,
    inbound,
    grant,
    savedDmGrant,
    forwardingFences,
    readIntent,
    sourceForReply,
    check,
    qualifyReply,
    options,
    assertConversationAllowed,
    forwardingSources,
    mirrorChoice,
    privateNotices,
    privateReplies,
    privateReplyKey,
    checkPostLimit,
    inFlight,
    binding,
    settle,
    prepareOutboxIntentInsert,
    prepareOutboxStateUpdate,
  });
  const outboundMedia = createOutboundMedia({
    channelMedia,
    options,
    inbound,
    grant,
    check,
    inFlight,
    current,
    transaction,
    get service() {
      return service;
    },
  });
  const outboundConversations = createOutboundConversations({
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
  });
  const outboundSnapshot = createOutboundSnapshot({
    database,
    get service() {
      return service;
    },
    providers,
    bounded,
    current,
    binding,
    inspectIdentity,
    inbound,
    typing,
    check,
    grant,
    options,
    history,
    now,
    get closed() {
      return closed;
    },
    receptionHostId,
    transaction,
    pairing,
    approvals,
    questions,
    failureAlerts,
  });

  const service: OutboundMessaging = {
    questions,
    privateInputReplyAuthority(botSlug, sourceEventId, authority) {
      const key = privateReplyKey(botSlug, sourceEventId);
      let authorities = privateReplies.get(key);
      if (authorities === undefined) {
        authorities = new Set();
        privateReplies.set(key, authorities);
      }
      authorities.add(authority);
      return () => {
        authorities.delete(authority);
        if (authorities.size === 0) privateReplies.delete(key);
      };
    },
    approvals,
    failureAlerts,
    beginProcessing: (botSlug, sourceEventIds) => typing.begin(botSlug, sourceEventIds),
    inbound,
    pairing,
    senderAccess: outboundConversations.senderAccess,
    toolRuleCreatorAuthorized: outboundConversations.toolRuleCreatorAuthorized,
    senderPermissions: outboundConversations.senderPermissions,
    directory: outboundConversations.directory,
    reviewPairing: outboundConversations.reviewPairing,
    defaults: outboundBinding.defaults,
    setDefaults: outboundBinding.setDefaults,
    identity: outboundBinding.identity,
    readChannelMedia: outboundMedia.readChannelMedia,
    acquireFile: outboundMedia.acquireFile,
    prepareAudio: outboundMedia.prepareAudio,
    replyFile: outboundReplies.replyFile,
    reply: outboundReplies.reply,
    replyCapability: outboundReplies.replyCapability,
    privateInputNotice: outboundReplies.privateInputNotice,
    register(value) {
      if (closed) throw new MessagingError('provider-unavailable');
      const token = {};
      const previous = providers.get(value.id);
      if (previous) typing.invalidate((candidate) => candidate.token === previous.token);
      if (previous !== undefined)
        for (const attempt of inFlight.values()) {
          if (attempt.token === previous.token) attempt.controller.abort();
        }
      providers.set(value.id, { provider: value, token });
      const disposeInbound = inbound.register(value);
      setImmediate(() => {
        void recoverMirrors(value.id);
      });
      return () => {
        typing.invalidate((candidate) => candidate.token === token);
        disposeInbound();
        if (providers.get(value.id)?.token === token) providers.delete(value.id);
        for (const attempt of inFlight.values())
          if (attempt.token === token) attempt.controller.abort();
      };
    },
    setPostLimit: outboundBinding.setPostLimit,
    reachable: outboundBinding.reachable,
    postConversation: delivery.postConversation,
    postRequest: delivery.postRequest,
    post: delivery.post,
    forwardWebDm,
    inspectIntent: outboxStoreMethods.inspectIntent,
    history,
    channelBridges: outboundSnapshot.channelBridges,
    deletionDependencies: outboundGrants.deletionDependencies,
    disableBot: outboundGrants.disableBot,
    apps: outboundSnapshot.apps,
    setups: outboundSnapshot.setups,
    snapshot: outboundSnapshot.snapshot,
    targets: outboundBinding.targets,
    authorize: outboundGrants.authorize,
    revoke: outboundGrants.revoke,
    conversation: outboundConversations.conversation,
    send: delivery.send,
    close() {
      if (closed) return;
      try {
        transaction((db) => stopReceptionHistory(db, now()));
      } catch (error) {
        if (
          !(error instanceof OperationalDatabaseError) ||
          (error.code !== 'closed' && error.code !== 'recovery-mode')
        )
          throw error;
      } finally {
        closed = true;
        approvals.close();
        questions.close();
        failureAlerts.close();
        pairingCards.close();
        feedback.close();
        typing.close();
        inbound.close();
        providers.clear();
        for (const attempt of inFlight.values()) attempt.controller.abort();
      }
    },
  };
  return service;
}
