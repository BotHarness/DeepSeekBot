import { describe, expect, it, vi } from 'vitest';

import type { RosterBot, RosterView } from '@botharness/host-client/client';
import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import type { HumanAttentionItem } from '@botharness/host-protocol/wire';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import {
  activityLabel,
  conversationGlyph,
  pendingActivity,
  recentConversations,
  recentSessionsShown,
  type TabMenuHost,
} from '../src/ui/shell/tab-menu-model';
import { createRecentSessions } from '../src/ui/shell/recent-sessions';

const bot = (slug: string, previewAt?: string): RosterBot => ({
  slug,
  displayName: slug.toUpperCase(),
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
  dmChannelId: `dm-${slug}`,
  ...(previewAt === undefined ? {} : { previewAt }),
});

const roster = (bots: RosterBot[], channels: RosterView['channels'] = []): RosterView => ({
  bots,
  channels,
});

const item = (id: string, createdAt: string, botSlug = 'ada'): HumanAttentionItem => ({
  id,
  category: 'action',
  kind: 'tool-approval',
  createdAt,
  botSlug,
  summary: `Approve ${id}`,
});

const host = (hostId: string, value: Partial<TabMenuHost> = {}): TabMenuHost => ({
  hostId,
  connected: true,
  roster: undefined,
  action: undefined,
  ...value,
});

describe('recentConversations', () => {
  const hosts = [
    host('home', {
      roster: roster(
        [bot('ada', '2026-11-24T08:00:00Z'), bot('bo', '2026-11-24T10:00:00Z'), bot('cy')],
        [
          {
            id: 'design',
            name: 'Design',
            memberCount: 1,
            members: ['ada'],
            previewAt: '2026-11-24T09:00:00Z',
          },
        ],
      ),
    }),
    host('office', {
      roster: roster([
        bot('dee', '2026-11-24T11:00:00Z'),
        bot('eve', '2026-11-24T07:00:00Z'),
        bot('fox', '2026-11-24T06:00:00Z'),
      ]),
    }),
    host('away', { connected: false, roster: roster([bot('gus', '2026-11-24T12:00:00Z')]) }),
  ];

  it('takes the newest conversations across connected computers in the scope', () => {
    expect(
      recentConversations(hosts, 'all', 4).map(({ hostId, conversation }) => [
        hostId,
        conversation.key,
      ]),
    ).toEqual([
      ['office', 'bot:dee'],
      ['home', 'bot:bo'],
      ['home', 'channel:design'],
      ['home', 'bot:ada'],
    ]);
  });

  it('keeps to the chosen computer and skips conversations with no activity', () => {
    expect(
      recentConversations(hosts, computerEnvironmentKey('home'), 4).map(
        ({ conversation }) => conversation.key,
      ),
    ).toEqual(['bot:bo', 'channel:design', 'bot:ada']);
    expect(recentConversations(hosts, computerEnvironmentKey('away'), 4)).toEqual([]);
    expect(recentConversations(hosts, '["cloud","scope","org"]', 4)).toEqual([]);
  });

  it('ranks a new conversation with no messages by its creation time', () => {
    const fresh = host('home', {
      roster: {
        ...roster(
          [bot('ada', '2026-11-24T08:00:00Z')],
          [{ id: 'launch', name: 'Launch', memberCount: 1, members: ['ada'] }],
        ),
        activityChannels: [
          { id: 'launch', type: 'group', name: 'Launch', createdAt: '2026-11-24T09:00:00Z' },
        ] as NonNullable<RosterView['activityChannels']>,
      },
    });
    expect(
      recentConversations([fresh], 'all', 4).map(({ conversation }) => conversation.key),
    ).toEqual(['channel:launch', 'bot:ada']);
  });

  it('leaves out hidden conversations', () => {
    const hidden = host('home', {
      roster: {
        ...roster([bot('ada', '2026-11-24T08:00:00Z'), bot('bo', '2026-11-24T10:00:00Z')]),
        arrangement: { pins: [], hidden: ['dm-bo'], sections: [], sectionOrder: [] },
      },
    });
    expect(
      recentConversations([hidden], 'all', 4).map(({ conversation }) => conversation.key),
    ).toEqual(['bot:ada']);
  });

  it('marks Bots, Channels and people with their own glyph', () => {
    const [ada] = recentConversations(hosts, computerEnvironmentKey('home'), 4).slice(-1);
    expect(conversationGlyph(ada!.conversation)).toBe('bot');
    const [, design] = recentConversations(hosts, computerEnvironmentKey('home'), 4);
    expect(conversationGlyph(design!.conversation)).toBe('channel');
  });
});

describe('pendingActivity', () => {
  it('lists the newest pending items in the scope', () => {
    const hosts = [
      host('home', {
        action: [item('a', '2026-11-24T08:00:00Z'), item('b', '2026-11-24T10:00:00Z')],
      }),
      host('office', {
        action: [
          item('c', '2026-11-24T09:00:00Z'),
          item('d', '2026-11-24T11:00:00Z'),
          item('e', '2026-11-24T07:00:00Z'),
        ],
      }),
      host('away', { connected: false, action: [item('f', '2026-11-24T12:00:00Z')] }),
    ];
    expect(pendingActivity(hosts, 'all', 4).map(({ item }) => item.id)).toEqual([
      'd',
      'b',
      'c',
      'a',
    ]);
    expect(
      pendingActivity(hosts, computerEnvironmentKey('office'), 4).map(({ item }) => item.id),
    ).toEqual(['d', 'c', 'e']);
  });

  it('names the Bot before the summary when the roster knows it', () => {
    const pending = item('a', '2026-11-24T08:00:00Z');
    expect(activityLabel(pending, roster([bot('ada')]))).toBe('ADA: Approve a');
    expect(activityLabel(pending, undefined)).toBe('Approve a');
  });
});

describe('recent Sessions', () => {
  const row = (sessionId: string, title?: string): HostSessionRow => ({
    sessionId,
    source: { kind: 'native' },
    ...(title === undefined ? {} : { title }),
    running: false,
    lastPromptAt: null,
    updatedAt: 0,
  });

  it('reads the four latest Sessions by last Human turn for the current Host', async () => {
    const recent = createRecentSessions(4);
    const listener = vi.fn();
    recent.subscribe(listener);
    const call = vi.fn(async () => ({
      sessions: ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, id.toUpperCase())),
      sources: [],
    }));
    await recent.refresh({ call: call as never }, 'home');
    expect(call).toHaveBeenCalledWith(
      'sessionList',
      { search: '', sort: 'last-human-turn', source: 'all', limit: 50, queryVersion: 1 },
      expect.anything(),
    );
    expect(recent.get('home')?.map((session) => session.sessionId)).toEqual(['a', 'b', 'c', 'd']);
    expect(recent.get('office')).toBeUndefined();
    recent.publish('home', [row('a', 'A'), row('b', 'B'), row('c', 'C'), row('d', 'D')]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('keeps the last list when a read fails', async () => {
    const recent = createRecentSessions(4);
    recent.publish('home', [row('a')]);
    await recent.refresh(
      {
        call: async () => {
          throw new Error('offline');
        },
      },
      'home',
    );
    expect(recent.get('home')?.map((session) => session.sessionId)).toEqual(['a']);
  });
});

describe('recentSessionsShown', () => {
  const native: HostSessionRow = {
    sessionId: 'native',
    source: { kind: 'native' },
    running: false,
    lastPromptAt: 2,
    updatedAt: 2,
  };
  const bot: HostSessionRow = {
    sessionId: 'bot',
    source: { kind: 'bot', botSlug: 'ada', displayName: 'Ada' },
    running: false,
    lastPromptAt: 1,
    updatedAt: 1,
  };

  it('drops Bot Sessions from the Sessions tab menu when the phone hides them', () => {
    expect(recentSessionsShown([native, bot], false)).toEqual([native, bot]);
    expect(recentSessionsShown([native, bot], true)).toEqual([native]);
    expect(recentSessionsShown(undefined, true)).toBeUndefined();
  });
});
