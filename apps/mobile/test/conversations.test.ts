import { describe, expect, it } from 'vitest';

import type { RosterView } from '../src/host/client';
import type { HumanAttentionItem } from '../src/host/wire';
import {
  chatList,
  conversations,
  countBadge,
  DONE_WINDOW_MS,
  rowStatus,
  searchConversations,
  shortTime,
  type ChatListItem,
} from '../src/ui/chat/conversations';

const roster: RosterView = {
  bots: [
    {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
      dmChannelId: 'dm-ada',
      preview: 'Done',
      previewAt: '2026-10-14T08:00:00.000Z',
    },
    {
      slug: 'bo',
      displayName: 'Bo',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'working',
      paused: false,
      dmChannelId: 'dm-bo',
    },
    {
      slug: 'cy',
      displayName: 'Cy',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'thinking',
      paused: false,
      previewAt: '2026-10-14T10:00:00.000Z',
    },
  ],
  channels: [
    {
      id: 'team',
      name: 'team',
      memberCount: 3,
      members: ['ada', 'bo', 'cy'],
      previewAt: '2026-10-14T09:00:00.000Z',
    },
  ],
};

const item = (overrides: Partial<HumanAttentionItem>): HumanAttentionItem => ({
  id: 'i',
  category: 'action',
  kind: 'tool-approval',
  createdAt: '2026-10-14T10:00:00.000Z',
  botSlug: 'ada',
  summary: 'run',
  ...overrides,
});

describe('Home conversations', () => {
  it('mixes Bot DMs and Channels by latest activity', () => {
    expect(conversations(roster, []).map((row) => row.key)).toEqual([
      'bot:cy',
      'channel:team',
      'bot:ada',
      'bot:bo',
    ]);
  });

  it('counts what needs the Human in the DM or the Channel it belongs to', () => {
    const action = [
      item({ id: '1' }),
      item({ id: '2', channelId: 'dm-ada' }),
      item({ id: '3', channelId: 'team' }),
    ];
    const rows = conversations(roster, action);
    expect(rows.find((row) => row.key === 'bot:ada')?.needsYou).toBe(2);
    expect(rows.find((row) => row.key === 'channel:team')?.needsYou).toBe(1);
  });

  it('reads unread messages from the DM or the Channel, with needs you first', () => {
    const rows = conversations(roster, [item({ id: '1', channelId: 'team' })], {
      'dm-ada': 3,
      team: 140,
      'dm-cy': 9,
    });
    const ada = rows.find((row) => row.key === 'bot:ada')!;
    const team = rows.find((row) => row.key === 'channel:team')!;
    expect(ada.unread).toBe(3);
    expect(countBadge(ada)).toEqual({ tone: 'unread', count: 3 });
    expect(team.unread).toBe(140);
    expect(countBadge(team)).toEqual({ tone: 'needs-you', count: 1 });
    expect(rows.find((row) => row.key === 'bot:cy')?.unread).toBe(0);
    expect(countBadge(rows.find((row) => row.key === 'bot:bo')!)).toBeUndefined();
  });

  it('gives a muted conversation the neutral chip', () => {
    const muted = {
      ...roster,
      arrangement: { pins: [], hidden: [], muted: ['team'], sections: [], sectionOrder: [] },
    };
    const team = conversations(muted, [], { team: 4 }).find((row) => row.key === 'channel:team')!;
    expect(team.muted).toBe(true);
    expect(countBadge(team)).toEqual({ tone: 'muted', count: 4 });
    expect(countBadge({ ...team, needsYou: 1 })).toEqual({ tone: 'needs-you', count: 1 });
  });

  it('treats a Channel on Do Not Disturb on this phone like a muted one', () => {
    const team = conversations(roster, [], { team: 4 }, ['team']).find(
      (row) => row.key === 'channel:team',
    )!;
    expect(team.muted).toBe(true);
    expect(countBadge(team)).toEqual({ tone: 'muted', count: 4 });
  });

  it('follows IM list conventions for the time', () => {
    const now = new Date('2026-10-14T12:00:00');
    const at = (iso: string) => new Date(iso).toISOString();
    expect(shortTime(at('2026-10-14T09:05:00'), now, 'en-GB')).toMatch(/^0?9:05$/);
    expect(shortTime(at('2026-10-13T23:59:00'), now, 'en-GB', 'Yesterday')).toBe('Yesterday');
    expect(shortTime(at('2026-10-12T09:05:00'), now, 'en-GB')).toBe('Mon');
    expect(shortTime(at('2026-10-02T09:05:00'), now, 'en-GB')).toBe('02/10');
    expect(shortTime(at('2025-12-30T09:05:00'), now, 'en-GB')).toBe('30/12/2025');
    expect(shortTime(undefined, now)).toBe('');
  });
});

const channel = (id: string, previewAt: string) => ({
  id,
  name: id,
  memberCount: 1,
  members: ['ada'],
  previewAt,
});

const arranged: RosterView = {
  bots: roster.bots,
  channels: [
    ...roster.channels,
    channel('design', '2026-10-14T07:00:00.000Z'),
    channel('ops', '2026-10-14T06:00:00.000Z'),
    channel('lounge', '2026-10-14T11:00:00.000Z'),
  ],
  arrangement: {
    pins: [],
    hidden: ['lounge'],
    sections: [
      { id: 'work', name: 'Work', channelIds: ['design', 'dm-ada', 'team'] },
      { id: 'later', name: 'Later', channelIds: [] },
    ],
    sectionOrder: ['work', 'later'],
    topOrder: [
      { kind: 'channel', id: 'ops' },
      { kind: 'section', id: 'work' },
      { kind: 'channel', id: 'dm-bo' },
      { kind: 'section', id: 'later' },
    ],
  },
};

const shape = (items: ChatListItem[]) =>
  items.map((item) =>
    item.kind === 'section'
      ? `[${item.id} ${item.count}${item.collapsed ? ' collapsed' : ''}${item.needsYou > 0 ? ` !${item.needsYou}` : ''}${item.unread > 0 ? ` +${item.unread}` : ''}]`
      : item.key,
  );

describe('Row status', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  const bot = roster.bots[0]!;
  const row = (
    patch: Partial<typeof bot>,
    attention: { needsYou?: number; unread?: number } = {},
  ): Parameters<typeof rowStatus>[0] => ({
    kind: 'bot',
    key: 'bot:ada',
    bot: { ...bot, ...patch },
    needsYou: attention.needsYou ?? 0,
    unread: attention.unread ?? 0,
    muted: false,
  });
  const fromAda = { previewAuthor: { kind: 'bot' as const, slug: 'ada' } };

  it('puts the Human first, then blocked work, then running work', () => {
    expect(rowStatus(row({ state: 'working' }, { needsYou: 1 }), now)).toBe('needs-you');
    expect(rowStatus(row({ state: 'waiting' }), now)).toBe('needs-you');
    expect(rowStatus(row({ state: 'blocked' }), now)).toBe('blocked');
    expect(rowStatus(row({ state: 'thinking', paused: true }), now)).toBe('working');
    expect(rowStatus(row({ paused: true }), now)).toBe('paused');
  });

  it('marks a finished turn by the Bot as unread, then done for a day, then nothing', () => {
    expect(rowStatus(row(fromAda, { unread: 2 }), now)).toBe('done-unread');
    expect(rowStatus(row(fromAda), now)).toBe('done');
    expect(
      rowStatus(
        row({
          ...fromAda,
          previewAt: new Date(now.getTime() - DONE_WINDOW_MS - 1).toISOString(),
        }),
        now,
      ),
    ).toBe('none');
    expect(rowStatus(row({ previewAuthor: { kind: 'human' } }, { unread: 1 }), now)).toBe('none');
    expect(rowStatus(row({}), now)).toBe('none');
  });
});

describe('Chats grouped by Channel section', () => {
  it('keeps the flat list for a Host with no sections', () => {
    const flat = conversations(roster, []).map((row) => row.key);
    expect(shape(chatList(roster, []))).toEqual(flat);
    expect(
      shape(
        chatList(
          { ...roster, arrangement: { pins: [], hidden: [], sections: [], sectionOrder: [] } },
          [],
        ),
      ),
    ).toEqual(flat);
  });

  it('follows the desktop top-level order with ungrouped conversations between sections', () => {
    expect(shape(chatList(arranged, []))).toEqual([
      'channel:ops',
      '[work 3]',
      'channel:team',
      'bot:ada',
      'channel:design',
      'bot:bo',
      '[later 0]',
      'bot:cy',
    ]);
  });

  it('keeps hidden Channels out of the list and the counts', () => {
    const keys = shape(chatList(arranged, [item({ id: '1', channelId: 'lounge' })]));
    expect(keys).not.toContain('channel:lounge');
    expect(conversations(arranged, []).map((row) => row.key)).not.toContain('channel:lounge');
  });

  it('folds a collapsed section into its count and what needs the Human inside', () => {
    const action = [item({ id: '1', channelId: 'team' }), item({ id: '2' })];
    expect(shape(chatList(arranged, action, new Set(['work'])))).toEqual([
      'channel:ops',
      '[work 3 collapsed !2]',
      'bot:bo',
      '[later 0]',
      'bot:cy',
    ]);
  });

  it('sums unread messages into a section, leaving muted conversations out', () => {
    const muted = { ...arranged, arrangement: { ...arranged.arrangement!, muted: ['design'] } };
    const unread = { team: 2, 'dm-ada': 5, design: 7, ops: 1 };
    expect(shape(chatList(muted, [], new Set(['work']), unread))).toEqual([
      'channel:ops',
      '[work 3 collapsed +7]',
      'bot:bo',
      '[later 0]',
      'bot:cy',
    ]);
  });

  it('lists pinned conversations first, outside their section', () => {
    const pinned = {
      ...arranged,
      arrangement: { ...arranged.arrangement!, pins: ['cy', 'team'] },
    };
    expect(shape(chatList(pinned, []))).toEqual([
      '[pinned 2]',
      'bot:cy',
      'channel:team',
      'channel:ops',
      '[work 2]',
      'bot:ada',
      'channel:design',
      'bot:bo',
      '[later 0]',
    ]);
  });
});

describe('Search', () => {
  const people: RosterView = {
    ...roster,
    bots: [
      ...roster.bots,
      {
        ...roster.bots[0]!,
        slug: 'xiaoming',
        displayName: '小明 助手',
        dmChannelId: 'dm-xiaoming',
      },
      { ...roster.bots[1]!, slug: 'adam', displayName: 'Madam Ada' },
    ],
    channels: [
      ...roster.channels,
      { id: 'design', name: 'Design Review', memberCount: 2, members: [] },
    ],
  };
  const keys = (query: string) => searchConversations(people, [], query).map((row) => row.key);

  it('matches PersonaBot names and Channel titles, ignoring case', () => {
    expect(keys('ADA')).toEqual(['bot:ada', 'bot:adam']);
    expect(keys('review')).toEqual(['channel:design']);
    expect(keys('TEAM')).toEqual(['channel:team']);
  });

  it('matches Chinese names and full-width letters', () => {
    expect(keys('小明')).toEqual(['bot:xiaoming']);
    expect(keys('ＡＤＡ')).toEqual(['bot:ada', 'bot:adam']);
  });

  it('puts names that start with the query first', () => {
    expect(keys('ad')).toEqual(['bot:ada', 'bot:adam']);
    expect(keys('a')[0]).toBe('bot:ada');
  });

  it('carries unread counts into search results', () => {
    expect(searchConversations(roster, [], 'team', { team: 2 })[0]?.unread).toBe(2);
  });

  it('finds nothing for an empty query or before the roster loads', () => {
    expect(keys('')).toEqual([]);
    expect(keys('   ')).toEqual([]);
    expect(searchConversations(undefined, [], 'ada')).toEqual([]);
    expect(keys('nobody')).toEqual([]);
  });

  it('leaves Hidden Channels out', () => {
    expect(searchConversations(arranged, [], 'lounge')).toEqual([]);
    expect(searchConversations(arranged, [], 'ops').map((row) => row.key)).toEqual(['channel:ops']);
  });
});
