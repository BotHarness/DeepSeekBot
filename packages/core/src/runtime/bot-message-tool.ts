import { defineTool } from '@deepseek-ai/dsh-tools';
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

export function createBotMessageTool(current: () => OrchestratorAgentRun) {
  return defineTool({
    name: 'bot_send_message',
    description:
      'Explicitly send a text message to a local Human DM. Reply using a trusted source_event_id, or proactively name channel_id; provide exactly one. Decide whether a message is useful: answer quick tasks directly, report meaningful changes, ask necessary questions, and respect silence. Ordinary assistant text is private. end_turn ends only this turn after delivery and requested Inbox resolution succeed; a question can end the turn without resolving unfinished work. Group and external routes still use their existing tools in this first slice.',
    parameters: {
      source_event_id: {
        type: 'string',
        description: 'Trusted local Human Source Event from your Inbox.',
      },
      channel_id: {
        type: 'string',
        description: 'Explicit authorized Human DM destination for a proactive send.',
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
      if ((args.source_event_id === undefined) === (args.channel_id === undefined))
        throw new BotMessageError(
          'destination-required',
          'Choose exactly one trusted reply source or explicit destination.',
        );
      if (!args.body.trim())
        throw new BotMessageError('empty-message', 'A text message is required.');
      const reply =
        args.source_event_id === undefined
          ? undefined
          : run.channels.replySource?.(args.source_event_id);
      if (args.source_event_id !== undefined && reply === undefined)
        throw new BotMessageError('unavailable-source', 'The trusted reply source is unavailable.');
      const channelId = reply?.channelId ?? args.channel_id!;
      const channel = run.channels
        .list({ channelId })
        .channels.find((entry) => entry.id === channelId);
      if (channel?.kind !== 'human-dm')
        throw new BotMessageError(
          'unsupported-destination',
          'This slice supports an authorized local Human DM.',
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
      const message = await run.channels.send({
        channelId,
        body: args.body,
        deliveryKey: String(exec.callId),
        ...(reply === undefined
          ? {}
          : { replyTo: reply.messageId, replySourceEventId: args.source_event_id! }),
      });
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
        messageId: message.id,
        inboxResolution,
      });
    },
  });
}
