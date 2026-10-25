import { expect, it, vi } from 'vitest';
import { conversationMenu } from '../src/ui/chat/conversation-menu';
import type { Conversation } from '../src/ui/chat/conversations';
import { t } from '../src/ui/strings';

const bot: Conversation = {
  kind: 'bot',
  key: 'bot:ada',
  unread: 0,
  needsYou: 0,
  muted: false,
  bot: {
    slug: 'ada',
    displayName: 'Ada',
    roles: [],
    computerAccess: false,
    browserAccess: false,
    state: 'idle',
    paused: false,
    dmChannelId: 'dm1',
  },
};
it('offers explicit Bot deletion alongside pin and section placement but never for Tob', () => {
  const onDelete = vi.fn();
  const options = {
    pinned: false,
    hostMuted: false,
    sections: [{ id: 's1', name: 'Work', channelIds: [] }],
    onAction: vi.fn(),
    onMove: vi.fn(),
    onDelete,
  };
  const menu = conversationMenu(bot, options);
  expect(menu.map((action) => action.label)).toContain(t.rowActions.pin);
  expect(menu.map((action) => action.key)).toContain('move:s1');
  menu.find((action) => action.key === 'delete')?.run();
  expect(onDelete).toHaveBeenCalledWith({ kind: 'bot', id: 'ada', name: 'Ada' });
  expect(
    conversationMenu({ ...bot, bot: { ...bot.bot, tob: true } }, options).some(
      (action) => action.key === 'delete',
    ),
  ).toBe(false);
});
