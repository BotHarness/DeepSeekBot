import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';

export function createChannelActionTool(legacy: ToolDefinition) {
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
    execute: async (args, exec) => {
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
      return String(
        await legacy.execute(
          Object.fromEntries(
            Object.entries({
              channel_id: args.channel_id,
              ...(action === 'react'
                ? {
                    react_to: args.react_to,
                    reaction: args.reaction,
                    remove_reaction: args.remove_reaction,
                  }
                : {
                    draft_id: args.draft_id,
                    observation_id: args.observation_id,
                    yield_to_message_ids: args.yield_to_message_ids,
                    resolve_inbox_ids: args.resolve_inbox_ids,
                  }),
              body: '',
              ...(action === 'inspect'
                ? { review_action: 'inspect' }
                : action === 'drop'
                  ? { drop: true }
                  : {}),
            }).filter(([, value]) => value !== undefined),
          ),
          exec,
        ),
      );
    },
  });
}
