import { expect, it, vi } from 'vitest';
import { createInbox, prepareNotificationBaseline } from '../src/host/inbox';
import type { HostClient } from '../src/host/client';
import type { HumanAttentionItem } from '../src/host/wire';

const item = (id: string): HumanAttentionItem => ({
  id,
  kind: 'channel-reply',
  category: 'replies',
  botSlug: 'ada',
  summary: id,
  createdAt: '2026-10-01T00:00:00Z',
});

it('publishes only complete notification discovery and restarts a scan invalidated between pages', async () => {
  let live = () => {};
  let fail = false;
  let mutate = false;
  let changed = false;
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'channelUnreadCounts') return { channels: [] };
    if (!args?.notifications) return { queryVersion: 1, items: [] };
    if (!args.cursor)
      return {
        notificationVersion: 1,
        items: [item(changed ? 'inserted' : 'withdrawn')],
        nextCursor: 'same-time-page',
      };
    if (fail) throw Error('page-unavailable');
    if (mutate && !changed) {
      changed = true;
      live();
    }
    return { notificationVersion: 1, items: [item('dm')] };
  });
  const unavailable = () => {
    throw Error('unused client operation');
  };
  const client: HostClient = {
    start: unavailable,
    stop: unavailable,
    retryNow: unavailable,
    refresh: unavailable,
    upload: unavailable,
    api: unavailable,
    resource: unavailable,
    follow: unavailable,
    getSnapshot: () => ({ connection: { status: 'connected', route: '' } }),
    subscribe: () => () => {},
    onLive: (listener) => {
      live = () => listener('activity');
      return () => {};
    },
    call: call as HostClient['call'],
  };
  const inbox = createInbox(client, { activity: true, notifications: true });
  const published: string[][] = [];
  inbox.subscribe(() => {
    const snapshot = inbox.getSnapshot();
    if (snapshot.status === 'ready' && snapshot.notificationItems)
      published.push(snapshot.notificationItems.map((item) => item.id));
  });
  try {
    await inbox.refresh();
    expect(published.at(-1)).toEqual(['withdrawn', 'dm']);
    published.length = 0;
    mutate = true;
    await inbox.refresh();
    expect(published).toEqual([['inserted', 'dm']]);
    fail = true;
    await expect(prepareNotificationBaseline(inbox, new AbortController().signal)).rejects.toThrow(
      'notification-baseline-unavailable',
    );
    expect(inbox.getSnapshot()).toMatchObject({ status: 'ready', notificationItems: undefined });
    expect(published).toHaveLength(1);
    fail = false;
    await prepareNotificationBaseline(inbox, new AbortController().signal);
    expect(published.at(-1)).toEqual(['inserted', 'dm']);
    expect(
      call.mock.calls
        .filter(([, args]) => args?.notifications)
        .every(([, args]) => args?.sort === undefined && args?.category === undefined),
    ).toBe(true);
  } finally {
    inbox.stop();
  }
});
