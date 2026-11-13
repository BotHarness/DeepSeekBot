import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import { UNREAD_COUNT_LIMIT } from '../src/runtime/human-attention.js';
import { createTempRoot } from './helpers.js';

it('stops unread counts at the display limit and keeps smaller counts exact', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-unread-limit-') });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Launch',
      members: ['ada'],
    });
    const at = (n: number) => new Date(Date.UTC(2026, 10, 4, 0, 0, n)).toISOString();
    const bot = { kind: 'bot' as const, slug: 'ada' };
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
      id: 'question',
      at: at(0),
      author: { kind: 'human' },
      body: 'Status?',
    });
    for (let n = 1; n <= 150; n++)
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
        id: `group-${n}`,
        at: at(n),
        author: bot,
        body: `Update ${n}`,
        ...(n % 50 === 0 ? { replyTo: 'question' } : {}),
      });
    for (let n = 1; n <= 120; n++)
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, dm.id, {
        id: `dm-${n}`,
        at: at(n),
        author: bot,
        body: `Note ${n}`,
      });

    expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT, true)).toMatchObject({
      unreadCount: UNREAD_COUNT_LIMIT,
      messageCounts: { replies: 3, other: UNREAD_COUNT_LIMIT - 3 },
    });
    expect(core.humanAttention.unreadByChannel(OWNER_HUMAN_CONTEXT)).toEqual(
      [
        { channelId: dm.id, unreadCount: UNREAD_COUNT_LIMIT },
        { channelId: group.id, unreadCount: UNREAD_COUNT_LIMIT },
      ].sort((a, b) => a.channelId.localeCompare(b.channelId)),
    );

    await core.channels.markRead(OWNER_HUMAN_CONTEXT, dm.id, 'dm-120');
    await core.channels.markRead(OWNER_HUMAN_CONTEXT, group.id, 'group-95');
    expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT, true)).toMatchObject({
      unreadCount: 55,
      messageCounts: { replies: 2, other: 53 },
    });
    expect(core.humanAttention.unreadByChannel(OWNER_HUMAN_CONTEXT)).toEqual([
      { channelId: group.id, unreadCount: 55 },
    ]);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('counts other unread messages directly when replies alone reach the limit', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-unread-limit-replies-') });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Launch',
      members: ['ada'],
    });
    const at = (n: number) => new Date(Date.UTC(2026, 10, 4, 0, 0, n)).toISOString();
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
      id: 'question',
      at: at(0),
      author: { kind: 'human' },
      body: 'Status?',
    });
    for (let n = 1; n <= 110; n++)
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
        id: `reply-${n}`,
        at: at(n),
        author: { kind: 'bot', slug: 'ada' },
        body: `Reply ${n}`,
        replyTo: 'question',
      });
    expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT, true)).toMatchObject({
      unreadCount: UNREAD_COUNT_LIMIT,
      messageCounts: { replies: UNREAD_COUNT_LIMIT, other: 0 },
    });
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
      id: 'ordinary',
      at: at(200),
      author: { kind: 'bot', slug: 'ada' },
      body: 'Ordinary',
    });
    expect(core.humanAttention.status(OWNER_HUMAN_CONTEXT, true).messageCounts).toEqual({
      replies: UNREAD_COUNT_LIMIT,
      other: 1,
    });
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
