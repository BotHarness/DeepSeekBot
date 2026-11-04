import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createInbox } from '../src/host/inbox';
import type { HostClient } from '../src/host/client';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it('refreshes once per burst of live frames', async () => {
  let live: (source: 'roster' | 'activity') => void = () => {};
  const call = vi.fn(async (method: string) =>
    method === 'channelUnreadCounts' ? { channels: [] } : { queryVersion: 1, items: [] },
  );
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
      live = listener;
      return () => {};
    },
    call: call as HostClient['call'],
  };
  const inbox = createInbox(client);
  try {
    await vi.runAllTimersAsync();
    const reads = () =>
      call.mock.calls.filter(([method]) => method === 'channelUnreadCounts').length;
    expect(reads()).toBe(1);

    for (let i = 0; i < 20; i++) live('activity');
    for (let i = 0; i < 5; i++) live('roster');
    expect(reads()).toBe(1);
    await vi.runAllTimersAsync();
    expect(reads()).toBe(2);

    for (let i = 0; i < 20; i++) live('activity');
    await vi.runAllTimersAsync();
    expect(reads()).toBe(3);
  } finally {
    inbox.stop();
  }
});
