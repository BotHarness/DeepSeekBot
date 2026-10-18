import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(): BotAgentAdapter {
  return {
    async runOrchestrator() {},
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

describe('Human attention projection', () => {
  it('pages mention priority across replies and applies unread-only before pagination', async () => {
    const core = createCore({ dshHome: createTempRoot('activity-sort-'), agents: adapter() });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await core.channels.appendMessage(group.id, {
        id: 'human',
        at: '2026-10-01T00:00:00Z',
        author: { kind: 'human' },
        body: 'Review',
      });
      await core.channels.appendMessage(group.id, {
        id: 'mention',
        at: '2026-10-01T00:01:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: '@Human review',
        botCausation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
        humanMentions: [{ humanId: 'local-human', label: 'Human', start: 0, end: 6 }],
        replyTo: 'human',
      });
      await core.channels.appendMessage(group.id, {
        id: 'reply',
        at: '2026-10-01T00:02:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Review done',
        replyTo: 'human',
      });
      const first = core.humanAttention.list({
        category: 'replies',
        sort: 'mentions-first',
        limit: 1,
      });
      expect(first.items.map((x) => x.messageId)).toEqual(['mention']);
      const second = core.humanAttention.list({
        category: 'replies',
        sort: 'mentions-first',
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.items.map((x) => x.messageId)).toEqual(['reply']);
      expect(second.nextCursor).toBeUndefined();
      expect(
        core.humanAttention
          .list({ category: 'replies', sort: 'newest' })
          .items.map((x) => x.messageId),
      ).toEqual(['reply', 'mention']);
      expect(() =>
        core.humanAttention.list({
          category: 'replies',
          sort: 'mentions-first',
          search: 'done',
          cursor: first.nextCursor!,
        }),
      ).toThrow('cursor is invalid');
      await core.channels.markRead(group.id, 'mention');
      expect(
        core.humanAttention
          .list({ category: 'replies', unreadOnly: true })
          .items.map((x) => x.messageId),
      ).toEqual(['reply']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('searches eligible messages before grouping and pagination, with bound query cursors', async () => {
    const core = createCore({ dshHome: createTempRoot('activity-search-'), agents: adapter() });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Design', members: ['ada'] });
      for (let i = 0; i < 35; i += 1)
        await core.channels.appendMessage(group.id, {
          id: `search-${i}`,
          at: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: i === 0 ? 'Needle budget ÉTUDE ПРОЕКТ' : 'Routine update',
        });
      const methods = createBridgeMethods({ ...core });
      for (const search of ['ÉTUDE', 'étude', 'ПРОЕКТ', 'проект'])
        expect(core.humanAttention.list({ category: 'unread', search }).items).toMatchObject([
          { messageId: 'search-0' },
        ]);
      expect(
        methods.humanAttention({ category: 'unread', search: 'needle', limit: 1 }),
      ).toMatchObject({
        ok: true,
        value: { items: [{ messageId: 'search-0', unreadCount: 1 }] },
      });
      expect(methods.humanAttention({ category: 'unread', search: "' OR 1=1 --" })).toMatchObject({
        ok: true,
        value: { items: [] },
      });
      expect(methods.humanAttention({ category: 'unread', search: 'missing' })).toMatchObject({
        ok: true,
        value: { items: [] },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('filters unread by Bot before choosing the Channel count and source anchor', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-human-unread-bot-'),
      agents: adapter(),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
      for (const [index, slug] of ['ada', 'ada', 'bea'].entries())
        await core.channels.appendMessage(group.id, {
          id: 'message-' + index,
          at: new Date(Date.UTC(2026, 8, 26, 1, 0, index)).toISOString(),
          author: { kind: 'bot', slug },
          body: 'Update ' + index,
        });
      const methods = createBridgeMethods({ ...core });
      expect(methods.humanAttention({ category: 'unread', botSlug: 'ada' })).toMatchObject({
        ok: true,
        value: { items: [{ channelId: group.id, unreadCount: 2, messageId: 'message-1' }] },
      });
      expect(methods.humanAttention({ category: 'unread', botSlug: 'bea' })).toMatchObject({
        ok: true,
        value: { items: [{ channelId: group.id, unreadCount: 1, messageId: 'message-2' }] },
      });
      expect(core.humanAttention.list({ category: 'unread' }).items).toMatchObject([
        { channelId: group.id, unreadCount: 3, messageId: 'message-2' },
      ]);
      expect(core.humanAttention.status()).toEqual({ unreadCount: 3, hasAction: false });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('groups visible unread Source Events by Channel and preserves the read boundary', async () => {
    const home = createTempRoot('botharness-human-unread-');
    const core = createCore({ dshHome: home, agents: adapter() });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(group.id, {
        id: 'own',
        at: '2026-09-26T01:00:00.000Z',
        author: { kind: 'human' },
        body: 'Start',
      });
      await core.channels.appendMessage(group.id, {
        id: 'first',
        at: '2026-09-26T01:01:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'First',
      });
      await core.channels.appendMessage(group.id, {
        id: 'second',
        at: '2026-09-26T01:02:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Second',
      });
      await core.channels.appendMessage(dm.id, {
        id: 'dm-one',
        at: '2026-09-26T01:03:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'DM',
      });
      expect(core.humanAttention.list({ category: 'unread' }).items).toMatchObject([
        { kind: 'channel-unread', channelId: dm.id, unreadCount: 1, messageId: 'dm-one' },
        { kind: 'channel-unread', channelId: group.id, unreadCount: 2, messageId: 'second' },
      ]);
      expect(core.humanAttention.status()).toMatchObject({ unreadCount: 3 });
      const methods = createBridgeMethods({ ...core });
      expect(methods.humanAttentionStatus({})).toEqual({
        ok: true,
        value: { unreadCount: 3, hasAction: false },
      });
      expect(methods.humanAttention({ category: 'unread' })).toMatchObject({
        ok: true,
        value: {
          items: [
            { channelId: dm.id, unreadCount: 1 },
            { channelId: group.id, unreadCount: 2 },
          ],
        },
      });
      expect(methods.humanAttention({ category: 'unknown' })).toMatchObject({ ok: false });
      await core.channels.markRead(group.id, 'first');
      expect(
        core.humanAttention.list({ category: 'unread', channelId: group.id }).items,
      ).toMatchObject([{ unreadCount: 1, messageId: 'second' }]);
      await core.channels.appendMessage(group.id, {
        id: 'third',
        at: '2026-09-26T01:04:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Third',
      });
      await core.channels.markRead(group.id, 'second');
      expect(
        core.humanAttention.list({ category: 'unread', channelId: group.id }).items,
      ).toMatchObject([{ unreadCount: 1, messageId: 'third' }]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('finds pending Group join requests, resolves one, and survives restart', async () => {
    const home = createTempRoot('botharness-human-attention-');
    const core = createCore({ dshHome: home, agents: adapter() });
    let groupId = '';
    try {
      const ada = core.registry.create({ slug: 'ada', displayName: 'Ada' });
      if (!ada.ok) throw new Error('Bot fixture failed');
      const group = core.channels.createGroup({ name: 'Team', members: [] });
      groupId = group.id;
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const request = core.channels.requestGroupJoin({
        channelId: group.id,
        requesterBotSlug: 'ada',
        requesterBotCreatedAt: ada.record.createdAt,
      });
      const methods = createBridgeMethods({ ...core });
      expect(core.humanAttention.status()).toEqual({ unreadCount: 0, hasAction: true });
      expect(methods.humanAttention({ category: 'action' })).toMatchObject({
        ok: true,
        value: {
          items: [
            {
              id: 'join:' + request.id,
              kind: 'group-join-request',
              channelId: group.id,
              botSlug: 'ada',
              requestId: request.id,
            },
          ],
        },
      });
      expect(methods.humanAttention({ category: 'action', botSlug: 'bea' })).toMatchObject({
        ok: true,
        value: { items: [] },
      });
      expect(
        methods.channelGroupJoinDecide({
          channelId: group.id,
          requestId: request.id,
          accept: true,
        }),
      ).toMatchObject({ ok: true });
      expect(core.humanAttention.list({ category: 'action' }).items).toEqual([]);
      await core.channels.appendMessage(dm.id, {
        id: 'bot-reply-1',
        at: '2026-09-26T01:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Here is the report.',
      });
      expect(core.humanAttention.list({ category: 'unread' }).items).toMatchObject([
        { kind: 'channel-unread', botSlug: 'ada', channelId: dm.id, messageId: 'bot-reply-1' },
      ]);
      expect(core.humanAttention.list({ category: 'info' }).items).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({ dshHome: home, agents: adapter() });
    try {
      expect(resumed.channels.get(groupId)?.members).toContain('ada');
      expect(resumed.humanAttention.list({ category: 'action' }).items).toEqual([]);
      expect(resumed.humanAttention.list({ category: 'unread' }).items).toHaveLength(1);
      await resumed.channels.markRead('dm-ada', 'bot-reply-1');
      expect(resumed.humanAttention.list({ category: 'unread' }).items).toEqual([]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });

  it('pages and binds its cursor to category and filters', async () => {
    const home = createTempRoot('botharness-human-attention-page-');
    const core = createCore({ dshHome: home, agents: adapter() });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const groups = [0, 1, 2].map((index) =>
        core.channels.createGroup({ name: 'Team ' + index, members: ['ada'] }),
      );
      for (const [index, group] of groups.entries())
        await core.channels.appendMessage(group.id, {
          id: 'report-' + index,
          at: new Date(Date.UTC(2026, 8, 26, 2, 0, index)).toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: 'Report ' + index,
        });
      const first = core.humanAttention.list({ category: 'unread', limit: 1 });
      expect(first.nextCursor).toBeDefined();
      const second = core.humanAttention.list({
        category: 'unread',
        limit: 1,
        cursor: first.nextCursor!!,
      });
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
      expect(() =>
        core.humanAttention.list({ category: 'action', cursor: first.nextCursor!! }),
      ).toThrow('Human attention cursor is invalid for these filters');
      expect(
        core.humanAttention.list({ category: 'unread', channelId: 'group-other' }).items,
      ).toEqual([]);
      const oldest = core.humanAttention.list({ category: 'unread', sort: 'oldest', limit: 1 });
      expect(oldest.items[0]?.messageId).toBe('report-0');
      expect(oldest.nextCursor).toBeDefined();
      expect(
        core.humanAttention.list({
          category: 'unread',
          sort: 'oldest',
          limit: 1,
          cursor: oldest.nextCursor!,
        }).items[0]?.messageId,
      ).toBe('report-1');
      expect(() =>
        core.humanAttention.list({ category: 'unread', cursor: oldest.nextCursor! }),
      ).toThrow('Human attention cursor is invalid for these filters');
      expect(
        core.humanAttention.list({ category: 'unread', botSlug: 'ada', channelId: groups[0]!.id })
          .items,
      ).toHaveLength(1);
      expect(
        core.humanAttention.list({ category: 'unread', botSlug: 'bea', channelId: groups[0]!.id })
          .items,
      ).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('shows native questions as actions until their durable answer or cancellation, including after restart', async () => {
    const home = createTempRoot('botharness-human-question-');
    let activeQuestions = ['question-one'];
    const before = createCore({
      dshHome: home,
      agents: adapter(),
      activeQuestionMessageIds: () => activeQuestions,
    });
    const dmId = 'dm-ada';
    try {
      before.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = before.channels.getOrCreateDm('ada', 'Ada')!;
      await before.channels.appendMessage(dm.id, {
        id: 'question-one',
        at: '2026-09-26T03:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Which branch should I use?',
        userQuestionRequest: {
          sessionId: 'session-one',
          questions: [{ id: 'branch', question: 'Which branch should I use?' }],
        },
      });
      expect(before.humanAttention.list({ category: 'action' }).items).toMatchObject([
        {
          kind: 'user-question',
          channelId: dm.id,
          botSlug: 'ada',
          messageId: 'question-one',
          summary: 'Which branch should I use?',
        },
      ]);
      expect(before.humanAttention.list({ category: 'info' }).items).toEqual([]);
      expect(
        before.humanAttention.list({ category: 'action', channelId: 'group-other' }).items,
      ).toEqual([]);
    } finally {
      await before.runtime.close();
      before.operationalDatabase.close();
    }

    activeQuestions = [];
    const resumed = createCore({
      dshHome: home,
      agents: adapter(),
      activeQuestionMessageIds: () => activeQuestions,
    });
    try {
      expect(resumed.humanAttention.list({ category: 'action' }).items).toEqual([]);
      await resumed.channels.appendMessage(dmId, {
        id: 'answer-one',
        at: '2026-09-26T03:01:00.000Z',
        author: { kind: 'human' },
        body: 'main',
        replyTo: 'question-one',
        userQuestionResolution: {
          requestMessageId: 'question-one',
          state: 'answered',
          answers: [{ id: 'branch', selected: [], custom: 'main' }],
        },
      });
      expect(resumed.humanAttention.list({ category: 'action' }).items).toEqual([]);
      activeQuestions = ['question-two'];
      await resumed.channels.appendMessage(dmId, {
        id: 'question-two',
        at: '2026-09-26T03:02:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Should I continue?',
        userQuestionRequest: {
          sessionId: 'session-two',
          questions: [{ id: 'continue', question: 'Should I continue?' }],
        },
      });
      expect(resumed.humanAttention.list({ category: 'action' }).items).toHaveLength(1);
      await resumed.channels.appendMessage(dmId, {
        id: 'cancel-two',
        at: '2026-09-26T03:03:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Question cancelled',
        replyTo: 'question-two',
        userQuestionResolution: { requestMessageId: 'question-two', state: 'cancelled' },
      });
      expect(resumed.humanAttention.list({ category: 'action' }).items).toEqual([]);
      expect(resumed.humanAttention.list({ category: 'info' }).items).toEqual([]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
  it('shows only live unresolved tool approvals as actions and removes them on decision or expiry', async () => {
    const home = createTempRoot('botharness-human-approval-');
    let activeApprovals = ['approval-one'];
    const core = createCore({
      dshHome: home,
      agents: adapter(),
      activeToolApprovalMessageIds: () => activeApprovals,
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'approval-one',
        at: '2026-09-26T04:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Request approval for bash',
        toolApprovalRequest: {
          sessionId: 'session-one',
          callId: 'call-one',
          toolName: 'bash',
          role: 'orchestrator',
          cwd: '/tmp/project',
          input: '{"command":"pwd"}',
        },
      });
      expect(core.humanAttention.list({ category: 'action' }).items).toMatchObject([
        {
          kind: 'tool-approval',
          botSlug: 'ada',
          channelId: dm.id,
          messageId: 'approval-one',
          summary: 'Request approval for bash',
        },
      ]);
      expect(core.humanAttention.list({ category: 'info' }).items).toEqual([]);
      activeApprovals = [];
      expect(core.humanAttention.list({ category: 'action' }).items).toEqual([]);
      activeApprovals = ['approval-one'];
      await core.channels.appendMessage(dm.id, {
        id: 'decision-one',
        at: '2026-09-26T04:01:00.000Z',
        author: { kind: 'human' },
        body: 'Approved once',
        replyTo: 'approval-one',
        toolApprovalDecision: { requestMessageId: 'approval-one', outcome: 'allowed-once' },
      });
      expect(core.humanAttention.list({ category: 'action' }).items).toEqual([]);
      expect(core.humanAttention.list({ category: 'info' }).items).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('projects one Bot repair admission as an action, retains it across restart, and removes it on resolution', async () => {
    const home = createTempRoot('botharness-human-repair-');
    const core = createCore({ dshHome: home, agents: adapter() });
    let groupId = '';
    let sourceEventId = '';
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
      groupId = group.id;
      await core.channels.appendMessage(group.id, {
        id: 'review-1',
        at: '2026-09-26T05:00:00.000Z',
        author: { kind: 'human' },
        body: '@Ada @Bea check the deployment',
        mentions: [
          { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
          { botSlug: 'bea', label: 'Bea', start: 5, end: 9 },
        ],
      });
      sourceEventId = core.attention.list({ botSlug: 'ada' }).items[0]!.id;
      attachOperationalModule(core.operationalDatabase, 'human-repair-test').transaction((db) => {
        db.prepare(
          "UPDATE inbox_admissions SET attempt_state = 'needs-repair' WHERE source_event_id = ? AND bot_slug = 'ada'",
        ).run(sourceEventId);
      });
      expect(core.humanAttention.list({ category: 'action' }).items).toMatchObject([
        {
          id: 'repair:' + sourceEventId + ':ada',
          kind: 'bot-message-needs-repair',
          botSlug: 'ada',
          channelId: group.id,
          channelName: 'Team',
          messageId: 'review-1',
          sourceEventId,
          summary: '@Ada @Bea check the deployment',
        },
      ]);
      expect(core.humanAttention.list({ category: 'action', botSlug: 'bea' }).items).toEqual([]);
      expect(
        core.humanAttention.list({ category: 'action', channelId: group.id }).items,
      ).toHaveLength(1);
      expect(core.humanAttention.list({ category: 'info' }).items).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({ dshHome: home, agents: adapter() });
    try {
      expect(resumed.humanAttention.list({ category: 'action' }).items).toHaveLength(1);
      resumed.channels.deleteGroup(groupId);
      expect(resumed.humanAttention.list({ category: 'action' }).items[0]).toMatchObject({
        channelId: groupId,
        channelName: '',
        sourceEventId,
      });
      attachOperationalModule(resumed.operationalDatabase, 'human-repair-resolve-test').transaction(
        (db) => {
          db.prepare(
            "UPDATE inbox_admissions SET attempt_state = 'handled' WHERE source_event_id = ? AND bot_slug = 'ada'",
          ).run(sourceEventId);
        },
      );
      expect(resumed.humanAttention.list({ category: 'action', botSlug: 'ada' }).items).toEqual([]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
});
