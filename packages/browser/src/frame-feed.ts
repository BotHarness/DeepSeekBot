export interface FeedFrame {
  readonly data: string;
  readonly mimeType: string;
  readonly viewport?: { width: number; height: number };
}

export interface FrameSource {
  isRunning(): boolean;
  captureScreenshot(tabId: string): Promise<FeedFrame | undefined>;
  streamFrames?(tabId: string, onFrame: (frame: FeedFrame) => void): Promise<() => Promise<void>>;
}

export interface FeedResult {
  readonly seq: number;
  readonly frame: FeedFrame;
  readonly mode: 'stream' | 'snapshot';
}

export interface FrameFeeds {
  next(
    slug: string,
    tabId: string,
    source: FrameSource,
    after: number | undefined,
  ): Promise<FeedResult | undefined>;
  close(): Promise<void>;
}

interface Feed {
  readonly tabId: string;
  readonly source: FrameSource;
  latest?: FeedResult;
  starting?: Promise<void>;
  mode: 'stream' | 'snapshot';
  stop?: () => Promise<void>;
  waiters: Set<() => void>;
  idle?: ReturnType<typeof setTimeout>;
  closed: boolean;
}

export function createFrameFeeds(options: { waitMs?: number; idleMs?: number } = {}): FrameFeeds {
  const waitMs = options.waitMs ?? 10_000;
  const idleMs = options.idleMs ?? 30_000;
  const feeds = new Map<string, Feed>();
  let seq = 0;

  const publish = (feed: Feed, frame: FeedFrame): FeedResult => {
    seq += 1;
    const result: FeedResult = { seq, frame, mode: feed.mode };
    feed.latest = result;
    for (const wake of feed.waiters) wake();
    feed.waiters.clear();
    return result;
  };

  const retire = async (slug: string, feed: Feed): Promise<void> => {
    if (feed.closed) return;
    feed.closed = true;
    if (feeds.get(slug) === feed) feeds.delete(slug);
    if (feed.idle !== undefined) clearTimeout(feed.idle);
    for (const wake of feed.waiters) wake();
    feed.waiters.clear();
    await feed.starting?.catch(() => undefined);
    await feed.stop?.().catch(() => undefined);
  };

  const keepAlive = (slug: string, feed: Feed): void => {
    if (feed.idle !== undefined) clearTimeout(feed.idle);
    feed.idle = setTimeout(() => void retire(slug, feed), idleMs);
    feed.idle.unref?.();
  };

  const feedFor = (slug: string, tabId: string, source: FrameSource): Feed => {
    const current = feeds.get(slug);
    if (current !== undefined && current.tabId === tabId && current.source === source)
      return current;
    if (current !== undefined) void retire(slug, current);
    const feed: Feed = {
      tabId,
      source,
      mode: source.streamFrames === undefined ? 'snapshot' : 'stream',
      waiters: new Set(),
      closed: false,
    };
    feeds.set(slug, feed);
    if (source.streamFrames !== undefined) {
      feed.starting = source
        .streamFrames(tabId, (frame) => {
          if (!feed.closed) publish(feed, frame);
        })
        .then(
          (stop) => {
            if (feed.closed) void stop().catch(() => undefined);
            else feed.stop = stop;
          },
          () => {
            feed.mode = 'snapshot';
            for (const wake of feed.waiters) wake();
            feed.waiters.clear();
          },
        );
    }
    return feed;
  };

  const modeOf = (feed: Feed): Feed['mode'] => feed.mode;

  const newer = (feed: Feed, after: number | undefined): FeedResult | undefined =>
    feed.latest !== undefined && (after === undefined || feed.latest.seq > after)
      ? feed.latest
      : undefined;

  const waitForFrame = (feed: Feed): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(done, waitMs);
      function done(): void {
        clearTimeout(timer);
        feed.waiters.delete(done);
        resolve();
      }
      feed.waiters.add(done);
    });

  const snapshot = async (feed: Feed): Promise<FeedResult | undefined> => {
    const frame = await feed.source.captureScreenshot(feed.tabId).catch(() => undefined);
    return frame === undefined || feed.closed ? undefined : publish(feed, frame);
  };

  return {
    async next(slug, tabId, source, after) {
      const feed = feedFor(slug, tabId, source);
      keepAlive(slug, feed);
      if (feed.mode === 'snapshot') return snapshot(feed);
      const ready = newer(feed, after);
      if (ready !== undefined) return ready;
      await waitForFrame(feed);
      if (feed.closed) return undefined;
      const arrived = newer(feed, after);
      if (arrived !== undefined) return arrived;
      if (modeOf(feed) === 'snapshot' || feed.latest === undefined) return snapshot(feed);
      return undefined;
    },
    async close() {
      await Promise.all([...feeds.entries()].map(([slug, feed]) => retire(slug, feed)));
    },
  };
}
