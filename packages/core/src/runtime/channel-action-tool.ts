import { defineTool } from '@deepseek-ai/dsh-tools';

import type { OrchestratorAgentRun } from './bot-runtime.js';

export function createChannelActionTool(
  current: () => OrchestratorAgentRun,
  discard: (channelId: string) => void,
) {
  return defineTool({
    name: 'channel_action',
    description:
      'Inspect or drop a Group draft, or add/remove a reaction. Does not send text or attachments; use bot_send_message for delivery.',
    parameters: {
      action: { type: 'string', enum: ['inspect', 'drop', 'react'], required: true },
      channel_id: { type: 'string', required: true },
      draft_id: { type: 'string' },
      observation_id: { type: 'string' },
      yield_to_message_ids: { type: 'array', items: { type: 'string' } },
      resolve_inbox_ids: { type: 'array', items: { type: 'string' } },
      react_to: { type: 'string' },
      reaction: { type: 'string' },
      remove_reaction: { type: 'boolean' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      const run = current();
      const { action } = args;
      if (
        action === 'react' &&
        (!args.react_to ||
          !args.reaction ||
          args.draft_id !== undefined ||
          args.resolve_inbox_ids !== undefined ||
          args.observation_id !== undefined ||
          args.yield_to_message_ids !== undefined)
      )
        throw new Error(
          'channel_action: reaction requires a message and emoji, without draft or Inbox changes',
        );
      if (
        action !== 'react' &&
        (args.react_to !== undefined ||
          args.reaction !== undefined ||
          args.remove_reaction !== undefined)
      )
        throw new Error('channel_action: draft actions cannot include reactions');
      if (action === 'inspect') {
        if (args.resolve_inbox_ids !== undefined || args.yield_to_message_ids !== undefined)
          throw new Error('channel_action: inspection cannot resolve or yield work');
        if (!run.channels.inspectDrafts) throw new Error('channel_action: inspection unavailable');
        return JSON.stringify(
          run.channels.inspectDrafts({
            channelId: args.channel_id,
            ...(args.draft_id === undefined ? {} : { draftId: args.draft_id }),
          }),
        );
      }
      if (action === 'react') {
        if (!run.channels.react) throw new Error('channel_action: reactions unavailable');
        return JSON.stringify(
          run.channels.react({
            channelId: args.channel_id,
            messageId: args.react_to!,
            emoji: args.reaction!,
            active: args.remove_reaction !== true,
          }),
        );
      }
      if (!args.draft_id || !run.channels.dropDraft)
        throw new Error('channel_action: drop requires draft_id and an available Group');
      if (
        args.yield_to_message_ids !== undefined &&
        (!args.observation_id ||
          args.yield_to_message_ids.length < 1 ||
          args.yield_to_message_ids.length > 20 ||
          args.yield_to_message_ids.some((id) => !id.trim()))
      )
        throw new Error('channel_action: yield requires observation_id and 1–20 peer Message IDs');
      if (
        args.resolve_inbox_ids !== undefined &&
        (!run.triage ||
          args.resolve_inbox_ids.length < 1 ||
          args.resolve_inbox_ids.length > 200 ||
          args.resolve_inbox_ids.some((id) => !id.trim()))
      )
        throw new Error('channel_action: resolution requires an Inbox and 1–200 IDs');
      const resolveCompleted = (keepOpenIds: string[] = []) => {
        const continuation = keepOpenIds.length
          ? {
              reason: 'exhausted-drop-keeps-original-work-open',
              instruction:
                'The original request is unfinished. Use inbox_snooze for its keepOpenInboxIds at suggestedSnoozeUntil unless a Human wait condition requires later. Batch-resolve already-read FYIs as done now; do not snooze them or re-read solely to confirm cleanup. End this turn after that cleanup and snooze. When woken, read fresh context, finish the original request and resolve it with the successful send. Resolve without sending only for cancellation or independently completed work.',
            }
          : {};
        if (args.resolve_inbox_ids === undefined)
          return run.triage === undefined
            ? {}
            : {
                inboxResolution: {
                  outcome: 'not-requested',
                  instruction:
                    'This drop did not resolve Inbox work. Explicitly inbox_resolve completed items before ending this turn; leave unfinished items open.',
                  ...continuation,
                },
              };
        const ids = args.resolve_inbox_ids.filter((id) => !keepOpenIds.includes(id));
        const keptOpen = args.resolve_inbox_ids.filter((id) => keepOpenIds.includes(id));
        const preservation = {
          ...continuation,
          ...(keptOpen.length ? { keptOpen } : {}),
        };
        if (ids.length === 0) return { inboxResolution: { outcome: 'kept-open', ...preservation } };
        try {
          return {
            inboxResolution: {
              ...run.triage!.resolve({ ids, outcome: 'done' }),
              ...preservation,
            },
          };
        } catch {
          return {
            inboxResolution: {
              ...preservation,
              outcome: 'failed',
              reason: 'inbox-resolution-failed',
              retry: 'inbox_resolve',
            },
          };
        }
      };

      const outcome = run.channels.dropDraft({
        channelId: args.channel_id,
        draftId: args.draft_id,
        ...(args.observation_id === undefined ? {} : { observationId: args.observation_id }),
        ...(args.yield_to_message_ids === undefined
          ? {}
          : { yieldToMessageIds: args.yield_to_message_ids }),
      });
      discard(args.channel_id);
      return JSON.stringify({
        ...outcome,
        ...(outcome.status === 'dropped' ? resolveCompleted(outcome.keepOpenInboxIds) : {}),
      });
    },
  });
}
