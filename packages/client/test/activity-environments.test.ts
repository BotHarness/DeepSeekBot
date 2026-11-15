import { expect, it, vi } from 'vitest';
import {
  combineActivityPages,
  observeActivityEnvironments,
} from '../src/client/activity-environments.js';
import type { ActivityQuery } from '../src/client/activity-feed.js';
import type { ActivityListState, HumanAttentionItem } from '../src/client/store.js';
import type { InboxSnapshot } from '../../../apps/mobile/src/host/inbox.js';

const query: ActivityQuery = {
  category: 'all',
  sort: 'default',
  search: '',
  snoozed: false,
  botSlug: undefined,
  channelId: undefined,
};
const item = (
  at: string,
  kind: HumanAttentionItem['kind'] = 'channel-unread',
): HumanAttentionItem => ({
  id: 'same-id',
  sourceEventId: 'same-source',
  channelId: 'same-channel',
  messageId: 'same-message',
  botSlug: 'same-bot',
  category: 'unread',
  kind,
  createdAt: at,
  summary: at,
  unreadCount: 2,
});
const page = (
  items: HumanAttentionItem[],
  overrides: Partial<ActivityListState> = {},
): ActivityListState => ({
  category: 'unread',
  sort: 'newest',
  items,
  status: 'ready',
  botSlug: undefined,
  channelId: undefined,
  snoozed: false,
  error: undefined,
  nextCursor: undefined,
  unreadCount: items.length * 2,
  hasAction: false,
  channelUnread: { 'same-channel': 2 },
  ...overrides,
});

it('interleaves source pages without deduplicating equal Host-local identities or mutating their messages', () => {
  const local = item('2026-11-15T10:00:00Z');
  const remote = item('2026-11-15T11:00:00Z');
  const result = combineActivityPages(
    [
      { name: 'Local', page: page([local]) },
      { name: 'Remote', page: page([remote], { nextCursor: 'remote-only' }) },
    ],
    'unread',
    query,
  );
  expect(result.items).toEqual([remote, local]);
  expect(result.items[0]).toBe(remote);
  expect(result.items[1]).toBe(local);
  expect(result.nextCursor).toBeDefined();
  expect(result.unreadCount).toBe(4);
  expect(
    combineActivityPages(
      [
        { name: 'Local', page: page([local]) },
        { name: 'Remote', page: page([remote]) },
      ],
      'action',
      query,
    ).items,
  ).toEqual([local, remote]);
});

it('retains partial results, identifies failed sources and does not turn unavailable coverage into an empty success', () => {
  const valid = item('2026-11-15T10:00:00Z');
  expect(
    combineActivityPages(
      [
        { name: 'Local', page: page([valid]) },
        { name: 'Studio', page: page([], { status: 'error', error: 'Unavailable' }) },
      ],
      'unread',
      query,
    ),
  ).toMatchObject({ items: [valid], status: 'ready', error: 'Studio: Unavailable' });
  expect(
    combineActivityPages(
      [{ name: 'Studio', page: page([], { status: 'loading' }) }],
      'unread',
      query,
    ).status,
  ).toBe('loading');
  expect(
    combineActivityPages(
      [{ name: 'Studio', page: page([], { status: 'error', error: 'Unavailable' }) }],
      'unread',
      query,
    ).status,
  ).toBe('error');
});

it('preserves mention priority only for the default replies order', () => {
  const reply = item('2026-11-15T11:00:00Z', 'channel-reply');
  const mention = item('2026-11-15T10:00:00Z', 'channel-mention');
  const pages = [
    { name: 'Local', page: page([reply]) },
    { name: 'Remote', page: page([mention]) },
  ];
  expect(combineActivityPages(pages, 'replies', query).items).toEqual([mention, reply]);
  expect(combineActivityPages(pages, 'replies', { ...query, sort: 'newest' }).items).toEqual([
    reply,
    mention,
  ]);
});

it('shares one subscription per selected Host across categories and keeps unchanged snapshots referentially stable', () => {
  let snapshot: InboxSnapshot = { status: 'loading' };
  const stop = vi.fn();
  const subscribe = vi.fn(() => stop);
  const activity = vi.fn(() => ({
    getSnapshot: () => snapshot,
    subscribe,
    getInbox: () => undefined,
    watching: () => true,
  }));
  const observation = observeActivityEnvironments({ activity }, ['a', 'b'], query);
  const release = observation.subscribe(() => {});
  expect(activity.mock.calls).toHaveLength(2);
  expect(subscribe).toHaveBeenCalledTimes(2);
  const first = observation.getSnapshot();
  expect(observation.getSnapshot()).toBe(first);
  snapshot = { status: 'error', error: 'offline' };
  expect(observation.getSnapshot()).not.toBe(first);
  expect(observation.getSnapshot()).toBe(observation.getSnapshot());
  release();
  expect(stop).toHaveBeenCalledTimes(2);
});

it('passes search, ordering and history to the existing Host query owner', () => {
  const activity = vi.fn(() => undefined);
  observeActivityEnvironments({ activity }, ['b'], {
    ...query,
    search: 'needle',
    sort: 'oldest',
    category: 'handled',
  });
  expect(activity).toHaveBeenCalledExactlyOnceWith('b', {
    activity: true,
    search: 'needle',
    sort: 'oldest',
    section: 'handled',
  });
});
