import { expect, it, vi } from 'vitest';

import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment(_run: AssignmentAgentRun) {},
    requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

it('counts a Tob send to a colleague as Tob Delegation and ignores other Bot DMs', async () => {
  const capture = vi.fn();
  let tobSlug = '';
  const core = createCore({
    dshHome: createTempRoot('botharness-tob-delegation-'),
    capture,
    agents: adapter(async (run) => {
      if (run.inboundChannelId !== 'dm-' + run.bot.slug) return;
      if (run.bot.slug === tobSlug || run.bot.slug === 'ada')
        await run.channels.sendToBot({ botSlug: 'bea', body: 'Please check the build' });
    }),
  });
  try {
    const home = await core.tob.ensure();
    tobSlug = home.botSlug;
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bea', displayName: 'Bea' });
    for (const [channelId, id] of [
      [home.channelId, 'human-tob'],
      [core.channels.getOrCreateDm('ada', 'Ada')!.id, 'human-ada'],
    ] as const) {
      await core.channels.appendMessage(channelId, {
        id,
        at: '2026-10-28T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Ask Bea',
      });
      core.runtime.admitDmMessage({ channelId, messageId: id, body: 'Ask Bea' });
      await core.runtime.whenIdle();
    }
    expect(
      core.channels.list().filter((channel) => channel.type === 'dm' && !channel.botSlug),
    ).toHaveLength(2);
    expect(capture.mock.calls.filter(([event]) => event === 'tob:delegation_send')).toEqual([
      ['tob:delegation_send', { surface: 'bot_tool' }],
    ]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
