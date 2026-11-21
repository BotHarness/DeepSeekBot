import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

export async function fixture(
  check: (f: {
    core: ReturnType<typeof createCore>;
    channelId: string;
    human(id: string, body: string): Promise<void>;
    tool(
      name: string,
      args: Record<string, unknown>,
      bot?: string,
    ): Promise<{
      status?: string;
      reason?: string;
      draftId?: string;
      draftVersion?: number;
      budget?: { used: number; limit: number; exhausted: boolean };
      suggestedSnoozeUntil?: string;
      messageId: string;
      observationIds: Record<string, string>;
      changedMessageIds?: string[];
      review?: {
        observationId: string;
        content: string;
        complete: boolean;
        observedMessageIds: string[];
        peerMessageIds?: string[];
      };
    }>;
  }) => Promise<void>,
) {
  const core = createCore({
    dshHome: createTempRoot('group-send-review-'),
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }),
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bob', displayName: 'Bob' });
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Review',
      members: ['ada', 'bob'],
    });
    for (const bot of group.members)
      core.channels.setGroupWakePolicy(group.id, bot, {
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      });
    core.runtime.groupSendReview!.configure(group.id, true);
    await check({
      core,
      channelId: group.id,
      human: async (id, body) => {
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
          id,
          body,
          author: { kind: 'human' },
          at: new Date().toISOString(),
        });
      },
      tool: async (name, args, bot = 'ada') =>
        JSON.parse(
          JSON.stringify(
            (
              await core.runtime.runDirectBotTool!(
                bot,
                args.action ? 'channel_action' : name,
                { channel_id: group.id, ...args },
                new AbortController().signal,
              )
            ).result,
          ),
        ),
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}
