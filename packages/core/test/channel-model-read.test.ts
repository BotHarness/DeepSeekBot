import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import type { ChannelMessage } from '../src/channels/channel.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import {
  CHANNEL_READ_OUTPUT_LIMIT,
  projectModelMessage,
} from '../src/runtime/channel-model-read.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

async function call(tools: readonly ToolDefinition[], args: unknown) {
  const output = String(
    await tools.find((tool) => tool.name === 'channel_read')!.execute(args, {} as ToolRunContext),
  );
  expect(output.length).toBeLessThanOrEqual(CHANNEL_READ_OUTPUT_LIMIT);
  return JSON.parse(output);
}

async function fixture(
  seed: ChannelMessage[],
  check: (input: {
    tools: readonly ToolDefinition[];
    core: ReturnType<typeof createCore>;
    groupId: string;
    states: () => Record<string, string>;
  }) => Promise<void>,
  fail = false,
  turns = 1,
) {
  let groupId = '';
  const failures: unknown[] = [];
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (_session, tools) => {
        try {
          await check({ tools, core, groupId, states });
        } catch (error) {
          failures.push(error);
          throw error;
        }
        if (fail) throw new Error('model failed after bounded read');
      },
    },
  );
  const core = createCore({
    dshHome: createTempRoot('botharness-model-read-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  const states = () =>
    attachOperationalModule(core.operationalDatabase, 'model-read-test').read((db) =>
      Object.fromEntries(
        db
          .prepare(
            `SELECT e.message_id, a.attempt_state FROM inbox_admissions a JOIN source_events e ON e.source_event_id=a.source_event_id WHERE a.bot_slug='ada'`,
          )
          .all()
          .map((row) => [String(row.message_id), String(row.attempt_state)]),
      ),
    );
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = core.channels.createGroup({ name: 'Silent', members: ['ada'] });
    groupId = group.id;
    core.channels.setGroupWakePolicy(groupId, 'ada', {
      mode: 'silent',
      count: 5,
      intervalSeconds: 30,
    });
    for (const message of seed) {
      await core.channels.appendMessageOnce(groupId, message);
      core.runtime.admitGroupMessage(groupId, message.id);
    }
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    for (let turn = 0; turn < turns; turn += 1) {
      const messageId = 'trigger-' + turn;
      await core.channels.appendMessageOnce(dm.id, {
        id: messageId,
        at: '2026-09-03T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Read the silent history',
      });
      core.runtime.admitDmMessage({ channelId: dm.id, messageId, body: 'Read the silent history' });
      await core.runtime.whenIdle();
    }
    expect(failures).toEqual([]);
    return states();
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

const seed = [1, 2, 3].map((index) => ({
  id: `record-${index}`,
  at: `2026-09-01T00:00:0${index}.000Z`,
  author: { kind: 'human' as const },
  body: 'needle ' + 'x'.repeat(6000),
  humanReceipts: [{ humanId: 'local-human', displayName: 'Human', state: 'read' as const }],
}));
const long: ChannelMessage = {
  id: 'long',
  at: '2026-09-01T00:00:00.000Z',
  author: { kind: 'human' },
  body: 'needle ' + 'escaped " line\n 🐻 '.repeat(1800),
};

describe('bounded model Channel read and exact Inbox settlement', () => {
  it.each(['channel', 'joined'] as const)(
    'selects %s content before observing and preserves filter-bound continuation',
    async (scope) => {
      const result = await fixture(seed, async ({ tools, groupId, states }) => {
        const args = {
          ...(scope === 'channel' ? { channel_id: groupId } : {}),
          scope,
          text: 'needle',
          author_kind: 'human',
          limit: 3,
        };
        const page = await call(tools, args);
        expect(page.messages.map((view: { message: { id: string } }) => view.message.id)).toEqual([
          'record-3',
        ]);
        expect(page.messages[0].message).not.toHaveProperty('humanReceipts');
        expect(page.messages[0].message).not.toHaveProperty('deliveries');
        expect(page.messages[0].message).not.toHaveProperty('channelRevision');
        expect(page.omitted.count).toBe(2);
        expect(page.nextCursor).toBeTypeOf('string');
        expect(states()).toMatchObject({
          'record-3': 'running',
          'record-2': 'pending',
          'record-1': 'pending',
        });
        await expect(
          call(tools, { ...args, text: 'changed', cursor: page.nextCursor }),
        ).rejects.toThrow('invalid cursor');
        const next = await call(tools, { ...args, cursor: page.nextCursor });
        expect(next.messages[0].message.id).toBe('record-2');
        expect(states()['record-1']).toBe('pending');
      });
      expect(result).toMatchObject({
        'record-3': 'handled',
        'record-2': 'handled',
        'record-1': 'pending',
      });
    },
  );

  it('settles only included content to needs-repair after a failed turn', async () => {
    const result = await fixture(
      seed,
      async ({ tools, groupId }) => {
        await call(tools, { channel_id: groupId, text: 'needle', limit: 3 });
      },
      true,
    );
    expect(result).toMatchObject({
      'record-3': 'needs-repair',
      'record-2': 'pending',
      'record-1': 'pending',
    });
  });

  it('continues past an oversized first message without consuming it or losing older results', async () => {
    const older: ChannelMessage = {
      id: 'older',
      at: '2026-08-31T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'needle older content',
    };
    const result = await fixture([older, long], async ({ tools, groupId, states }) => {
      const first = await call(tools, { channel_id: groupId, text: 'needle', limit: 2 });
      expect(first.messages).toEqual([]);
      expect(first.omitted.readContent.message_id).toBe('long');
      expect(first.nextCursor).toBeTypeOf('string');
      expect(states()).toMatchObject({ long: 'pending', older: 'pending' });
      const next = await call(tools, {
        channel_id: groupId,
        text: 'needle',
        limit: 2,
        cursor: first.nextCursor,
      });
      expect(next.messages.map((view: { message: { id: string } }) => view.message.id)).toEqual([
        'older',
      ]);
      expect(states()).toMatchObject({ long: 'pending', older: 'running' });
    });
    expect(result).toMatchObject({ long: 'pending', older: 'handled' });
  });

  it('bounds a merged joined page before observing messages from another Channel', async () => {
    const result = await fixture(seed, async ({ tools, core, groupId, states }) => {
      const other = core.channels.createGroup({ name: 'Other', members: ['ada'] });
      core.channels.setGroupWakePolicy(other.id, 'ada', {
        mode: 'silent',
        count: 5,
        intervalSeconds: 30,
      });
      await core.channels.appendMessageOnce(other.id, {
        id: 'cross',
        at: '2026-09-01T00:00:09.000Z',
        author: { kind: 'human' },
        body: 'needle ' + 'x'.repeat(6000),
      });
      core.runtime.admitGroupMessage(other.id, 'cross');
      const args = { scope: 'joined', text: 'needle', limit: 4 };
      const first = await call(tools, args);
      expect(first.messages[0].channelId).toBe(other.id);
      expect(first.messages[0].message.id).toBe('cross');
      expect(states()).toMatchObject({
        cross: 'running',
        'record-3': 'pending',
        'record-2': 'pending',
        'record-1': 'pending',
      });
      const next = await call(tools, { ...args, cursor: first.nextCursor });
      expect(next.messages[0].channelId).toBe(groupId);
      expect(next.messages[0].message.id).toBe('record-3');
    });
    expect(result).toMatchObject({
      cross: 'handled',
      'record-3': 'handled',
      'record-2': 'pending',
      'record-1': 'pending',
    });
  });

  it('keeps a single oversized message pending after metadata lookup and partial content', async () => {
    const result = await fixture([long], async ({ tools, core, groupId, states }) => {
      const page = await call(tools, { channel_id: groupId });
      expect(page.messages).toEqual([]);
      expect(page.omitted.readContent).toEqual({ channel_id: groupId, message_id: 'long' });
      expect(states().long).toBe('pending');
      core.channels.message(groupId, 'long');
      const part = await call(tools, { channel_id: groupId, message_id: 'long' });
      expect(part.complete).toBe(false);
      expect(part.contentCursor).toBeTypeOf('string');
      expect(states().long).toBe('pending');
      await expect(
        call(tools, { channel_id: groupId, message_id: 'long', scope: 'joined' }),
      ).rejects.toThrow('cannot be combined');
      await expect(call(tools, { content_cursor: part.contentCursor })).rejects.toThrow(
        'requires message_id',
      );
    });
    expect(result.long).toBe('pending');
  });

  it('retrieves complete escaped Unicode content across bounded fragments before including its exact ID', async () => {
    const result = await fixture([long], async ({ tools, core, groupId, states }) => {
      let cursor: string | undefined;
      let content = '';
      let pages = 0;
      do {
        const part = await call(tools, {
          channel_id: groupId,
          message_id: 'long',
          ...(cursor === undefined ? {} : { content_cursor: cursor }),
        });
        content += part.content;
        cursor = part.contentCursor;
        pages += 1;
        expect(states().long).toBe(cursor === undefined ? 'running' : 'pending');
      } while (cursor !== undefined && pages < 20);
      expect(cursor).toBeUndefined();
      expect(pages).toBeGreaterThan(1);
      expect(JSON.parse(content)).toEqual(
        projectModelMessage({
          channelId: groupId,
          channelName: 'Silent',
          actorNames: { humans: { 'local-human': 'Human' }, bots: {} },
          message: core.channels.message(groupId, 'long')!,
        }),
      );
    });
    expect(result.long).toBe('handled');
  });

  it('does not consume content whose earlier fragments were only read in a previous turn', async () => {
    let turn = 0;
    let cursor: string | undefined;
    const result = await fixture(
      [long],
      async ({ tools, groupId, states }) => {
        if (turn++ === 0) {
          cursor = (await call(tools, { channel_id: groupId, message_id: 'long' })).contentCursor;
          return;
        }
        let pages = 0;
        do {
          const part = await call(tools, {
            channel_id: groupId,
            message_id: 'long',
            content_cursor: cursor,
          });
          cursor = part.contentCursor;
          pages += 1;
        } while (cursor !== undefined && pages < 20);
        expect(cursor).toBeUndefined();
        expect(states().long).toBe('pending');
      },
      false,
      2,
    );
    expect(result.long).toBe('pending');
  });

  it('retrieves a single oversized action card completely without losing its call identity', async () => {
    const card: ChannelMessage = {
      id: 'huge-card',
      at: '2026-09-01T00:00:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Approve this tool',
      toolApprovalRequest: {
        sessionId: 'assignment-1',
        callId: 'call-big',
        toolName: 'shell',
        cwd: '/memory/ada',
        input: 'x'.repeat(25000),
        role: 'assignment',
      },
    };
    await fixture([card], async ({ tools, groupId }) => {
      const page = await call(tools, { channel_id: groupId });
      expect(page.messages).toEqual([]);
      expect(page.omitted.readContent.message_id).toBe('huge-card');
      let cursor: string | undefined;
      let text = '';
      let pages = 0;
      do {
        const part = await call(tools, {
          channel_id: groupId,
          message_id: 'huge-card',
          ...(cursor === undefined ? {} : { content_cursor: cursor }),
        });
        text += part.content;
        cursor = part.contentCursor;
        pages += 1;
      } while (cursor !== undefined && pages < 20);
      expect(cursor).toBeUndefined();
      expect(JSON.parse(text).message.toolApprovalRequest).toEqual(card.toolApprovalRequest);
    });
  });

  it('rejects changed or cross-message content cursors and rechecks current membership', async () => {
    await fixture([long, { ...long, id: 'other-long' }], async ({ tools, core, groupId }) => {
      const first = await call(tools, { channel_id: groupId, message_id: 'long' });
      await expect(
        call(tools, {
          channel_id: groupId,
          message_id: 'other-long',
          content_cursor: first.contentCursor,
        }),
      ).rejects.toThrow('invalid content_cursor');
      await expect(
        call(tools, { channel_id: groupId, message_id: 'long', content_cursor: 'broken' }),
      ).rejects.toThrow('invalid content_cursor');
      core.channels.removeGroupMember(groupId, 'ada');
      await expect(
        call(tools, {
          channel_id: groupId,
          message_id: 'long',
          content_cursor: first.contentCursor,
        }),
      ).rejects.toThrow('not a member');
    });
  });

  it('preserves reply, attachment and action-card identity while omitting only presentation bookkeeping', async () => {
    const card: ChannelMessage = {
      id: 'card',
      at: '2026-09-01T00:00:02.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Approve the requested tool',
      replyTo: 'target',
      toolApprovalRequest: {
        sessionId: 'assignment-1',
        callId: 'call-1',
        toolName: 'shell',
        cwd: '/memory/ada',
        input: 'echo approved',
        role: 'assignment',
      },
      userQuestionRequest: {
        sessionId: 'assignment-1',
        questions: [
          { id: 'question-1', question: 'Which environment?', options: [{ label: 'Local' }] },
        ],
      },
      botCausation: {
        rootSourceEventId: 'source-root',
        parentSourceEventId: 'source-parent',
        hop: 1,
      },
    };
    await fixture(
      [
        {
          id: 'target',
          at: '2026-09-01T00:00:01.000Z',
          author: { kind: 'human' },
          body: 'Question',
        },
        card,
      ],
      async ({ tools, core, groupId }) => {
        const image = await core.attachments.upload({
          name: 'pixel.png',
          data: (async function* () {
            yield Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yjZkAAAAASUVORK5CYII=',
              'base64',
            );
          })(),
        });
        await core.channels.appendMessageOnce(groupId, {
          id: 'image',
          at: '2026-09-01T00:00:03.000Z',
          author: { kind: 'human' },
          body: 'Inspect this image',
          attachments: [image],
        });
        const page = await call(tools, { channel_id: groupId });
        expect(
          page.messages.find((v: { message: { id: string } }) => v.message.id === 'card').message,
        ).toMatchObject(card);
        expect(
          page.messages.find((v: { message: { id: string } }) => v.message.id === 'image').message
            .attachments,
        ).toEqual([image]);
        expect(page.messages[1].message.replyToPreview).toMatchObject({ body: 'Question' });
      },
    );
  });
});

describe('channel_read reactions', () => {
  it('shows Human reactions to the Bot as feedback on its message', () => {
    const reactions = [{ emoji: '👍', actors: [{ kind: 'human' as const, id: 'local-human' }] }];
    expect(
      projectModelMessage({
        channelId: 'dm-ada',
        channelName: 'Ada',
        actorNames: { humans: { 'local-human': 'Human' }, bots: {} },
        message: {
          id: 'bot-one',
          at: '2026-10-14T00:00:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'Done',
          channelRevision: 2,
          reactions,
        },
      }).message,
    ).toEqual({
      id: 'bot-one',
      at: '2026-10-14T00:00:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Done',
      reactions,
    });
  });
});
