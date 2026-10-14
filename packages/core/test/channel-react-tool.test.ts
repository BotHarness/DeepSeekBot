import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

type Core = ReturnType<typeof createCore>;

async function withBotTurn(
  check: (input: { core: Core; tools: readonly ToolDefinition[]; dmId: string }) => Promise<void>,
) {
  const failures: unknown[] = [];
  let checked = false;
  let dmId = '';
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (session, tools) => {
        if (session.header.cwd !== '/memory/ada' || checked) return;
        checked = true;
        try {
          await check({ core, tools, dmId });
        } catch (error) {
          failures.push(error);
          throw error;
        }
      },
    },
  );
  const core = createCore({
    dshHome: createTempRoot('botharness-channel-react-tool-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
    core.channels.createGroup({ name: 'Bea only', members: ['bea'] });
    dmId = core.channels.getOrCreateDm('ada', 'ada')!.id;
    await core.channels.appendMessage(dmId, {
      id: 'trigger',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Thanks, that fixed it',
    });
    core.runtime.admitDmMessage({ channelId: dmId, messageId: 'trigger', body: 'Thanks' });
    await core.runtime.whenIdle();
    expect(checked).toBe(true);
    expect(failures).toEqual([]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

const call = (tools: readonly ToolDefinition[], args: unknown) =>
  tools.find((tool) => tool.name === 'channel_react')!.execute(args, {} as ToolRunContext);

describe('channel_react Bot tool', () => {
  it('adds and removes the Bot reaction on a message in its inbound Channel', async () => {
    await withBotTurn(async ({ core, tools, dmId }) => {
      expect(JSON.parse(String(await call(tools, { message_id: 'trigger', emoji: '✅' })))).toEqual(
        {
          channelId: dmId,
          messageId: 'trigger',
          reactions: [{ emoji: '✅', actors: [{ kind: 'bot', id: 'ada' }] }],
        },
      );
      expect(core.channels.message(dmId, 'trigger')?.reactions).toEqual([
        { emoji: '✅', actors: [{ kind: 'bot', id: 'ada' }] },
      ]);
      expect(
        JSON.parse(String(await call(tools, { message_id: 'trigger', emoji: '✅', remove: true }))),
      ).toMatchObject({ reactions: [] });
      await expect(call(tools, { message_id: 'trigger', emoji: 'ok' })).rejects.toThrow(
        'cannot take this reaction',
      );
      await expect(call(tools, { message_id: 'missing', emoji: '👍' })).rejects.toThrow(
        'cannot take this reaction',
      );
    });
  });

  it('refuses a Channel the Bot has not joined', async () => {
    await withBotTurn(async ({ core, tools }) => {
      const other = core.channels.list().find((channel) => channel.name === 'Bea only')!;
      await expect(
        call(tools, { channel_id: other.id, message_id: 'x', emoji: '👍' }),
      ).rejects.toThrow('not a member');
    });
  });
});

describe('channelReact as a Bot', () => {
  it('runs the same Bot reaction path without the model and keeps the Human reaction apart', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-bot-react-direct-') });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-one',
        at: '2026-10-14T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Ship it',
      });
      const methods = createBridgeMethods({ ...core });
      methods.channelReact({ channelId: dm.id, messageId: 'human-one', emoji: '👍' });
      expect(
        methods.channelReact({
          channelId: dm.id,
          messageId: 'human-one',
          emoji: '👍',
          botId: 'ada',
        }),
      ).toEqual({
        ok: true,
        value: {
          reactions: [
            {
              emoji: '👍',
              actors: [
                { kind: 'human', id: 'local-human' },
                { kind: 'bot', id: 'ada' },
              ],
            },
          ],
        },
      });
      expect(
        methods.channelReact({
          channelId: dm.id,
          messageId: 'human-one',
          emoji: '👍',
          botId: 'bea',
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        methods.channelReact({
          channelId: dm.id,
          messageId: 'human-one',
          emoji: '👍',
          botId: 'nobody',
        }),
      ).toMatchObject({ ok: false });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
