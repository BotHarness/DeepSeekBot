import { expect, it, vi } from 'vitest';
import {
  subscribeMessagingDefaults,
  openSharedChannel,
} from '../src/client/messaging-defaults-live.js';
import { mountActivityLive } from '../src/client/activity-live.js';
import { createStore } from '../src/client/store.js';
import { mountChannelLive } from '../src/client/channel-live.js';

it('switches cached ready Channels with healthy Activity without leaking a nested subscription', () => {
  const streams: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      streams.push(this);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const store = createStore();
  store.setMode('bot');
  const channel = (id: string) => ({
    id,
    name: id,
    type: 'group' as const,
    members: [],
    createdAt: '2026-10-11T00:00:00Z',
    updatedAt: '2026-10-11T00:00:00Z',
  });
  const first = channel('first'),
    second = channel('second');
  store.setRoster([], [first, second]);
  store.select({ kind: 'channel', channelId: first.id });
  store.setConversation({ status: 'ready', channel: first, messages: [], revision: 0 });
  store.select({ kind: 'channel', channelId: second.id });
  store.setConversation({ status: 'ready', channel: second, messages: [], revision: 0 });
  store.select({ kind: 'channel', channelId: first.id });
  const stopRoster = subscribeMessagingDefaults(() => {}),
    stopActivity = mountActivityLive(store);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const stopChannel = mountChannelLive(store, { refreshChannelMessages: vi.fn(async () => {}) });
  try {
    streams.at(-1)!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation: 'host', revision: 1, bots: [] }),
      }),
    );
    expect(store.getSnapshot().activitySync).toBe('live');
    store.select({ kind: 'channel', channelId: second.id });
    expect(streams.filter((source) => !source.closed)).toHaveLength(1);
    expect(streams.at(-1)!.url).toContain('channelId=second');
    expect(warning).not.toHaveBeenCalled();
  } finally {
    stopChannel();
    stopActivity();
    stopRoster();
    warning.mockRestore();
    vi.unstubAllGlobals();
  }
  expect(streams.every((source) => source.closed)).toBe(true);
});

it('preserves healthy consumers when Channel attach or detach cannot construct a replacement', () => {
  const streams: Events[] = [];
  let fail = false;
  class Events extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      if (fail) throw new Error('constructor refused');
      streams.push(this);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const stopRoster = subscribeMessagingDefaults(() => {});
  const store = createStore();
  store.setMode('bot');
  const stopActivity = mountActivityLive(store);
  let channel: ReturnType<typeof openSharedChannel> | undefined;
  try {
    fail = true;
    expect(() => openSharedChannel('/api/botharness/stream?channelId=shared&after=0')).toThrow(
      'constructor refused',
    );
    expect(streams[0]!.closed).toBe(false);
    fail = false;
    channel = openSharedChannel('/api/botharness/stream?channelId=shared&after=0');
    fail = true;
    expect(() => channel!.close()).not.toThrow();
    expect(streams.at(-1)!.closed).toBe(false);
    streams.at(-1)!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation: 'host', revision: 1, bots: [] }),
      }),
    );
    expect(store.getSnapshot().activitySync).toBe('live');
  } finally {
    fail = false;
    channel?.close();
    stopActivity();
    stopRoster();
    warning.mockRestore();
    vi.unstubAllGlobals();
  }
  expect(streams.every((stream) => stream.closed)).toBe(true);
});

it('shares the selected Channel with roster and Activity and rejects callbacks from the replaced stream', () => {
  const streams: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      streams.push(this);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const stopRoster = subscribeMessagingDefaults(() => {});
  const store = createStore();
  store.setMode('bot');
  const stopActivity = mountActivityLive(store);
  const channel = {
    id: 'shared',
    name: 'Shared',
    type: 'group' as const,
    members: [],
    createdAt: '2026-10-11T00:00:00Z',
    updatedAt: '2026-10-11T00:00:00Z',
  };
  store.setRoster([], [channel]);
  store.select({ kind: 'channel', channelId: channel.id });
  store.setConversation({ status: 'ready', channel, messages: [], revision: 0 });
  const stopChannel = mountChannelLive(store, { refreshChannelMessages: vi.fn(async () => {}) });
  try {
    expect(streams.filter((stream) => !stream.closed)).toHaveLength(1);
    const active = streams.at(-1)!;
    expect(active.url).toContain('channelId=shared');
    expect(active.url).toContain('roster=1');
    expect(active.url).toContain('activity=1');
    const frame = (id: string) =>
      new MessageEvent('channel/message', {
        data: JSON.stringify({
          channelId: 'shared',
          revision: 1,
          message: { id, at: channel.createdAt, author: { kind: 'human' }, body: id },
        }),
      });
    streams[0]!.dispatchEvent(frame('old-transport'));
    expect(store.getSnapshot().conversation.messages).toHaveLength(0);
    active.dispatchEvent(frame('current'));
    expect(store.getSnapshot().conversation.messages.map((message) => message.body)).toEqual([
      'current',
    ]);
    stopChannel();
    expect(streams.filter((stream) => !stream.closed)).toHaveLength(1);
    expect(streams.at(-1)!.url).toContain('scope=roster');
  } finally {
    stopChannel();
    stopActivity();
    stopRoster();
    vi.unstubAllGlobals();
  }
  expect(streams.every((stream) => stream.closed)).toBe(true);
});

it('retries the same selected Channel after a temporary construction refusal without leaking its owner', () => {
  let fail = true;
  const streams: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      if (fail) throw new Error('refused');
      streams.push(this);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const store = createStore();
  store.setMode('bot');
  const channel = {
    id: 'shared',
    name: 'Shared',
    type: 'group' as const,
    members: [],
    createdAt: '2026-10-11T00:00:00Z',
    updatedAt: '2026-10-11T00:00:00Z',
  };
  store.setRoster([], [channel]);
  store.select({ kind: 'channel', channelId: channel.id });
  store.setConversation({ status: 'ready', channel, messages: [], revision: 0 });
  const stop = mountChannelLive(store, { refreshChannelMessages: vi.fn(async () => {}) });
  try {
    expect(streams).toHaveLength(0);
    fail = false;
    store.setConversation({ revision: 0 });
    expect(streams).toHaveLength(1);
  } finally {
    stop();
    warning.mockRestore();
    vi.unstubAllGlobals();
  }
  expect(streams[0]!.closed).toBe(true);
});

it('keeps existing Activity recovery running while a Channel replacement handshake stalls', async () => {
  vi.useFakeTimers();
  const streams: Events[] = [];
  class Events extends EventTarget {
    readyState = 0;
    constructor(readonly url: string) {
      super();
      streams.push(this);
    }
    close() {
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const stopRoster = subscribeMessagingDefaults(() => {});
  const store = createStore();
  store.setMode('bot');
  const recovery = vi.fn(async () => undefined);
  const stopActivity = mountActivityLive(store, undefined, recovery);
  let channel: ReturnType<typeof openSharedChannel> | undefined;
  try {
    await vi.runAllTicks();
    await Promise.resolve();
    streams[0]!.readyState = 1;
    streams[0]!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation: 'host', revision: 1, bots: [] }),
      }),
    );
    expect(store.getSnapshot().activitySync).toBe('live');
    channel = openSharedChannel('/api/botharness/stream?channelId=shared&after=0');
    await vi.runAllTicks();
    expect(store.getSnapshot().activitySync).toBe('stale');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(recovery).toHaveBeenCalledTimes(2);
    streams.at(-1)!.readyState = 1;
    streams.at(-1)!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation: 'host', revision: 2, bots: [] }),
      }),
    );
    expect(store.getSnapshot().activitySync).toBe('live');
  } finally {
    channel?.close();
    stopActivity();
    stopRoster();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it('keeps roster and independent activity consumers on one connection and replays the live baseline', async () => {
  const streams: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      streams.push(this);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const roster = vi.fn();
  const stopRoster = subscribeMessagingDefaults(roster);
  const store = createStore();
  store.setMode('bot');
  store.setRoster(
    [
      {
        slug: 'ada',
        displayName: 'Ada',
        roles: [],
        workspaces: [],
        description: '',
        paused: false,
        aggregateState: 'idle',
        createdAt: '2026-10-01T00:00:00Z',
      },
    ],
    [],
  );
  let stopActivity = () => {};
  let stopLateActivity = () => {};
  try {
    stopActivity = mountActivityLive(store);
    expect(streams).toHaveLength(1);
    expect(streams[0]!.url).toContain('scope=roster');
    expect(streams[0]!.url).toContain('activity=1');
    streams[0]!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({
          generation: 'host',
          revision: 1,
          bots: [{ slug: 'ada', state: 'working' }],
        }),
      }),
    );
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    stopActivity();
    expect(streams[0]!.closed).toBe(false);
    const late = createStore();
    late.setMode('bot');
    late.setRoster(
      store.getSnapshot().bots.map((bot) => ({ ...bot, aggregateState: 'idle' })),
      [],
    );
    stopLateActivity = mountActivityLive(late);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(streams).toHaveLength(1);
    expect(late.getSnapshot().bots[0]?.aggregateState).toBe('working');
    streams[0]!.dispatchEvent(new Event('roster/changed'));
    expect(roster).toHaveBeenCalledOnce();
    stopRoster();
    expect(streams[0]!.closed).toBe(false);
    stopLateActivity();
    expect(streams[0]!.closed).toBe(true);
    streams[0]!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({
          generation: 'host',
          revision: 2,
          bots: [{ slug: 'ada', state: 'thinking' }],
        }),
      }),
    );
    expect(late.getSnapshot().bots[0]?.aggregateState).toBe('working');
  } finally {
    stopActivity();
    stopLateActivity();
    stopRoster();
    vi.unstubAllGlobals();
  }
});
it('shares one roster transport and releases it only when the last mounted consumer leaves', () => {
  const streams: Events[] = [];
  class Events extends EventTarget {
    closed = false;
    constructor() {
      super();
      streams.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const first = vi.fn(),
    second = vi.fn();
  const stopFirst = subscribeMessagingDefaults(first),
    stopSecond = subscribeMessagingDefaults(second);
  try {
    expect(streams).toHaveLength(1);
    streams[0]!.dispatchEvent(new Event('roster/changed'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    stopFirst();
    expect(streams[0]!.closed).toBe(false);
    streams[0]!.dispatchEvent(new Event('open'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  } finally {
    stopSecond();
    vi.unstubAllGlobals();
  }
  expect(streams[0]!.closed).toBe(true);
});

it('keeps a late activity consumer stale with HTTP recovery while the shared transport reconnects', async () => {
  vi.useFakeTimers();
  const streams: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    constructor() {
      super();
      streams.push(this);
    }
    close() {
      this.readyState = 2;
    }
  }
  vi.stubGlobal('EventSource', Events);
  const stopRoster = subscribeMessagingDefaults(() => {});
  const first = createStore();
  first.setMode('bot');
  const stopFirst = mountActivityLive(first);
  const recovery = vi.fn(async () => undefined);
  const late = createStore();
  late.setMode('bot');
  let stopLate = () => {};
  try {
    streams[0]!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation: 'host', revision: 1, bots: [] }),
      }),
    );
    streams[0]!.readyState = 0;
    streams[0]!.dispatchEvent(new Event('error'));
    stopLate = mountActivityLive(late, undefined, recovery);
    await vi.runAllTicks();
    await Promise.resolve();
    expect(late.getSnapshot().activitySync).toBe('stale');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(recovery).toHaveBeenCalledTimes(2);
    streams[0]!.readyState = 1;
    streams[0]!.dispatchEvent(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation: 'host', revision: 2, bots: [] }),
      }),
    );
    expect(late.getSnapshot().activitySync).toBe('live');
  } finally {
    stopFirst();
    stopLate();
    stopRoster();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
