import { afterEach, expect, it, vi } from 'vitest';
import { mountRosterLive } from '../src/client/channel-live.js';
import { createStore, type ChannelSummary } from '../src/client/store.js';
import type { BridgeActions } from '../src/client/actions.js';

afterEach(() => vi.useRealTimers());

it('publishes a multi-Channel burst once while preserving every latest preview and Bot activity', async () => {
  vi.useFakeTimers();
  const store = createStore();
  store.setMode('bot');
  const at = '2026-10-19T00:00:00.000Z';
  const channels: ChannelSummary[] = Array.from({ length: 24 }, (_, n) => ({
    id: `group-${n}`,
    type: 'group',
    name: `Group ${n}`,
    members: ['ada'],
    createdAt: at,
    updatedAt: at,
  }));
  store.setRoster(
    [
      {
        slug: 'ada',
        displayName: 'Ada',
        aggregateState: 'idle',
        roles: [],
        workspaces: [],
        createdAt: at,
      },
    ],
    channels,
  );
  const source = new EventTarget();
  const refreshRoster = vi.fn(async () => {});
  const stop = mountRosterLive(
    store,
    { refreshRoster } as unknown as BridgeActions,
    () => Object.assign(source, { close() {} }) as EventSource,
  );
  store.setRosterStatus('error', 'Retry roster read');
  const published = vi.fn();
  const off = store.subscribe(published);
  try {
    for (let n = 0; n < 240; n++)
      source.dispatchEvent(
        new MessageEvent('roster/latest', {
          data: JSON.stringify({
            channelId: `group-${n % 24}`,
            message: {
              id: `message-${n}`,
              at: new Date(Date.parse(at) + n).toISOString(),
              author: { kind: 'bot', slug: 'ada' },
              body: `message ${n}`,
            },
          }),
        }),
      );
    await vi.advanceTimersByTimeAsync(25);
    expect(published).toHaveBeenCalledTimes(1);
    for (let n = 0; n < 24; n++)
      expect(store.getSnapshot().channels[n]?.latestMessage?.id).toBe(`message-${216 + n}`);
    expect(store.getSnapshot().bots[0]?.lastActivityAt).toBe(Date.parse(at) + 239);
    expect(refreshRoster).not.toHaveBeenCalled();
    expect(store.getSnapshot().status).toBe('error');
    expect(store.getSnapshot().error).toBe('Retry roster read');
  } finally {
    off();
    stop();
  }
});

it.each(['mode exit', 'dispose', 'channel deletion', 'content purge'] as const)(
  'does not revive queued previews after %s',
  async (boundary) => {
    vi.useFakeTimers();
    const store = createStore();
    store.setMode('bot');
    const at = '2026-10-19T00:00:00.000Z';
    store.setRoster(
      [],
      [{ id: 'group', type: 'group', name: 'Group', members: [], createdAt: at, updatedAt: at }],
    );
    const source = new EventTarget();
    const stop = mountRosterLive(
      store,
      { refreshRoster: async () => {} } as unknown as BridgeActions,
      () => Object.assign(source, { close() {} }) as EventSource,
    );
    source.dispatchEvent(
      new MessageEvent('roster/latest', {
        data: JSON.stringify({
          channelId: 'group',
          message: { id: 'queued', at, author: { kind: 'human' }, body: 'Private queued content' },
        }),
      }),
    );
    if (boundary === 'mode exit') store.setMode('dsh');
    if (boundary === 'dispose') stop();
    if (boundary === 'channel deletion') store.setRoster([], []);
    if (boundary === 'content purge')
      store.purgeContent([{ channelId: 'group', messageId: 'queued', sourceEventId: 'source' }]);
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(store.getSnapshot().channels[0]?.latestMessage?.body).not.toBe(
        'Private queued content',
      );
      if (boundary !== 'content purge')
        expect(store.getSnapshot().channels[0]?.latestMessage).toBeUndefined();
    } finally {
      stop();
    }
  },
);
