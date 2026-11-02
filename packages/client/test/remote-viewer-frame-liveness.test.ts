import { describe, expect, it } from 'vitest';

import {
  BUSY_EMPTY_AFTER,
  EMPTY_AFTER_MISSES,
  LOSS_REMOUNT_AFTER,
  MAX_AUTO_RELOAD,
  QUIET_ABANDON,
  QUIET_TOLERANCE,
  hashBytes,
  nextStreamTracker,
  sampleSurface,
  shouldAutoReload,
  shouldRemountLoss,
  upstreamBusy,
  type StreamSample,
  type StreamTracker,
} from '../src/client/remote-viewer/frame-liveness.js';

function statusElement(text: string, hidden: boolean): unknown {
  return {
    textContent: text,
    classList: { contains: (name: string): boolean => (name === 'hidden' ? hidden : false) },
  };
}

function fakeContext(pixels: number[], contextNull: boolean | undefined): unknown {
  return contextNull === true
    ? null
    : {
        drawImage: () => undefined,
        getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
      };
}

function stubDoc(options: {
  canvasWidth?: number;
  pixels?: number[];
  statusText?: string;
  statusHidden?: boolean;
  contextNull?: boolean;
}): Document {
  const { canvasWidth, pixels, statusText, statusHidden, contextNull } = options;
  return {
    getElementById: (id: string): unknown => {
      if (id === 'videoCanvas') {
        if (canvasWidth === undefined) return null;
        return {
          width: canvasWidth,
          getContext: () => fakeContext(pixels ?? [0], contextNull),
        };
      }
      if (id === 'status-display') {
        if (statusText === undefined) return null;
        return statusElement(statusText, statusHidden ?? false);
      }
      return null;
    },
    createElement: (tag: string): unknown => {
      if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
      return {
        width: 0,
        height: 0,
        getContext: () => fakeContext(pixels ?? [0], contextNull),
      };
    },
  } as unknown as Document;
}

const FRESH: StreamTracker = { misses: 0, busyStreak: 0, quiet: 0 };

function tick(
  tracker: StreamTracker,
  sample: StreamSample,
): { readonly tracker: StreamTracker; readonly phase: string } {
  const next = nextStreamTracker(tracker, sample);
  return { tracker: next.tracker, phase: next.phase };
}

describe('hashBytes', () => {
  it('is deterministic and distinguishes pixel payloads', () => {
    const a = new Uint8ClampedArray([10, 20, 30, 40]);
    const b = new Uint8ClampedArray([10, 20, 30, 41]);
    expect(hashBytes(a)).toBe(hashBytes(new Uint8ClampedArray([10, 20, 30, 40])));
    expect(hashBytes(a)).not.toBe(hashBytes(b));
  });
});

describe('upstreamBusy', () => {
  it('is quiet without a document or status element', () => {
    expect(upstreamBusy(null)).toBe(false);
    expect(upstreamBusy(undefined)).toBe(false);
    expect(upstreamBusy(stubDoc({}))).toBe(false);
  });

  it('reads Selkies connecting/reconnecting states', () => {
    expect(upstreamBusy(stubDoc({ statusText: 'Connecting...' }))).toBe(true);
    expect(
      upstreamBusy(stubDoc({ statusText: 'WebSocket disconnected. Attempting to reconnect...' })),
    ).toBe(true);
    expect(
      upstreamBusy(stubDoc({ statusText: 'Reconnecting due to abnormal connection closure.' })),
    ).toBe(true);
  });

  it('ignores a hidden status line and healthy states', () => {
    expect(upstreamBusy(stubDoc({ statusText: 'Connecting...', statusHidden: true }))).toBe(false);
    expect(upstreamBusy(stubDoc({ statusText: 'Connected' }))).toBe(false);
    expect(upstreamBusy(stubDoc({ statusText: '60 FPS · 8 Mbps' }))).toBe(false);
  });

  it('never throws on a hostile document', () => {
    const hostile = {
      getElementById: (): unknown => {
        throw new Error('denied');
      },
    } as unknown as Document;
    expect(upstreamBusy(hostile)).toBe(false);
  });
});

describe('sampleSurface', () => {
  it('reports unsized without a document or canvas', () => {
    expect(sampleSurface(null)).toEqual({ sized: false, busy: false });
    expect(sampleSurface(stubDoc({}))).toEqual({ sized: false, busy: false });
    expect(sampleSurface(stubDoc({ canvasWidth: 0, pixels: [1] })).sized).toBe(false);
  });

  it('sizes the canvas and signs its pixels', () => {
    const first = sampleSurface(stubDoc({ canvasWidth: 1024, pixels: [1, 2, 3] }));
    const same = sampleSurface(stubDoc({ canvasWidth: 1024, pixels: [1, 2, 3] }));
    const changed = sampleSurface(stubDoc({ canvasWidth: 1024, pixels: [9, 9, 9] }));
    expect(first.sized).toBe(true);
    expect(first.signature).toBeDefined();
    expect(same.signature).toBe(first.signature);
    expect(changed.signature).not.toBe(first.signature);
  });

  it('degrades to sized-only when pixels are unreadable', () => {
    const sample = sampleSurface(stubDoc({ canvasWidth: 1024, pixels: [1], contextNull: true }));
    expect(sample.sized).toBe(true);
    expect(sample.signature).toBeUndefined();
  });

  it('carries the upstream busy line in the same sample', () => {
    const sample = sampleSurface(
      stubDoc({ canvasWidth: 1024, pixels: [1], statusText: 'Connecting...' }),
    );
    expect(sample).toMatchObject({ sized: true, busy: true });
  });
});

describe('nextStreamTracker', () => {
  it('ages unsized ticks toward empty and recovers on live', () => {
    let tracker: StreamTracker = FRESH;
    for (let index = 1; index < EMPTY_AFTER_MISSES; index += 1) {
      const next = tick(tracker, { sized: false, busy: false });
      expect(next.phase).toBe('connecting');
      tracker = next.tracker;
    }
    const empty = tick(tracker, { sized: false, busy: false });
    expect(empty.phase).toBe('empty');
    const live = tick(empty.tracker, { sized: true, busy: false, signature: 2 });
    expect(live.phase).toBe('connecting');
    expect(live.tracker.misses).toBe(EMPTY_AFTER_MISSES);
    expect(live.tracker.quiet).toBe(1);
  });

  it('never goes live while the upstream reports busy, then ages out patiently', () => {
    let tracker: StreamTracker = FRESH;
    for (let index = 1; index <= BUSY_EMPTY_AFTER; index += 1) {
      const next = tick(tracker, { sized: true, busy: true, signature: index });
      tracker = next.tracker;
      if (index < BUSY_EMPTY_AFTER) expect(next.phase).toBe('connecting');
    }
    expect(tracker.busyStreak).toBe(BUSY_EMPTY_AFTER);
    expect(tracker.misses).toBe(0);
    expect(tick(tracker, { sized: true, busy: true, signature: 99 }).phase).toBe('empty');
  });

  it('goes live on the second changed signature', () => {
    const first = tick(FRESH, { sized: true, busy: false, signature: 10 });
    expect(first.phase).toBe('connecting');
    const second = tick(first.tracker, { sized: true, busy: false, signature: 11 });
    expect(second.phase).toBe('live');
    expect(second.tracker).toMatchObject({ misses: 0, busyStreak: 0, quiet: 0 });
  });

  it('keeps a changing live picture live when it becomes briefly static', () => {
    const first = tick(FRESH, { sized: true, busy: false, signature: 10 });
    let tracker = tick(first.tracker, { sized: true, busy: false, signature: 11 }).tracker;
    for (let index = 0; index < QUIET_TOLERANCE; index += 1) {
      const next = tick(tracker, { sized: true, busy: false, signature: 11 });
      expect(next.phase).toBe('live');
      tracker = next.tracker;
    }
    const busy = tick(tracker, { sized: true, busy: true, signature: 11 });
    expect(busy.phase).toBe('connecting');
    expect(tick(busy.tracker, { sized: true, busy: false, signature: 11 }).phase).toBe(
      'connecting',
    );
  });
  it('grants a quiet static desktop live after the tolerance, then gives up', () => {
    let tracker: StreamTracker = FRESH;
    let phase = 'connecting';
    for (let index = 1; index <= QUIET_ABANDON; index += 1) {
      const next = tick(tracker, { sized: true, busy: false, signature: 7 });
      tracker = next.tracker;
      phase = next.phase;
      if (index < QUIET_TOLERANCE) expect(phase).toBe('connecting');
      else if (index < QUIET_ABANDON) expect(phase).toBe('live');
    }
    expect(phase).toBe('empty');
  });

  it('degrades to the sized-only signal when pixels are unreadable', () => {
    const next = tick(FRESH, { sized: true, busy: false });
    expect(next.phase).toBe('live');
  });

  it('a busy line vetoes even a changing picture', () => {
    const first = tick(FRESH, { sized: true, busy: false, signature: 1 });
    const vetoed = tick(first.tracker, { sized: true, busy: true, signature: 2 });
    expect(vetoed.phase).toBe('connecting');
    expect(vetoed.tracker.quiet).toBe(0);
  });

  it('busy ticks preserve the pixel baseline instead of tracking vetoed art', () => {
    const quiet = tick(FRESH, { sized: true, busy: false, signature: 1 });
    const vetoed = tick(quiet.tracker, { sized: true, busy: true, signature: 2 });
    expect(vetoed.tracker.lastSignature).toBe(1);
    expect(vetoed.tracker.busyStreak).toBe(1);
    const settled = tick(vetoed.tracker, { sized: true, busy: false, signature: 1 });
    expect(settled.phase).toBe('connecting');
    expect(tick(vetoed.tracker, { sized: true, busy: false, signature: 3 }).phase).toBe('live');
  });
});

describe('remount guards', () => {
  it('auto-reloads a never-live empty document a bounded number of times', () => {
    expect(shouldAutoReload('empty', false, 0)).toBe(true);
    expect(shouldAutoReload('empty', false, MAX_AUTO_RELOAD - 1)).toBe(true);
    expect(shouldAutoReload('empty', false, MAX_AUTO_RELOAD)).toBe(false);
    expect(shouldAutoReload('empty', true, 0)).toBe(false);
    expect(shouldAutoReload('connecting', false, 0)).toBe(false);
    expect(shouldAutoReload('live', false, 0)).toBe(false);
  });

  it('remounts after a loss only once it persists', () => {
    expect(shouldRemountLoss(0)).toBe(false);
    expect(shouldRemountLoss(LOSS_REMOUNT_AFTER - 1)).toBe(false);
    expect(shouldRemountLoss(LOSS_REMOUNT_AFTER)).toBe(true);
  });
});
