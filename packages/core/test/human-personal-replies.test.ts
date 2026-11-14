import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  requestAssignment() {
    throw new Error('No Assignment expected');
  },
  async close() {},
};

describe('Human personal replies', () => {
  it('pages replies across Bots and Channels and binds cursors to their filters', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-reply-pages-'), agents });
    try {
      for (const slug of ['ada', 'bea']) core.registry.create({ slug, displayName: slug });
      const channels = ['Launch', 'Release'].map((name) =>
        core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name, members: ['ada', 'bea'] }),
      );
      for (const [index, channel] of channels.entries()) {
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
          id: 'human-plan',
          at: '2026-10-01T01:00:00Z',
          author: { kind: 'human' },
          body: 'Review.',
        });
        for (const slug of ['ada', 'bea'])
          await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
            id: 'reply-' + slug,
            at: new Date(Date.UTC(2026, 9, 1, 1, index + 1)).toISOString(),
            author: { kind: 'bot', slug },
            body: slug + ' reviewed.',
            replyTo: 'human-plan',
          });
      }
      const all = core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items;
      expect(all).toHaveLength(4);
      expect(all.slice(0, 2).every((item) => item.channelId === channels[1]!.id)).toBe(true);
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = core.humanAttention.list(OWNER_HUMAN_CONTEXT, {
          category: 'replies',
          limit: 1,
          ...(cursor === undefined ? {} : { cursor }),
        });
        ids.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      expect(ids).toEqual(all.map((item) => item.id));
      const first = core.humanAttention.list(OWNER_HUMAN_CONTEXT, {
        category: 'replies',
        limit: 1,
      });
      if (first.nextCursor === undefined) throw new Error('Expected another reply page');
      const firstCursor = first.nextCursor;
      expect(() =>
        core.humanAttention.list(OWNER_HUMAN_CONTEXT, {
          category: 'replies',
          botSlug: 'ada',
          cursor: firstCursor,
        }),
      ).toThrow('filters');
      expect(() =>
        core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'unread', cursor: firstCursor }),
      ).toThrow('filters');
      expect(
        core.humanAttention.list(OWNER_HUMAN_CONTEXT, {
          category: 'replies',
          botSlug: 'bea',
          channelId: channels[0]!.id,
        }).items,
      ).toMatchObject([{ botSlug: 'bea', channelId: channels[0]!.id }]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('requires both reply and original Human message inside the joined visibility boundary', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-reply-visibility-'), agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const channel = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['ada'],
      });
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id: 'human-plan',
        at: '2026-10-01T01:00:00Z',
        author: { kind: 'human' },
        body: 'Review.',
      });
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
        id: 'reply',
        at: '2026-10-01T01:01:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Reviewed.',
        replyTo: 'human-plan',
      });
      expect(
        core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items,
      ).toHaveLength(1);
      const database = attachOperationalModule(core.operationalDatabase, 'channels');
      database.transaction((db) =>
        db
          .prepare(
            'UPDATE channel_human_members SET visible_from_revision = 2 WHERE channel_id = ?',
          )
          .run(channel.id),
      );
      expect(core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items).toEqual(
        [],
      );
      expect(
        core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'unread' }).items,
      ).toMatchObject([{ messageId: 'reply', unreadCount: 1 }]);
      database.transaction((db) =>
        db
          .prepare(
            'UPDATE channel_human_members SET visible_from_revision = 1, left_at = ? WHERE channel_id = ?',
          )
          .run('2026-10-01T01:02:00Z', channel.id),
      );
      expect(core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items).toEqual(
        [],
      );
      expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount).toBe(0);
      database.transaction((db) =>
        db
          .prepare('UPDATE channel_human_members SET left_at = NULL WHERE channel_id = ?')
          .run(channel.id),
      );
      core.channels.deleteGroup(channel.id);
      expect(core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'replies' }).items).toEqual(
        [],
      );
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('projects a Group reply once, keeps its read fact, and reconstructs it after restart', async () => {
    const home = createTempRoot('botharness-personal-replies-');
    const core = createCore({ dshHome: home, agents });
    let expected: unknown;
    let groupId = '';
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Launch',
        members: ['ada'],
      });
      groupId = group.id;
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'human-plan',
        at: '2026-10-01T01:00:00Z',
        author: { kind: 'human' },
        body: 'Review launch.',
      });
      for (const [index, message] of [
        { id: 'personal', body: 'Ready for your approval.', replyTo: 'human-plan' },
        { id: 'ordinary', body: 'General status.' },
        { id: 'bot-reply', body: 'Replying to Ada.', replyTo: 'personal' },
      ].entries())
        await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
          ...message,
          at: new Date(Date.UTC(2026, 9, 1, 1, 1, index)).toISOString(),
          author: { kind: 'bot', slug: 'ada' },
        });
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: 'private-update',
        at: '2026-10-01T01:02:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Private update.',
      });
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core });
      const response = methods.humanAttention({ category: 'replies' });
      expect(response).toMatchObject({
        ok: true,
        value: {
          items: [
            {
              kind: 'channel-reply',
              category: 'replies',
              botSlug: 'ada',
              channelId: group.id,
              channelName: 'Launch',
              messageId: 'personal',
              summary: 'Ready for your approval.',
              isUnread: true,
            },
          ],
        },
      });
      if (!response.ok) throw new Error('Replies failed');
      expect(response.value.items).toHaveLength(1);
      expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT)).toEqual({
        unreadCount: 4,
        hasAction: false,
      });
      expect(
        core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'unread', channelId: group.id })
          .items,
      ).toMatchObject([{ unreadCount: 2, messageId: 'bot-reply' }]);
      expect(methods.humanAttention({ category: 'replies', botSlug: 'bea' })).toMatchObject({
        ok: true,
        value: { items: [] },
      });
      expect(methods.humanAttention({ category: 'replies', channelId: dm.id })).toMatchObject({
        ok: true,
        value: { items: [] },
      });
      await core.channels.markRead(OWNER_HUMAN_CONTEXT, group.id, 'personal');
      expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount).toBe(3);
      const readReply = methods.humanAttention({ category: 'replies' });
      expect(readReply).toMatchObject({
        ok: true,
        value: { items: [{ messageId: 'personal', isUnread: false }] },
      });
      if (!readReply.ok) throw new Error('Replies failed');
      expected = readReply.value;
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({ dshHome: home, agents });
    try {
      expect(
        createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...resumed }).humanAttention({
          category: 'replies',
        }),
      ).toEqual({
        ok: true,
        value: expected,
      });
      expect(resumed.channels.readMessages(groupId)).toHaveLength(4);
      expect(resumed.humanAttention.status(OWNER_HUMAN_CONTEXT).unreadCount).toBe(3);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
});
