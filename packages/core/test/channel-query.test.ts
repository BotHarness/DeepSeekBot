import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';

import { queryChannelMessages } from '../src/channels/store.js';
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

describe('PersonaBot Channel history query', () => {
  it('filters old messages by author, date, and text before paginating, without leaking another Group', async () => {
    const home = createTempRoot('botharness-channel-query-');
    let groupId = '';
    let otherId = '';
    let privateId = '';
    let checked = false;
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.bot.slug !== 'ada') return;
        const filter = {
          channelId: groupId,
          text: 'NEEDLE',
          authorBotId: 'bea',
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-02T00:00:00.000Z',
          limit: 1,
        };
        const first = run.channels.query(filter);
        expect(first.messages.map((view) => view.message.id)).toEqual(['old-100']);
        expect(first.messages[0]?.message.replyToPreview?.body).toBe('needle 5');
        const cursor = first.nextCursor;
        if (cursor === undefined) throw new Error('Expected second history page');
        const second = run.channels.query({ ...filter, cursor });
        expect(second.messages.map((view) => view.message.id)).toEqual(['old-5']);
        expect(second.messages[0]?.message.replyToPreview).toBeUndefined();
        expect(second.nextCursor).toBeUndefined();
        expect(
          run.channels
            .query({ channelId: groupId, text: 'needle', authorKind: 'human' })
            .messages.map((view) => view.message.id),
        ).toContain('old-210');
        expect(
          run.channels
            .query({ ...filter, from: '2026-09-01T00:01:00.000Z' })
            .messages.map((view) => view.message.id),
        ).toEqual(['old-100']);
        expect(() => run.channels.query({ ...filter, text: 'different', cursor })).toThrow(
          'invalid cursor',
        );
        expect(() => run.channels.query({ ...filter, authorKind: 'human' })).toThrow(
          'requires author_kind bot',
        );
        expect(
          run.channels
            .query({ channelId: groupId, text: 'café' })
            .messages.map((view) => view.message.id),
        ).toEqual(['unicode-1']);
        expect(
          run.channels
            .query({ channelId: groupId, text: 'needle', to: '2026-09-01' })
            .messages.map((view) => view.message.id),
        ).toEqual(['old-210', 'old-100', 'old-5']);
        expect(
          run.channels
            .query({ channelId: groupId, text: 'needle', to: '2026-09-01T00:00:05.000Z' })
            .messages.map((view) => view.message.id),
        ).toEqual(['old-5']);
        expect(() => run.channels.query({ channelId: privateId })).toThrow('not a member');
        expect(() => Reflect.apply(run.channels.list, undefined, [{ type: 'private' }])).toThrow(
          'type must be group or dm',
        );
        expect(() => Reflect.apply(run.channels.query, undefined, [{ scope: 'all' }])).toThrow(
          'invalid scope',
        );
        expect(() =>
          Reflect.apply(run.channels.query, undefined, [
            { channelId: groupId, authorKind: 'agent' },
          ]),
        ).toThrow('invalid author_kind');
        const joined = run.channels.query({ scope: 'joined', text: 'needle', limit: 2 });
        expect(joined.messages.map((view) => view.message.id)).toEqual(['other-1', 'old-210']);
        const joinedCursor = joined.nextCursor;
        if (joinedCursor === undefined) throw new Error('Expected second joined history page');
        const joinedNext = run.channels.query({
          scope: 'joined',
          text: 'needle',
          cursor: joinedCursor,
          limit: 2,
        });
        expect(joinedNext.messages.map((view) => view.message.id)).toEqual(['old-100', 'old-5']);
        expect(joinedNext.nextCursor).toBeUndefined();
        expect(
          run.channels
            .query({ scope: 'joined', text: 'needle', authorBotId: 'bea' })
            .messages.map((view) => view.message.id),
        ).toEqual(['old-100', 'old-5']);
        expect(() =>
          run.channels.query({ scope: 'joined', text: 'other', cursor: joinedCursor }),
        ).toThrow('invalid cursor');
        expect(() =>
          run.channels.query({ scope: 'joined', text: 'needle', channelId: otherId }),
        ).toThrow('cannot be combined');
        core.channels.removeGroupMember(otherId, 'ada');
        expect(() =>
          run.channels.query({ scope: 'joined', text: 'needle', cursor: joinedCursor }),
        ).toThrow('invalid cursor');
        checked = true;
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      core.registry.create({ slug: 'cee', displayName: 'Cee' });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'History',
        members: ['ada', 'bea'],
      });
      groupId = group.id;
      privateId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Private',
        members: ['cee'],
      }).id;
      otherId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Other',
        members: ['ada'],
      }).id;
      for (let index = 0; index < 215; index++) {
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
          id: 'old-' + index,
          at: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
          author: index === 5 || index === 100 ? { kind: 'bot', slug: 'bea' } : { kind: 'human' },
          body:
            index === 5 || index === 100 || index === 210 ? 'needle ' + index : 'filler ' + index,
          ...(index === 100 ? { replyTo: 'old-5' } : {}),
        });
      }
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
        id: 'unicode-1',
        at: '2026-09-01T00:04:00.000Z',
        author: { kind: 'human' },
        body: 'CAFÉ status',
      });
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, otherId, {
        id: 'other-1',
        at: '2026-09-01T00:04:00.000Z',
        author: { kind: 'human' },
        body: 'needle from another joined Channel',
      });
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, privateId, {
        id: 'secret-1',
        at: '2026-09-01T00:05:00.000Z',
        author: { kind: 'human' },
        body: 'needle must stay private',
      });
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'ask-history',
        at: '2026-09-02T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Find old messages',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'ask-history',
        body: 'Find old messages',
      });
      await core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('orders file-backed query pages by instant across UTC offsets', () => {
    const messages = [
      {
        id: 'utc',
        at: '2026-09-02T00:01:00.000Z',
        author: { kind: 'human' as const },
        body: 'chronology',
      },
      {
        id: 'offset',
        at: '2026-09-02T00:30:00+01:00',
        author: { kind: 'human' as const },
        body: 'chronology',
      },
    ];
    const first = queryChannelMessages('group-time', messages, { orderBy: 'time', limit: 1 });
    expect(first.messages.map((message) => message.id)).toEqual(['utc']);
    if (first.nextCursor === undefined) throw new Error('Expected time cursor');
    expect(
      queryChannelMessages('group-time', messages, {
        orderBy: 'time',
        limit: 1,
        cursor: first.nextCursor,
      }).messages.map((message) => message.id),
    ).toEqual(['offset']);
  });

  it('sorts cross-Channel pages by message time when older commits arrive later', async () => {
    const home = createTempRoot('botharness-joined-order-');
    let groupId = '';
    let checked = false;
    let failure: unknown;
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        try {
          const first = run.channels.query({ scope: 'joined', text: 'chronology', limit: 2 });
          expect(first.messages.map((view) => view.message.id)).toEqual(['new-119', 'new-118']);
          const cursor = first.nextCursor;
          if (cursor === undefined) throw new Error('Expected joined cursor');
          const second = run.channels.query({
            scope: 'joined',
            text: 'chronology',
            cursor,
            limit: 2,
          });
          expect(second.messages.map((view) => view.message.id)).toEqual(['new-117', 'new-116']);
          const groupFirst = run.channels.query({
            channelId: groupId,
            text: 'chronology',
            orderBy: 'time',
            limit: 2,
          });
          expect(groupFirst.messages.map((view) => view.message.id)).toEqual([
            'new-119',
            'new-118',
          ]);
          const offsetFilter = {
            scope: 'joined' as const,
            text: 'chronology',
            from: '2026-09-01T23:30:00.000Z',
            to: '2026-09-02T00:00:00.000Z',
            limit: 1,
          };
          const offsetFirst = run.channels.query(offsetFilter);
          expect(offsetFirst.messages.map((view) => view.message.id)).toEqual(['new-0']);
          const offsetCursor = offsetFirst.nextCursor;
          if (offsetCursor === undefined) throw new Error('Expected offset cursor');
          expect(
            run.channels
              .query({ ...offsetFilter, cursor: offsetCursor })
              .messages.map((view) => view.message.id),
          ).toEqual(['offset-backfill']);
          checked = true;
        } catch (error) {
          failure = error;
          throw error;
        }
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Timeline',
        members: ['ada'],
      });
      groupId = group.id;
      for (const [prefix, day] of [
        ['new', 2],
        ['backfill', 1],
      ] as const) {
        for (let index = 0; index < 120; index++) {
          await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
            id: prefix + '-' + index,
            at: new Date(Date.UTC(2026, 8, day, 0, 0, index)).toISOString(),
            author: { kind: 'human' },
            body: 'chronology ' + prefix + ' ' + index,
          });
        }
      }
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
        id: 'offset-backfill',
        at: '2026-09-02T00:30:00+01:00',
        author: { kind: 'human' },
        body: 'chronology offset backfill',
      });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'ask-order',
        at: '2026-09-03T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Find history',
      });
      core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'ask-order',
        body: 'Find history',
      });
      await core.runtime.whenIdle();
      expect(failure).toBeUndefined();
      expect(checked).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
