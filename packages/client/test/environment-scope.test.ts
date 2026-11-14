import { describe, expect, it } from 'vitest';
import { mixedEnvironmentChannels, remoteChannelRows } from '../src/client/environment-channels.js';
import { environmentAttention, environmentUnread } from '../src/client/environment-activity.js';
import type { RemoteHost, RemoteHostsSnapshot } from '../src/client/remote-hosts.js';
import type { ChannelSummary } from '../src/client/store.js';

function host(id: string, at: string, status: 'connected' | 'stopped' = 'connected'): RemoteHost {
  return {
    host: {
      hostId: id,
      hostName: 'Studio',
      routes: ['http://localhost:12345'],
      credential: 'fixture',
      deviceId: 'device',
    },
    snapshot: {
      connection: { status, route: 'http://localhost:12345' },
      roster: {
        bots: [],
        channels: [{ id: 'same-id', name: 'Shared', memberCount: 0, members: [], previewAt: at }],
        arrangement: {
          pins: [],
          hidden: [],
          sections: [{ id: 'same-section', name: 'Work', channelIds: ['same-id'] }],
          sectionOrder: ['same-section'],
        },
      },
    },
    inbox: {
      status: 'ready',
      sections: { action: [], replies: [], unread: [], handled: [] },
      unread: { 'same-id': 3 },
    },
  };
}
function channel(at: string): ChannelSummary {
  return {
    id: 'same-id',
    type: 'group',
    name: 'Shared',
    members: [],
    createdAt: at,
    updatedAt: at,
    latestMessage: { id: 'same-message', at, author: { kind: 'human' }, body: 'Local' },
  };
}

describe('Environment browsing', () => {
  it('shows canonical Human DMs from each raw Host roster without reclassifying other DMs', () => {
    const a = host('a', '2026-11-13T12:00:00Z');
    const b = host('b', '2026-11-13T12:00:00Z');
    const human = {
      id: 'same-human-dm',
      type: 'dm' as const,
      name: 'Other Human',
      members: [],
      humanParticipants: ['owner', 'member'],
      latestMessage: {
        id: 'hello',
        at: '2026-11-13T12:03:00Z',
        author: { kind: 'human' as const, humanId: 'member' },
        body: 'Hello from this Host',
      },
    };
    for (const remote of [a, b]) {
      const roster = remote.snapshot.roster;
      if (roster === undefined) throw new Error('missing fixture roster');
      roster.activityChannels = [
        human,
        { ...human, id: 'deleted-human-dm', deletedAt: '2026-11-13T12:04:00Z' },
        { id: 'bot-dm', type: 'dm', name: 'Bot', botSlug: 'bot', members: ['bot'] },
        { id: 'bot-bot-dm', type: 'dm', name: 'Two Bots', members: ['a', 'b'] },
      ];
      roster.arrangement!.hidden = ['same-id'];
      if (remote.inbox.status !== 'ready') throw new Error('missing fixture Inbox');
      remote.inbox.unread = { 'same-human-dm': 2 };
      expect(remoteChannelRows(remote)).toEqual([
        {
          key: 'channel:same-human-dm',
          hostId: remote.host.hostId,
          title: 'Other Human',
          channelId: 'same-human-dm',
          unread: 2,
          preview: human.latestMessage.body,
          previewAt: human.latestMessage.at,
        },
      ]);
    }
    const mixed = mixedEnvironmentChannels([], [a, b], 'other human');
    expect(mixed.map((row) => (row.kind === 'remote' ? row.row.hostId : 'local'))).toEqual([
      'a',
      'b',
    ]);
    expect(new Set(mixed.map((row) => row.key)).size).toBe(2);
    a.snapshot.roster!.arrangement!.hidden.push('same-human-dm');
    expect(remoteChannelRows(a)).toEqual([]);
    expect(remoteChannelRows(b)).toHaveLength(1);
  });
  it('does not present unknown, stale or paged unread coverage as a known zero', () => {
    expect(environmentUnread({ status: 'loading' })).toBeUndefined();
    expect(environmentUnread({ status: 'error', error: 'offline' })).toBeUndefined();
    const inbox = host('a', '').inbox;
    expect(environmentUnread(inbox)).toBe(3);
    if (inbox.status !== 'ready') throw new Error('fixture unavailable');
    expect(environmentUnread({ ...inbox, stale: 'offline' })).toBeUndefined();
    expect(environmentUnread({ ...inbox, cursors: { unread: 'next-page' } })).toBeUndefined();
    expect(environmentUnread({ ...inbox, unread: {} })).toBe(0);
  });
  it('interleaves actual source Channels by latest message and retains source-qualified collisions', () => {
    const result = mixedEnvironmentChannels(
      [channel('2026-11-13T12:01:00Z')],
      [host('b', '2026-11-13T12:02:00Z'), host('a', '2026-11-13T12:00:00Z')],
      '',
    );
    expect(result.map((entry) => (entry.kind === 'local' ? 'local' : entry.row.hostId))).toEqual([
      'b',
      'local',
      'a',
    ]);
    expect(new Set(result.map((entry) => entry.key)).size).toBe(3);
    expect(
      result
        .filter((entry) => entry.kind === 'remote')
        .map((entry) => entry.remote.snapshot.roster?.arrangement?.sections[0]?.id),
    ).toEqual(['same-section', 'same-section']);
  });
  it('uses deterministic Host-qualified ties regardless of discovery order and preserves offline loaded rows', () => {
    const a = host('a', '', 'stopped');
    const b = host('b', '');
    const order = (hosts: RemoteHost[]) =>
      mixedEnvironmentChannels([channel('')], hosts, '').map((entry) => entry.key);
    expect(order([b, a])).toEqual(order([a, b]));
    expect(mixedEnvironmentChannels([], [a], '')[0]?.kind).toBe('remote');
    expect(mixedEnvironmentChannels([], [a], 'missing')).toEqual([]);
  });
  it('counts the selected sources and reports incomplete/offline coverage', () => {
    const local = {
      unreadCount: 2,
      hasAction: false,
      attentionStatus: 'ready' as const,
      messageCounts: { replies: 0, other: 2 },
    };
    const sources: RemoteHostsSnapshot = { hosts: [host('a', '')], avatars: new Map(), tab: 'all' };
    expect(environmentAttention(local, sources).unreadCount).toBe(5);
    expect(environmentAttention(local, { ...sources, tab: 'local' }).unreadCount).toBe(2);
    expect(environmentAttention(local, { ...sources, tab: 'a' }).unreadCount).toBe(3);
    expect(
      environmentAttention(local, { ...sources, hosts: [host('a', '', 'stopped')] })
        .attentionStatus,
    ).toBe('error');
    expect(
      environmentAttention(local, {
        ...sources,
        hosts: [{ ...host('a', ''), inbox: { status: 'loading' } }],
      }).attentionStatus,
    ).toBe('error');
  });
});
