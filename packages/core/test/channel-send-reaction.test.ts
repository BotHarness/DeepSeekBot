import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

async function setup() {
  const core = createCore({
    dshHome: createTempRoot('botharness-channel-send-reaction-'),
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }),
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
  const channels = core.channels;
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const other = channels.createGroup({ name: 'Bea only', members: ['bea'] });
  await channels.appendMessage(dm.id, {
    id: 'trigger',
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Thanks, that fixed it',
  });
  const signal = new AbortController().signal;
  const send = async (args: Record<string, unknown>) =>
    (
      await core.runtime.runDirectBotTool!(
        'ada',
        'channel_action',
        { action: 'react', channel_id: dm.id, ...args },
        signal,
      )
    ).result as Record<string, unknown>;
  return {
    channels,
    dm,
    other,
    send,
    close: async () => {
      await core.runtime.close();
      core.operationalDatabase.close();
    },
  };
}

describe('channel_action reactions', () => {
  it('reacts without sending a message when body is empty, and takes the reaction back', async () => {
    const state = await setup();
    const { channels, dm, send } = state;
    try {
      const before = channels.readMessages(dm.id).length;
      expect(await send({ body: '', react_to: 'trigger', reaction: '✅' })).toEqual({
        channelId: dm.id,
        messageId: 'trigger',
        reactions: [{ emoji: '✅', actors: [{ kind: 'bot', id: 'ada' }] }],
      });
      expect(channels.readMessages(dm.id)).toHaveLength(before);
      expect(
        await send({ body: '', react_to: 'trigger', reaction: '✅', remove_reaction: true }),
      ).toMatchObject({ reactions: [] });
      expect(channels.message(dm.id, 'trigger')?.reactions ?? []).toEqual([]);
      expect(await send({ body: ' ', react_to: 'trigger', reaction: '👀' })).toMatchObject({
        reactions: [{ emoji: '👀', actors: [{ kind: 'bot', id: 'ada' }] }],
      });
      expect(channels.readMessages(dm.id)).toHaveLength(before);
    } finally {
      await state.close();
    }
  });

  it('cannot send a reply through the reaction action', async () => {
    const state = await setup();
    const { channels, dm, send } = state;
    try {
      const result = await send({ body: '7×8 = 56', react_to: 'trigger', reaction: '👀' });
      expect(result).toMatchObject({
        channelId: dm.id,
        reactions: [{ emoji: '👀', actors: [{ kind: 'bot', id: 'ada' }] }],
      });
      expect(channels.readMessages(dm.id).some((message) => message.body === '7×8 = 56')).toBe(
        false,
      );
    } finally {
      await state.close();
    }
  });

  it('refuses a missing emoji, a text emoji, a missing message and a Channel the Bot has not joined', async () => {
    const state = await setup();
    const { other, send } = state;
    try {
      await expect(send({ body: '', react_to: 'trigger', remove_reaction: true })).rejects.toThrow(
        'reaction requires a message and emoji',
      );
      await expect(send({ body: '', react_to: 'trigger', reaction: 'ok' })).rejects.toThrow(
        'cannot take this reaction',
      );
      await expect(send({ body: '', react_to: 'missing', reaction: '👍' })).rejects.toThrow(
        'cannot take this reaction',
      );
      await expect(
        send({ body: '', channel_id: other!.id, react_to: 'x', reaction: '👍' }),
      ).rejects.toThrow('not a member');
    } finally {
      await state.close();
    }
  });
});
