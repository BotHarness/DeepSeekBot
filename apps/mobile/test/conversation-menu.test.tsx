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
    canDisband: true,
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

it('never offers to disband a DM with another person', () => {
  const person: Conversation = {
    kind: 'channel',
    key: 'channel:dm-humans-ab',
    person: true,
    unread: 0,
    needsYou: 0,
    muted: false,
    channel: { id: 'dm-humans-ab', name: 'Bob', memberCount: 2, members: [] },
  };
  const menu = conversationMenu(person, {
    pinned: false,
    hostMuted: false,
    canDisband: true,
    sections: [],
    onAction: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
  });
  expect(menu.some((action) => action.key === 'delete')).toBe(false);
  expect(menu.map((action) => action.label)).toContain(t.rowActions.pin);
});

it('offers Disband for a group only to a viewer who can disband it', () => {
  const group: Conversation = {
    kind: 'channel',
    key: 'channel:g1',
    unread: 0,
    needsYou: 0,
    muted: false,
    channel: { id: 'g1', name: 'Launch', memberCount: 3, members: [] },
  };
  const onDelete = vi.fn();
  const options = {
    pinned: false,
    hostMuted: false,
    sections: [],
    onAction: vi.fn(),
    onMove: vi.fn(),
    onDelete,
  };
  const owner = conversationMenu(group, { ...options, canDisband: true });
  owner.find((action) => action.key === 'delete')?.run();
  expect(onDelete).toHaveBeenCalledWith({ kind: 'group', id: 'g1', name: 'Launch' });
  const member = conversationMenu(group, { ...options, canDisband: false });
  expect(member.some((action) => action.key === 'delete')).toBe(false);
  expect(member.map((action) => action.label)).not.toContain(t.deletion.disband);
  expect(member.map((action) => action.label)).toContain(t.rowActions.pin);
});

it('lets a member hide an auto-joined group without offering to leave or disband it', () => {
  const group: Conversation = {
    kind: 'channel',
    key: 'channel:lobby',
    unread: 0,
    needsYou: 0,
    muted: false,
    channel: { id: 'lobby', name: 'Lobby', memberCount: 3, members: [] },
  };
  const onAction = vi.fn();
  const menu = conversationMenu(group, {
    pinned: false,
    hostMuted: true,
    canDisband: false,
    sections: [],
    onAction,
    onMove: vi.fn(),
    onDelete: vi.fn(),
  });
  const hide = menu.find((action) => action.key === 'hide');
  expect(hide).toMatchObject({ label: t.rowActions.hide, icon: 'eye.slash', glyph: 'hide' });
  hide?.run();
  expect(onAction).toHaveBeenCalledWith('hide');
  expect(menu.map((action) => action.key)).toEqual(['pin', 'section', 'unmute', 'hide']);
});
