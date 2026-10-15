import { describe, expect, it } from 'vitest';

import type { RosterView } from '../src/host/client';
import type { HumanAttentionItem } from '../src/host/wire';
import {
  chatList,
  conversations,
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

  it('shows a clock time today and a date otherwise', () => {
    const now = new Date('2026-10-14T12:00:00');
    expect(shortTime(new Date('2026-10-14T09:05:00').toISOString(), now, 'en-GB')).toMatch(
      /^0?9:05$/,
    );
    expect(shortTime(new Date('2026-10-12T09:05:00').toISOString(), now, 'en-GB')).toBe('12/10');
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
      ? `[${item.id} ${item.count}${item.collapsed ? ' collapsed' : ''}${item.needsYou > 0 ? ` !${item.needsYou}` : ''}]`
      : item.key,
  );

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
