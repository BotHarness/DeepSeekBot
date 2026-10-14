import { expect, it, vi } from 'vitest';
import {
  CHANNEL_REMOTE_DESCRIPTOR,
  COMPANION_REMOTE_DESCRIPTOR,
  createChannelFollow,
  createCompanionSource,
  createTypedLive,
  SNAPSHOT_REMOTE_DESCRIPTORS,
} from '../src/client/live-snapshots.js';
import {
  installTypedLive,
  openRosterActivity,
  openSharedChannel,
  subscribeMessagingDefaults,
  type TypedLive,
} from '../src/client/messaging-defaults-live.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function channel<Frame>() {
  const queue: IteratorResult<Frame>[] = [];
  let wake: (() => void) | undefined;
  const put = (result: IteratorResult<Frame>): void => {
    queue.push(result);
    wake?.();
  };
  return {
    push: (value: Frame) => put({ done: false, value }),
    async *items(signal: AbortSignal): AsyncGenerator<Frame> {
      signal.addEventListener('abort', () => put({ done: true, value: undefined }), { once: true });
      for (;;) {
        while (queue.length === 0)
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        const next = queue.shift()!;
        if (next.done) return;
        yield next.value;
      }
    },
  };
}

it('declares parameterless stream methods for roster and Activity', () => {
  expect(SNAPSHOT_REMOTE_DESCRIPTORS.map((descriptor) => descriptor.method)).toEqual([
    'followRoster',
    'followActivity',
  ]);
  for (const descriptor of SNAPSHOT_REMOTE_DESCRIPTORS)
    expect(descriptor).toMatchObject({
      namespace: 'botharness',
      mode: 'stream',
      parameters: [],
      cancellation: { parameter: 'signal' },
    });
});

it('consumes a baseline then increments through the Gateway snapshot stream', async () => {
  const roster = channel<unknown>();
  const signals: AbortSignal[] = [];
  const remote = {
    $stream: (options: { open: (signal: AbortSignal) => AsyncIterable<unknown> }) => {
      const lifetime = new AbortController();
      signals.push(lifetime.signal);
      return {
        restart: () => undefined,
        dispose: async () => lifetime.abort(),
        async *[Symbol.asyncIterator]() {
          for await (const value of options.open(lifetime.signal))
            yield { generation: 1, value, signal: lifetime.signal, accept: () => undefined };
        },
      };
    },
  };
  const live = createTypedLive(remote as never, () => ({
    followRoster: (signal) => roster.items(signal) as never,
    followActivity: () => {
      throw new Error('unused');
    },
  }));
  const handlers = {
    baseline: vi.fn(),
    changed: vi.fn(),
    latest: vi.fn(),
    purged: vi.fn(),
    interrupted: vi.fn(),
  };
  const stop = live.roster(handlers);
  const placements = [{ sourceEventId: 'source', channelId: 'channel', messageId: 'message' }];
  roster.push({ type: 'baseline', placements });
  roster.push({ type: 'changed' });
  const message = {
    id: 'm1',
    at: '2026-10-13T00:00:00.000Z',
    author: { kind: 'human' },
    body: 'hi',
  };
  roster.push({ type: 'latest', channelId: 'channel', message });
  roster.push({ type: 'purged', placements });
  await settle();
  expect(handlers.baseline).toHaveBeenCalledWith(placements);
  expect(handlers.changed).toHaveBeenCalledTimes(1);
  expect(handlers.latest).toHaveBeenCalledWith({ channelId: 'channel', message });
  expect(handlers.purged).toHaveBeenCalledWith(placements);
  stop();
  await settle();
  expect(signals[0]!.aborted).toBe(true);
});

it('gives roster and Activity their own typed streams and leaves only the Channel on the shared source', async () => {
  const sources: Events[] = [];
  class Events extends EventTarget {
    readyState = 1;
    closed = false;
    constructor(readonly url: string) {
      super();
      sources.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('EventSource', Events);
  let roster: Parameters<TypedLive['roster']>[0] | undefined;
  let activity: Parameters<TypedLive['activity']>[0] | undefined;
  const stopRoster = vi.fn();
  const stopActivity = vi.fn();
  const uninstall = installTypedLive({
    roster: (handlers) => {
      roster = handlers;
      return stopRoster;
    },
    activity: (handlers) => {
      activity = handlers;
      return stopActivity;
    },
  });
  const listener = vi.fn();
  const purged = vi.fn();
  const latest = vi.fn();
  const unsubscribe = subscribeMessagingDefaults(listener, purged, latest);
  const feed = openRosterActivity()!;
  const snapshots: string[] = [];
  feed.addEventListener('activity/snapshot', (event) =>
    snapshots.push((event as MessageEvent).data),
  );
  try {
    expect(sources).toHaveLength(0);
    expect(feed.readyState).toBe(0);
    const placements = [{ sourceEventId: 'source', channelId: 'channel', messageId: 'message' }];
    roster!.baseline(placements);
    roster!.changed();
    expect(listener).toHaveBeenCalledTimes(2);
    roster!.latest({ channelId: 'channel' });
    expect(latest).toHaveBeenCalledWith({ channelId: 'channel' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(purged).toHaveBeenCalledWith(placements);
    activity!.snapshot('{"revision":1}');
    expect(snapshots).toEqual(['{"revision":1}']);
    expect(feed.readyState).toBe(1);
    activity!.interrupted();
    expect(feed.readyState).toBe(0);

    const live = openSharedChannel('./api/botharness/stream?channelId=c1&after=2');
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toBe('./api/botharness/stream?channelId=c1&after=2');
    live.close();
    expect(sources[0]!.closed).toBe(true);

    feed.close();
    expect(stopActivity).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(stopRoster).toHaveBeenCalledTimes(1);
  } finally {
    feed.close();
    unsubscribe();
    uninstall();
    vi.unstubAllGlobals();
  }
});

it('declares the Channel stream with strict Channel ID and page-size parameters', () => {
  expect(CHANNEL_REMOTE_DESCRIPTOR).toMatchObject({ method: 'followChannel', mode: 'stream' });
  const [channelId, limit] = CHANNEL_REMOTE_DESCRIPTOR.parameters.map((parameter) =>
    parameter.codec.create(),
  );
  expect(channelId!.parse('c1')).toBe('c1');
  expect(() => channelId!.parse(1)).toThrow('Expected a Channel ID');
  expect(limit!.parse(50)).toBe(50);
  expect(() => limit!.parse(0)).toThrow('Expected a page size');
});

it('follows a Channel through the official journal stream: replace, append, gap repair and prepend', async () => {
  const message = (revision: number) => ({
    channelId: 'c1',
    revision,
    message: {
      id: `m${revision}`,
      at: '2026-09-21T00:00:00.000Z',
      author: { kind: 'human' },
      body: `m${revision}`,
    },
  });
  const pageOf = (first: number, last: number) => ({
    entries: Array.from({ length: Math.max(0, last - first + 1) }, (_, index) =>
      message(first + index),
    ),
    olderCursor: first > 1 ? `c${first}` : null,
    hasOlder: first > 1,
  });
  const feed = channel<unknown>();
  const reads: unknown[] = [];
  const remote = {
    $stream: (options: { open: (signal: AbortSignal) => AsyncIterable<unknown> }) => {
      const lifetime = new AbortController();
      return {
        signal: lifetime.signal,
        restart: () => undefined,
        dispose: async () => lifetime.abort(),
        async *[Symbol.asyncIterator]() {
          for await (const value of options.open(lifetime.signal))
            yield { generation: 1, value, signal: lifetime.signal, accept: () => undefined };
        },
      };
    },
  };
  const opens: number[] = [];
  const follow = createChannelFollow(
    remote as never,
    () => ({
      followChannel: (_channelId, limit, signal) => {
        opens.push(limit);
        return feed.items(signal) as never;
      },
    }),
    async (channelId, request) => {
      reads.push([channelId, request]);
      const last = request.before === undefined ? request.through : request.before - 1;
      return pageOf(Math.max(1, last - 1), last) as never;
    },
  );
  const changes: string[] = [];
  const interrupted = vi.fn();
  const journal = follow('c1', {
    change: (change) =>
      changes.push(
        change.type === 'append'
          ? `append ${change.entry.revision}`
          : change.type === 'notification'
            ? 'notification'
            : `${change.type} ${change.entries.map((item) => item.revision).join(',')}`,
      ),
    interrupted,
  });
  try {
    feed.push({ type: 'opened', cursor: 6, page: pageOf(5, 6) });
    feed.push({ type: 'entry', entry: message(7) });
    feed.push({ type: 'notification', notification: { kind: 'human-read' } });
    await settle();
    expect(opens).toEqual([50]);
    expect(changes).toEqual(['replace 5,6', 'append 7', 'notification']);

    feed.push({ type: 'entry', entry: message(9) });
    await settle();
    await settle();
    expect(reads).toEqual([['c1', { through: 9, limit: 50 }]]);
    expect(changes.at(-1)).toBe('replace 8,9');

    await journal.prepend(8);
    expect(reads.at(-1)).toEqual(['c1', { through: 9, before: 8, limit: 50 }]);
    expect(changes.at(-1)).toBe('prepend 6,7');
    expect(interrupted).not.toHaveBeenCalled();
  } finally {
    journal.stop();
  }
});

it('presents the typed Companion stream as the source the Companion owner consumes', async () => {
  expect(COMPANION_REMOTE_DESCRIPTOR.parameters.map((parameter) => parameter.wire)).toEqual([
    'resume',
    'lastEventId',
  ]);
  const feed = channel<unknown>();
  const opens: [string, string][] = [];
  let carrierFailed: (() => void) | undefined;
  const remote = {
    $stream: (options: {
      open: (signal: AbortSignal) => AsyncIterable<unknown>;
      carrierFailed?: () => void;
    }) => {
      const lifetime = new AbortController();
      carrierFailed = options.carrierFailed;
      return {
        restart: () => undefined,
        dispose: async () => lifetime.abort(),
        async *[Symbol.asyncIterator]() {
          for await (const value of options.open(lifetime.signal))
            yield { generation: 1, value, signal: lifetime.signal, accept: () => undefined };
        },
      };
    },
  };
  const source = createCompanionSource(remote as never, () => ({
    followCompanion: (resume, lastEventId, signal) => {
      opens.push([resume, lastEventId]);
      return feed.items(signal) as never;
    },
  }))('./api/botharness/companion?subscribe=1&resume=r1');
  const seen: unknown[] = [];
  source.addEventListener('companion/baseline', (event) =>
    seen.push(['baseline', (event as MessageEvent).data]),
  );
  source.addEventListener('companion/message', (event) =>
    seen.push(['message', (event as MessageEvent).data]),
  );
  source.addEventListener('error', () => seen.push(['error', source.readyState]));
  await settle();
  expect(source.readyState).toBe(0);
  expect(opens).toEqual([['r1', '']]);
  feed.push({ type: 'baseline', value: { consumerId: 'c1' }, id: 'c1' });
  feed.push({ type: 'message', value: { botId: 'ada' }, id: 'c1' });
  await settle();
  expect(source.readyState).toBe(1);
  expect(seen).toEqual([
    ['baseline', { consumerId: 'c1' }],
    ['message', { botId: 'ada' }],
  ]);
  carrierFailed!();
  expect(seen.at(-1)).toEqual(['error', 0]);
  source.close();
  expect(source.readyState).toBe(2);
});
