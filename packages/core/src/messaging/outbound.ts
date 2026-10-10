import {
  createApprovalMessaging,
  type ApprovalMessaging,
  type ApprovalMessagingSnapshot,
} from './approval-messaging.js';
import {
  createBotPairing,
  type BotPairing,
  type PairingRequest,
  type PairingReviewInput,
} from './pairing.js';
import {
  changeSenderAccess,
  externalUserRoles,
  readSenderPolicy,
  type SenderAccessInput,
  type SenderPolicy,
  type ExternalUserRole,
} from './sender-access.js';
import {
  assertMessagingIdentity,
  readMessagingIdentity,
  type MessagingIdentity,
  type MessagingIdentityView,
  type MessagingIdentityInput,
} from './identity.js';
import type { ThreadReceptionView } from './thread-policy.js';
import {
  observeReception,
  receptionObservationDue,
  receptionHistory,
  recordLocalReception,
  stopReceptionHistory,
  type ReceptionInterval,
} from './reception-history.js';
import {
  messagingDefaults,
  messagingDefaultsPlatform,
  commitMessagingDefaults,
  type MessagingDefaults,
  type MessagingDefaultsInput,
} from './defaults.js';
import { initializeGroupReceptionPolicy, type GroupReceptionPolicy } from './group-policy.js';
import {
  admissionBound,
  listBlocks,
  listHeld,
  readBlock,
  readHeld,
  removeBlock,
  removeHeld,
  writeBlock,
  type BlockedConversation,
  type HeldConversation,
  type MessagingConversationInput,
} from './conversations.js';
import { bridgeChannel, humanBridgeChannel } from './channel-target.js';
import {
  channelBridgeRoutes,
  type ChannelBridgeRoute,
  type ChannelBridgeSnapshot,
  type ChannelBridgeConfiguration,
} from './channel-bridge.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import { attachmentIdentity, type ChannelAttachmentRef } from '../attachments/ref.js';
import type { AttachmentStore } from '../attachments/store.js';
import { createChannelMediaAccess } from './channel-media.js';
import { sourceMediaUploadId } from './media-identity.js';
import { decodeWeChatVoice, MAX_VOICE_INPUT_BYTES } from '../attachments/wechat-audio.js';
import { createHash, randomUUID } from 'node:crypto';
import { createInboundMessaging, type InboundMessaging, type ExternalSource } from './inbound.js';
import { createMessagingTyping, type MessagingProcessing } from './typing.js';
import { createMessagingFeedback, type SourceFeedback } from './feedback.js';
import { createBotSourcePolicyStore, type BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { DatabaseSync } from 'node:sqlite';
import type { TelemetryCapture } from '../telemetry/service.js';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import {
  MessagingError,
  MessagingProviderError,
  type MessagingProvider,
  type MessagingAccount,
  type MessagingTarget,
  type MessagingReceipt,
  type MessagingReplyRoute,
} from './provider.js';

async function replyFileBytes(
  store: AttachmentStore,
  file: ChannelAttachmentRef,
  signal: AbortSignal,
) {
  try {
    const downloaded = await store.download(attachmentIdentity(file), file.name, signal);
    if (downloaded.ref.size < 1 || downloaded.ref.size > store.maxBytes) {
      await downloaded.body.cancel();
      throw new MessagingProviderError('invalid-file', 'not-started');
    }
    const reader = downloaded.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > store.maxBytes) throw new MessagingProviderError('invalid-file', 'not-started');
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (size !== downloaded.ref.size)
      throw new MessagingProviderError('file-changed', 'not-started');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { name: downloaded.ref.name, bytes, mediaType: downloaded.ref.mime };
  } catch (error) {
    if (error instanceof MessagingProviderError) throw error;
    throw new MessagingProviderError('file-unavailable', 'not-started');
  }
}

export interface MessagingGrant {
  id: string;
  bindingId: string;
  botSlug: string;
  providerId: string;
  accountRef: string;
  accountName: string;
  fingerprint: string;
  platform: string;
  targetRef: string;
  targetName: string;
  targetDigest: string;
  revision: number;
  createdAt: string;
  receiveAfter?: string;
  receiveScope?: { kind: 'group' | 'dm'; conversationId: string };
  receiveTargetChannelId?: string;
  receptionInheritance?: 'inherit' | 'custom';
  channelBridge?: ChannelBridgeConfiguration;
  bridgeRoutes?: ChannelBridgeRoute[];
  origin?: 'explicit' | 'implicit';
  muted?: boolean;
  preferenceRevision?: number;
  revokedAt?: string;
  suspendedReason?: 'rebind-required';
}

export type OutboxState =
  | 'pending'
  | 'in-flight'
  | 'provider-accepted'
  | 'failed'
  | 'unknown-outcome'
  | 'cancelled'
  | 'grant-revoked';

export interface ReportOrigin {
  providerId: string;
  accountRef: string;
  fingerprint: string;
  platform: string;
  accountName: string;
  targetName: string;
  conversationId: string;
}

export interface ReplyOrigin extends ReportOrigin {
  route: MessagingReplyRoute;
}

export interface OutboxIntent {
  id: string;
  botSlug: string;
  grantId: string;
  grantRevision: number;
  sourceEventId?: string;
  report?: ReportOrigin;
  reply?: ReplyOrigin;
  receipt?: MessagingReceipt;
  echo?: { eventId: string; at: string };
  file?: ChannelAttachmentRef;
  text: string;
  state: OutboxState;
  createdAt: string;
  settledAt?: string;
  reason?: string;
}

export type MessagingApp = MessagingAccount & {
  providerId: string;
  boundBotSlug?: string;
  bindingId?: string;
};

export interface MessagingSnapshot {
  senderPolicy?: SenderPolicy;
  roles?: ExternalUserRole[];
  receptionHistory?: ReceptionInterval[];
  feedback?: { sourceEventId: string; bindingId: string; attempts: SourceFeedback }[];
  approvals?: ApprovalMessagingSnapshot;
  setup?: {
    providerReady: boolean;
    receipts: {
      sourceEventId: string;
      grantId: string;
      messageId: string;
      conversationId: string;
      threadId?: string;
      at: string;
      replyState?: OutboxState;
      replyMessageId?: string;
      echoObserved: boolean;
    }[];
  };
  identities?: MessagingIdentityView[];
  pairings?: PairingRequest[];
  pairingReceivers?: { name: string; status: 'off' | 'connecting' | 'receiving' | 'unavailable' }[];
  channelTargets?: { id: string; name: string }[];
  appSetups?: (import('./provider.js').MessagingSetup & { providerId: string })[];
  accounts: MessagingApp[];
  grants: (MessagingGrant & {
    availability: 'available' | 'unavailable' | 'rebind-required';
    reception: ReturnType<InboundMessaging['status']>;
    canReceive?: boolean;
    canPost?: boolean;
    lastMessageAt?: string;
    groupPolicy?: GroupReceptionPolicy;
    threadPolicies?: ThreadReceptionView[];
    ordinaryDelivery?: 'verified' | 'unverified';
  })[];
  heldConversations?: HeldConversation[];
  blockedConversations?: BlockedConversation[];
  intents: OutboxIntent[];
}

export interface OutboundMessaging {
  approvals: ApprovalMessaging;
  beginProcessing(botSlug: string, sourceEventIds: readonly string[]): MessagingProcessing;
  pairing: BotPairing;
  senderAccess(botSlug: string, input: SenderAccessInput): void;
  reviewPairing(botSlug: string, input: PairingReviewInput): Promise<PairingRequest>;
  inbound: InboundMessaging;
  defaults<Platform extends string = 'feishu'>(platform?: Platform): MessagingDefaults<Platform>;
  setDefaults(input: MessagingDefaultsInput): Promise<MessagingDefaults>;
  identity(botSlug: string, input: MessagingIdentityInput): Promise<MessagingIdentity>;
  reply(botSlug: string, sourceEventId: string, text: string): Promise<OutboxIntent>;
  acquireFile(
    botSlug: string,
    sourceEventId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ): Promise<ChannelAttachmentRef>;
  readChannelMedia(input: {
    channelId: string;
    sourceEventId: string;
    attachmentId: string;
    signal: AbortSignal;
  }): Promise<{ ref: ChannelAttachmentRef; body: ReadableStream<Uint8Array> }>;
  prepareAudio(
    botSlug: string,
    sourceEventId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ): Promise<ChannelAttachmentRef>;
  replyFile(
    botSlug: string,
    sourceEventId: string,
    file: ChannelAttachmentRef,
  ): Promise<OutboxIntent>;
  register(provider: MessagingProvider): () => void;
  snapshot(botSlug: string): Promise<MessagingSnapshot>;
  disableBot(botSlug: string): Promise<void>;
  deletionDependencies(botSlug: string): { identities: string[]; grants: string[] };
  apps(): Promise<MessagingApp[]>;
  setups(): Promise<(import('./provider.js').MessagingSetup & { providerId: string })[]>;
  channelBridges(channelId: string): Promise<ChannelBridgeSnapshot>;
  targets(providerId: string, accountRef: string): Promise<MessagingTarget[]>;
  authorize(input: {
    botSlug: string;
    providerId: string;
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
  }): Promise<MessagingGrant>;
  revoke(botSlug: string, grantId: string): void;
  conversation(botSlug: string, input: MessagingConversationInput): Promise<void>;
  send(
    botSlug: string,
    grantId: string,
    requestId: string,
    text: string,
    sourceEventId?: string,
    file?: ChannelAttachmentRef,
    report?: boolean,
  ): Promise<OutboxIntent>;
  post(botSlug: string, grantId: string, requestId: string, text: string): Promise<OutboxIntent>;
  inspectIntent(botSlug: string, intentId: string): OutboxIntent;
  history(botSlug: string): OutboxIntent[];
  close(): void;
}

type StoredIntent = OutboxIntent & { requestId: string; payloadHash: string };

const CONNECTOR_TYPES = new Set(['feishu', 'lark', 'slack', 'discord', 'weixin']);

export function connectorType(platform: string): string {
  const normalized = platform.trim().toLowerCase();
  return CONNECTOR_TYPES.has(normalized) ? normalized : 'other';
}

export function createOutboundMessaging(options: {
  database: OperationalDatabaseModulePort;
  attachments?: AttachmentStore;
  isBotActive(slug: string): boolean;
  sourcePolicy?: BotSourcePolicyStore;
  onDefaultsChanged?: () => void;
  onReceptionChanged?: () => void;
  onAdmitted?(botSlug: string, sourceEventId: string): void;
  onPlaced?(commit: ChannelMessageCommit): void;
  onShared?(botSlugs: string[]): void;
  onIngested?(channelId: string, messageId: string): void;
  timeoutMs?: number;
  recover?: boolean;
  now?: () => Date;
  warn?: (message: string) => void;
  capture?: TelemetryCapture;
}): OutboundMessaging {
  const { database } = options;
  const connectorEnabled = (platform: string): void => {
    try {
      options.capture?.('connector_enabled', { type: connectorType(platform) });
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
  const providers = new Map<string, { provider: MessagingProvider; token: object }>();
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
  const revokePendingIntents = (db: DatabaseSync, grantId: string, at: string) => {
    const pending = db
      .prepare("SELECT id FROM messaging_outbox WHERE grant_id = ? AND state = 'pending'")
      .all(grantId) as unknown as { id: string }[];
    for (const row of pending) {
      const intent = readIntent(row.id);
      db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
        'grant-revoked',
        JSON.stringify({
          ...intent,
          state: 'grant-revoked',
          reason: 'grant-revoked',
          settledAt: at,
        }),
        row.id,
      );
    }
  };
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
  const inspectIdentity = async (
    value: Pick<MessagingIdentity, 'providerId' | 'accountRef' | 'fingerprint'>,
  ) => {
    const entry = provider(value.providerId);
    const account = await bounded(
      entry.provider.inspectAccount
        ? entry.provider.inspectAccount(value.accountRef)
        : entry.provider
            .accounts()
            .then((rows) => rows.find((r) => r.ref === value.accountRef && !r.unsupported)),
    );
    current(value.providerId, entry.token);
    if (!account || account.ref !== value.accountRef || account.fingerprint !== value.fingerprint)
      throw new MessagingError('rebind-required');
    if (!account.connected) throw new MessagingError('provider-unavailable');
    return { ...account, token: entry.token };
  };
  const grant = (slug: string, id: string): MessagingGrant => {
    const row = database.read((db) =>
      db.prepare('SELECT body FROM messaging_grants WHERE id = ? AND bot_slug = ?').get(id, slug),
    ) as { body: string } | undefined;
    if (row === undefined) throw new MessagingError('grant-unavailable');
    return JSON.parse(row.body) as MessagingGrant;
  };
  const readIntent = (id: string): StoredIntent => {
    const row = database.read((db) =>
      db.prepare('SELECT body FROM messaging_outbox WHERE id = ?').get(id),
    ) as { body: string } | undefined;
    if (!row) throw new MessagingError('intent-unavailable');
    return JSON.parse(row.body) as StoredIntent;
  };
  const settle = (
    id: string,
    state: OutboxState,
    reason?: string,
    receipt?: MessagingReceipt,
  ): OutboxIntent => {
    return transaction(
      (db) => {
        const existing = readIntent(id);
        if (existing.state !== 'pending' && existing.state !== 'in-flight') return existing;
        const value = {
          ...existing,
          state,
          settledAt: now(),
          ...(reason === undefined ? {} : { reason }),
          ...(receipt === undefined ? {} : { receipt }),
        };
        db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
          state,
          JSON.stringify(value),
          id,
        );
        db.prepare(
          'UPDATE messaging_outbox_attempts SET state = ?, finished_at = ?, reason = ? WHERE intent_id = ?',
        ).run(state, value.settledAt, reason ?? null, id);
        return value;
      },
      ['outbox'],
    );
  };
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

  const history = (botSlug: string) => {
    const rows = database.read((db) =>
      db
        .prepare(
          'SELECT body FROM messaging_outbox WHERE bot_slug = ? ORDER BY created_at DESC, id DESC LIMIT 30',
        )
        .all(botSlug),
    ) as unknown as { body: string }[];
    return rows.map((row) => JSON.parse(row.body) as OutboxIntent);
  };
  const suspend = (value: MessagingGrant) => {
    transaction(
      (db) => {
        const latest = grant(value.botSlug, value.id);
        if (latest.revokedAt === undefined && latest.suspendedReason === undefined) {
          db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
            JSON.stringify({
              ...latest,
              suspendedReason: 'rebind-required',
              revision: latest.revision + 1,
            }),
            latest.revision + 1,
            latest.id,
          );
        }
      },
      ['grants'],
    );
  };
  const inspectImplicit = async (registered: MessagingProvider, value: MessagingGrant) => {
    if (!registered.inspectAccount || !value.receiveScope)
      throw new MessagingError('capability-unavailable');
    const account = await bounded(registered.inspectAccount(value.accountRef));
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
  const check = async (value: MessagingGrant) => {
    active(value.botSlug);
    if (value.revokedAt !== undefined) throw new MessagingError('grant-revoked');
    const identity = enabledBinding(value.bindingId);
    if (value.suspendedReason !== undefined) throw new MessagingError('rebind-required');
    const entry = provider(value.providerId);
    let inspected;
    try {
      inspected =
        value.origin === 'implicit'
          ? await inspectImplicit(entry.provider, value)
          : await bounded(entry.provider.inspect(value.accountRef, value.targetRef));
    } catch (error) {
      current(value.providerId, entry.token);
      if (error instanceof MessagingError && error.code === 'rebind-required') suspend(value);
      throw error;
    }
    current(value.providerId, entry.token);
    enabledBinding(value.bindingId, identity.revision);
    active(value.botSlug);
    if (!inspected.account.connected) throw new MessagingError('provider-unavailable');
    if (
      inspected.account.ref !== value.accountRef ||
      inspected.account.fingerprint !== value.fingerprint ||
      inspected.account.platform !== value.platform ||
      inspected.target.ref !== value.targetRef ||
      inspected.target.digest !== value.targetDigest
    ) {
      suspend(value);
      throw new MessagingError('rebind-required');
    }
    return { ...entry, inspected, identityRevision: identity.revision };
  };
  const pairing = createBotPairing(database, options.isBotActive, options.now);
  const approvals = createApprovalMessaging({
    database,
    pairing,
    ...(options.recover === undefined ? {} : { recover: options.recover }),
    provider: (id) => provider(id).provider,
    isBotActive: options.isBotActive,
    ...(options.warn ? { warn: options.warn } : {}),
  });
  const inbound = createInboundMessaging({
    onApprovalAction: (providerId, event, signal) => approvals.action(providerId, event, signal),
    pairing,
    database,
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
    onAdmissionCommitted(botSlug, sourceEventId) {
      feedback.notify(botSlug, sourceEventId, 'received');
    },
    onAdmitted: options.onAdmitted ?? (() => undefined),
    ...(options.onReceptionChanged ? { onReceptionChanged: options.onReceptionChanged } : {}),
    ...(options.onPlaced ? { onPlaced: options.onPlaced } : {}),
    ...(options.onShared ? { onShared: options.onShared } : {}),
    ...(options.onIngested ? { onIngested: options.onIngested } : {}),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const sourceForReply = (botSlug: string, sourceEventId: string, value: MessagingGrant) => {
    const source = inbound.readShared(botSlug, sourceEventId);
    if (source.grantId === value.id) {
      if (!inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
    } else {
      const ingress = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(source.grantId),
      ) as { body: string } | undefined;
      if (!ingress) throw new MessagingError('source-unavailable');
      const owner = JSON.parse(ingress.body) as MessagingGrant;
      if (
        owner.botSlug === botSlug ||
        owner.providerId !== value.providerId ||
        source.platform !== value.platform ||
        (source.event.conversation.kind !== 'group' &&
          !(source.platform === 'weixin' && source.event.conversation.kind === 'dm')) ||
        !source.localChannelId
      )
        throw new MessagingError('source-unavailable');
    }
    return source;
  };
  const qualifyReply = async (
    botSlug: string,
    sourceEventId: string,
    value: MessagingGrant,
    entry: Awaited<ReturnType<typeof check>>,
    signal: AbortSignal,
  ) => {
    const source = sourceForReply(botSlug, sourceEventId, value);
    if (source.grantId === value.id) return source.event.reply;
    if (
      entry.inspected.target.receiveScope?.conversationId !== source.event.conversation.id ||
      !entry.provider.qualifyReply ||
      !entry.provider.reply
    )
      throw new MessagingError('capability-unavailable');
    await inbound.ensureReplyConsumer(botSlug, value.id, signal);
    const route = await entry.provider.qualifyReply({
      accountRef: value.accountRef,
      fingerprint: value.fingerprint,
      route: source.event.reply,
      signal,
    });
    signal.throwIfAborted();
    current(value.providerId, entry.token);
    sourceForReply(botSlug, sourceEventId, value);
    if (
      !route.actorId ||
      route.actorId.length > 512 ||
      route.messageId !== source.event.reply.messageId ||
      route.conversationId !== source.event.reply.conversationId ||
      route.threadId !== source.event.reply.threadId ||
      route.rootId !== source.event.reply.rootId ||
      route.parentId !== source.event.reply.parentId
    )
      throw new MessagingError('stale-route');
    return route;
  };
  const channelMedia = options.attachments
    ? createChannelMediaAccess({
        database,
        attachments: options.attachments,
        active: options.isBotActive,
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
      if (source.platform !== 'feishu') return undefined;
      const value = grant(botSlug, source.grantId);
      if (value.botSlug !== botSlug) return undefined;
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
  const service: OutboundMessaging = {
    approvals,
    beginProcessing: (botSlug, sourceEventIds) => typing.begin(botSlug, sourceEventIds),
    inbound,
    pairing,
    senderAccess(botSlug, input) {
      active(botSlug);
      transaction((db) => changeSenderAccess(db, botSlug, input), ['pairing', 'bot-inbox']);
    },
    async reviewPairing(botSlug, input) {
      const request = pairing.review(botSlug, input);
      await inbound.notifyPairing(request);
      return pairing.list(botSlug).find((item) => item.id === request.id)!;
    },
    defaults<Platform extends string = 'feishu'>(platform?: Platform) {
      return database.read((db) => messagingDefaults(db, platform));
    },
    async setDefaults(input) {
      const prior = service.defaults(input.platform);
      const value = transaction(
        (db) => commitMessagingDefaults(db, input),
        ['bindings', 'grants', 'channel', 'bot-inbox'],
      );
      const identities = database.read((db) =>
        db
          .prepare(
            'SELECT id FROM messaging_bindings WHERE platform = ? AND enabled_inherited = 1 AND revoked_at IS NULL',
          )
          .all(value.platform),
      ) as { id: string }[];
      if (prior.identityEnabled !== value.identityEnabled)
        await Promise.allSettled(identities.map(({ id }) => bounded(inbound.reconcileBinding(id))));
      if (prior.typingEnabled !== value.typingEnabled) {
        const inherited = database.read((db) =>
          db
            .prepare(
              'SELECT id FROM messaging_bindings WHERE platform = ? AND typing_inherited = 1 AND revoked_at IS NULL',
            )
            .all(value.platform),
        ) as { id: string }[];
        const ids = new Set(inherited.map(({ id }) => id));
        typing.invalidate((candidate) => ids.has(candidate.bindingId));
      }
      options.onDefaultsChanged?.();
      options.warn?.(
        JSON.stringify({
          event: 'messaging-defaults',
          phase: 'committed',
          initiator: 'human-settings',
          revision: value.revision,
          platform: value.platform,
        }),
      );
      return value;
    },
    async identity(botSlug, input) {
      active(botSlug);
      if (input.kind === 'bind') {
        const account = await inspectIdentity(input);
        const bound = transaction(
          (db) => {
            active(botSlug);
            current(input.providerId, account.token);
            const prior = db
              .prepare(
                'SELECT id FROM messaging_bindings WHERE revoked_at IS NULL AND provider_id = ? AND (account_ref = ? OR fingerprint = ?)',
              )
              .get(input.providerId, input.accountRef, input.fingerprint);
            if (prior) throw new MessagingError('binding-conflict');
            const id = randomUUID();
            db.prepare(
              'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name, enabled_inherited, typing_inherited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ).run(
              id,
              botSlug,
              input.providerId,
              account.platform,
              input.accountRef,
              input.fingerprint,
              now(),
              account.name,
              messagingDefaultsPlatform.safeParse(account.platform).success ? 1 : 0,
              account.platform === 'weixin' ? 1 : 0,
            );
            return readMessagingIdentity(db, id);
          },
          ['bindings'],
        );
        await bounded(inbound.reconcileBinding(bound.id));
        if (bound.enabled) connectorEnabled(bound.platform);
        return bound;
      }
      const value = binding(input.id);
      if (value.botSlug !== botSlug || value.revokedAt)
        throw new MessagingError('identity-unavailable');
      if (value.revision !== input.expectedRevision) throw new MessagingError('identity-stale');
      if (input.kind === 'update' && (!input.name.trim() || input.name.length > 120))
        throw new MessagingError('invalid-input');
      if (
        input.kind === 'update' &&
        (input.typingEnabled !== undefined || input.inheritTyping !== undefined) &&
        value.platform !== 'weixin'
      )
        throw new MessagingError('invalid-input');
      const scopes = database.read((db) =>
        db
          .prepare('SELECT body FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL')
          .all(value.id),
      ) as { body: string }[];
      const enabled =
        input.kind === 'update'
          ? input.inheritEnabled
            ? service.defaults(value.platform).identityEnabled
            : input.enabled
          : input.kind === 'reconnect'
            ? value.enabledInheritance === 'inherit'
              ? service.defaults(value.platform).identityEnabled
              : true
            : false;
      const validatedTokens = new Map<string, object>();
      if (enabled) {
        const account = await inspectIdentity(value);
        validatedTokens.set(value.providerId, account.token);
        if (account.platform !== value.platform) throw new MessagingError('rebind-required');
        for (const row of scopes) {
          const g = JSON.parse(row.body) as MessagingGrant;
          if (g.origin === 'implicit') continue;
          const entry = provider(g.providerId);
          const checked = await bounded(entry.provider.inspect(g.accountRef, g.targetRef));
          current(g.providerId, entry.token);
          validatedTokens.set(g.providerId, entry.token);
          if (
            g.suspendedReason ||
            checked.account.fingerprint !== value.fingerprint ||
            !checked.account.connected ||
            checked.target.digest !== g.targetDigest ||
            checked.target.ref !== g.targetRef ||
            checked.account.ref !== value.accountRef ||
            checked.account.platform !== value.platform
          )
            throw new MessagingError('rebind-required');
        }
      }
      const updated = transaction(
        (db) => {
          active(botSlug);
          for (const [id, token] of validatedTokens) current(id, token);
          const latest = readMessagingIdentity(db, value.id);
          if (
            input.kind === 'update' &&
            input.expectedDefaultRevision !== undefined &&
            input.expectedDefaultRevision !== latest.defaultRevision
          )
            throw new MessagingError('defaults-stale');
          if (latest.revokedAt || latest.revision !== input.expectedRevision)
            throw new MessagingError('identity-stale');
          const currentScopes = db
            .prepare(
              'SELECT body FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL',
            )
            .all(value.id) as { body: string }[];
          if (enabled && JSON.stringify(currentScopes) !== JSON.stringify(scopes))
            throw new MessagingError('identity-stale');
          const at = now();
          if (latest.platform === 'weixin' && enabled && !latest.enabled) {
            db.prepare('UPDATE messaging_bindings SET receive_after = ? WHERE id = ?').run(
              at,
              value.id,
            );
            for (const row of currentScopes) {
              const g = JSON.parse(row.body) as MessagingGrant;
              db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
                JSON.stringify({ ...g, receiveAfter: at }),
                g.id,
              );
            }
          }
          db.prepare(
            'UPDATE messaging_bindings SET revision = revision + 1, enabled = ?, display_name = ?, revoked_at = ?, enabled_inherited = ?, typing_enabled = ?, typing_inherited = ?, new_conversations = ?, new_conversations_inherited = ? WHERE id = ?',
          ).run(
            enabled ? 1 : 0,
            input.kind === 'update' ? input.name.trim() : latest.name,
            input.kind === 'unbind' ? at : null,
            input.kind === 'update'
              ? input.inheritEnabled
                ? 1
                : 0
              : latest.enabledInheritance === 'inherit'
                ? 1
                : 0,
            (input.kind === 'update'
              ? (input.typingEnabled ?? latest.typingEnabled)
              : latest.typingEnabled) === false
              ? 0
              : 1,
            input.kind === 'update' && input.inheritTyping !== undefined
              ? input.inheritTyping
                ? 1
                : 0
              : input.kind === 'update' && input.typingEnabled !== undefined
                ? 0
                : latest.typingInheritance === 'inherit'
                  ? 1
                  : 0,
            input.kind === 'update' &&
              input.newConversations !== undefined &&
              input.newConversations !== 'inherit'
              ? input.newConversations
              : (
                  db
                    .prepare('SELECT new_conversations FROM messaging_bindings WHERE id = ?')
                    .get(value.id) as { new_conversations: string }
                ).new_conversations,
            input.kind === 'update' && input.newConversations !== undefined
              ? input.newConversations === 'inherit'
                ? 1
                : 0
              : latest.newConversationsInheritance === 'custom'
                ? 0
                : 1,
            value.id,
          );
          if (input.kind === 'unbind') {
            for (const row of scopes) {
              const g = JSON.parse(row.body) as MessagingGrant;
              db.prepare(
                'UPDATE messaging_grants SET body = ?, revoked_at = ?, revision = ? WHERE id = ?',
              ).run(
                JSON.stringify({ ...g, revokedAt: at, revision: g.revision + 1 }),
                at,
                g.revision + 1,
                g.id,
              );
            }
          }
          return readMessagingIdentity(db, value.id);
        },
        ['bindings', 'grants', 'bot-inbox'],
      );
      typing.invalidate((candidate) => candidate.bindingId === value.id);
      await bounded(inbound.reconcileBinding(value.id));
      options.warn?.(
        JSON.stringify({
          event: 'messaging-identity',
          phase: 'committed',
          initiator: 'human-profile',
          identityId: value.id,
          revision: updated.revision,
          enabled: updated.enabled,
          operation: input.kind,
        }),
      );
      if (updated.enabled && !value.enabled && !updated.revokedAt)
        connectorEnabled(updated.platform);
      return updated;
    },
    readChannelMedia(input) {
      if (!channelMedia) throw new MessagingError('capability-unavailable');
      return channelMedia(input);
    },
    async acquireFile(botSlug, sourceEventId, attachmentId, signal) {
      if (options.attachments === undefined || !inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
      const source = inbound.read(botSlug, sourceEventId);
      const attachment = source.event.attachments?.find((item) => item.id === attachmentId);
      if (attachment === undefined) throw new MessagingError('attachment-unavailable');
      const value = grant(botSlug, source.grantId);
      const entry = await check(value);
      if (entry.provider.readFile === undefined) throw new MessagingError('capability-unavailable');
      const controller = new AbortController();
      const combined = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(30000),
        inbound.sourceSignal(botSlug, sourceEventId),
        ...(signal === undefined ? [] : [signal]),
      ]);
      const key = 'file-' + randomUUID();
      inFlight.set(key, {
        providerId: value.providerId,
        token: entry.token,
        controller,
        fileGrantId: value.id,
      });
      const validate = () => {
        combined.throwIfAborted();
        current(value.providerId, entry.token);
        if (!inbound.available(botSlug, sourceEventId))
          throw new MessagingError('source-unavailable');
      };
      const startedAt = Date.now();
      options.warn?.(
        JSON.stringify({
          event: 'messaging-attachment',
          phase: 'starting',
          initiator: 'source-file-access',
          sourceEventId,
        }),
      );
      let abort: (() => void) | undefined;
      try {
        validate();
        const uploadId = sourceMediaUploadId(
          value.providerId,
          value.fingerprint,
          source.event.conversation.id,
          attachment.id,
        );
        const interrupted = new Promise<never>((_, reject) => {
          abort = () => reject(new MessagingError('transfer-cancelled'));
          combined.addEventListener('abort', abort, { once: true });
          if (combined.aborted) abort();
        });
        const ref = await Promise.race([
          options.attachments.acquire({
            uploadId,
            name: attachment.name,
            signal: combined,
            load: async () => {
              validate();
              const data = await entry.provider.readFile!({
                accountRef: value.accountRef,
                fingerprint: value.fingerprint,
                route: source.event.reply,
                attachment,
                signal: combined,
              });
              return (async function* () {
                for await (const chunk of data) {
                  validate();
                  yield chunk;
                }
                validate();
              })();
            },
          }),
          interrupted,
        ]);
        validate();
        transaction((db) =>
          db
            .prepare('INSERT OR IGNORE INTO messaging_managed_files VALUES (?, ?, ?)')
            .run(sourceEventId, ref.fileId!, 'original'),
        );
        options.warn?.(
          JSON.stringify({
            event: 'messaging-attachment',
            phase: 'completed',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            size: ref.size,
          }),
        );
        return ref;
      } catch (error) {
        options.warn?.(
          JSON.stringify({
            event: 'messaging-attachment',
            phase: 'refused',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            reason: error instanceof MessagingError ? error.code : 'transfer-unavailable',
          }),
        );
        throw error;
      } finally {
        if (abort !== undefined) combined.removeEventListener('abort', abort);
        inFlight.delete(key);
        controller.abort();
      }
    },
    async prepareAudio(botSlug, sourceEventId, attachmentId, signal) {
      if (options.attachments === undefined || !inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
      const source = inbound.read(botSlug, sourceEventId);
      if (
        source.platform !== 'weixin' ||
        !source.event.voice ||
        !source.event.attachments?.some(
          (file) => file.id === attachmentId && file.mediaType?.startsWith('audio/'),
        )
      )
        throw new MessagingError('audio-codec-unsupported');
      const combined = AbortSignal.any([
        inbound.sourceSignal(botSlug, sourceEventId),
        AbortSignal.timeout(15000),
        ...(signal ? [signal] : []),
      ]);
      const validate = (): void => {
        combined.throwIfAborted();
        if (!inbound.available(botSlug, sourceEventId))
          throw new MessagingError('source-unavailable');
      };
      const startedAt = Date.now();
      try {
        const original = await service.acquireFile(botSlug, sourceEventId, attachmentId, combined);
        if (original.size > MAX_VOICE_INPUT_BYTES) throw new MessagingError('audio-too-large');
        const downloaded = await options.attachments.download(
          attachmentIdentity(original),
          original.name,
          combined,
        );
        const reader = downloaded.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            validate();
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > MAX_VOICE_INPUT_BYTES) throw new MessagingError('audio-too-large');
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        validate();
        const digest = createHash('sha256')
          .update(bytes)
          .update(JSON.stringify([sourceEventId, attachmentId, source.event.voice, 'silk-wav-v1']))
          .digest('hex')
          .slice(0, 32);
        const uploadId = [
          digest.slice(0, 8),
          digest.slice(8, 12),
          '4' + digest.slice(13, 16),
          '8' + digest.slice(17, 20),
          digest.slice(20),
        ].join('-');
        const result = await options.attachments.acquire({
          uploadId,
          name: 'voice.wav',
          signal: combined,
          load: async () => {
            const wav = await decodeWeChatVoice(bytes, source.event.voice!, combined);
            validate();
            return (async function* () {
              validate();
              yield wav;
              validate();
            })();
          },
        });
        validate();
        transaction((db) =>
          db
            .prepare('INSERT OR IGNORE INTO messaging_managed_files VALUES (?, ?, ?)')
            .run(sourceEventId, result.fileId!, 'voice.wav'),
        );
        await check(grant(botSlug, source.grantId));
        validate();
        options.warn?.(
          JSON.stringify({
            event: 'messaging-audio',
            phase: 'completed',
            initiator: 'source-audio-access',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            size: result.size,
          }),
        );
        return result;
      } catch (error) {
        options.warn?.(
          JSON.stringify({
            event: 'messaging-audio',
            phase: 'refused',
            initiator: 'source-audio-access',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            reason: error instanceof MessagingError ? error.code : 'audio-unavailable',
          }),
        );
        throw error;
      }
    },
    async replyFile(botSlug, sourceEventId, file) {
      if (!inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
      const source = inbound.read(botSlug, sourceEventId);
      const result = await service.send(
        botSlug,
        source.grantId,
        'reply-' + sourceEventId,
        'File reply: ' + file.name,
        sourceEventId,
        file,
      );
      if (result.state === 'provider-accepted')
        feedback.notify(botSlug, sourceEventId, 'answered', result.id);
      return result;
    },
    async reply(botSlug, sourceEventId, text) {
      let source: ExternalSource;
      try {
        source = inbound.readShared(botSlug, sourceEventId);
      } catch (error) {
        if (error instanceof MessagingError && error.code === 'channel-unavailable')
          throw new MessagingError('source-unavailable');
        throw error;
      }
      const ingress = database.read((db) =>
        db.prepare('SELECT bot_slug FROM messaging_grants WHERE id = ?').get(source.grantId),
      ) as { bot_slug: string } | undefined;
      if (ingress?.bot_slug === botSlug) {
        const result = await service.send(
          botSlug,
          source.grantId,
          'reply-' + sourceEventId,
          text,
          sourceEventId,
        );
        if (result.state === 'provider-accepted')
          feedback.notify(botSlug, sourceEventId, 'answered', result.id);
        return result;
      }
      const rows = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE bot_slug = ?').all(botSlug),
      ) as { body: string }[];
      const matches: MessagingGrant[] = [];
      for (const row of rows) {
        const value = JSON.parse(row.body) as MessagingGrant;
        if (
          value.platform !== source.platform ||
          value.revokedAt ||
          value.suspendedReason ||
          (value.receiveScope !== undefined &&
            value.receiveScope.conversationId !== source.event.conversation.id)
        )
          continue;
        sourceForReply(botSlug, sourceEventId, value);
        if (value.origin !== 'implicit') {
          const registered = provider(value.providerId);
          const targets = await bounded(registered.provider.targets(value.accountRef));
          current(value.providerId, registered.token);
          if (
            !targets.some(
              (target) =>
                target.ref === value.targetRef &&
                target.receiveScope?.conversationId === source.event.conversation.id,
            )
          )
            continue;
        }
        const entry = await check(value);
        if (entry.inspected.target.receiveScope?.conversationId === source.event.conversation.id)
          matches.push(value);
      }
      if (matches.length !== 1)
        throw new MessagingError(
          matches.length ? 'reply-target-ambiguous' : 'own-reply-grant-unavailable',
        );
      const requestId =
        'reply-' +
        createHash('sha256')
          .update(JSON.stringify([botSlug, sourceEventId]))
          .digest('hex');
      return service.send(botSlug, matches[0]!.id, requestId, text, sourceEventId);
    },
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
      return () => {
        typing.invalidate((candidate) => candidate.token === token);
        disposeInbound();
        if (providers.get(value.id)?.token === token) providers.delete(value.id);
        for (const attempt of inFlight.values())
          if (attempt.token === token) attempt.controller.abort();
      };
    },
    async post(botSlug, grantId, requestId, text) {
      const value = grant(botSlug, grantId);
      if (value.origin === 'implicit' || provider(value.providerId).provider.post === undefined)
        throw new MessagingError('capability-unavailable');
      return service.send(botSlug, grantId, requestId, text, undefined, undefined, true);
    },
    inspectIntent(botSlug, intentId) {
      const value = readIntent(intentId);
      if (value.botSlug !== botSlug) throw new MessagingError('intent-unavailable');
      const { requestId: _request, payloadHash: _hash, ...intent } = value;
      return intent;
    },
    history,
    async channelBridges(channelId) {
      const channel = database.read((db) => humanBridgeChannel(db, channelId));
      const snapshots = await Promise.all(channel.members.map((slug) => service.snapshot(slug)));
      const current = database.read((db) => humanBridgeChannel(db, channelId));
      const grants = snapshots.flatMap((snapshot, index) =>
        current.members.includes(channel.members[index]!)
          ? snapshot.grants.filter(
              (grant) => grant.platform === 'weixin' || grant.receiveScope?.kind !== 'dm',
            )
          : [],
      );
      const source = (g: MessagingSnapshot['grants'][number]) => ({
        grantId: g.id,
        grantRevision: g.revision,
        botSlug: g.botSlug,
        platform: g.platform,
        accountName: g.accountName,
        conversationName: g.targetName,
        ordinaryDelivery: g.ordinaryDelivery ?? ('unverified' as const),
        defaultRevision: service.defaults(g.platform).revision,
      });
      return {
        channelId,
        canTargetInbox: current.type === 'dm',
        bridges: grants.flatMap((g) =>
          channelBridgeRoutes(g)
            .filter(
              (route) =>
                route.channelId === channelId ||
                (current.type === 'dm' && route.channelId === null && g.origin !== 'implicit'),
            )
            .map((route) => ({
              ...source(g),
              ...route,
              routeId: route.id,
              delivery: route.channelId === null ? ('inbox' as const) : ('channel' as const),
              collection:
                route.collectionInheritance === 'inherit'
                  ? service.defaults(g.platform).collection
                  : route.collection,
              defaultRevision: service.defaults(g.platform).revision,
              availability: g.availability,
              reception: route.enabled ? g.reception : ('off' as const),
            })),
        ),
        sources: grants
          .filter((g) => !g.revokedAt && g.availability === 'available' && g.canReceive)
          .map(source),
      };
    },
    deletionDependencies(botSlug) {
      return database.read((db) => ({
        identities: db
          .prepare(
            'SELECT id FROM messaging_bindings WHERE bot_slug = ? AND revoked_at IS NULL ORDER BY id',
          )
          .all(botSlug)
          .map((row) => String(row['id'])),
        grants: db
          .prepare(
            'SELECT id FROM messaging_grants WHERE bot_slug = ? AND revoked_at IS NULL ORDER BY id',
          )
          .all(botSlug)
          .map((row) => String(row['id'])),
      }));
    },
    async disableBot(botSlug) {
      const dependencies = service.deletionDependencies(botSlug);
      for (const id of dependencies.grants) service.revoke(botSlug, id);
      database.transaction(
        (db) => {
          db.prepare(
            'UPDATE messaging_bindings SET enabled = 0, enabled_inherited = 0, revision = revision + 1 WHERE bot_slug = ? AND revoked_at IS NULL',
          ).run(botSlug);
        },
        ['bindings', 'grants', 'bot-inbox'],
      );
      await Promise.all(dependencies.identities.map((id) => bounded(inbound.reconcileBinding(id))));
    },
    async apps() {
      const accounts = (
        await Promise.allSettled(
          [...providers.values()].map(async (entry) =>
            (await bounded(entry.provider.accounts())).map((account) => ({
              ...account,
              providerId: entry.provider.id,
            })),
          ),
        )
      ).flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
      const bindings = database.read((db) =>
        db
          .prepare(
            'SELECT id, bot_slug, provider_id, account_ref, fingerprint FROM messaging_bindings WHERE revoked_at IS NULL',
          )
          .all(),
      ) as {
        id: string;
        bot_slug: string;
        provider_id: string;
        account_ref: string;
        fingerprint: string;
      }[];
      return accounts.map((account) => {
        const bound = bindings.find(
          (b) =>
            b.provider_id === account.providerId &&
            (b.account_ref === account.ref || b.fingerprint === account.fingerprint),
        );
        return bound ? { ...account, boundBotSlug: bound.bot_slug, bindingId: bound.id } : account;
      });
    },
    async setups() {
      return (
        await Promise.allSettled(
          [...providers.values()].map(async ({ provider }) => {
            const setup = await bounded(provider.setup?.() ?? Promise.resolve(undefined));
            return setup ? { ...setup, providerId: provider.id } : undefined;
          }),
        )
      ).flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
    },
    async snapshot(botSlug) {
      const accounts = await service.apps();
      const appSetups = await service.setups();
      const rows = database.read((db) =>
        db
          .prepare('SELECT body FROM messaging_grants WHERE bot_slug = ? ORDER BY created_at DESC')
          .all(botSlug),
      ) as unknown as { body: string }[];
      const identityRows = database.read((db) =>
        db
          .prepare(
            'SELECT id FROM messaging_bindings WHERE bot_slug = ? AND revoked_at IS NULL ORDER BY created_at',
          )
          .all(botSlug),
      ) as { id: string }[];
      const identities: MessagingIdentityView[] = await Promise.all(
        identityRows.map(async ({ id }) => {
          const value = binding(id);
          let availability: MessagingIdentityView['availability'] = value.enabled
            ? 'unavailable'
            : 'paused';
          if (value.enabled) {
            try {
              await inspectIdentity(value);
              availability = 'available';
            } catch (error) {
              if (error instanceof MessagingError && error.code === 'rebind-required')
                availability = 'rebind-required';
            }
          }
          const latest = binding(id);
          if (latest.revision !== value.revision)
            availability = latest.enabled ? 'unavailable' : 'paused';
          const scopes = rows
            .map((r) => JSON.parse(r.body) as MessagingGrant)
            .filter((g) => g.bindingId === id && !g.revokedAt);
          return {
            ...latest,
            availability,
            reception:
              availability === 'available'
                ? inbound.pairingReception(id)
                : availability === 'paused'
                  ? ('off' as const)
                  : ('unavailable' as const),
            grantCount: scopes.length,
            scopes: scopes.map((g) => g.targetName),
            ...(latest.platform === 'weixin'
              ? {
                  typing: {
                    supported: accounts.some(
                      (account) =>
                        account.providerId === latest.providerId &&
                        account.ref === latest.accountRef &&
                        account.fingerprint === latest.fingerprint &&
                        account.typingSupported === true,
                    ),
                    ...typing.state(id),
                  },
                }
              : {}),
          };
        }),
      );
      const grants = await Promise.all(
        rows.map(async (row) => {
          const value = JSON.parse(row.body) as MessagingGrant;
          let availability: 'available' | 'unavailable' | 'rebind-required' = 'unavailable';
          let canReceive = false;
          let canPost = false;
          if (value.revokedAt === undefined) {
            try {
              const checked = await check(value);
              canPost =
                value.origin !== 'implicit' &&
                checked.provider.post !== undefined &&
                checked.inspected.target.receiveScope !== undefined;
              canReceive =
                checked.provider.consume !== undefined &&
                checked.provider.reply !== undefined &&
                checked.inspected.target.receiveScope !== undefined;
              availability = 'available';
            } catch (error) {
              if (error instanceof MessagingError && error.code === 'rebind-required')
                availability = 'rebind-required';
            }
          }
          const current = grant(botSlug, value.id);
          const lastMessageAt =
            current.origin === 'implicit'
              ? (
                  database.read((db) =>
                    db
                      .prepare(
                        "SELECT max(created_at) AS at FROM source_events WHERE source_kind = 'bridge-message' AND json_extract(payload_json, '$.external.grantId') = ?",
                      )
                      .get(current.id),
                  ) as { at: string | null }
                ).at
              : null;
          return {
            ...current,
            ...(lastMessageAt ? { lastMessageAt } : {}),
            availability,
            reception: inbound.status(value.id),
            canReceive,
            canPost,
            ...(current.revokedAt === undefined &&
            !current.suspendedReason &&
            options.isBotActive(botSlug) &&
            current.receiveScope?.kind !== 'dm' &&
            current.platform !== 'weixin'
              ? {
                  groupPolicy: inbound.policy(botSlug, value.id),
                  threadPolicies: inbound.threads(botSlug, value.id),
                  ordinaryDelivery: inbound.ordinaryDelivery(value.id),
                }
              : {}),
          };
        }),
      );
      const channelTargets = database.read((db) => {
        const rows = db.prepare('SELECT channel_id FROM channel_records').all() as {
          channel_id: string;
        }[];
        return rows.flatMap(({ channel_id }) => {
          try {
            const channel = bridgeChannel(db, channel_id, botSlug, true);
            return channel.type === 'group' ? [{ id: channel.id, name: channel.name }] : [];
          } catch (error) {
            if (error instanceof MessagingError) return [];
            throw error;
          }
        });
      });
      const intents = history(botSlug);
      const setupRows = database.read((db) =>
        db
          .prepare(`SELECT source_event_id FROM source_events
          WHERE bot_slug = ? AND source_kind = 'bridge-message'
          AND instr(body, '[BH-LARK-SETUP]') > 0
          ORDER BY created_at DESC, source_event_id DESC LIMIT 20`)
          .all(botSlug),
      ) as { source_event_id: string }[];
      const receipts: NonNullable<MessagingSnapshot['setup']>['receipts'] = [];
      for (const row of setupRows) {
        try {
          const source = inbound.read(botSlug, row.source_event_id);
          const current = grants.find((g) => g.id === source.grantId);
          if (
            source.platform !== 'feishu' ||
            !source.event.mentionedAccount ||
            current?.availability !== 'available' ||
            current.revokedAt ||
            current.reception !== 'receiving' ||
            current.receiveScope?.conversationId !== source.event.conversation.id ||
            !source.event.reply.threadId
          )
            continue;
          const setupReply = database.read((db) =>
            db
              .prepare('SELECT body FROM messaging_outbox WHERE bot_slug = ? AND request_id = ?')
              .get(botSlug, `reply-${source.id}`),
          ) as { body: string } | undefined;
          const candidate = setupReply ? (JSON.parse(setupReply.body) as OutboxIntent) : undefined;
          const intent =
            candidate?.sourceEventId === source.id &&
            candidate.grantId === current.id &&
            candidate.reply?.route.threadId === source.event.reply.threadId &&
            candidate.text.trim() === 'LARK-SETUP-OK'
              ? candidate
              : undefined;
          receipts.push({
            sourceEventId: source.id,
            grantId: current.id,
            messageId: source.event.messageId,
            conversationId: source.event.conversation.id,
            threadId: source.event.reply.threadId,
            at: source.at,
            ...(intent ? { replyState: intent.state } : {}),
            ...(intent?.receipt?.conversationId === source.event.conversation.id
              ? { replyMessageId: intent.receipt.messageId }
              : {}),
            echoObserved:
              intent?.state === 'provider-accepted' &&
              !!intent.echo &&
              intent.receipt?.conversationId === source.event.conversation.id,
          });
        } catch (error) {
          if (!(error instanceof MessagingError)) throw error;
        }
      }
      const qqIdentities = identities.filter((identity) => identity.platform === 'qq');
      const observedAt = now();
      const observations = closed
        ? []
        : database.read((db) =>
            qqIdentities.filter((identity) =>
              receptionObservationDue(db, identity, receptionHostId, observedAt),
            ),
          );
      if (observations.length)
        transaction((db) => {
          for (const identity of observations)
            if (readMessagingIdentity(db, identity.id).revision === identity.revision)
              observeReception(db, identity, receptionHostId, observedAt);
        });
      return {
        ...(qqIdentities.length
          ? { receptionHistory: database.read((db) => receptionHistory(db, botSlug)) }
          : {}),
        accounts,
        appSetups,
        feedback: database.read((db) =>
          (
            db
              .prepare(`SELECT s.source_event_id, s.payload_json, g.binding_id
          FROM source_events s JOIN inbox_admissions a USING(source_event_id)
          JOIN messaging_grants g ON g.id = json_extract(s.payload_json, '$.external.grantId')
          WHERE a.bot_slug = ? AND json_type(s.payload_json, '$.feedback') = 'object'
          ORDER BY s.created_at DESC, s.source_event_id DESC LIMIT 30`)
              .all(botSlug) as {
              source_event_id: string;
              payload_json: string;
              binding_id: string;
            }[]
          ).map((row) => ({
            sourceEventId: row.source_event_id,
            bindingId: row.binding_id,
            attempts: (JSON.parse(row.payload_json) as { feedback: SourceFeedback }).feedback,
          })),
        ),
        identities,
        roles: database.read((db) => externalUserRoles(db, botSlug)),
        senderPolicy: database.read((db) => readSenderPolicy(db, botSlug)),
        pairings: pairing.list(botSlug),
        approvals: approvals.snapshot(botSlug),
        pairingReceivers: identities
          .filter((i) => i.platform === 'feishu' && !i.revokedAt)
          .map((i) => ({ name: i.name, status: i.reception ?? 'unavailable' })),
        grants,
        heldConversations: database.read((db) =>
          identities.flatMap((identity) => listHeld(db, identity.id)),
        ),
        blockedConversations: database
          .read((db) => listBlocks(db, botSlug))
          .map((block) => {
            const owner = identities.find((identity) => identity.fingerprint === block.fingerprint);
            return owner ? { ...block, bindingId: owner.id } : block;
          }),
        channelTargets,
        intents,
        setup: {
          providerReady: [...providers.values()].some(
            ({ provider }) =>
              provider.id === 'dsh-im/feishu' && !!provider.consume && !!provider.reply,
          ),
          receipts,
        },
      };
    },
    async targets(providerId, accountRef) {
      return provider(providerId).provider.targets(accountRef);
    },
    async authorize(input) {
      active(input.botSlug);
      const entry = provider(input.providerId);
      const inspected = await entry.provider.inspect(input.accountRef, input.targetRef);
      current(input.providerId, entry.token);
      if (
        inspected.account.ref !== input.accountRef ||
        !inspected.account.connected ||
        inspected.account.fingerprint !== input.fingerprint ||
        inspected.target.ref !== input.targetRef ||
        inspected.target.digest !== input.targetDigest
      )
        throw new MessagingError('rebind-required');
      let createdBinding: string | undefined;
      const authorized = transaction(
        (db) => {
          createdBinding = undefined;
          active(input.botSlug);
          const existing = db
            .prepare(
              'SELECT id FROM messaging_bindings WHERE revoked_at IS NULL AND provider_id = ? AND (account_ref = ? OR fingerprint = ?)',
            )
            .get(input.providerId, input.accountRef, input.fingerprint);
          let reusable: MessagingIdentity | undefined;
          if (existing !== undefined) {
            reusable = readMessagingIdentity(db, (existing as { id: string }).id);
            if (
              reusable.botSlug !== input.botSlug ||
              reusable.providerId !== input.providerId ||
              reusable.accountRef !== input.accountRef ||
              reusable.fingerprint !== input.fingerprint ||
              !reusable.enabled
            )
              throw new MessagingError('binding-conflict');
            const duplicate = db
              .prepare(
                "SELECT id FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL AND json_extract(body, '$.targetRef') = ?",
              )
              .get(reusable.id, input.targetRef);
            if (duplicate) throw new MessagingError('binding-conflict');
          }
          const at = now();
          const bindingId = reusable?.id ?? randomUUID();
          const id = randomUUID();
          const value: MessagingGrant = {
            ...input,
            id,
            bindingId,
            accountName: inspected.account.name,
            platform: inspected.account.platform,
            targetName: inspected.target.name,
            revision: 1,
            createdAt: at,
            origin: 'explicit',
          };
          if (!reusable)
            db.prepare(
              'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name, enabled_inherited, typing_inherited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ).run(
              bindingId,
              input.botSlug,
              input.providerId,
              value.platform,
              input.accountRef,
              value.fingerprint,
              at,
              inspected.account.name,
              messagingDefaultsPlatform.safeParse(value.platform).success ? 1 : 0,
              value.platform === 'weixin' ? 1 : 0,
            );
          if (!reusable && readMessagingIdentity(db, bindingId).enabled)
            createdBinding = value.platform;
          db.prepare(
            'INSERT INTO messaging_grants (id, binding_id, bot_slug, revision, created_at, body) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(id, bindingId, input.botSlug, 1, at, JSON.stringify(value));
          return value;
        },
        ['bindings', 'grants'],
      );
      if (createdBinding !== undefined) connectorEnabled(createdBinding);
      return authorized;
    },
    revoke(botSlug, grantId) {
      transaction(
        (db) => {
          const value = grant(botSlug, grantId);
          if (value.revokedAt !== undefined) return;
          const revokedAt = now();
          db.prepare('UPDATE messaging_grants SET body = ?, revoked_at = ? WHERE id = ?').run(
            JSON.stringify({ ...value, revokedAt }),
            revokedAt,
            grantId,
          );

          revokePendingIntents(db, grantId, revokedAt);
        },
        ['grants', 'bindings', 'outbox'],
      );
      inbound.revoke(grantId);
      typing.invalidate((candidate) => candidate.grantId === grantId);
      for (const attempt of inFlight.values())
        if (attempt.fileGrantId === grantId) attempt.controller.abort();
    },
    async conversation(botSlug, input) {
      active(botSlug);
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
    async send(botSlug, grantId, requestId, text, sourceEventId, file, report = false) {
      active(botSlug);
      if (
        (report && (sourceEventId !== undefined || file !== undefined)) ||
        (file !== undefined && sourceEventId === undefined) ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(requestId) ||
        !text.trim() ||
        text.length > 4000
      )
        throw new MessagingError('invalid-input');
      const payloadHash = createHash('sha256')
        .update(
          file === undefined
            ? sourceEventId === undefined
              ? report
                ? JSON.stringify(['report', text])
                : text
              : JSON.stringify([text, sourceEventId])
            : JSON.stringify([text, sourceEventId, file]),
        )
        .digest('hex');
      const duplicate = database.read((db) =>
        db.prepare('SELECT id FROM messaging_outbox WHERE request_id = ?').get(requestId),
      ) as { id: string } | undefined;
      if (duplicate) {
        const value = readIntent(duplicate.id);
        if (
          value.botSlug !== botSlug ||
          value.grantId !== grantId ||
          value.payloadHash !== payloadHash
        )
          throw new MessagingError('request-conflict');
        return value;
      }
      const acceptedGrant = grant(botSlug, grantId);
      const source =
        sourceEventId === undefined
          ? undefined
          : sourceForReply(botSlug, sourceEventId, acceptedGrant);
      if (file && source?.grantId !== grantId) throw new MessagingError('capability-unavailable');
      if (acceptedGrant.origin === 'implicit' && source === undefined)
        throw new MessagingError('capability-unavailable');
      const acceptedEntry = await check(acceptedGrant);
      const acceptedIdentity = acceptedEntry.identityRevision;
      const replyRoute =
        sourceEventId !== undefined && file === undefined
          ? await qualifyReply(
              botSlug,
              sourceEventId,
              acceptedGrant,
              acceptedEntry,
              AbortSignal.timeout(options.timeoutMs ?? 15000),
            )
          : undefined;
      const conversationId = acceptedEntry.inspected.target.receiveScope?.conversationId;
      if (report && !conversationId) throw new MessagingError('capability-unavailable');
      const id = transaction(
        (db) => {
          active(botSlug);
          enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
          const currentGrant = grant(botSlug, grantId);
          if (
            currentGrant.revokedAt !== undefined ||
            currentGrant.revision !== acceptedGrant.revision
          )
            throw new MessagingError('grant-revoked');
          if (sourceEventId !== undefined) sourceForReply(botSlug, sourceEventId, currentGrant);
          const existing = db
            .prepare('SELECT id FROM messaging_outbox WHERE request_id = ?')
            .get(requestId) as { id: string } | undefined;
          if (existing) return { id: existing.id, created: false };
          const value: StoredIntent = {
            id: randomUUID(),
            botSlug,
            grantId,
            grantRevision: currentGrant.revision,
            requestId,
            payloadHash,
            ...(sourceEventId === undefined ? {} : { sourceEventId }),
            ...(report
              ? {
                  report: {
                    providerId: currentGrant.providerId,
                    accountRef: currentGrant.accountRef,
                    fingerprint: currentGrant.fingerprint,
                    platform: currentGrant.platform,
                    accountName: currentGrant.accountName,
                    targetName: currentGrant.targetName,
                    conversationId: conversationId!,
                  },
                }
              : {}),
            ...(replyRoute
              ? {
                  reply: {
                    providerId: currentGrant.providerId,
                    accountRef: currentGrant.accountRef,
                    fingerprint: currentGrant.fingerprint,
                    platform: currentGrant.platform,
                    accountName: currentGrant.accountName,
                    targetName: currentGrant.targetName,
                    conversationId: replyRoute.conversationId,
                    route: replyRoute,
                  },
                }
              : {}),
            ...(file === undefined ? {} : { file }),
            text,
            state: 'pending',
            createdAt: now(),
          };
          db.prepare(
            'INSERT INTO messaging_outbox (id, bot_slug, grant_id, request_id, state, created_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            value.id,
            botSlug,
            grantId,
            requestId,
            value.state,
            value.createdAt,
            JSON.stringify(value),
          );
          return { id: value.id, created: true };
        },
        ['outbox'],
      );
      if (!id.created) {
        const value = readIntent(id.id);
        if (
          value.botSlug !== botSlug ||
          value.grantId !== grantId ||
          value.payloadHash !== payloadHash
        )
          throw new MessagingError('request-conflict');
        return value;
      }
      const beganAt = Date.now();
      let started = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const controller = new AbortController();
      try {
        const entry = await check(grant(botSlug, grantId));
        transaction(
          (db) => {
            active(botSlug);
            current(acceptedGrant.providerId, entry.token);
            enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
            const value = grant(botSlug, grantId);
            if (value.revokedAt !== undefined || value.revision !== acceptedGrant.revision)
              throw new MessagingError('grant-revoked');
            const intent = readIntent(id.id);
            if (intent.state !== 'pending') throw new MessagingError('grant-revoked');
            const at = now();
            db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
              'in-flight',
              JSON.stringify({ ...intent, state: 'in-flight' }),
              id.id,
            );
            db.prepare(
              'INSERT INTO messaging_outbox_attempts (intent_id, started_at, state) VALUES (?, ?, ?)',
            ).run(id.id, at, 'in-flight');
          },
          ['outbox'],
        );
        if (sourceEventId !== undefined) sourceForReply(botSlug, sourceEventId, acceptedGrant);
        started = true;
        options.warn?.(
          JSON.stringify({
            event: 'messaging-outbox',
            phase: 'starting',
            initiator: report
              ? 'bot-external-post'
              : sourceEventId === undefined
                ? 'human-profile'
                : 'bot-source-reply',
            intentId: id.id,
          }),
        );
        inFlight.set(id.id, {
          providerId: acceptedGrant.providerId,
          token: entry.token,
          controller,
          ...(file === undefined ? {} : { fileGrantId: acceptedGrant.id }),
        });
        const interrupted = new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => reject(new MessagingProviderError('provider-interrupted', 'unknown')),
            { once: true },
          );
          timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
        });
        const result = await Promise.race([
          file !== undefined && sourceEventId !== undefined
            ? (async () => {
                if (entry.provider.replyFile === undefined || options.attachments === undefined)
                  throw new MessagingProviderError('capability-unavailable', 'not-started');
                const result = await replyFileBytes(options.attachments, file, controller.signal);
                try {
                  await check(grant(botSlug, grantId));
                } catch (error) {
                  throw new MessagingProviderError(
                    error instanceof MessagingError ? error.code : 'grant-unavailable',
                    'not-started',
                  );
                }
                if (!inbound.available(botSlug, sourceEventId))
                  throw new MessagingProviderError('source-unavailable', 'not-started');
                return entry.provider.replyFile({
                  accountRef: acceptedGrant.accountRef,
                  fingerprint: acceptedGrant.fingerprint,
                  route: inbound.read(botSlug, sourceEventId).event.reply,
                  file: { id: id.id, ...result },
                  signal: controller.signal,
                  beforeSend: () => {
                    try {
                      active(botSlug);
                      current(acceptedGrant.providerId, entry.token);
                      enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
                      const latest = grant(botSlug, grantId);
                      if (latest.revokedAt || latest.revision !== acceptedGrant.revision)
                        return false;
                      sourceForReply(botSlug, sourceEventId, latest);
                      return !controller.signal.aborted;
                    } catch {
                      return false;
                    }
                  },
                });
              })()
            : sourceEventId !== undefined
              ? entry.provider.reply === undefined
                ? Promise.reject(
                    new MessagingProviderError('capability-unavailable', 'not-started'),
                  )
                : (async () => {
                    let route: MessagingReplyRoute;
                    try {
                      route = await qualifyReply(
                        botSlug,
                        sourceEventId,
                        acceptedGrant,
                        entry,
                        controller.signal,
                      );
                      await check(grant(botSlug, grantId));
                      enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
                      const latest = grant(botSlug, grantId);
                      if (latest.revokedAt || latest.revision !== acceptedGrant.revision)
                        throw new MessagingError('grant-revoked');
                      sourceForReply(botSlug, sourceEventId, latest);
                      if (
                        [
                          'messageId',
                          'conversationId',
                          'actorId',
                          'threadId',
                          'rootId',
                          'parentId',
                        ].some((key) => Reflect.get(route, key) !== Reflect.get(replyRoute!, key))
                      )
                        throw new MessagingError('stale-route');
                    } catch (error) {
                      throw new MessagingProviderError(
                        error instanceof MessagingError ? error.code : 'source-unavailable',
                        'not-started',
                      );
                    }
                    return entry.provider.reply!({
                      accountRef: acceptedGrant.accountRef,
                      fingerprint: acceptedGrant.fingerprint,
                      route,
                      text,
                      signal: controller.signal,
                      beforeSend: () => {
                        try {
                          active(botSlug);
                          current(acceptedGrant.providerId, entry.token);
                          enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
                          const latest = grant(botSlug, grantId);
                          if (latest.revokedAt || latest.revision !== acceptedGrant.revision)
                            return false;
                          sourceForReply(botSlug, sourceEventId, latest);
                          return !controller.signal.aborted;
                        } catch {
                          return false;
                        }
                      },
                    });
                  })()
              : report
                ? entry.provider.post === undefined
                  ? Promise.reject(
                      new MessagingProviderError('capability-unavailable', 'not-started'),
                    )
                  : entry.provider.post({
                      accountRef: acceptedGrant.accountRef,
                      targetRef: acceptedGrant.targetRef,
                      fingerprint: acceptedGrant.fingerprint,
                      targetDigest: acceptedGrant.targetDigest,
                      conversationId: conversationId!,
                      text,
                      signal: controller.signal,
                      beforeSend: () => {
                        try {
                          active(botSlug);
                          current(acceptedGrant.providerId, entry.token);
                          enabledBinding(acceptedGrant.bindingId, acceptedIdentity);
                          const latest = grant(botSlug, grantId);
                          return (
                            !controller.signal.aborted &&
                            !latest.revokedAt &&
                            latest.revision === acceptedGrant.revision
                          );
                        } catch {
                          return false;
                        }
                      },
                    })
                : entry.provider.send({
                    accountRef: acceptedGrant.accountRef,
                    targetRef: acceptedGrant.targetRef,
                    fingerprint: acceptedGrant.fingerprint,
                    targetDigest: acceptedGrant.targetDigest,
                    text,
                    signal: controller.signal,
                  }),
          interrupted,
        ]);
        if (result.accepted !== true)
          throw new MessagingProviderError('provider-result-unknown', 'unknown');
        const receipt = 'receipt' in result ? (result.receipt as MessagingReceipt) : undefined;
        if (
          (report || (source !== undefined && source.grantId !== grantId)) &&
          (receipt?.version !== 1 ||
            typeof receipt.messageId !== 'string' ||
            !receipt.messageId ||
            receipt.messageId.length > 512 ||
            receipt.conversationId !== (replyRoute?.conversationId ?? conversationId!))
        )
          throw new MessagingProviderError('provider-result-unknown', 'unknown');
        return settle(id.id, 'provider-accepted', undefined, receipt);
      } catch (error) {
        const definite =
          !started ||
          (error instanceof MessagingProviderError && error.disposition === 'not-started');
        const reason =
          error instanceof MessagingError || error instanceof MessagingProviderError
            ? error.code
            : 'provider-result-unknown';
        const state =
          reason === 'grant-revoked' && !started
            ? 'grant-revoked'
            : definite
              ? 'failed'
              : 'unknown-outcome';
        return settle(id.id, state, reason);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        inFlight.delete(id.id);
        const value = readIntent(id.id);
        options.warn?.(
          JSON.stringify({
            event: 'messaging-outbox',
            intentId: id.id,
            phase: 'settled',
            durationMs: Date.now() - beganAt,
            state: value.state,
            reason: value.reason,
          }),
        );
      }
    },
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
