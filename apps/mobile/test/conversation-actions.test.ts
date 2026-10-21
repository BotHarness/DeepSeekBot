import { expect, it, vi } from 'vitest';

import { conversationActions, runConversationAction } from '../src/ui/chat/conversation-actions';
import type { Conversation } from '../src/ui/chat/conversations';
import { t } from '../src/ui/strings';

const channel = (unread: number, latestMessageId?: string): Conversation => ({
  kind: 'channel',
  key: 'c1',
  channel: {
    id: 'c1',
    name: 'Ops',
    memberCount: 2,
    members: [],
    ...(latestMessageId === undefined ? {} : { latestMessageId }),
  },
  needsYou: 0,
  unread,
  muted: false,
});

const bot = (dmChannelId?: string): Conversation =>
  ({
    kind: 'bot',
    key: 'b1',
    bot: { slug: 'ada', displayName: 'Ada', ...(dmChannelId ? { dmChannelId } : {}) },
    needsYou: 0,
    unread: 0,
    muted: false,
  }) as Conversation;

it('offers mute and pin, ending with mark as read when there is something to read', () => {
  expect(conversationActions(channel(0), { pinned: false, hostMuted: false })).toEqual([
    { key: 'mute', label: t.rowActions.mute },
    { key: 'pin', label: t.rowActions.pin },
  ]);
  expect(
    conversationActions(channel(3, 'm9'), { pinned: true, hostMuted: true }).map((a) => a.key),
  ).toEqual(['unmute', 'unpin', 'read']);
  expect(conversationActions(channel(3), { pinned: false, hostMuted: false })).toHaveLength(2);
  expect(conversationActions(bot(), { pinned: false, hostMuted: false })).toEqual([]);
  expect(conversationActions(bot('dm1'), { pinned: false, hostMuted: false })).toHaveLength(2);
});

it('calls the existing Host methods and refreshes', async () => {
  const call = vi.fn(async () => ({}));
  const refresh = vi.fn(async () => undefined);
  const inbox = { refresh: vi.fn(async () => undefined) };
  const client = { call, refresh } as never;
  await runConversationAction(client, inbox, channel(3, 'm9'), 'read');
  await runConversationAction(client, inbox, channel(0), 'mute');
  await runConversationAction(client, inbox, bot('dm1'), 'pin');
  expect(call.mock.calls).toEqual([
    ['channelMarkRead', { channelId: 'c1', messageId: 'm9' }],
    ['channelMuteSet', { channelId: 'c1', muted: true }],
    ['rosterBatch', { action: 'pin', channelIds: ['dm1'] }],
  ]);
  expect(inbox.refresh).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledTimes(2);
});
