import { createHash } from 'node:crypto';
import { z } from 'zod';
import { dshImInbound } from '../features/messaging/dsh-im-inbound.js';
import type { DshImOutboundService, DshImTarget } from '../features/messaging/dsh-im-types.js';
import { identifier, providerFailure } from '../features/messaging/dsh-im-validation.js';
import { MessagingError, MessagingProviderError, type MessagingProvider } from './provider.js';

export type { DshImOutboundService } from '../features/messaging/dsh-im-types.js';

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
      ...(['qq', 'weixin'].includes(platform)
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
    async inspect(accountRef, targetRef, checkedAccount) {
      const current = checkedAccount ?? (await account(accountRef));
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
    ...(platform === 'feishu' &&
    host.questionCardVersion === 1 &&
    typeof host.questionCardChecked === 'function'
      ? {
          async questionCard(input: Parameters<NonNullable<MessagingProvider['questionCard']>>[0]) {
            input.signal.throwIfAborted();
            const info = await host.describeBot(input.accountRef);
            if (info.account.fingerprint !== input.fingerprint)
              throw new MessagingError('rebind-required');
            if (
              !info.connected ||
              ![
                'question-card-checked',
                'question-card-update-checked',
                'question-action-consumer',
              ].every((cap) => info.capabilities.includes(cap))
            )
              throw new MessagingProviderError('capability-unavailable', 'not-started');
            try {
              const result = await host.questionCardChecked!(
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
    ...dshImInbound(host, platform, rememberRuleCapability),
    ...(host.fileVersion === 1 &&
    typeof host.readSourceFile === 'function' &&
    typeof host.replyFileChecked === 'function'
      ? {
          async readFile(input: Parameters<NonNullable<MessagingProvider['readFile']>>[0]) {
            const info = await host.describeBot(input.accountRef);
            if (
              info.account.fingerprint !== input.fingerprint ||
              !info.capabilities.includes('source-file-checked') ||
              (platform === 'feishu' &&
                input.attachment.mediaType === 'video/unknown' &&
                !info.capabilities.includes('source-video-checked')) ||
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
            if (
              (platform === 'qq' || platform === 'weixin') &&
              !info.capabilities.includes('proactive-text-checked')
            )
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
