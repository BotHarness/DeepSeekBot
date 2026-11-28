import { HarnessError } from '@deepseek-ai/dsh-llm';
import {
  withInlineMentions,
  mentionPeople,
  withoutMentionMarkup,
} from '../messaging/mention-text.js';
import { isChannelAttachmentRef } from '../attachments/ref.js';
import { ChannelAttachmentError } from '../attachments/store.js';
import type { DiagnosticEventFields, DiagnosticEvents } from '../diagnostics/diagnostic-log.js';
import { createHash } from 'node:crypto';
import { parseGenuiContent } from '../channels/genui.js';
import { GENUI_DOCUMENT_LIMITS } from '../channels/genui-document.js';
import { SendReviewRequired, GroupReplySourceRevoked } from '../channels/send-review.js';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { ChannelMessage } from '../channels/channel.js';
import { BotHopLimitReached } from '../channels/hop-limit.js';
import { ChannelQuoteError, MAX_CHANNEL_QUOTES, parseQuotesInput } from '../channels/quotes.js';
import type { OrchestratorAgentRun } from './bot-runtime.js';
import type { VoiceAttachOutcome } from '../voice/messages.js';
import { SESSION_DIRECT_MESSAGE_PREFIX } from './session-direct-message.js';
import { expandGenuiContent, genuiPreviews, type GenuiPreviewStore } from './genui-authoring.js';
import {
  qqReplyFailureCapability,
  sourceReplyCapability,
} from '../messaging/source-reply-capability.js';
import { MessagingError } from '../messaging/provider.js';
import {
  closeStreakSource,
  isStreakSourceClosed,
  recordSend,
  SEND_STREAK_LIMIT,
} from './send-streak.js';

const QQ_REPLY_NOTICE =
  'Keep the answer in the original QQ conversation. Use its actual @-mention Source Event if it is still replyable. A failed reply does not authorize a proactive post.';

function unsupportedVoice(): VoiceAttachOutcome {
  return {
    status: 'failed',
    code: 'unsupported-destination',
    message: 'Voice messages are available in local Channels only; the text was sent.',
  };
}

export class BotMessageError extends HarnessError {
  constructor(
    code: string,
    message: string,
    readonly limit?: number,
  ) {
    super(message, code);
    this.name = 'BotMessageError';
  }
}

const SEND_STREAK_NOTICE = `Not sent, and this turn has ended: this would be message ${SEND_STREAK_LIMIT + 1} in a row to the same destination with no other work in between. Do not post status updates in place of work. This request is closed: do not reply to it or continue it later. Answer only new messages. If something you need, such as a tool, is unavailable, say so once instead of promising it.`;
const EXPLICIT_SEND_STREAK_NOTICE = `Not sent. This turn ended after ${SEND_STREAK_LIMIT} calls to the same destination without other work in between. Continue only from a new request. Do not retry this send.`;

const CLOSED_SOURCE_NOTICE =
  'Not sent: this request was closed after repeated messages in a row. Do not reply to it or finish it; answer only new messages.';

const NOT_WOKEN_NOTICE =
  'The message was saved, but these colleagues did not receive an Inbox admission. Tell the Humans in this conversation what is needed to continue; do not resend the same message.';

const HOP_LIMIT_NOTICE =
  'Not sent: the next Bot-to-Bot hop exceeds the chain depth limit. A new Human DM or @-mention can start a fresh chain. Humans can change the limit in Settings → Messaging. Do not retry from the same source.';

function notWoken(message: ChannelMessage, targets: readonly string[]) {
  const woken = new Set((message.deliveries ?? []).map((delivery) => delivery.botSlug));
  return [...new Set(targets)]
    .filter((botSlug) => !woken.has(botSlug) && !botSlug.startsWith('remote:'))
    .map((botId) => ({ botId, reason: 'not-admitted' as const }));
}

const DESTINATION_FIELDS = [
  'source_event_id',
  'channel_id',
  'grant_id',
  'bot_id',
  'human_id',
  'binding_id',
] as const;

const OPTIONAL_FIELDS = [
  ...DESTINATION_FIELDS,
  'conversation_id',
  'observation_id',
  'draft_id',
  'recover',
  'attachments',
  'quotes',
  'mention_bot_ids',
  'mention_human_ids',
  'freshness_override',
  'resolve_inbox_ids',
  'voice',
] as const;

export type SessionLinkKind = 'created' | 'sent';

const SESSION_MENTION = /\[([^\]\n]{1,200})\]\(session:([A-Za-z0-9_.:-]{1,200})\)/gu;

export function sessionMentionIds(body: string): string[] {
  return [...new Set([...body.matchAll(SESSION_MENTION)].map((match) => match[2]!))];
}

export function withoutSessionMentions(body: string): string {
  return body.replace(SESSION_MENTION, (_match, title: string) => title);
}

function isEmptyOption(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    const override = value as { draftVersion?: unknown; reason?: unknown };
    return (
      Object.keys(value).every((key) => key === 'draftVersion' || key === 'reason') &&
      (override.draftVersion === undefined ||
        override.draftVersion === null ||
        override.draftVersion === 0) &&
      isEmptyOption(override.reason)
    );
  }
  return false;
}

function withoutEmptyOptions<T extends object>(args: T): T {
  const normalized = { ...args } as Record<string, unknown>;
  for (const field of OPTIONAL_FIELDS)
    if (isEmptyOption(normalized[field])) delete normalized[field];
  return normalized as unknown as T;
}

export function createBotMessageTool(
  current: () => OrchestratorAgentRun,
  drafts?: {
    settle(channelId: string, body: string): void;
    discard(channelId: string): void;
  },
  sentToHumanDm?: (messageId: string) => void,
  previews?: GenuiPreviewStore,
  diagnostics?: DiagnosticEvents,
) {
  const runsWithFailedQqReply = new WeakSet<OrchestratorAgentRun>();
  function record(run: OrchestratorAgentRun, phase: string, fields: DiagnosticEventFields) {
    diagnostics?.record(
      'bot-send-message',
      phase,
      { sessionId: run.sessionId, ...fields },
      {
        bot: run.bot.slug,
        level: 'warn',
      },
    );
  }
  function hopLimitRefusal(
    run: OrchestratorAgentRun,
    error: BotHopLimitReached,
    channelId: string | undefined,
  ): string {
    const details = { reason: error.code, hop: error.hop, hopLimit: error.limit };
    record(run, 'refused', details);
    return JSON.stringify({
      status: 'refused',
      ...(channelId === undefined ? {} : { channelId }),
      ...details,
      notice: HOP_LIMIT_NOTICE,
    });
  }
  const tool = defineTool({
    name: 'bot_send_message',
    description:
      'Send a message to a Channel or external IM. Ordinary assistant text is private. Give exactly one destination: a trusted source_event_id to reply, or channel_id, human_id, bot_id, grant_id, or binding_id with conversation_id. After delivery-unknown, check that conversation history and report the uncertainty; never resend or switch destinations. unable-to-deliver and network-denied are refusals. A finished reply passes resolve_inbox_ids and end_turn.',
    parameters: {
      source_event_id: {
        type: 'string',
        description: 'Trusted Inbox Source Event to reply to.',
      },
      channel_id: {
        type: 'string',
        description: 'Authorized Channel for a proactive send.',
      },
      human_id: {
        type: 'string',
        description: 'Host Human to DM proactively, when proactive DMs are allowed.',
      },
      bot_id: {
        type: 'string',
        description: 'Colleague Bot ID from list_bot_contacts, for its Bot DM.',
      },
      binding_id: {
        type: 'string',
        description: 'External app from bridge_reachable_groups, with conversation_id.',
      },
      conversation_id: {
        type: 'string',
        description: 'Conversation of binding_id.',
      },
      grant_id: {
        type: 'string',
        description: 'External target from bridge_targets.',
      },
      observation_id: { type: 'string', description: 'Group observation from a read or review.' },
      draft_id: { type: 'string', description: 'Held Group draft to revise or recover.' },
      recover: { type: 'boolean', description: 'Recover draft_id after a restart.' },
      attachments: {
        type: 'array',
        description:
          'Up to ten imported Attachments for local Channels or local bot_id. External replies take one file with an empty body.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            hash: { type: 'string' },
            fileId: { type: 'string' },
            name: { type: 'string', required: true },
            mime: { type: 'string', required: true },
            size: { type: 'integer', required: true },
          },
        },
      },
      quotes: {
        type: 'array',
        description: `Up to ${MAX_CHANNEL_QUOTES} earlier messages this answers, shown above your text. text cites a verbatim excerpt; note answers that quote. Local Channels only.`,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message_id: { type: 'string', required: true },
            text: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
      mention_bot_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Bot IDs to mention in a local Group.',
      },
      mention_human_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Human IDs to mention in a local Group.',
      },
      freshness_override: {
        type: 'object',
        additionalProperties: false,
        properties: {
          draftVersion: { type: 'integer', required: true },
          reason: { type: 'string', required: true },
        },
        description: 'Group review override for this draft version.',
      },
      voice: {
        type: 'boolean',
        description:
          'Also send as a voice message in your voice; give it before body. Local Channels only.',
      },
      body: {
        type: 'string',
        required: true,
        description:
          'Message text. [Assignment title](session:<session id>) shows a clickable Assignment chip.',
      },
      genui_json: {
        type: 'string',
        description:
          'Complete GenUI JSON for a Human DM (256 KiB max), same format as genui_preview; body is the readable summary. After a genui_preview, pass genui_preview_id instead.',
      },
      genui_preview_id: {
        type: 'string',
        description: 'Publish a genui_preview result instead of genui_json. Human DM only.',
      },
      resolve_inbox_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Resolve this reply source after delivery; omit for unfinished work.',
      },
      end_turn: {
        type: 'boolean',
        description: 'End this turn after delivery and resolution succeed.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (rawArgs, exec) => {
      const run = current();
      exec.signal.throwIfAborted();
      const args = withoutEmptyOptions(rawArgs);
      const destinations = DESTINATION_FIELDS.filter((field) => args[field] !== undefined);
      if (destinations.length !== 1)
        throw new BotMessageError(
          'destination-required',
          `Choose exactly one trusted reply source or explicit destination (got: ${destinations.join(', ') || 'none'}). For a Bot DM, provide bot_id from list_bot_contacts.`,
        );
      if ((args.binding_id === undefined) !== (args.conversation_id === undefined))
        throw new BotMessageError(
          'destination-required',
          'binding_id and conversation_id must be supplied together.',
        );
      if (!args.body.trim() && !args.attachments?.length)
        throw new BotMessageError('empty-message', 'Text or an attachment is required.');
      if (
        args.source_event_id !== undefined &&
        isStreakSourceClosed(run.sessionId, args.source_event_id)
      ) {
        record(run, 'refused', { reason: 'source-closed', limit: SEND_STREAK_LIMIT });
        return JSON.stringify({
          status: 'refused',
          reason: 'source-closed',
          notice: CLOSED_SOURCE_NOTICE,
          inboxResolution: { outcome: 'not-requested' },
        });
      }
      const destination = destinations[0]!;
      if (
        recordSend(
          run,
          JSON.stringify([destination, args[destination], args.conversation_id]),
          String(exec.callId),
        ) > SEND_STREAK_LIMIT
      ) {
        const details = { reason: 'send-streak', limit: SEND_STREAK_LIMIT };
        record(run, 'refused', details);
        exec.concludeTurn();
        let ignored = false;
        if (args.source_event_id !== undefined)
          closeStreakSource(run.sessionId, args.source_event_id);
        if (args.source_event_id !== undefined && run.triage !== undefined)
          try {
            ignored =
              run.triage.resolve({
                ids: [args.source_event_id],
                outcome: 'ignored',
                note: 'send-streak',
              }).outcome === 'resolved';
          } catch {
            ignored = false;
          }
        return JSON.stringify({
          status: 'refused',
          ...details,
          notice:
            args.source_event_id === undefined ? EXPLICIT_SEND_STREAK_NOTICE : SEND_STREAK_NOTICE,
          inboxResolution: ignored
            ? { outcome: 'ignored', resolved: [args.source_event_id] }
            : { outcome: 'not-requested' },
        });
      }
      const reply =
        args.source_event_id === undefined
          ? undefined
          : (run.replyDestination?.(args.source_event_id) ??
            (() => {
              const local = run.channels.replySource?.(args.source_event_id!);
              return local === undefined ? undefined : { kind: 'channel' as const, ...local };
            })());
      if (args.source_event_id !== undefined && reply === undefined)
        throw new BotMessageError('unavailable-source', 'The trusted reply source is unavailable.');
      const external =
        reply?.kind === 'external' || args.grant_id !== undefined || args.binding_id !== undefined;
      if (args.source_event_id === undefined && runsWithFailedQqReply.has(run)) {
        return JSON.stringify({
          status: 'refused',
          reason: 'reply-destination-required',
          notice: QQ_REPLY_NOTICE,
          inboxResolution: { outcome: 'not-requested' },
        });
      }
      let channelId =
        args.human_id === undefined
          ? reply?.kind === 'channel'
            ? reply.channelId
            : args.channel_id
          : run.channels.startHumanDm?.(args.human_id).id;
      const channel =
        external || args.bot_id !== undefined
          ? undefined
          : run.channels
              .list({ channelId: channelId! })
              .channels.find((entry) => entry.id === channelId);
      if (!external && args.bot_id === undefined && channel === undefined)
        throw new BotMessageError(
          'unavailable-destination',
          'The authorized Channel is unavailable.',
        );
      const groupOptions =
        args.observation_id !== undefined ||
        args.draft_id !== undefined ||
        args.recover !== undefined ||
        args.freshness_override !== undefined ||
        args.mention_bot_ids !== undefined ||
        args.mention_human_ids !== undefined;
      if (groupOptions && channel?.kind !== 'group')
        throw new BotMessageError('invalid-review', 'Group options require a local Group.');
      if (args.recover && (!args.draft_id || !args.observation_id))
        throw new BotMessageError(
          'invalid-review',
          'Recovery requires draft_id and a fresh observation_id.',
        );
      if (args.genui_json !== undefined && args.genui_preview_id !== undefined)
        throw new BotMessageError(
          'invalid-genui',
          'Use either genui_preview_id or genui_json, not both.',
        );
      const genui =
        args.genui_json === undefined && args.genui_preview_id === undefined
          ? undefined
          : await (async () => {
              if (external || channel?.kind !== 'human-dm' || !args.body.trim())
                throw new BotMessageError(
                  'unsupported-genui-destination',
                  'Reports require a Human DM and a readable summary.',
                );
              if (args.genui_preview_id !== undefined)
                return parseGenuiContent(
                  (previews ?? genuiPreviews).read(run.bot.slug, args.genui_preview_id),
                );
              if (new TextEncoder().encode(args.genui_json!).length > GENUI_DOCUMENT_LIMITS.bytes)
                throw new BotMessageError('invalid-genui', 'Report JSON exceeds its budget.');
              return parseGenuiContent(
                await expandGenuiContent(JSON.parse(args.genui_json!), { signal: exec.signal }),
              );
            })();
      exec.signal.throwIfAborted();
      if (
        args.freshness_override &&
        (!args.draft_id ||
          !args.observation_id ||
          !Number.isSafeInteger(args.freshness_override.draftVersion) ||
          args.freshness_override.draftVersion < 1 ||
          !args.freshness_override.reason.trim() ||
          args.freshness_override.reason.length > 500)
      )
        throw new BotMessageError(
          'invalid-review',
          'Override requires the current draft, observation, version and a reason.',
        );
      const quotes =
        args.quotes === undefined
          ? undefined
          : (() => {
              if (external || args.bot_id !== undefined)
                throw new BotMessageError(
                  'unsupported-quotes',
                  'Quotes need a local Channel destination: reply with source_event_id or name channel_id.',
                );
              const parsed = parseQuotesInput(
                args.quotes!.map((quote) => ({
                  messageId: quote.message_id,
                  ...(quote.text === undefined ? {} : { text: quote.text }),
                  ...(quote.note === undefined ? {} : { note: quote.note }),
                })),
              );
              if (typeof parsed === 'string') throw new BotMessageError('invalid-quotes', parsed);
              return parsed;
            })();
      if ((args.attachments?.length ?? 0) > 10)
        throw new BotMessageError(
          'invalid-attachments',
          'At most ten attachments are supported.',
          10,
        );
      if (
        external &&
        args.attachments?.length &&
        (args.attachments.length !== 1 ||
          !args.attachments[0]?.fileId ||
          args.body.trim() ||
          args.grant_id !== undefined ||
          args.binding_id !== undefined)
      )
        throw new BotMessageError(
          'unsupported-attachment-send',
          'An external file reply requires one imported fileId, a reply source, and an empty body.',
        );
      if (args.attachments !== undefined && !args.attachments.every(isChannelAttachmentRef))
        throw new BotMessageError(
          'invalid-attachments',
          'Use trusted imported Attachment references.',
        );
      const unknown = sessionMentionIds(args.body).filter(
        (sessionId) => run.assignments.inspect(sessionId) === undefined,
      );
      if (unknown.length > 0)
        throw new BotMessageError(
          'invalid-session-links',
          `Unknown Assignment Session in an inline mention: ${unknown.join(', ')}.`,
        );
      const ids = args.resolve_inbox_ids;
      if (
        ids !== undefined &&
        (ids.length !== 1 || ids[0] !== args.source_event_id || run.triage === undefined)
      )
        throw new BotMessageError(
          'invalid-resolution',
          'Only the explicitly referenced reply source can be resolved by this slice.',
        );
      let messageId: string;
      let voice: VoiceAttachOutcome | undefined;
      let intentId: string | undefined;
      let unwoken: ReturnType<typeof notWoken> = [];
      if (args.bot_id !== undefined) {
        let sent: Awaited<ReturnType<typeof run.channels.sendToBot>>;
        try {
          sent = await run.channels.sendToBot({
            botSlug: args.bot_id,
            body: withoutSessionMentions(args.body),
            deliveryKey: String(exec.callId),
            ...(args.attachments === undefined ? {} : { attachments: args.attachments }),
          });
        } catch (error) {
          if (error instanceof BotHopLimitReached) return hopLimitRefusal(run, error, undefined);
          throw error;
        }
        messageId = sent.message.id;
        channelId = sent.channelId;
        unwoken = notWoken(sent.message, [args.bot_id]);
        drafts?.settle(channelId, sent.message.body);
        if (args.voice) voice = unsupportedVoice();
      } else if (external) {
        const messaging = run.externalMessaging;
        if (messaging === undefined)
          throw new BotMessageError(
            'unavailable-destination',
            'External messaging is unavailable.',
          );
        const key = createHash('sha256')
          .update(JSON.stringify([run.sessionId, String(exec.callId)]))
          .digest('hex');
        const source = reply?.kind === 'external' ? reply.source : undefined;
        const qqReply = source === undefined ? undefined : sourceReplyCapability(source);
        if (qqReply?.state === 'unavailable') {
          runsWithFailedQqReply.add(run);
          return JSON.stringify({
            status: 'refused',
            reason: qqReply.reason,
            replyCapability: qqReply,
            notice: QQ_REPLY_NOTICE,
            inboxResolution: { outcome: 'not-requested' },
          });
        }
        const plain = withoutSessionMentions(args.body);
        const body =
          source === undefined
            ? withoutMentionMarkup(plain)
            : withInlineMentions(
                source.platform,
                plain,
                mentionPeople(source.event.actor, source.event.mentions),
              );
        let result;
        try {
          result = args.attachments?.length
            ? await messaging.replyFile(args.source_event_id!, args.attachments[0]!.fileId!, key)
            : args.binding_id !== undefined
              ? await (() => {
                  if (messaging.postConversation === undefined)
                    throw new BotMessageError(
                      'unavailable-destination',
                      'Reachable external posting is unavailable.',
                    );
                  return messaging.postConversation(
                    args.binding_id!,
                    args.conversation_id!,
                    key,
                    body,
                  );
                })()
              : args.grant_id === undefined
                ? await messaging.reply(args.source_event_id!, body, key)
                : await (() => {
                    if (messaging.post === undefined)
                      throw new BotMessageError(
                        'unavailable-destination',
                        'Proactive external messaging is unavailable.',
                      );
                    return messaging.post(args.grant_id!, key, body);
                  })();
        } catch (error) {
          if (qqReply === undefined || !(error instanceof MessagingError)) throw error;
          runsWithFailedQqReply.add(run);
          return JSON.stringify({
            status: 'refused',
            reason: error.code,
            replyCapability: qqReplyFailureCapability(error.code),
            notice: QQ_REPLY_NOTICE,
            inboxResolution: { outcome: 'not-requested' },
          });
        }
        if (result.state !== 'provider-accepted' || result.receipt === undefined) {
          if (qqReply !== undefined) runsWithFailedQqReply.add(run);
          return JSON.stringify({
            status: result.state,
            intentId: result.id,
            ...(result.reason === undefined ? {} : { reason: result.reason }),
            ...(qqReply === undefined
              ? {}
              : {
                  replyCapability: qqReplyFailureCapability(
                    result.state === 'unknown-outcome' ? undefined : result.reason,
                  ),
                  notice:
                    result.state === 'unknown-outcome' || result.state === 'provider-accepted'
                      ? 'Delivery is unconfirmed. Inspect the Outbox receipt before any further send. Keep the answer in its original QQ conversation.'
                      : QQ_REPLY_NOTICE,
                }),
            inboxResolution: { outcome: 'not-requested' },
          });
        }
        messageId = result.receipt.messageId;
        intentId = result.id;
        if (args.voice) voice = unsupportedVoice();
      } else {
        try {
          const message = await run.channels.send({
            channelId: channelId!,
            body: args.body,
            deliveryKey: String(exec.callId),
            ...(genui === undefined ? {} : { genui }),
            ...(args.attachments === undefined ? {} : { attachments: args.attachments }),
            ...(quotes === undefined ? {} : { quotes }),
            ...(args.mention_bot_ids === undefined ? {} : { mentionBotIds: args.mention_bot_ids }),
            ...(args.mention_human_ids === undefined
              ? {}
              : { mentionHumanIds: args.mention_human_ids }),
            ...(args.freshness_override === undefined
              ? {}
              : { freshnessOverride: args.freshness_override }),
            ...(args.observation_id === undefined ? {} : { observationId: args.observation_id }),
            ...(args.draft_id === undefined ? {} : { draftId: args.draft_id }),
            ...(args.recover === undefined ? {} : { recover: args.recover }),
            ...(reply?.kind !== 'channel'
              ? {}
              : reply.messageId.startsWith(SESSION_DIRECT_MESSAGE_PREFIX)
                ? { replySourceEventId: args.source_event_id! }
                : {
                    replyTo: reply.messageId,
                    replySourceEventId: args.source_event_id!,
                  }),
          });
          messageId = message.id;
          if (channel?.kind === 'human-dm') sentToHumanDm?.(message.id);
          unwoken = notWoken(
            message,
            channel?.kind === 'bot-dm'
              ? channel.members
                  .map((member) => member.botId)
                  .filter((botId) => message.author.kind === 'bot' && botId !== message.author.slug)
              : (message.mentions ?? []).map((mention) => mention.botSlug),
          );
          drafts?.settle(channelId!, message.body);
          if (args.voice)
            voice =
              run.channels.attachVoice === undefined
                ? {
                    status: 'failed',
                    code: 'voice-unavailable',
                    message: 'Voice messages are unavailable on this Host.',
                  }
                : await run.channels.attachVoice({
                    channelId: channelId!,
                    messageId,
                    signal: exec.signal,
                  });
        } catch (error) {
          if (error instanceof SendReviewRequired) {
            drafts?.discard(error.outcome.channelId);
            return JSON.stringify(error.outcome);
          }
          if (error instanceof BotHopLimitReached) {
            drafts?.discard(channelId!);
            return hopLimitRefusal(run, error, channelId);
          }
          if (error instanceof ChannelQuoteError)
            throw new BotMessageError(error.code, error.message);
          if (error instanceof GroupReplySourceRevoked) {
            drafts?.discard(error.channelId);
            return JSON.stringify({
              status: 'refused',
              channelId: error.channelId,
              reason: error.code,
            });
          }
          throw error;
        }
      }
      let inboxResolution: {
        outcome: string;
        resolved?: string[];
        alreadyResolved?: string[];
        unresolved?: string[];
        reason?: string;
      } = { outcome: 'not-requested' };
      if (ids !== undefined) {
        try {
          const result = run.triage!.resolve({ ids, outcome: 'done' });
          inboxResolution =
            result.outcome === 'resolved'
              ? result
              : { outcome: 'failed', unresolved: ids, reason: 'resolution-not-confirmed' };
        } catch {
          inboxResolution = {
            outcome: 'failed',
            unresolved: ids,
            reason: 'inbox-resolution-failed',
          };
        }
      }
      if (
        args.end_turn &&
        !exec.signal.aborted &&
        ['not-requested', 'resolved'].includes(inboxResolution.outcome)
      )
        exec.concludeTurn();
      if (unwoken.length > 0)
        record(run, 'not-woken', { reason: 'not-admitted', count: unwoken.length });
      return JSON.stringify({
        status: 'committed',
        channelId,
        messageId,
        ...(intentId === undefined ? {} : { intentId }),
        ...(unwoken.length === 0 ? {} : { notWoken: unwoken, notice: NOT_WOKEN_NOTICE }),
        ...(voice === undefined ? {} : { voice }),
        inboxResolution,
      });
    },
  });
  return {
    ...tool,
    async execute(...args: Parameters<typeof tool.execute>) {
      try {
        return await tool.execute(...args);
      } catch (error) {
        const failure =
          error instanceof ChannelAttachmentError
            ? new BotMessageError(`attachment-${error.code}`, error.message)
            : error;
        if (diagnostics !== undefined && !args[1].signal.aborted) {
          const reason = failure instanceof HarnessError ? failure.code : 'send-failed';
          try {
            record(current(), reason === 'delivery-unknown' ? 'delivery-unknown' : 'failed', {
              reason,
              limit: failure instanceof BotMessageError ? failure.limit : undefined,
            });
          } catch {}
        }
        throw failure;
      }
    },
  };
}
