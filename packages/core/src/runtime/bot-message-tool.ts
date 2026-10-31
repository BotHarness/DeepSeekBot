import {
  withInlineMentions,
  mentionPeople,
  withoutMentionMarkup,
} from '../messaging/mention-text.js';
import { isChannelAttachmentRef } from '../attachments/ref.js';
import { createHash } from 'node:crypto';
import { SendReviewRequired, GroupReplySourceRevoked } from '../channels/send-review.js';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { MAX_BOT_HOPS, type ChannelMessage } from '../channels/channel.js';
import type { OrchestratorAgentRun } from './bot-runtime.js';

export class BotMessageError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BotMessageError';
  }
}

const NOT_WOKEN_NOTICE =
  'These colleagues did not wake and will not see this message on their own. Tell the Humans in this conversation where the work stands and what is needed to continue; do not resend the same @.';

function notWoken(message: ChannelMessage, targets: readonly string[]) {
  const woken = new Set((message.deliveries ?? []).map((delivery) => delivery.botSlug));
  const reason =
    (message.botCausation?.hop ?? 0) > MAX_BOT_HOPS ? 'collaboration-hop-limit' : 'not-admitted';
  return [...new Set(targets)]
    .filter(
      (botSlug) =>
        !woken.has(botSlug) &&
        (reason === 'collaboration-hop-limit' || !botSlug.startsWith('remote:')),
    )
    .map((botId) => ({ botId, reason }));
}

export function createBotMessageTool(
  current: () => OrchestratorAgentRun,
  drafts?: {
    settle(channelId: string, body: string): void;
    discard(channelId: string): void;
  },
) {
  return defineTool({
    name: 'bot_send_message',
    description:
      'Explicitly send a text message to a Channel or external IM. Reply using a trusted source_event_id, or proactively name channel_id, bot_id, grant_id, or binding_id plus conversation_id; provide exactly one destination. Decide whether a message is useful: answer quick tasks directly, report meaningful changes, ask necessary questions, and respect silence. Ordinary assistant text is private. end_turn ends only this turn after delivery and requested Inbox resolution succeed; a question can end the turn without resolving unfinished work. Group sends retain draft review: use the returned observation and draft identifiers to revise or recover a held send. Unknown external delivery never resolves Inbox or ends the turn.',
    parameters: {
      source_event_id: {
        type: 'string',
        description:
          'Trusted Source Event from your Inbox. External sources reply on their original IM route.',
      },
      channel_id: {
        type: 'string',
        description: 'Explicit authorized Channel destination for a proactive send.',
      },
      bot_id: {
        type: 'string',
        description:
          'Stable colleague Bot ID from list_bot_contacts; proactively open or send to its Bot DM.',
      },
      binding_id: {
        type: 'string',
        description: 'Owned external app from bridge_reachable_groups; use with conversation_id.',
      },
      conversation_id: {
        type: 'string',
        description: 'Exact reachable conversation belonging to binding_id.',
      },
      grant_id: {
        type: 'string',
        description:
          'Explicit authorized external target from bridge_targets for a proactive send.',
      },
      observation_id: { type: 'string', description: 'Current Group read or review observation.' },
      draft_id: { type: 'string', description: 'Existing Group draft to revise or recover.' },
      recover: { type: 'boolean', description: 'Recover the specified Group draft after restart.' },
      attachments: {
        type: 'array',
        description:
          'Imported Attachment references. External replies support one file with empty body; proactive external file sending is unavailable.',
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
      mention_bot_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Stable Bot IDs to mention in a local Group.',
      },
      mention_human_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Stable Human IDs to mention in a local Group.',
      },
      freshness_override: {
        type: 'object',
        additionalProperties: false,
        properties: {
          draftVersion: { type: 'integer', required: true },
          reason: { type: 'string', required: true },
        },
        description: 'Explicit Group review override for the current draft version and reason.',
      },
      body: { type: 'string', required: true, description: 'The actual message to deliver.' },
      resolve_inbox_ids: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Explicitly resolve this reply source after delivery. Omit for unfinished work.',
      },
      end_turn: {
        type: 'boolean',
        description:
          'Default false. Conclude this turn only after successful delivery and requested resolution.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args, exec) => {
      const run = current();
      exec.signal.throwIfAborted();
      if (
        [args.source_event_id, args.channel_id, args.grant_id, args.bot_id, args.binding_id].filter(
          (id) => id !== undefined,
        ).length !== 1
      )
        throw new BotMessageError(
          'destination-required',
          'Choose exactly one trusted reply source or explicit destination.',
        );
      if ((args.binding_id === undefined) !== (args.conversation_id === undefined))
        throw new BotMessageError(
          'destination-required',
          'binding_id and conversation_id must be supplied together.',
        );
      if (!args.body.trim() && !args.attachments?.length)
        throw new BotMessageError('empty-message', 'Text or an attachment is required.');
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
      let channelId = reply?.kind === 'channel' ? reply.channelId : args.channel_id;
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
      if ((args.attachments?.length ?? 0) > 10)
        throw new BotMessageError('invalid-attachments', 'At most ten attachments are supported.');
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
      if (args.bot_id !== undefined && args.attachments?.length)
        throw new BotMessageError(
          'unsupported-attachment-send',
          'Discover the existing Bot DM Channel to send attachments.',
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
      let intentId: string | undefined;
      let unwoken: ReturnType<typeof notWoken> = [];
      if (args.bot_id !== undefined) {
        const sent = await run.channels.sendToBot({
          botSlug: args.bot_id,
          body: args.body,
          deliveryKey: String(exec.callId),
        });
        messageId = sent.message.id;
        channelId = sent.channelId;
        unwoken = notWoken(sent.message, [args.bot_id]);
        drafts?.settle(channelId, sent.message.body);
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
        const source =
          args.source_event_id !== undefined && /<@!?[A-Za-z0-9_-]+>/u.test(args.body)
            ? messaging.read(args.source_event_id)
            : undefined;
        const body =
          source === undefined
            ? withoutMentionMarkup(args.body)
            : withInlineMentions(
                source.platform,
                args.body,
                mentionPeople(source.event.actor, source.event.mentions),
              );
        const result = args.attachments?.length
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
        if (result.state !== 'provider-accepted' || result.receipt === undefined)
          return JSON.stringify({
            status: result.state,
            intentId: result.id,
            inboxResolution: { outcome: 'not-requested' },
          });
        messageId = result.receipt.messageId;
        intentId = result.id;
      } else {
        try {
          const message = await run.channels.send({
            channelId: channelId!,
            body: args.body,
            deliveryKey: String(exec.callId),
            ...(args.attachments === undefined ? {} : { attachments: args.attachments }),
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
              : { replyTo: reply.messageId, replySourceEventId: args.source_event_id! }),
          });
          messageId = message.id;
          unwoken = notWoken(
            message,
            channel?.kind === 'bot-dm'
              ? channel.members
                  .map((member) => member.botId)
                  .filter((botId) => message.author.kind === 'bot' && botId !== message.author.slug)
              : (message.mentions ?? []).map((mention) => mention.botSlug),
          );
          drafts?.settle(channelId!, message.body);
        } catch (error) {
          if (error instanceof SendReviewRequired) {
            drafts?.discard(error.outcome.channelId);
            return JSON.stringify(error.outcome);
          }
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
      return JSON.stringify({
        status: 'committed',
        channelId,
        messageId,
        ...(intentId === undefined ? {} : { intentId }),
        ...(unwoken.length === 0 ? {} : { notWoken: unwoken, notice: NOT_WOKEN_NOTICE }),
        inboxResolution,
      });
    },
  });
}
