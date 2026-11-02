import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

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

describe('Channel unread counts', () => {
  it('counts unread Bot messages per Channel and drops a Channel once it is read', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-channel-unread-'),
      agents: adapter(),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const append = (channelId: string, id: string, minute: number, human = false) =>
        core.channels.appendMessage(channelId, {
          id,
          at: new Date(Date.UTC(2026, 9, 14, 1, minute)).toISOString(),
          author: human ? { kind: 'human' } : { kind: 'bot', slug: 'ada' },
          body: id,
        });
      await append(group.id, 'own', 0, true);
      await append(group.id, 'first', 1);
      await append(group.id, 'second', 2);
      await append(dm.id, 'dm-one', 3);
      const methods = createBridgeMethods({ ...core });
      const counts = () => {
        const result = methods.channelUnreadCounts({});
        if (!result.ok) throw new Error('channelUnreadCounts failed');
        return [...result.value.channels].sort((a, b) => a.channelId.localeCompare(b.channelId));
      };
      expect(counts()).toEqual(
        [
          { channelId: group.id, unreadCount: 2 },
          { channelId: dm.id, unreadCount: 1 },
        ].sort((a, b) => a.channelId.localeCompare(b.channelId)),
      );
      await core.channels.markRead(group.id, 'second');
      expect(counts()).toEqual([{ channelId: dm.id, unreadCount: 1 }]);
      expect(core.humanAttention.status().unreadCount).toBe(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps a muted Channel out of the unread total while still counting it per Channel', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-channel-mute-'),
      agents: adapter(),
    });
    try {
      await core.roster.attach(createFakeRosterDomain().facility);
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      for (const [index, channelId] of [group.id, group.id, dm.id].entries())
        await core.channels.appendMessage(channelId, {
          id: 'message-' + index,
          at: new Date(Date.UTC(2026, 9, 14, 2, index)).toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: 'Update ' + index,
        });
      const methods = createBridgeMethods({ ...core });
      expect(core.humanAttention.status().unreadCount).toBe(3);
      expect(await methods.channelMuteSet({ channelId: group.id, muted: true })).toEqual({
        ok: true,
        value: { muted: [group.id] },
      });
      expect(core.humanAttention.status().unreadCount).toBe(1);
      expect(methods.channelUnreadCounts({})).toMatchObject({
        ok: true,
        value: { channels: expect.arrayContaining([{ channelId: group.id, unreadCount: 2 }]) },
      });
      expect(methods.rosterGet({})).toMatchObject({ ok: true, value: { muted: [group.id] } });
      expect(await methods.channelMuteSet({ channelId: 'missing', muted: true })).toMatchObject({
        ok: false,
      });
      expect(await methods.channelMuteSet({ channelId: group.id, muted: false })).toEqual({
        ok: true,
        value: { muted: [] },
      });
      expect(core.humanAttention.status().unreadCount).toBe(3);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

it('filters muted message attention before search and paging without reading messages or losing requests', async () => {
  const core = createCore({ dshHome: createTempRoot('mute-inbox-'), agents: adapter() });
  try {
    await core.roster.attach(createFakeRosterDomain().facility);
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const bea = core.registry.create({ slug: 'bea', displayName: 'Bea' });
    if (!bea.ok) throw new Error('Bot fixture failed');
    const a = core.channels.createGroup({ name: 'Quiet', members: ['ada'] });
    const b = core.channels.getOrCreateDm('ada', 'Ada')!;
    const append = async (channelId: string, id: string, minute: number, personal = false) =>
      core.channels.appendMessage(channelId, {
        id,
        at: new Date(Date.UTC(2026, 9, 19, 0, minute)).toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: personal ? '@Human needle' : 'needle ' + id,
        ...(personal
          ? {
              replyTo: 'human',
              botCausation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
              humanMentions: [{ humanId: 'local-human', label: 'Human', start: 0, end: 6 }],
            }
          : {}),
      });
    await core.channels.appendMessage(a.id, {
      id: 'human',
      at: '2026-10-19T00:00:00Z',
      author: { kind: 'human' },
      body: 'Review',
    });
    await append(a.id, 'already-read-mention', 1, true);
    await core.channels.markRead(a.id, 'already-read-mention');
    await append(a.id, 'ordinary-1', 2);
    await append(a.id, 'ordinary-2', 3);
    await append(a.id, 'mention-and-reply', 4, true);
    await append(b.id, 'other-channel', 1);
    const request = core.channels.requestGroupJoin({
      channelId: a.id,
      requesterBotSlug: 'bea',
      requesterBotCreatedAt: bea.record.createdAt,
    });
    const methods = createBridgeMethods({ ...core });
    const position = core.channels.readPosition(a.id);
    const timeline = methods.channelMessages({ channelId: a.id });
    const before = core.humanAttention.list({ category: 'unread', channelId: a.id }).items[0]!;
    expect(core.humanAttention.status()).toEqual({ unreadCount: 4, hasAction: true });
    expect(methods.humanAttentionStatus({ messageCounts: true })).toMatchObject({
      ok: true,
      value: { unreadCount: 4, hasAction: true, messageCounts: { replies: 1, other: 3 } },
    });
    expect(core.humanAttention.list({ category: 'replies' }).items).toHaveLength(2);
    await methods.channelMuteSet({ channelId: a.id, muted: true });
    for (const category of ['unread', 'replies'] as const) {
      expect(
        methods.humanAttention({ category, channelId: a.id, search: 'needle', limit: 1 }),
      ).toMatchObject({ ok: true, value: { items: [] } });
    }
    expect(
      core.humanAttention.list({ category: 'unread', search: 'needle', limit: 1 }),
    ).toMatchObject({ items: [{ channelId: b.id, unreadCount: 1 }] });
    expect(core.humanAttention.item(before.id, before.sourceEventId)).toBeUndefined();
    expect(core.humanAttention.status()).toEqual({ unreadCount: 1, hasAction: true });
    expect(core.humanAttention.status(true).messageCounts).toEqual({ replies: 0, other: 1 });
    expect(core.humanAttention.list({ category: 'action' }).items).toMatchObject([
      { requestId: request.id },
    ]);
    expect(core.channels.readPosition(a.id)).toEqual(position);
    expect(methods.channelMessages({ channelId: a.id })).toEqual(timeline);
    expect(core.humanAttention.unreadByChannel()).toEqual(
      expect.arrayContaining([{ channelId: a.id, unreadCount: 3 }]),
    );
    await append(a.id, 'arrived-muted', 6, true);
    expect(core.humanAttention.list({ category: 'replies' }).items).toEqual([]);
    await methods.channelMuteSet({ channelId: a.id, muted: false });
    expect(core.humanAttention.status()).toEqual({ unreadCount: 5, hasAction: true });
    expect(core.humanAttention.status(true).messageCounts).toEqual({ replies: 2, other: 3 });
    expect(core.channels.readPosition(a.id)).toEqual(position);
    expect(core.humanAttention.list({ category: 'unread', channelId: a.id }).items).toMatchObject([
      { unreadCount: 2 },
    ]);
    const first = core.humanAttention.list({ category: 'replies', search: 'needle', limit: 1 });
    expect(first.items[0]?.messageId).toBe('arrived-muted');
    expect(first.nextCursor).toBeDefined();
    await methods.channelMuteSet({ channelId: a.id, muted: true });
    expect(
      core.humanAttention.list({
        category: 'replies',
        search: 'needle',
        limit: 1,
        cursor: first.nextCursor!,
      }).items,
    ).toEqual([]);
    await methods.channelMuteSet({ channelId: a.id, muted: false });
    expect(core.humanAttention.list({ category: 'replies', unreadOnly: true }).items).toHaveLength(
      2,
    );
    expect(core.humanAttention.list({ category: 'replies' }).items).toHaveLength(3);
    await methods.channelMuteSet({ channelId: b.id, muted: true });
    expect(core.humanAttention.list({ category: 'unread' }).items).toMatchObject([
      { channelId: a.id },
    ]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('returns complete category counts independent of the first Activity page', async () => {
  const core = createCore({ dshHome: createTempRoot('attention-summary-'), agents: adapter() });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.createGroup({ name: 'Large', members: ['ada'] });
    for (let i = 0; i < 55; i++)
      await core.channels.appendMessage(dm.id, {
        id: 'message-' + i,
        at: new Date(Date.UTC(2026, 9, 19, 0, i)).toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: '@Human message ' + i,
        botCausation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 },
        humanMentions: [{ humanId: 'local-human', label: 'Human', start: 0, end: 6 }],
      });
    expect(core.humanAttention.list({ category: 'replies', limit: 1 }).items).toHaveLength(1);
    const methods = createBridgeMethods({ ...core });
    expect(methods.humanAttentionStatus({ messageCounts: true })).toMatchObject({
      ok: true,
      value: { unreadCount: 55, messageCounts: { replies: 55, other: 0 } },
    });
    await core.channels.markRead(dm.id, 'message-54');
    expect(core.humanAttention.list({ category: 'replies', limit: 1 }).items).toHaveLength(1);
    expect(core.humanAttention.status(true).messageCounts).toEqual({ replies: 0, other: 0 });
    expect(methods.humanAttentionStatus({ messageCounts: 'true' })).toMatchObject({ ok: false });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('lists unread plain Bot messages in a DM as replies for push, leaving cards, read and muted DMs out', async () => {
  const core = createCore({
    dshHome: createTempRoot('botharness-dm-replies-'),
    agents: adapter(),
  });
  try {
    await core.roster.attach(createFakeRosterDomain().facility);
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
    const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 19, 3, minute)).toISOString();
    await core.channels.appendMessage(dm.id, {
      id: 'ask',
      at: at(0),
      author: { kind: 'human' },
      body: 'Ping',
    });
    await core.channels.appendMessage(dm.id, {
      id: 'answer',
      at: at(1),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Pong',
    });
    await core.channels.appendMessage(dm.id, {
      id: 'question',
      at: at(2),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Which branch?',
      userQuestionRequest: {
        sessionId: 'session-one',
        questions: [{ id: 'branch', question: 'Which branch?' }],
      },
    });
    await core.channels.appendMessage(group.id, {
      id: 'group-update',
      at: at(3),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Group update',
    });
    expect(core.humanAttention.dmReplies(10)).toMatchObject([
      {
        category: 'replies',
        kind: 'channel-reply',
        channelId: dm.id,
        botSlug: 'ada',
        messageId: 'answer',
        summary: 'Pong',
      },
    ]);
    expect(core.humanAttention.dmReplies(10)[0]?.id).toMatch(/^dm-reply:/u);

    const methods = createBridgeMethods({ ...core });
    await methods.channelMuteSet({ channelId: dm.id, muted: true });
    expect(core.humanAttention.dmReplies(10)).toEqual([]);
    await methods.channelMuteSet({ channelId: dm.id, muted: false });
    await core.channels.markRead(dm.id, 'question');
    expect(core.humanAttention.dmReplies(10)).toEqual([]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
