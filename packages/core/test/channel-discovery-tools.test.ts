import {
  parameterSchemaSpecToJsonSchema,
  validateArgs,
  type ToolDefinition,
  type ToolRunContext,
} from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

async function withTools(
  check: (
    tools: readonly ToolDefinition[],
    fixture: {
      core: ReturnType<typeof createCore>;
      team: string;
      other: string;
      privateId: string;
      requestId: string;
    },
  ) => Promise<void>,
) {
  let fixture: Parameters<typeof check>[1];
  const failures: unknown[] = [];
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (session, tools) => {
        if (fixture.core.ownership.resolve(session.id)?.botSlug !== 'ada') return;
        try {
          await check(tools, fixture);
        } catch (error) {
          failures.push(error);
          throw error;
        }
      },
    },
  );
  const core = createCore({
    dshHome: createTempRoot('botharness-discovery-tools-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => `/memory/${bot.slug}`,
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  try {
    for (const slug of ['ada', 'bea', 'cee'])
      core.registry.create({ slug, displayName: slug.toUpperCase() });
    const team = core.channels.createGroup({
      name: 'Team A',
      members: ['ada', 'bea'],
      ownerBotSlug: 'ada',
    });
    const other = core.channels.createGroup({ name: 'Team B', members: ['ada', 'bea'] });
    const privateGroup = core.channels.createGroup({ name: 'Private secret', members: ['cee'] });
    const request = core.channels.requestGroupJoin({
      channelId: team.id,
      requesterBotSlug: 'cee',
      requesterBotCreatedAt: core.registry.get('cee')!.createdAt,
    });
    fixture = {
      core,
      team: team.id,
      other: other.id,
      privateId: privateGroup.id,
      requestId: request.id,
    };
    for (const [kind, author] of [
      ['human', { kind: 'human' as const }],
      ['bot', { kind: 'bot' as const, slug: 'bea' }],
      ['bridged', { kind: 'bridged' as const, source: 'qa' }],
      ['system', { kind: 'system' as const }],
    ] as const) {
      for (const index of [1, 2])
        await core.channels.appendMessage(team.id, {
          id: `${kind}-${index}`,
          at: `2026-09-01T00:00:0${index}.000Z`,
          author,
          ...(kind === 'system'
            ? {
                memberDeparture: {
                  memberKind: 'bot' as const,
                  memberId: 'former',
                  displayName: 'Former',
                  departureType: 'left' as const,
                },
              }
            : {}),
          body: `needle ${kind} ${index}`,
        });
    }
    await core.channels.appendMessage(other.id, {
      id: 'other-record',
      at: '2026-09-01T00:00:03.000Z',
      author: { kind: 'human' },
      body: 'needle other',
    });
    await core.channels.appendMessage(privateGroup.id, {
      id: 'private-record',
      at: '2026-09-01T00:00:04.000Z',
      author: { kind: 'human' },
      body: 'needle secret',
    });
    const dm = core.channels.getOrCreateDm('ada', 'ADA')!;
    await core.channels.appendMessage(dm.id, {
      id: 'human-check',
      at: '2026-09-02T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Check',
    });
    core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'human-check', body: 'Check' });
    await core.runtime.whenIdle();
    expect(failures).toEqual([]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

async function call(tools: readonly ToolDefinition[], name: string, args: unknown) {
  return JSON.parse(
    String(
      await tools
        .find((tool) => tool.name === name)!
        .execute(args, { signal: new AbortController().signal } as ToolRunContext),
    ),
  );
}

describe('registered Channel discovery/read contracts', () => {
  it('sends trusted Human targets discovered through the registered tools', async () => {
    await withTools(async (tools, { core, team }) => {
      const listed = await call(tools, 'channel_list', { channel_id: team });
      expect(listed.channels[0].humanMembers).toEqual([
        { humanId: 'local-human', displayName: 'Human' },
      ]);
      const send = tools.find((tool) => tool.name === 'bot_send_message')!;
      for (const invalid of ['local-human', { humanId: 'local-human' }, null, [12]]) {
        await expect(
          send.execute({ channel_id: team, body: 'Invalid mention', mention_human_ids: invalid }, {
            signal: new AbortController().signal,
          } as ToolRunContext),
        ).rejects.toThrow('invalid arguments');
      }
      await send.execute({ channel_id: team, body: 'Ready?', mention_human_ids: ['local-human'] }, {
        signal: new AbortController().signal,
      } as ToolRunContext);
      expect(
        core.humanAttention.list({ category: 'replies', channelId: team }).items,
      ).toMatchObject([{ kind: 'channel-mention', summary: '@Human Ready?' }]);
    });
  });
  it('enforces the existing enum choices in converted schemas without tightening numeric compatibility', async () => {
    await withTools(async (tools) => {
      const list = tools.find((tool) => tool.name === 'channel_list')!.parameters;
      const read = tools.find((tool) => tool.name === 'channel_read')!.parameters;
      expect(list).toMatchObject({
        properties: { type: { enum: ['group', 'dm'] }, limit: { type: 'number' } },
      });
      expect(read).toMatchObject({
        properties: {
          scope: { enum: ['channel', 'joined'] },
          author_kind: { enum: ['human', 'bot', 'bridged', 'system'] },
          limit: { type: 'number' },
        },
      });
      for (const [name, args] of [
        ['channel_list', { type: 'private' }],
        ['channel_read', { scope: 'all' }],
        ['channel_read', { author_kind: 'agent' }],
      ] as const)
        await expect(call(tools, name, args)).rejects.toThrow('invalid arguments');
    });
  });

  it('keeps filtered cursor discovery, stable members and creator request IDs private', async () => {
    await withTools(async (tools, fixture) => {
      const filters = {
        type: 'group',
        name: ' TEAM ',
        member_bot_ids: ['bea', 'ada', 'bea'],
        limit: 1,
      };
      const first = await call(tools, 'channel_list', filters);
      const second = await call(tools, 'channel_list', { ...filters, cursor: first.nextCursor });
      expect([first.channels[0].id, second.channels[0].id]).toEqual([fixture.team, fixture.other]);
      expect(first.channels[0].members).toEqual([
        { botId: 'ada', displayName: 'ADA', active: true },
        { botId: 'bea', displayName: 'BEA', active: true },
      ]);
      expect(first.channels[0].pendingJoinRequests).toEqual([
        {
          requestId: fixture.requestId,
          requesterBotId: 'cee',
          createdAt: fixture.core.channels.get(fixture.team)!.joinRequests![0]!.createdAt,
        },
      ]);
      expect(second.channels[0].pendingJoinRequests).toBeUndefined();
      expect(second.nextCursor).toBeUndefined();
      await expect(
        call(tools, 'channel_list', { ...filters, name: 'Other', cursor: first.nextCursor }),
      ).rejects.toThrow('invalid cursor');
      expect(
        (await call(tools, 'channel_list', { type: 'dm' })).channels.map(
          (entry: { kind: string }) => entry.kind,
        ),
      ).toEqual(['human-dm']);
      expect(await call(tools, 'channel_list', { channel_id: fixture.privateId })).toEqual({
        channels: [],
        outcome: 'no-accessible-match',
      });
      expect(await call(tools, 'channel_list', { channel_id: 'group-missing' })).toEqual({
        channels: [],
        outcome: 'no-accessible-match',
      });
      expect(
        await call(tools, 'channel_list', { channel_id: fixture.team, name: 'no-match' }),
      ).toEqual({ channels: [], outcome: 'no-accessible-match' });
      expect(await call(tools, 'channel_list', { name: 'no-match' })).toEqual({ channels: [] });
      await expect(call(tools, 'channel_read', { channel_id: fixture.privateId })).rejects.toThrow(
        'not a member',
      );
    });
  });

  it.each(['human', 'bot', 'bridged', 'system'] as const)(
    'supports %s author queries and filter-bound history cursors',
    async (author_kind) => {
      await withTools(async (tools, fixture) => {
        const filters = {
          channel_id: fixture.team,
          scope: 'channel',
          text: ' NEEDLE ',
          author_kind,
          from: '2026-09-01',
          to: '2026-09-01',
          limit: 1,
        };
        const first = await call(tools, 'channel_read', filters);
        const second = await call(tools, 'channel_read', { ...filters, cursor: first.nextCursor });
        expect(first.messages.map((view: { message: { id: string } }) => view.message.id)).toEqual([
          `${author_kind}-2`,
        ]);
        expect(second.messages.map((view: { message: { id: string } }) => view.message.id)).toEqual(
          [`${author_kind}-1`],
        );
        expect(second.nextCursor).toBeUndefined();
        await expect(
          call(tools, 'channel_read', { ...filters, text: 'changed', cursor: first.nextCursor }),
        ).rejects.toThrow('invalid cursor');
        if (author_kind === 'bot')
          expect(
            (await call(tools, 'channel_read', { channel_id: fixture.team, author_bot_id: 'bea' }))
              .messages,
          ).toHaveLength(2);
      });
    },
  );

  it('searches only joined history across pages and rejects incompatible or invalid filters', async () => {
    await withTools(async (tools, fixture) => {
      const filters = { scope: 'joined', text: 'needle', author_kind: 'human', limit: 2 };
      const first = await call(tools, 'channel_read', filters);
      const second = await call(tools, 'channel_read', { ...filters, cursor: first.nextCursor });
      expect([...first.messages, ...second.messages].map((view) => view.message.id)).toEqual([
        'other-record',
        'human-2',
        'human-1',
      ]);
      expect(second.nextCursor).toBeUndefined();
      expect(await call(tools, 'channel_read', { scope: 'joined', text: 'no-match' })).toEqual({
        outputLimit: 12000,
        messages: [],
      });
      for (const [args, error] of [
        [{ scope: 'joined' }, 'must not be blank'],
        [{ scope: 'joined', text: '  ' }, 'must not be blank'],
        [{ scope: 'joined', text: 'needle', channel_id: fixture.team }, 'cannot be combined'],
        [
          { channel_id: fixture.team, author_bot_id: 'bea', author_kind: 'human' },
          'requires author_kind bot',
        ],
        [{ channel_id: fixture.team, from: 'invalid' }, 'invalid date range'],
        [{ channel_id: fixture.team, from: '2026-09-02', to: '2026-09-01' }, 'invalid date range'],
      ] as const)
        await expect(call(tools, 'channel_read', args)).rejects.toThrow(error);
      await expect(
        call(tools, 'channel_read', { ...filters, text: 'changed', cursor: first.nextCursor }),
      ).rejects.toThrow('invalid cursor');
      fixture.core.channels.removeGroupMember(fixture.other, 'ada');
      await expect(
        call(tools, 'channel_read', { ...filters, cursor: first.nextCursor }),
      ).rejects.toThrow('invalid cursor');
      await expect(call(tools, 'channel_read', { channel_id: fixture.other })).rejects.toThrow(
        'not a member',
      );
    });
  });

  it('preserves legacy floor/clamp limits and inclusive timestamp/date-only boundaries', async () => {
    await withTools(async (tools, fixture) => {
      for (const [limit, listed, read] of [
        [0, 1, 1],
        [-1, 1, 1],
        [1.9, 1, 1],
        [1000, 2, 8],
      ] as const) {
        expect((await call(tools, 'channel_list', { type: 'group', limit })).channels).toHaveLength(
          listed,
        );
        expect(
          (await call(tools, 'channel_read', { channel_id: fixture.team, limit })).messages,
        ).toHaveLength(read);
        expect(
          (
            await call(tools, 'channel_read', {
              scope: 'joined',
              text: 'needle',
              author_kind: 'system',
              limit,
            })
          ).messages,
        ).toHaveLength(Math.min(read, 2));
      }
      expect(
        (
          await call(tools, 'channel_read', {
            channel_id: fixture.team,
            author_kind: 'human',
            from: '2026-09-01T00:00:01.000Z',
            to: '2026-09-01T00:00:01.000Z',
          })
        ).messages.map((view: { message: { id: string } }) => view.message.id),
      ).toEqual(['human-1']);
      expect(
        (
          await call(tools, 'channel_read', {
            channel_id: fixture.team,
            author_kind: 'human',
            from: '2026-09-01',
            to: '2026-09-01',
          })
        ).messages,
      ).toHaveLength(2);
    });
  });

  it('verifies pinned DSH integer support and rejects unsupported range keywords', () => {
    expect(validateArgs({ limit: { type: 'integer' } }, { limit: 1.5 })).not.toEqual([]);
    expect(validateArgs({ limit: { type: 'integer' } }, { limit: 2 })).toEqual([]);
    for (const keyword of ['minimum', 'maximum'])
      expect(() =>
        Reflect.apply(parameterSchemaSpecToJsonSchema, undefined, [
          { limit: { type: 'number', [keyword]: 1 } },
        ]),
      ).toThrow('unsupported');
  });
});
