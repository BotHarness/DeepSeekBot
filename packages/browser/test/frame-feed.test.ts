import { describe, expect, it, vi } from 'vitest';

import { createFrameFeeds, type FeedFrame } from '../src/frame-feed.js';

function frame(label: string): FeedFrame {
  return {
    data: Buffer.from(label).toString('base64'),
    mimeType: 'image/jpeg',
    viewport: { width: 1200, height: 800 },
  };
}

function streamingSource() {
  let push: ((next: FeedFrame) => void) | undefined;
  const stop = vi.fn(async () => undefined);
  const source = {
    isRunning: () => true,
    captureScreenshot: vi.fn(async () => frame('snapshot')),
    streamFrames: vi.fn(async (_tabId: string, onFrame: (next: FeedFrame) => void) => {
      push = onFrame;
      return stop;
    }),
  };
  return { source, stop, push: (next: FeedFrame) => push?.(next) };
}

const label = (value: { frame: FeedFrame } | undefined) =>
  value === undefined ? undefined : Buffer.from(value.frame.data, 'base64').toString();

describe('browser frame feeds', () => {
  it('serves pushed frames and waits for a newer one instead of capturing', async () => {
    const feeds = createFrameFeeds({ waitMs: 1_000, idleMs: 60_000 });
    const s = streamingSource();
    const first = feeds.next('qa', 'tab-1', s.source, undefined);
    await vi.waitFor(() => expect(s.source.streamFrames).toHaveBeenCalledOnce());
    s.push(frame('one'));
    const one = await first;
    expect(label(one)).toBe('one');
    expect(one?.mode).toBe('stream');
    const waiting = feeds.next('qa', 'tab-1', s.source, one!.seq);
    s.push(frame('two'));
    const two = await waiting;
    expect(label(two)).toBe('two');
    expect(two!.seq).toBeGreaterThan(one!.seq);
    expect(s.source.captureScreenshot).not.toHaveBeenCalled();
    expect(s.source.streamFrames).toHaveBeenCalledOnce();
    await feeds.close();
    expect(s.stop).toHaveBeenCalledOnce();
  });

  it('returns nothing when no newer frame arrives before the wait ends', async () => {
    const feeds = createFrameFeeds({ waitMs: 20, idleMs: 60_000 });
    const s = streamingSource();
    const first = feeds.next('qa', 'tab-1', s.source, undefined);
    await vi.waitFor(() => expect(s.source.streamFrames).toHaveBeenCalled());
    s.push(frame('one'));
    const one = await first;
    expect(await feeds.next('qa', 'tab-1', s.source, one!.seq)).toBeUndefined();
    await feeds.close();
  });

  it('captures a snapshot when the first pushed frame is late', async () => {
    const feeds = createFrameFeeds({ waitMs: 20, idleMs: 60_000 });
    const s = streamingSource();
    const first = await feeds.next('qa', 'tab-1', s.source, undefined);
    expect(label(first)).toBe('snapshot');
    expect(first?.mode).toBe('stream');
    await feeds.close();
  });

  it('falls back to snapshots when the runtime cannot stream', async () => {
    const feeds = createFrameFeeds({ waitMs: 1_000, idleMs: 60_000 });
    const source = { isRunning: () => true, captureScreenshot: vi.fn(async () => frame('snap')) };
    const one = await feeds.next('qa', 'tab-1', source, undefined);
    const two = await feeds.next('qa', 'tab-1', source, one!.seq);
    expect(one?.mode).toBe('snapshot');
    expect(label(two)).toBe('snap');
    expect(two!.seq).toBeGreaterThan(one!.seq);
    expect(source.captureScreenshot).toHaveBeenCalledTimes(2);
    await feeds.close();
  });

  it('falls back to snapshots when starting the stream fails', async () => {
    const feeds = createFrameFeeds({ waitMs: 1_000, idleMs: 60_000 });
    const source = {
      isRunning: () => true,
      captureScreenshot: vi.fn(async () => frame('snap')),
      streamFrames: vi.fn(async () => {
        throw new Error('screencast unavailable');
      }),
    };
    const one = await feeds.next('qa', 'tab-1', source, undefined);
    expect(label(one)).toBe('snap');
    expect(one?.mode).toBe('snapshot');
    await feeds.close();
  });

  it('restarts the stream when the viewed tab changes and stops it when idle', async () => {
    vi.useFakeTimers();
    try {
      const feeds = createFrameFeeds({ waitMs: 1_000, idleMs: 5_000 });
      const s = streamingSource();
      const first = feeds.next('qa', 'tab-1', s.source, undefined);
      await vi.waitFor(() => expect(s.source.streamFrames).toHaveBeenCalledTimes(1));
      s.push(frame('one'));
      await first;
      const other = feeds.next('qa', 'tab-2', s.source, undefined);
      await vi.waitFor(() => expect(s.source.streamFrames).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(s.stop).toHaveBeenCalledTimes(1));
      expect(s.source.streamFrames).toHaveBeenLastCalledWith('tab-2', expect.any(Function));
      s.push(frame('other'));
      expect(label(await other)).toBe('other');
      await vi.advanceTimersByTimeAsync(6_000);
      await vi.waitFor(() => expect(s.stop).toHaveBeenCalledTimes(2));
      await feeds.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
