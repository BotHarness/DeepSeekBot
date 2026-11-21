import { z } from 'zod';
import { mentionTags } from '../../messaging/mention-text.js';
import {
  MessagingError,
  MessagingProviderError,
  type MessagingCardAction,
  type MessagingHistoryPage,
  type MessagingInboundEvent,
  type MessagingOwnEcho,
  type MessagingProvider,
  type MessagingQuestionAction,
} from '../../messaging/provider.js';
import type { DshImOutboundService } from './dsh-im-types.js';
import { identifier, providerFailure } from './dsh-im-validation.js';

const inboundSchema = z
  .object({
    version: z.literal(1),
    channel: z.enum(['feishu', 'slack', 'discord', 'weixin', 'qq']),
    botId: identifier,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    eventId: identifier,
    messageId: identifier,
    actor: z
      .object({ kind: z.enum(['user', 'bot']), id: identifier, name: identifier.optional() })
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
        durationMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
        posterAttachmentId: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
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
      ((event.channel === 'weixin' ||
        event.channel === 'qq' ||
        (event.channel === 'feishu' && event.attachments?.length === 1)) &&
        (!event.attachments?.length ||
          (event.attachments.length === 1 &&
            event.attachments[0]?.mediaType?.startsWith('audio/')))),
    {
      message: 'Invalid voice source',
    },
  )
  .refine(
    (event) =>
      event.actor.kind === 'user' ||
      (event.conversation.kind === 'group' && event.mentionedAccount),
    { message: 'Bot senders are accepted only when they mention this account in a group' },
  );

function isLarkVideo(event: z.infer<typeof inboundSchema>, images: boolean): boolean {
  const video = event.video;
  const items = event.attachments ?? [];
  if (
    !video ||
    !event.mentionedAccount ||
    !event.reply.parentId ||
    event.reply.parentId === event.messageId ||
    event.contentParts ||
    event.voice ||
    video.playLength !== undefined ||
    video.reportedSizeBytes !== undefined ||
    items.length !== (video.posterAttachmentId === undefined ? 1 : 2)
  )
    return false;
  return (
    items.every((item) =>
      item.messageId !== event.reply.parentId
        ? false
        : item.id === video.itemId
          ? item.mediaType === 'video/unknown'
          : images && item.id === video.posterAttachmentId && item.mediaType === 'image/unknown',
    ) && items.some((item) => item.id === video.itemId)
  );
}

function isLarkVoice(event: z.infer<typeof inboundSchema>): boolean {
  const voice = event.voice;
  const item = event.attachments?.[0];
  return (
    voice !== undefined &&
    event.mentionedAccount &&
    !!event.reply.parentId &&
    event.reply.parentId !== event.messageId &&
    !event.contentParts &&
    !event.video &&
    voice.transcript === 'unavailable' &&
    voice.encodeType === undefined &&
    voice.sampleRate === undefined &&
    voice.bitsPerSample === undefined &&
    event.attachments?.length === 1 &&
    item !== undefined &&
    item.id === voice.itemId &&
    item.messageId === event.reply.parentId &&
    item.mediaType === 'audio/unknown'
  );
}

export function dshImInbound(
  host: DshImOutboundService,
  platform: 'feishu' | 'slack' | 'discord' | 'weixin' | 'qq',
  rememberRuleCapability: (
    ref: string,
    info: Awaited<ReturnType<DshImOutboundService['describeBot']>>,
  ) => void,
): Pick<MessagingProvider, 'consume' | 'reply' | 'history'> {
  return {
    ...(typeof host.consumeInbound === 'function' && typeof host.replyChecked === 'function'
      ? {
          async consume(input: Parameters<NonNullable<MessagingProvider['consume']>>[0]) {
            input.signal.throwIfAborted();
            let abort = () => {};
            const cancelled = new Promise<never>((_resolve, reject) => {
              abort = () =>
                reject(
                  input.signal.reason instanceof Error
                    ? input.signal.reason
                    : new Error('IM consume cancelled', { cause: input.signal.reason }),
                );
              input.signal.addEventListener('abort', abort, { once: true });
            });
            let info: Awaited<ReturnType<DshImOutboundService['describeBot']>>;
            try {
              info = await Promise.race([host.describeBot(input.accountRef), cancelled]);
              input.signal.throwIfAborted();
            } finally {
              input.signal.removeEventListener('abort', abort);
            }
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
            const larkVideos =
              platform === 'feishu' &&
              sourceFiles &&
              info.capabilities.includes('source-video-checked');
            const larkVoices =
              platform === 'feishu' &&
              sourceFiles &&
              info.capabilities.includes('source-voice-audio-checked');
            const qqDirect =
              platform === 'qq' && info.capabilities.includes('direct-message-consumer');
            return host.consumeInbound!(input.accountRef, {
              expectedFingerprint: input.fingerprint,
              signal: input.signal,
              ...(info.capabilities.includes('ordinary-text-consumer')
                ? { ordinaryText: true }
                : {}),
              ...(qqDirect ? { directMessages: true } : {}),
              ...(sourceFiles ? { sourceFiles: true } : {}),
              ...(sourceImages ? { sourceImages: true } : {}),
              ...(platform === 'weixin' && info.capabilities.includes('source-quote-checked')
                ? { sourceQuotes: true }
                : {}),
              ...((platform === 'weixin' || platform === 'qq') &&
              info.capabilities.includes('source-voice-transcript-checked')
                ? { sourceVoiceTranscripts: true }
                : {}),
              ...(larkVoices ||
              ((platform === 'weixin' || platform === 'qq') &&
                host.fileVersion === 1 &&
                info.capabilities.includes('source-voice-audio-checked'))
                ? { sourceVoiceAudio: true }
                : {}),
              ...(larkVideos ||
              (platform === 'weixin' &&
                host.fileVersion === 1 &&
                info.capabilities.includes('source-video-checked') &&
                info.capabilities.includes('reply-video-fence-checked'))
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
                                  action: z.enum(['allowed-once', 'rejected', 'answer']),
                                  values: z
                                    .array(
                                      z
                                        .object({
                                          selected: z
                                            .array(z.number().int().min(0).max(99))
                                            .max(100),
                                          custom: z.string().min(1).max(2000).optional(),
                                        })
                                        .strict(),
                                    )
                                    .min(1)
                                    .max(3)
                                    .optional(),
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
                      if ('values' in event || event.action === 'answer') {
                        const { values } = event as { values?: MessagingQuestionAction['values'] };
                        if (
                          event.action !== 'answer' ||
                          !values ||
                          host.questionCardVersion !== 1 ||
                          !info.capabilities.includes('question-action-consumer')
                        )
                          throw new MessagingError('untrusted-source');
                        return input.onAction!(
                          {
                            ...(event as Omit<MessagingQuestionAction, 'values'>),
                            values: values.map(({ selected, custom }) => ({
                              selected,
                              ...(custom === undefined ? {} : { custom }),
                            })),
                          },
                          context.signal,
                        );
                      }
                      return input.onAction!(event as MessagingCardAction, context.signal);
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
                const larkVideo = larkVideos && isLarkVideo(parsed, sourceImages);
                const larkVoice = larkVoices && isLarkVoice(parsed);
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
                    ((parsed.conversation.kind !== 'group' &&
                      !(qqDirect && parsed.conversation.kind === 'dm')) ||
                      parsed.reply.threadId !== undefined ||
                      parsed.reply.rootId !== undefined ||
                      parsed.reply.parentId !== undefined ||
                      ((parsed.attachments?.length ?? 0) > 0 && !qqAttachments))) ||
                  ((parsed.contentParts ||
                    (parsed.attachments?.length ?? 0) > 1 ||
                    (platform === 'feishu' &&
                      parsed.attachments?.some((item) => item.mediaType?.startsWith('image/')))) &&
                    !larkVideo &&
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
                    (platform === 'feishu'
                      ? !larkVoice
                      : !info.capabilities.includes('source-voice-transcript-checked'))) ||
                  (parsed.voice &&
                    parsed.attachments?.length &&
                    !info.capabilities.includes('source-voice-audio-checked')) ||
                  (platform !== 'feishu' &&
                    (parsed.video?.durationMs !== undefined ||
                      parsed.video?.posterAttachmentId !== undefined)) ||
                  (parsed.video &&
                    !larkVideo &&
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
                      (platform === 'feishu' && (larkVideo || !item.mediaType?.startsWith('image/'))
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
  };
}
