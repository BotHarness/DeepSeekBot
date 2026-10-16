import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  MessagingAttachment,
  MessagingOwnEcho,
  MessagingReceipt,
  MessagingInboundEvent,
  MessagingReplyRoute,
  MessagingHistoryQuery,
  MessagingHistoryPage,
  MessagingApprovalCard,
  MessagingPairingCard,
  MessagingApprovalAck,
  MessagingTypingState,
  MessagingTypingLease,
} from './provider.js';
import { mentionTags } from './mention-text.js';
import { MessagingError, MessagingProviderError, type MessagingProvider } from './provider.js';

interface DshImTarget {
  targetId: string;
  name?: string;
  kind: string;
  route: Record<string, string | number>;
}

export interface DshImOutboundService {
  contractVersion: 1;
  setupVersion?: 1;
  describeSetup?(channel: string): Promise<unknown> | unknown;
  reactionVersion?: 1;
  reactionChecked?(
    botId: string,
    route: MessagingReplyRoute,
    reaction: 'received' | 'answered',
    options: { expectedFingerprint: string; signal: AbortSignal; beforeSend(): boolean },
  ): Promise<{ accepted: true }>;
  approvalCardVersion?: 1;
  approvalRuleCardVersion?: 1 | 2;
  pairingCardVersion?: 1;
  approvalCardChecked?(
    botId: string,
    route: MessagingReplyRoute | MessagingReceipt,
    card: MessagingApprovalCard | MessagingPairingCard,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      beforeSend(): boolean;
      update?: boolean;
    },
  ): Promise<{ sent?: true; updated?: true; receipt?: MessagingReceipt }>;
  fileVersion?: 1;
  replyContextVersion?: 1;
  replyReceiptVersion?: 1;
  replyFenceVersion?: 1;
  receiptVersion?: 1;
  postFenceVersion?: 1;
  reachableConversationVersion?: 1;
  listReachableConversations?(
    botId: string,
    options: { expectedFingerprint: string; signal: AbortSignal; cursor?: string },
  ): Promise<import('./provider.js').MessagingReachablePage>;
  postConversationChecked?(
    botId: string,
    conversationId: string,
    text: string,
    options: { expectedFingerprint: string; signal: AbortSignal; beforeSend: () => boolean },
  ): Promise<{ sent: true; receipt: MessagingReceipt }>;
  typingVersion?: 1;
  beginTypingChecked?(
    botId: string,
    route: MessagingReplyRoute,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      beforeSend(): boolean;
      onState(state: MessagingTypingState): void;
    },
  ): Promise<MessagingTypingLease>;
  echoVersion?: 1;
  readSourceFile?(
    botId: string,
    route: MessagingReplyRoute,
    attachment: MessagingAttachment,
    options: { expectedFingerprint: string; signal: AbortSignal },
  ): Promise<AsyncIterable<Uint8Array>>;
  replyFileChecked?(
    botId: string,
    route: MessagingReplyRoute,
    file: { id: string; name: string; bytes: Uint8Array; mediaType?: string },
    options: { expectedFingerprint: string; signal: AbortSignal; beforeSend?: () => boolean },
  ): Promise<{ sent: true; receipt?: MessagingReceipt }>;

  listBots(): Promise<{ botId: string; channel: string }[]>;
  listTargets(botId: string): Promise<DshImTarget[]>;
  describeBot(botId: string): Promise<{
    version: 1;
    channel: string;
    botId: string;
    account: { fingerprint: string; name?: string };
    connected: boolean;
    capabilities: string[];
  }>;
  consumeInbound?(
    botId: string,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      sourceFiles?: boolean;
      sourceImages?: boolean;
      sourceVoiceTranscripts?: boolean;
      sourceVoiceAudio?: boolean;
      sourceVideos?: boolean;
      sourceQuotes?: boolean;
      ordinaryText?: boolean;
      onAction?(event: unknown, context: { signal: AbortSignal }): Promise<MessagingApprovalAck>;
      onEcho?(event: unknown, context: { signal: AbortSignal }): Promise<{ accepted: true }>;
      onEvent(event: unknown, context: { signal: AbortSignal }): Promise<{ accepted: true }>;
    },
  ): Promise<() => void>;
  qualifyReplyChecked?(
    botId: string,
    route: MessagingReplyRoute,
    options: { expectedFingerprint: string; signal: AbortSignal },
  ): Promise<MessagingReplyRoute>;
  replyChecked?(
    botId: string,
    route: MessagingReplyRoute,
    text: string,
    options: {
      expectedFingerprint: string;
      signal: AbortSignal;
      receipt?: true;
      beforeSend?: () => boolean;
      mentionUserIds?: string[];
    },
  ): Promise<{ sent: true; receipt?: MessagingReceipt }>;
  historyChecked?(
    botId: string,
    route: MessagingReplyRoute,
    query: MessagingHistoryQuery,
    options: { expectedFingerprint: string; signal: AbortSignal },
  ): Promise<MessagingHistoryPage>;
  sendChecked(
    botId: string,
    targetId: string,
    text: string,
    options: {
      expectedFingerprint: string;
      expectedTargetDigest: string;
      signal: AbortSignal;
      format: 'plain';
      receipt?: true;
      beforeSend?: () => boolean;
    },
  ): Promise<{ sent: true; receipt?: MessagingReceipt }>;
}

function targetDigest(target: DshImTarget): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        kind: target.kind,
        route: Object.fromEntries(
          Object.entries(target.route).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        ),
      }),
    )
    .digest('hex');
}

const identifier = z.string().min(1).max(512);
const inboundSchema = z
  .object({
    version: z.literal(1),
    channel: z.enum(['feishu', 'slack', 'discord', 'weixin', 'qq']),
    botId: identifier,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    eventId: identifier,
    messageId: identifier,
    actor: z
      .object({ kind: z.literal('user'), id: identifier, name: identifier.optional() })
      .strict()
      .transform(({ name, ...actor }) => ({ ...actor, ...(name === undefined ? {} : { name }) })),
    conversation: z
      .object({ kind: z.enum(['group', 'dm']), id: identifier, name: identifier.optional() })
      .strict()
      .transform(({ name, ...conversation }) => ({
        ...conversation,
        ...(name === undefined ? {} : { name }),
      })),
    mentions: z
      .array(
        z
          .object({ id: identifier, key: identifier, name: identifier.optional() })
          .strict()
          .transform(({ name, ...mention }) => ({
            ...mention,
            ...(name === undefined ? {} : { name }),
          })),
      )
      .max(100),
    mentionedAccount: z.boolean(),
    attachments: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-f0-9]{64}$/),
            messageId: identifier,
            resourceKey: identifier,
            name: identifier,
            sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
            mediaType: z
              .string()
              .regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/)
              .max(127)
              .optional(),
          })
          .strict(),
      )
      .max(32)
      .optional(),
    contentParts: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('text'), text: z.string().max(16000) }).strict(),
          z
            .object({ kind: z.literal('attachment'), id: z.string().regex(/^[a-f0-9]{64}$/) })
            .strict(),
        ]),
      )
      .max(256)
      .optional(),
    voice: z
      .object({
        transcript: z.enum(['platform', 'unavailable']),
        itemId: identifier.optional(),
        durationMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
        encodeType: z.number().int().nonnegative().max(1000000).optional(),
        sampleRate: z.number().int().nonnegative().max(1000000).optional(),
        bitsPerSample: z.number().int().nonnegative().max(1000000).optional(),
      })
      .strict()
      .optional(),
    video: z
      .object({
        itemId: identifier.optional(),
        reportedSizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
        playLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
      })
      .strict()
      .optional(),
    quote: z
      .object({
        serverMessageId: identifier.optional(),
        itemId: identifier.optional(),
        text: z.string().max(16000).optional(),
        summary: z.string().max(16000).optional(),
        attachmentKind: z.enum(['image', 'audio', 'file', 'video']).optional(),
        partial: z
          .object({
            start: z.string().max(16000),
            end: z.string().max(16000),
            startIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            endIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            digest: z.string().max(128),
          })
          .strict()
          .refine((partial) => partial.endIndex >= partial.startIndex)
          .optional(),
      })
      .strict()
      .optional(),
    at: z.iso.datetime(),
    text: z.string().min(1).max(16000),
    reply: z
      .object({
        messageId: identifier,
        conversationId: identifier,
        actorId: identifier,
        threadId: identifier.optional(),
        rootId: identifier.optional(),
        parentId: identifier.optional(),
      })
      .strict(),
    replay: z
      .object({
        kind: z.literal('provider-redelivery'),
        resumeCursor: z.literal(false),
        gapPossible: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .refine(
    (event) =>
      !event.voice ||
      ((event.channel === 'weixin' || event.channel === 'qq') &&
        (!event.attachments?.length ||
          (event.attachments.length === 1 &&
            event.attachments[0]?.mediaType?.startsWith('audio/')))),
    {
      message: 'Invalid voice source',
    },
  );

function providerFailure(error: unknown): MessagingProviderError {
  if (error instanceof MessagingProviderError) return error;
  const code =
    error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'provider-result-unknown';
  const definite = [
    'unknown-bot',
    'unknown-target',
    'account-changed',
    'account-unverified',
    'target-changed',
    'capability-unavailable',
    'bot-not-connected',
    'bad-request',
    'stale-route',
    'source-not-found',
    'source-unavailable',
    'cancelled',
    'reply-permission-denied',
    'reply-window-expired',
    'reply-limit-exceeded',
    'reply-rate-limited',
    'consumer-unavailable',
    'file-upload-failed',
    'file-provider-rejected',
    'card-provider-rejected',
    'private-context-unavailable',
    'private-context-rejected',
    'send-permission-denied',
    'send-preflight-unavailable',
    'send-rate-limited',
    'target-rejected',
    'reaction-permission-denied',
    'reaction-provider-rejected',
  ].includes(code);
  return new MessagingProviderError(
    definite ? code : 'provider-result-unknown',
    definite ? 'not-started' : 'unknown',
  );
}

export function createDshImProvider(
  value: unknown,
  platform: 'feishu' | 'slack' | 'discord' | 'weixin' | 'qq' = 'feishu',
): MessagingProvider | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const service = value as Partial<DshImOutboundService>;
  if (
    service.contractVersion !== 1 ||
    typeof service.describeBot !== 'function' ||
    typeof service.sendChecked !== 'function' ||
    typeof service.listBots !== 'function' ||
    typeof service.listTargets !== 'function'
  )
    return undefined;
  const host = service as DshImOutboundService;
  const allOpaqueAccounts = new Map<string, string>();
  const rememberRuleCapability = (
    ref: string,
    info: Awaited<ReturnType<DshImOutboundService['describeBot']>>,
  ) => {
    if (
      platform === 'feishu' &&
      info.version === 1 &&
      info.botId === ref &&
      info.channel === platform &&
      host.approvalRuleCardVersion === 2 &&
      info.connected &&
      info.capabilities.includes('approval-rule-card-checked') &&
      info.capabilities.includes('approval-rule-all-opaque-card-checked')
    )
      allOpaqueAccounts.set(ref, info.account.fingerprint);
    else allOpaqueAccounts.delete(ref);
  };
  const describe = async (ref: string) => {
    let info;
    try {
      info = await host.describeBot(ref);
    } catch (error) {
      const code =
        error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
      throw new MessagingError(
        code === 'account-changed' ? 'rebind-required' : 'provider-unavailable',
      );
    }
    if (
      info.version !== 1 ||
      info.botId !== ref ||
      info.channel !== platform ||
      !/^[a-f0-9]{64}$/.test(info.account?.fingerprint ?? '')
    )
      throw new MessagingError('provider-incompatible');
    rememberRuleCapability(ref, info);
    return {
      ref,
      platform: info.channel,
      name: info.account.name ?? ref,
      fingerprint: info.account.fingerprint,
      connected: info.connected,
      ...(platform === 'qq' || platform === 'weixin'
        ? {
            postSupported:
              host.receiptVersion === 1 &&
              [
                'proactive-text-checked',
                'proactive-receipt-checked',
                'proactive-fence-checked',
              ].every((capability) => info.capabilities.includes(capability)),
          }
        : {}),
      ...(['feishu', 'slack'].includes(platform)
        ? {
            reactionSupported:
              host.reactionVersion === 1 &&
              typeof host.reactionChecked === 'function' &&
              info.capabilities.includes('reaction-write-checked'),
          }
        : {}),
      ...(platform === 'weixin' &&
      host.typingVersion === 1 &&
      typeof host.beginTypingChecked === 'function' &&
      info.capabilities.includes('typing-lifecycle-checked')
        ? { typingSupported: true }
        : {}),
      ...(info.capabilities.includes('proactive-text-checked') ||
      (platform === 'qq' &&
        host.replyContextVersion === 1 &&
        host.replyReceiptVersion === 1 &&
        host.replyFenceVersion === 1 &&
        typeof host.consumeInbound === 'function' &&
        typeof host.qualifyReplyChecked === 'function' &&
        typeof host.replyChecked === 'function' &&
        [
          'exclusive-text-consumer',
          'reply-text-checked',
          'reply-context-checked',
          'reply-receipt-checked',
          'reply-fence-checked',
        ].every((capability) => info.capabilities.includes(capability)))
        ? {}
        : { unsupported: 'checked-send' as const }),
    };
  };
  const account = async (ref: string) => {
    const value = await describe(ref);
    if (value.unsupported) throw new MessagingError('provider-incompatible');
    return value;
  };
  const targets = async (ref: string) =>
    (await host.listTargets(ref)).map((target) => ({
      ref: target.targetId,
      name: target.name ?? target.targetId,
      digest: targetDigest(target),
      ...((platform === 'feishu' &&
        target.kind === 'group' &&
        typeof target.route.chatId === 'string') ||
      (platform === 'slack' &&
        target.kind === 'conversation' &&
        typeof target.route.channelId === 'string') ||
      (platform === 'discord' &&
        target.kind === 'channel' &&
        typeof target.route.channelId === 'string') ||
      (platform === 'qq' && target.kind === 'group' && typeof target.route.groupOpenId === 'string')
        ? {
            receiveScope: {
              kind: 'group' as const,
              conversationId: String(
                platform === 'feishu'
                  ? target.route.chatId
                  : platform === 'qq'
                    ? target.route.groupOpenId
                    : target.route.channelId,
              ),
            },
          }
        : platform === 'feishu' &&
            target.kind === 'user' &&
            typeof target.route.openId === 'string' &&
            /^ou_[A-Za-z0-9]+$/.test(target.route.openId) &&
            typeof target.route.chatId === 'string' &&
            /^oc_[A-Za-z0-9]+$/.test(target.route.chatId)
          ? { receiveScope: { kind: 'dm' as const, conversationId: target.route.chatId } }
          : platform === 'weixin' &&
              target.kind === 'user' &&
              typeof target.route.toUserId === 'string'
            ? { receiveScope: { kind: 'dm' as const, conversationId: target.route.toUserId } }
            : {}),
    }));
  return {
    id: `dsh-im/${platform}`,
    ...(host.setupVersion === 1 &&
    typeof host.describeSetup === 'function' &&
    (platform === 'feishu' || platform === 'weixin')
      ? {
          async setup() {
            const raw = await host.describeSetup!(platform);
            if (!raw || typeof raw !== 'object') return undefined;
            const descriptor = raw as Record<string, unknown>;
            const kind = platform === 'feishu' ? 'credentials' : 'qr';
            if (
              descriptor['version'] !== 1 ||
              descriptor['channel'] !== platform ||
              descriptor['endpoint'] !== 'dsh-im/app-setup' ||
              descriptor['kind'] !== kind
            )
              return undefined;
            return { version: 1 as const, platform, endpoint: 'dsh-im/app-setup' as const, kind };
          },
        }
      : {}),
    async accounts() {
      const bots = (await host.listBots()).filter((bot) => bot.channel === platform);
      const result = await Promise.allSettled(bots.map((bot) => describe(bot.botId)));
      return result.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : []));
    },
    targets,
    ...(['feishu', 'slack'].includes(platform) &&
    host.reactionVersion === 1 &&
    typeof host.reactionChecked === 'function'
      ? {
          async react(input: Parameters<NonNullable<MessagingProvider['react']>>[0]) {
            input.signal.throwIfAborted();
            const info = await host.describeBot(input.accountRef);
            if (info.account.fingerprint !== input.fingerprint)
              throw new MessagingProviderError('account-changed', 'not-started');
            if (!info.connected || !info.capabilities.includes('reaction-write-checked'))
              throw new MessagingProviderError('capability-unavailable', 'not-started');
            try {
              const result = await host.reactionChecked!(
                input.accountRef,
                input.route,
                input.reaction,
                {
                  expectedFingerprint: input.fingerprint,
                  signal: input.signal,
                  beforeSend: input.beforeSend,
                },
              );
              if (result?.accepted !== true)
                throw new MessagingProviderError('provider-result-unknown', 'unknown');
              return { accepted: true as const };
            } catch (error) {
              throw providerFailure(error);
            }
          },
        }
      : {}),
    ...(platform === 'weixin' &&
    host.typingVersion === 1 &&
    typeof host.beginTypingChecked === 'function'
      ? {
          async beginTyping(input: Parameters<NonNullable<MessagingProvider['beginTyping']>>[0]) {
            input.signal.throwIfAborted();
            const info = await host.describeBot(input.accountRef);
            if (info.account.fingerprint !== input.fingerprint)
              throw new MessagingError('rebind-required');
            if (!info.connected || !info.capabilities.includes('typing-lifecycle-checked'))
              throw new MessagingError('capability-unavailable');
            try {
              const result = await host.beginTypingChecked!(input.accountRef, input.route, {
                expectedFingerprint: input.fingerprint,
                signal: input.signal,
                beforeSend: input.beforeSend,
                onState(state) {
                  const parsed = z
                    .object({
                      phase: z.enum(['idle', 'requesting', 'accepted', 'cleanup-unconfirmed']),
                      reason: z
                        .enum([
                          'completed',
                          'cancelled',
                          'disposed',
                          'maximum-duration',
                          'renewal-refused',
                          'typing-unavailable',
                        ])
                        .optional(),
                    })
                    .safeParse(state);
                  if (parsed.success)
                    input.onState({
                      phase: parsed.data.phase,
                      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
                    });
                },
              });
              if (result?.accepted !== true || typeof result.stop !== 'function')
                throw new MessagingError('provider-incompatible');
              return result;
            } catch (error) {
              throw new MessagingError(
                error instanceof MessagingError
                  ? error.code
                  : input.signal.aborted
                    ? 'cancelled'
                    : 'typing-unavailable',
              );
            }
          },
        }
      : {}),
    inspectAccount: account,
    async inspect(accountRef, targetRef) {
      const current = await account(accountRef);
      const target = (await targets(accountRef)).find((item) => item.ref === targetRef);
      if (target === undefined) throw new MessagingError('provider-unavailable');
      return { account: current, target };
    },
    ...(platform === 'feishu' &&
    host.approvalCardVersion === 1 &&
    typeof host.approvalCardChecked === 'function'
      ? {
          async approvalCard(input: Parameters<NonNullable<MessagingProvider['approvalCard']>>[0]) {
            input.signal.throwIfAborted();
            const info = await host.describeBot(input.accountRef);
            rememberRuleCapability(input.accountRef, info);
            if (info.account.fingerprint !== input.fingerprint)
              throw new MessagingError('rebind-required');
            if (
              !info.connected ||
              (input.card.kind !== 'pairing' &&
                (input.card.rules || input.card.ruleConfirmation) &&
                (![1, 2].includes(host.approvalRuleCardVersion ?? 0) ||
                  !info.capabilities.includes('approval-rule-card-checked'))) ||
              (input.card.kind !== 'pairing' &&
                (input.card.rules?.some((kind) => kind === 'all-opaque') ||
                  input.card.ruleConfirmation?.kind === 'all-opaque') &&
                (host.approvalRuleCardVersion !== 2 ||
                  !info.capabilities.includes('approval-rule-all-opaque-card-checked'))) ||
              (input.card.kind === 'pairing' &&
                (host.pairingCardVersion !== 1 ||
                  !info.capabilities.includes('pairing-card-checked'))) ||
              ![
                'approval-card-checked',
                'approval-card-update-checked',
                'approval-action-consumer',
              ].every((cap) => info.capabilities.includes(cap))
            )
              throw new MessagingProviderError('capability-unavailable', 'not-started');
            try {
              const result = await host.approvalCardChecked!(
                input.accountRef,
                input.route,
                input.card,
                {
                  expectedFingerprint: input.fingerprint,
                  signal: input.signal,
                  beforeSend: input.beforeSend,
                  ...(input.update ? { update: true } : {}),
                },
              );
              if (input.update) {
                if (result.updated !== true)
                  throw new MessagingProviderError('provider-result-unknown', 'unknown');
                return { updated: true as const };
              }
              if (
                result.sent !== true ||
                result.receipt?.version !== 1 ||
                !result.receipt.messageId ||
                result.receipt.conversationId !== input.route.conversationId
              )
                throw new MessagingProviderError('provider-result-unknown', 'unknown');
              return { sent: true as const, receipt: result.receipt };
            } catch (error) {
              throw providerFailure(error);
            }
          },
          approvalRuleCardSupported: [1, 2].includes(host.approvalRuleCardVersion ?? 0),
          approvalRuleAllOpaqueCardSupported: (ref: string, fingerprint: string) =>
            host.approvalRuleCardVersion === 2 && allOpaqueAccounts.get(ref) === fingerprint,
        }
      : {}),
    ...(host.replyContextVersion === 1 &&
    host.replyReceiptVersion === 1 &&
    host.replyFenceVersion === 1 &&
    typeof host.qualifyReplyChecked === 'function'
      ? {
          async qualifyReply(input: Parameters<NonNullable<MessagingProvider['qualifyReply']>>[0]) {
            input.signal.throwIfAborted();
            const info = await host.describeBot(input.accountRef);
            if (info.account.fingerprint !== input.fingerprint)
              throw new MessagingError('rebind-required');
            if (
              !info.connected ||
              !['reply-context-checked', 'reply-receipt-checked', 'reply-fence-checked'].every(
                (capability) => info.capabilities.includes(capability),
              )
            )
              throw new MessagingError('capability-unavailable');
            let raw;
            try {
              raw = await host.qualifyReplyChecked!(input.accountRef, input.route, {
                expectedFingerprint: input.fingerprint,
                signal: input.signal,
              });
            } catch (error) {
              const code =
                error !== null && typeof error === 'object' && 'code' in error
                  ? error.code
                  : undefined;
              throw new MessagingError(
                typeof code === 'string' &&
                  [
                    'reply-permission-denied',
                    'reply-window-expired',
                    'reply-limit-exceeded',
                    'reply-rate-limited',
                    'source-not-found',
                    'source-unavailable',
                    'stale-route',
                    'account-changed',
                    'capability-unavailable',
                    'cancelled',
                  ].includes(code)
                  ? code
                  : 'source-unavailable',
              );
            }
            input.signal.throwIfAborted();
            const route = z
              .object({
                messageId: identifier,
                conversationId: identifier,
                actorId: identifier,
                threadId: identifier.optional(),
                rootId: identifier.optional(),
                parentId: identifier.optional(),
              })
              .strict()
              .parse(raw);
            if (
              route.messageId !== input.route.messageId ||
              route.conversationId !== input.route.conversationId ||
              route.threadId !== input.route.threadId ||
              route.rootId !== input.route.rootId ||
              route.parentId !== input.route.parentId
            )
              throw new MessagingError('stale-route');
            return {
              messageId: route.messageId,
              conversationId: route.conversationId,
              actorId: route.actorId,
              ...(route.threadId === undefined ? {} : { threadId: route.threadId }),
              ...(route.rootId === undefined ? {} : { rootId: route.rootId }),
              ...(route.parentId === undefined ? {} : { parentId: route.parentId }),
            };
          },
        }
      : {}),
    ...(typeof host.consumeInbound === 'function' && typeof host.replyChecked === 'function'
      ? {
          async consume(input: Parameters<NonNullable<MessagingProvider['consume']>>[0]) {
            const info = await host.describeBot(input.accountRef);
            rememberRuleCapability(input.accountRef, info);
            if (
              info.account.fingerprint !== input.fingerprint ||
              !info.capabilities.includes('exclusive-text-consumer') ||
              !info.capabilities.includes('reply-text-checked')
            )
              throw new MessagingError('provider-incompatible');
            const sourceImages =
              (platform === 'weixin' || platform === 'feishu' || platform === 'qq') &&
              host.fileVersion === 1 &&
              info.capabilities.includes('source-image-checked') &&
              (platform === 'feishu' || info.capabilities.includes('reply-image-fence-checked'));
            const sourceFiles =
              host.fileVersion === 1 &&
              info.capabilities.includes('source-file-checked') &&
              info.capabilities.includes('reply-file-checked') &&
              (platform !== 'weixin' || info.capabilities.includes('reply-file-fence-checked')) &&
              (platform !== 'qq' ||
                (info.capabilities.includes('source-generic-file-checked') &&
                  info.capabilities.includes('reply-file-fence-checked')));
            return host.consumeInbound!(input.accountRef, {
              expectedFingerprint: input.fingerprint,
              signal: input.signal,
              ...(info.capabilities.includes('ordinary-text-consumer')
                ? { ordinaryText: true }
                : {}),
              ...(sourceFiles ? { sourceFiles: true } : {}),
              ...(sourceImages ? { sourceImages: true } : {}),
              ...(platform === 'weixin' && info.capabilities.includes('source-quote-checked')
                ? { sourceQuotes: true }
                : {}),
              ...((platform === 'weixin' || platform === 'qq') &&
              info.capabilities.includes('source-voice-transcript-checked')
                ? { sourceVoiceTranscripts: true }
                : {}),
              ...((platform === 'weixin' || platform === 'qq') &&
              host.fileVersion === 1 &&
              info.capabilities.includes('source-voice-audio-checked')
                ? { sourceVoiceAudio: true }
                : {}),
              ...(platform === 'weixin' &&
              host.fileVersion === 1 &&
              info.capabilities.includes('source-video-checked') &&
              info.capabilities.includes('reply-video-fence-checked')
                ? { sourceVideos: true }
                : {}),
              ...(platform === 'feishu' &&
              host.approvalCardVersion === 1 &&
              info.capabilities.includes('approval-action-consumer') &&
              input.onAction
                ? {
                    onAction: async (raw: unknown, context: { signal: AbortSignal }) => {
                      const event = (
                        typeof raw === 'object' &&
                        raw !== null &&
                        'kind' in raw &&
                        raw.kind === 'approval-rule'
                          ? z
                              .object({
                                kind: z.literal('approval-rule'),
                                version: z.literal(1),
                                channel: z.literal('feishu'),
                                botId: identifier,
                                fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
                                actorId: identifier,
                                conversationId: identifier,
                                messageId: identifier,
                                requestId: z.string().uuid(),
                                action: z.enum([
                                  'preview-exact',
                                  'confirm-exact',
                                  'preview-all-opaque',
                                  'confirm-all-opaque',
                                  'cancel-rule',
                                ]),
                                confirmationId: z.string().uuid().optional(),
                              })
                              .strict()
                          : typeof raw === 'object' &&
                              raw !== null &&
                              'kind' in raw &&
                              raw.kind === 'pairing'
                            ? z
                                .object({
                                  kind: z.literal('pairing'),
                                  version: z.literal(1),
                                  channel: z.literal('feishu'),
                                  botId: identifier,
                                  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
                                  actorId: identifier,
                                  conversationId: identifier,
                                  messageId: identifier,
                                  requestId: z.string().uuid(),
                                  action: z.enum([
                                    'select-role',
                                    'approve-pairing',
                                    'reject-pairing',
                                    'next-roles',
                                    'previous-roles',
                                  ]),
                                  roleId: z.string().uuid().optional(),
                                })
                                .strict()
                            : z
                                .object({
                                  version: z.literal(1),
                                  channel: z.literal('feishu'),
                                  botId: identifier,
                                  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
                                  actorId: identifier,
                                  conversationId: identifier,
                                  messageId: identifier,
                                  requestId: z.string().uuid(),
                                  action: z.enum(['allowed-once', 'rejected']),
                                })
                                .strict()
                      ).parse(raw);
                      context.signal.throwIfAborted();
                      if (
                        'kind' in event &&
                        event.kind === 'approval-rule' &&
                        (![1, 2].includes(host.approvalRuleCardVersion ?? 0) ||
                          !info.capabilities.includes('approval-rule-card-checked') ||
                          (['preview-all-opaque', 'confirm-all-opaque'].includes(event.action) &&
                            (host.approvalRuleCardVersion !== 2 ||
                              !info.capabilities.includes(
                                'approval-rule-all-opaque-card-checked',
                              ))))
                      )
                        throw new MessagingError('capability-unavailable');
                      if (
                        event.botId !== input.accountRef ||
                        event.fingerprint !== input.fingerprint
                      )
                        throw new MessagingError('untrusted-source');
                      return input.onAction!(event, context.signal);
                    },
                  }
                : {}),
              ...(host.echoVersion === 1 &&
              info.capabilities.includes('own-text-echo') &&
              input.onEcho
                ? {
                    onEcho: async (raw: unknown, context: { signal: AbortSignal }) => {
                      const event: MessagingOwnEcho = z
                        .object({
                          version: z.literal(1),
                          botId: z.string().min(1).max(512),
                          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
                          eventId: z.string().min(1).max(512),
                          messageId: z.string().min(1).max(512),
                          conversationId: z.string().min(1).max(512),
                          text: z.string().min(1).max(16000),
                          at: z.iso.datetime(),
                        })
                        .parse(raw);
                      context.signal.throwIfAborted();
                      if (
                        event.botId !== input.accountRef ||
                        event.fingerprint !== input.fingerprint
                      )
                        throw new MessagingError('untrusted-source');
                      return input.onEcho!(event, context.signal);
                    },
                  }
                : {}),
              onEvent: async (raw, context) => {
                const parsed = inboundSchema.parse(raw);
                const qqAttachments = parsed.attachments?.every((item) =>
                  item.mediaType?.startsWith('image/')
                    ? sourceImages
                    : parsed.voice && item.mediaType === 'audio/unknown'
                      ? host.fileVersion === 1 &&
                        info.capabilities.includes('source-voice-audio-checked')
                      : sourceFiles && item.mediaType === 'application/octet-stream',
                );
                if (
                  parsed.channel !== platform ||
                  (platform === 'qq' &&
                    (parsed.conversation.kind !== 'group' ||
                      parsed.reply.threadId !== undefined ||
                      parsed.reply.rootId !== undefined ||
                      parsed.reply.parentId !== undefined ||
                      ((parsed.attachments?.length ?? 0) > 0 && !qqAttachments))) ||
                  ((parsed.contentParts ||
                    (parsed.attachments?.length ?? 0) > 1 ||
                    (platform === 'feishu' &&
                      parsed.attachments?.some((item) => item.mediaType?.startsWith('image/')))) &&
                    (platform === 'qq'
                      ? !qqAttachments
                      : platform !== 'feishu' ||
                        !info.capabilities.includes('source-image-checked') ||
                        !parsed.attachments?.every((item) =>
                          item.mediaType?.startsWith('image/'),
                        ))) ||
                  new Set(parsed.attachments?.map((item) => item.id)).size !==
                    (parsed.attachments?.length ?? 0) ||
                  parsed.contentParts?.some(
                    (part) =>
                      part.kind === 'attachment' &&
                      !parsed.attachments?.some((item) => item.id === part.id),
                  ) ||
                  (parsed.quote &&
                    (platform !== 'weixin' ||
                      !info.capabilities.includes('source-quote-checked'))) ||
                  (parsed.voice &&
                    !info.capabilities.includes('source-voice-transcript-checked')) ||
                  (parsed.voice &&
                    parsed.attachments?.length &&
                    !info.capabilities.includes('source-voice-audio-checked')) ||
                  (parsed.video &&
                    (platform !== 'weixin' ||
                      !info.capabilities.includes('source-video-checked') ||
                      !info.capabilities.includes('reply-video-fence-checked') ||
                      parsed.attachments?.length !== 1 ||
                      parsed.attachments[0]?.mediaType !== 'video/unknown'))
                )
                  throw new MessagingError('untrusted-source');
                if (
                  parsed.contentParts &&
                  (parsed.contentParts
                    .filter((part) => part.kind === 'text')
                    .reduce((length, part) => length + part.text.length, 0) > 16000 ||
                    parsed.attachments?.some(
                      (item) =>
                        !parsed.contentParts!.some(
                          (part) => part.kind === 'attachment' && part.id === item.id,
                        ),
                    ))
                )
                  throw new MessagingError('untrusted-source');
                const { threadId, rootId, parentId, ...required } = parsed.reply;
                const { attachments, voice, video, quote, contentParts, ...base } = parsed;
                const event: MessagingInboundEvent = {
                  ...base,
                  ...(contentParts ? { contentParts } : {}),
                  ...(quote === undefined
                    ? {}
                    : {
                        quote: Object.fromEntries(
                          Object.entries(quote).filter(([, value]) => value !== undefined),
                        ),
                      }),
                  ...(voice === undefined
                    ? {}
                    : {
                        voice: {
                          transcript: voice.transcript,
                          ...(voice.encodeType === undefined
                            ? {}
                            : { encodeType: voice.encodeType }),
                          ...(voice.sampleRate === undefined
                            ? {}
                            : { sampleRate: voice.sampleRate }),
                          ...(voice.bitsPerSample === undefined
                            ? {}
                            : { bitsPerSample: voice.bitsPerSample }),
                          ...(voice.itemId === undefined ? {} : { itemId: voice.itemId }),
                          ...(voice.durationMs === undefined
                            ? {}
                            : { durationMs: voice.durationMs }),
                        },
                      }),
                  ...(video === undefined
                    ? {}
                    : {
                        video: Object.fromEntries(
                          Object.entries(video).filter(([, value]) => value !== undefined),
                        ),
                      }),
                  ...(attachments === undefined
                    ? {}
                    : {
                        attachments: attachments.map(({ sizeBytes, mediaType, ...file }) => ({
                          ...file,
                          ...(sizeBytes === undefined ? {} : { sizeBytes }),
                          ...(mediaType === undefined ? {} : { mediaType }),
                        })),
                      }),
                  reply: {
                    ...required,
                    ...(threadId === undefined ? {} : { threadId }),
                    ...(rootId === undefined ? {} : { rootId }),
                    ...(parentId === undefined ? {} : { parentId }),
                  },
                };
                context.signal.throwIfAborted();
                if (
                  event.botId !== input.accountRef ||
                  event.fingerprint !== input.fingerprint ||
                  event.reply.messageId !== event.messageId ||
                  event.reply.conversationId !== event.conversation.id ||
                  event.reply.actorId !== event.actor.id ||
                  event.attachments?.some(
                    (item) =>
                      item.messageId !==
                      (platform === 'feishu' && !item.mediaType?.startsWith('image/')
                        ? event.reply.parentId
                        : event.messageId),
                  )
                )
                  throw new MessagingError('untrusted-source');
                return input.onEvent(event, context.signal);
              },
            }).catch((error: unknown) => {
              const code =
                error !== null && typeof error === 'object' && 'code' in error
                  ? error.code
                  : undefined;
              if (code === 'provider-unavailable' || code === 'bot-not-connected')
                throw new MessagingError('provider-unavailable');
              throw error;
            });
          },
          async reply(input: Parameters<NonNullable<MessagingProvider['reply']>>[0]) {
            try {
              const tags =
                platform === 'slack' || platform === 'discord'
                  ? mentionTags(input.text)
                  : { mentions: [], render: () => input.text };
              const checkedMentions =
                tags.mentions.length > 0 &&
                (await host.describeBot(input.accountRef)).capabilities.includes(
                  'reply-mention-checked',
                );
              const text =
                tags.mentions.length === 0
                  ? input.text
                  : tags.render((mention) =>
                      checkedMentions ? `<@${mention.id}>` : `@${mention.name || mention.id}`,
                    );
              const result = await host.replyChecked!(input.accountRef, input.route, text, {
                expectedFingerprint: input.fingerprint,
                signal: input.signal,
                ...(checkedMentions
                  ? { mentionUserIds: [...new Set(tags.mentions.map((mention) => mention.id))] }
                  : {}),
                ...(host.replyReceiptVersion === 1 ? { receipt: true as const } : {}),
                ...(host.replyFenceVersion === 1 && input.beforeSend
                  ? { beforeSend: input.beforeSend }
                  : {}),
              });
              if (result.sent !== true)
                throw new MessagingProviderError('provider-result-unknown', 'unknown');
              if (host.replyReceiptVersion === 1) {
                const receipt = z
                  .object({
                    version: z.literal(1),
                    messageId: identifier,
                    conversationId: identifier,
                    identityKind: z.literal('client-acknowledgement').optional(),
                  })
                  .strict()
                  .safeParse(result.receipt);
                if (
                  !receipt.success ||
                  receipt.data.conversationId !== input.route.conversationId ||
                  (platform === 'weixin'
                    ? receipt.data.identityKind !== 'client-acknowledgement'
                    : receipt.data.identityKind !== undefined)
                )
                  throw new MessagingProviderError('provider-result-unknown', 'unknown');
                return {
                  accepted: true as const,
                  receipt: {
                    version: 1 as const,
                    messageId: receipt.data.messageId,
                    conversationId: receipt.data.conversationId,
                    ...(receipt.data.identityKind
                      ? { identityKind: receipt.data.identityKind }
                      : {}),
                  },
                };
              }
              return { accepted: true as const };
            } catch (error) {
              throw providerFailure(error);
            }
          },
        }
      : {}),
    ...(typeof host.historyChecked === 'function'
      ? {
          async history(input: Parameters<NonNullable<MessagingProvider['history']>>[0]) {
            input.signal.throwIfAborted();
            const info = await host.describeBot(input.accountRef);
            if (info.account.fingerprint !== input.fingerprint)
              throw new MessagingError('rebind-required');
            if (
              !info.capabilities.includes('history-text-checked') ||
              (input.query.scope === 'thread' &&
                !info.capabilities.includes('thread-history-text-checked'))
            )
              throw new MessagingError('history-capability-unavailable');
            let raw;
            try {
              raw = await host.historyChecked!(input.accountRef, input.route, input.query, {
                expectedFingerprint: input.fingerprint,
                signal: input.signal,
              });
            } catch (error) {
              const code =
                error !== null && typeof error === 'object' && 'code' in error
                  ? error.code
                  : undefined;
              throw new MessagingError(
                typeof code === 'string' &&
                  [
                    'history-permission-denied',
                    'history-unavailable',
                    'thread-unavailable',
                    'stale-route',
                    'account-changed',
                    'capability-unavailable',
                    'cancelled',
                  ].includes(code)
                  ? code
                  : 'history-unavailable',
              );
            }
            input.signal.throwIfAborted();
            const parsed = z
              .object({
                version: z.literal(1),
                scope: z.enum(['group', 'nearby', 'thread']),
                events: z.array(inboundSchema).max(20),
                omitted: z.number().int().min(0).max(20),
                hasMore: z.boolean(),
                nextCursor: z.string().min(1).max(4096).optional(),
                window: z
                  .object({ start: z.number().int(), end: z.number().int() })
                  .strict()
                  .optional(),
                coverage: z.literal('provider-visible-human-text'),
              })
              .strict()
              .parse(raw);
            if (
              parsed.scope !== input.query.scope ||
              parsed.events.length + parsed.omitted > input.query.limit ||
              parsed.hasMore !== (parsed.nextCursor !== undefined)
            )
              throw new MessagingError('untrusted-source');
            for (const event of parsed.events) {
              if (
                event.channel !== platform ||
                event.botId !== input.accountRef ||
                event.fingerprint !== input.fingerprint ||
                event.conversation.kind !== 'group' ||
                event.conversation.id !== input.route.conversationId ||
                event.reply.conversationId !== event.conversation.id ||
                event.reply.messageId !== event.messageId ||
                event.reply.actorId !== event.actor.id ||
                (input.query.scope === 'thread' && event.reply.threadId !== input.route.threadId)
              )
                throw new MessagingError('untrusted-source');
            }
            return parsed as MessagingHistoryPage;
          },
        }
      : {}),
    ...(host.fileVersion === 1 &&
    typeof host.readSourceFile === 'function' &&
    typeof host.replyFileChecked === 'function'
      ? {
          async readFile(input: Parameters<NonNullable<MessagingProvider['readFile']>>[0]) {
            const info = await host.describeBot(input.accountRef);
            if (
              info.account.fingerprint !== input.fingerprint ||
              !info.capabilities.includes('source-file-checked') ||
              (platform === 'qq' &&
                !input.attachment.mediaType?.startsWith('image/') &&
                (input.attachment.mediaType === 'audio/unknown'
                  ? !info.capabilities.includes('source-voice-audio-checked')
                  : !info.capabilities.includes('source-generic-file-checked') ||
                    !info.capabilities.includes('reply-file-fence-checked')))
            )
              throw new MessagingError('provider-incompatible');
            return host.readSourceFile!(input.accountRef, input.route, input.attachment, {
              expectedFingerprint: input.fingerprint,
              signal: input.signal,
            });
          },
          async replyFile(input: Parameters<NonNullable<MessagingProvider['replyFile']>>[0]) {
            try {
              const info = await host.describeBot(input.accountRef);
              if (
                info.account.fingerprint !== input.fingerprint ||
                !info.capabilities.includes('reply-file-checked') ||
                ((platform === 'weixin' ||
                  (platform === 'qq' && !input.file.mediaType?.startsWith('image/'))) &&
                  !info.capabilities.includes('reply-file-fence-checked')) ||
                ((platform === 'weixin' || platform === 'qq') &&
                  input.file.mediaType?.startsWith('image/') &&
                  !info.capabilities.includes('reply-image-fence-checked')) ||
                (platform === 'weixin' &&
                  input.file.mediaType?.startsWith('video/') &&
                  !info.capabilities.includes('reply-video-fence-checked'))
              )
                throw new MessagingProviderError('capability-unavailable', 'not-started');
              const receiptChecked = info.capabilities.includes('reply-file-receipt-checked');
              if (platform === 'qq' && !receiptChecked)
                throw new MessagingProviderError('capability-unavailable', 'not-started');
              const result = await host.replyFileChecked!(
                input.accountRef,
                input.route,
                platform === 'weixin' || platform === 'qq'
                  ? input.file
                  : { id: input.file.id, name: input.file.name, bytes: input.file.bytes },
                {
                  expectedFingerprint: input.fingerprint,
                  signal: input.signal,
                  ...(input.beforeSend === undefined ? {} : { beforeSend: input.beforeSend }),
                },
              );
              if (result.sent !== true)
                throw new MessagingProviderError('provider-result-unknown', 'unknown');
              if (receiptChecked) {
                const receipt = z
                  .object({
                    version: z.literal(1),
                    messageId: identifier,
                    conversationId: identifier,
                    identityKind: z.literal('client-acknowledgement').optional(),
                  })
                  .strict()
                  .safeParse(result.receipt);
                if (
                  !receipt.success ||
                  receipt.data.conversationId !== input.route.conversationId ||
                  (platform === 'weixin'
                    ? receipt.data.identityKind !== 'client-acknowledgement'
                    : receipt.data.identityKind !== undefined)
                )
                  throw new MessagingProviderError('provider-result-unknown', 'unknown');
                return {
                  accepted: true as const,
                  receipt: {
                    version: 1 as const,
                    messageId: receipt.data.messageId,
                    conversationId: receipt.data.conversationId,
                    ...(receipt.data.identityKind === undefined
                      ? {}
                      : { identityKind: receipt.data.identityKind }),
                  },
                };
              }
              return { accepted: true as const };
            } catch (error) {
              throw providerFailure(error);
            }
          },
        }
      : {}),
    ...((platform === 'feishu' || platform === 'discord' || platform === 'slack') &&
    host.reachableConversationVersion === 1 &&
    typeof host.listReachableConversations === 'function' &&
    typeof host.postConversationChecked === 'function'
      ? {
          async reachable(input: Parameters<NonNullable<MessagingProvider['reachable']>>[0]) {
            input.signal.throwIfAborted();
            const info = await host.describeBot(input.accountRef);
            if (info.account.fingerprint !== input.fingerprint)
              throw new MessagingError('rebind-required');
            if (!info.capabilities.includes('reachable-conversations-checked'))
              throw new MessagingError('capability-unavailable');
            const page = await host.listReachableConversations!(input.accountRef, {
              expectedFingerprint: input.fingerprint,
              signal: input.signal,
              ...(input.cursor ? { cursor: input.cursor } : {}),
            });
            if (
              page?.version !== 1 ||
              !Array.isArray(page.conversations) ||
              page.conversations.length > 100 ||
              typeof page.hasMore !== 'boolean' ||
              (page.hasMore &&
                (typeof page.cursor !== 'string' || !page.cursor || page.cursor.length > 2048))
            )
              throw new MessagingError('provider-incompatible');
            return {
              version: 1 as const,
              conversations: page.conversations.map((value) => {
                if (
                  typeof value?.id !== 'string' ||
                  !value.id ||
                  value.id.length > 512 ||
                  value.kind !== 'group' ||
                  typeof value.name !== 'string' ||
                  value.name.length > 512
                )
                  throw new MessagingError('provider-incompatible');
                return { id: value.id, kind: value.kind, name: value.name };
              }),
              hasMore: page.hasMore,
              ...(page.hasMore ? { cursor: page.cursor! } : {}),
            };
          },
          async postConversation(
            input: Parameters<NonNullable<MessagingProvider['postConversation']>>[0],
          ) {
            try {
              input.signal.throwIfAborted();
              const info = await host.describeBot(input.accountRef);
              input.signal.throwIfAborted();
              if (info.account.fingerprint !== input.fingerprint)
                throw new MessagingProviderError('account-changed', 'not-started');
              if (!info.capabilities.includes('reachable-conversations-checked'))
                throw new MessagingProviderError('capability-unavailable', 'not-started');
            } catch (error) {
              if (error instanceof MessagingProviderError) throw error;
              throw new MessagingProviderError(
                input.signal.aborted ? 'cancelled' : 'provider-unavailable',
                'not-started',
              );
            }
            try {
              const result = await host.postConversationChecked!(
                input.accountRef,
                input.conversationId,
                input.text,
                {
                  expectedFingerprint: input.fingerprint,
                  signal: input.signal,
                  beforeSend: input.beforeSend,
                },
              );
              if (
                result?.sent !== true ||
                result.receipt?.version !== 1 ||
                result.receipt.conversationId !== input.conversationId ||
                typeof result.receipt.messageId !== 'string' ||
                !result.receipt.messageId ||
                result.receipt.messageId.length > 512
              )
                throw new MessagingProviderError('provider-result-unknown', 'unknown');
              return {
                accepted: true as const,
                receipt: {
                  version: 1 as const,
                  messageId: result.receipt.messageId,
                  conversationId: input.conversationId,
                },
              };
            } catch (error) {
              throw providerFailure(error);
            }
          },
        }
      : {}),
    ...((platform === 'feishu' ||
      platform === 'slack' ||
      platform === 'qq' ||
      platform === 'weixin') &&
    host.receiptVersion === 1
      ? {
          async post(input: Parameters<NonNullable<MessagingProvider['post']>>[0]) {
            input.signal.throwIfAborted();
            const info = await host.describeBot(input.accountRef);
            if (info.account.fingerprint !== input.fingerprint)
              throw new MessagingProviderError('account-changed', 'not-started');
            if (!info.capabilities.includes('proactive-receipt-checked'))
              throw new MessagingProviderError('capability-unavailable', 'not-started');
            if (platform === 'qq' && !info.capabilities.includes('proactive-text-checked'))
              throw new MessagingProviderError('capability-unavailable', 'not-started');
            if (
              (platform === 'weixin' || platform === 'qq') &&
              !info.capabilities.includes('proactive-fence-checked')
            )
              throw new MessagingProviderError('capability-unavailable', 'not-started');
            try {
              const result = await host.sendChecked(input.accountRef, input.targetRef, input.text, {
                expectedFingerprint: input.fingerprint,
                expectedTargetDigest: input.targetDigest,
                signal: input.signal,
                format: 'plain',
                receipt: true,
                ...(host.postFenceVersion === 1 ||
                info.capabilities.includes('proactive-fence-checked')
                  ? { beforeSend: input.beforeSend }
                  : {}),
              });
              const receipt = result.receipt;
              if (
                result.sent !== true ||
                receipt?.version !== 1 ||
                typeof receipt.messageId !== 'string' ||
                !receipt.messageId ||
                receipt.messageId.length > 512 ||
                receipt.conversationId !== input.conversationId ||
                (platform === 'weixin'
                  ? receipt.identityKind !== 'client-acknowledgement' ||
                    (receipt.serverMessageId !== undefined &&
                      (typeof receipt.serverMessageId !== 'string' ||
                        !/^\d{1,512}$/.test(receipt.serverMessageId)))
                  : receipt.identityKind !== undefined)
              )
                throw new MessagingProviderError('provider-result-unknown', 'unknown');
              return {
                accepted: true as const,
                receipt: {
                  version: 1 as const,
                  messageId: receipt.messageId,
                  conversationId: receipt.conversationId,
                  ...(receipt.identityKind ? { identityKind: receipt.identityKind } : {}),
                  ...(platform === 'weixin' && receipt.serverMessageId
                    ? { serverMessageId: receipt.serverMessageId }
                    : {}),
                },
              };
            } catch (error) {
              throw providerFailure(error);
            }
          },
        }
      : {}),
    async send(input) {
      try {
        if (platform === 'qq') {
          const info = await host.describeBot(input.accountRef);
          if (info.account.fingerprint !== input.fingerprint)
            throw new MessagingProviderError('account-changed', 'not-started');
          if (!info.capabilities.includes('proactive-text-checked'))
            throw new MessagingProviderError('capability-unavailable', 'not-started');
        }
        const result = await host.sendChecked(input.accountRef, input.targetRef, input.text, {
          expectedFingerprint: input.fingerprint,
          expectedTargetDigest: input.targetDigest,
          signal: input.signal,
          format: 'plain',
        });
        if (result.sent !== true)
          throw new MessagingProviderError('provider-result-unknown', 'unknown');
        return { accepted: true };
      } catch (error) {
        throw providerFailure(error);
      }
    },
  };
}
