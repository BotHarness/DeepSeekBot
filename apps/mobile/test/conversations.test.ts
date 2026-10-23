import { describe, expect, it } from 'vitest';

import type { RosterView } from '../src/host/client';
import type { HumanAttentionItem } from '../src/host/wire';
import { locale, t } from '../src/ui/strings';
import {
  chatList,
  conversations,
  countBadge,
  DONE_WINDOW_MS,
  previewText,
  rowLabel,
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

  it('shows a pending tool approval preview in the app language', () => {
    expect(previewText('请求批准执行 secret_cli')).toBe(t.approvalPreview('secret_cli'));
    expect(t.approvalPreview('secret_cli')).toBe(
      locale === 'zh' ? '请求批准执行 secret_cli' : 'Requests approval to run secret_cli',
    );
    expect(previewText('Sure, done')).toBe('Sure, done');
  });

  it('reads the status once in the row label', () => {
    const paused = locale === 'zh' ? '已暂停' : 'Paused';
    expect(rowLabel(row({ paused: true }), 'Ada', 'paused', paused)).toBe('Ada, ' + paused);
    expect(rowLabel(row({ state: 'working' }), 'Ada', 'working', 'Sure')).toBe(
      locale === 'zh' ? 'Ada, 工作中, Sure' : 'Ada, Working, Sure',
    );
    expect(rowLabel(row({}, { needsYou: 2 }), 'Ada', 'needs-you', 'Done')).toBe(
      locale === 'zh' ? 'Ada, 2 项等你处理, Done' : 'Ada, 2 need you, Done',
    );
  });
});

describe('Chats grouped by Channel section', () => {
  it('shows pins without custom sections, deduplicates legacy slugs and keeps quiet counts', () => {
    const pinned = {
      ...roster,
      arrangement: { pins: ['ada', 'dm-ada', 'team'], hidden: [], sections: [], sectionOrder: [] },
    };
    expect(shape(chatList(pinned, [], new Set(), { 'dm-ada': 3, team: 7 }, ['team']))).toEqual([
      '[pinned 2 +3]',
      'channel:team',
      'bot:ada',
      'bot:cy',
      'bot:bo',
    ]);
  });

  it('unpin returns to retained membership without mutating the Host snapshot', () => {
    const pinned: RosterView = {
      ...arranged,
      arrangement: { ...arranged.arrangement!, pins: ['dm-ada'] },
    };
    const before = structuredClone(pinned);
    const displayed = chatList(pinned, []);
    expect(
      displayed.filter((entry) => entry.kind === 'row' && entry.row.key === 'bot:ada'),
    ).toHaveLength(1);
    expect(
      displayed.find((entry) => entry.kind === 'row' && entry.row.key === 'bot:ada'),
    ).toMatchObject({ sectionId: 'pinned' });
    expect(pinned).toEqual(before);
    const unpinned = chatList({ ...pinned, arrangement: { ...pinned.arrangement!, pins: [] } }, []);
    expect(
      unpinned.find((entry) => entry.kind === 'row' && entry.row.key === 'bot:ada'),
    ).toMatchObject({ sectionId: 'work' });
    expect(unpinned.some((entry) => entry.kind === 'section' && entry.id === 'pinned')).toBe(false);
  });

  it('inherits Host global manual order while scope overrides restore newest sorting', () => {
    const manual: RosterView = { ...arranged, sorting: { sortMode: 'manual', sortModes: {} } };
    expect(shape(chatList(manual, []))).toEqual([
      'channel:ops',
      '[work 3]',
      'channel:design',
      'bot:ada',
      'channel:team',
      'bot:bo',
      '[later 0]',
      'bot:cy',
    ]);
    const newestWork = {
      ...manual,
      sorting: { sortMode: 'manual' as const, sortModes: { work: 'updated' as const } },
    };
    expect(shape(chatList(newestWork, []))).toEqual(shape(chatList(arranged, [])));
    const newestGlobal = {
      ...arranged,
      sorting: { sortMode: 'updated' as const, sortModes: { work: 'manual' as const } },
    };
    expect(shape(chatList(newestGlobal, []))).toEqual(shape(chatList(manual, [])));
  });

  it('keeps manual pin order through new messages; a pin override can inherit or restore newest', () => {
    const pinned: RosterView = {
      ...arranged,
      arrangement: { ...arranged.arrangement!, pins: ['ada', 'team', 'cy'] },
      sorting: { sortMode: 'manual', sortModes: {} },
    };
    const keys = (view: RosterView) =>
      chatList(view, [])
        .filter((entry) => entry.kind === 'row' && entry.sectionId === 'pinned')
        .map((entry) => entry.key);
    expect(keys(pinned)).toEqual(['bot:ada', 'channel:team', 'bot:cy']);
    expect(
      keys({ ...pinned, sorting: { sortMode: 'manual', sortModes: { pinned: 'updated' } } }),
    ).toEqual(['bot:cy', 'channel:team', 'bot:ada']);
    expect(
      keys({ ...pinned, sorting: { sortMode: 'updated', sortModes: { pinned: 'manual' } } }),
    ).toEqual(['bot:ada', 'channel:team', 'bot:cy']);
  });

  it('sorts loose runs independently, never moving rows across section blocks', () => {
    const top = {
      ...arranged,
      arrangement: {
        ...arranged.arrangement!,
        topOrder: [
          { kind: 'channel' as const, id: 'dm-bo' },
          { kind: 'channel' as const, id: 'ops' },
          { kind: 'section' as const, id: 'work' },
          { kind: 'section' as const, id: 'later' },
        ],
      },
    };
    expect(
      shape(chatList({ ...top, sorting: { sortMode: 'manual', sortModes: {} } }, [])).slice(0, 3),
    ).toEqual(['bot:bo', 'channel:ops', '[work 3]']);
    expect(shape(chatList(top, [])).slice(0, 3)).toEqual(['channel:ops', 'bot:bo', '[work 3]']);
    expect(shape(chatList(top, [])).at(-1)).toBe('bot:cy');
  });

  it('uses Host channel recency when a conversation has no message and breaks ties by ID like Web', () => {
    const view: RosterView = {
      bots: [],
      channels: [channel('z', ''), channel('a', ''), channel('b', '')],
      activityChannels: ['a', 'b', 'z'].map((id) => ({
        id,
        name: id,
        type: 'group',
        members: [],
        updatedAt: id === 'z' ? '2026-10-20T00:00:00Z' : '2026-10-19T00:00:00Z',
      })),
      arrangement: { pins: ['a', 'z', 'b'], hidden: [], sections: [], sectionOrder: [] },
    };
    expect(shape(chatList(view, []))).toEqual([
      '[pinned 3]',
      'channel:z',
      'channel:a',
      'channel:b',
    ]);
  });

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
