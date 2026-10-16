import { describe, expect, it, vi } from 'vitest';

import {
  parseMessagePerf,
  messagePerfView,
  averagePerfView,
  loadAveragePerf,
  AVERAGE_PERF_WINDOW,
} from '../src/client/message-perf.js';
import type { TimelinePage, TimelinePageRequest } from '../src/client/bridge.js';
import type { ChannelMessage } from '../src/client/store.js';

function message(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'm',
    at: '2026-10-08T00:00:00.000Z',
    author: { kind: 'bot', slug: 'ada' },
    body: 'hi',
    ...overrides,
  };
}

describe('message generation speed label', () => {
  it('pages backward from the latest messages until it has 20 measured replies', async () => {
    const measured = Array.from({ length: 25 }, (_, index) =>
      message({
        id: String(index),
        perf: { outputTokens: index < 5 ? 1 : 100, elapsedMs: 1_000, estimated: false },
      }),
    );
    const loadPage = vi.fn(async (request: TimelinePageRequest): Promise<TimelinePage> => ({
      entries:
        request.cursor === 'older'
          ? measured.slice(0, 15)
          : [...measured.slice(15), ...Array.from({ length: 30 }, () => message())],
      olderCursor: request.cursor === 'older' ? 'oldest' : 'older',
      newerCursor: null,
      hasOlder: true,
      hasNewer: false,
    }));

    expect(await loadAveragePerf(loadPage)).toEqual({
      tokensPerSecond: 100,
      estimated: false,
      count: 20,
    });
    expect(loadPage.mock.calls).toEqual([[{}], [{ direction: 'older', cursor: 'older' }]]);
  });

  it('excludes streaming and failed replies without filling the average window', async () => {
    const completed = message({
      perf: { outputTokens: 100, elapsedMs: 1_000, estimated: false },
    });
    const hidden = Array.from({ length: AVERAGE_PERF_WINDOW }, (_, index) =>
      message({
        id: String(index),
        ...(index % 2 === 0 ? { streaming: true } : { failed: 'failed' }),
        perf: { outputTokens: 500, elapsedMs: 1_000, estimated: true },
      }),
    );
    const loadPage = vi.fn(async (request: TimelinePageRequest): Promise<TimelinePage> => ({
      entries: request.cursor === 'older' ? [completed] : hidden,
      olderCursor: request.cursor === 'older' ? null : 'older',
      newerCursor: null,
      hasOlder: request.cursor !== 'older',
      hasNewer: false,
    }));
    const expected = { tokensPerSecond: 100, estimated: false, count: 1 };

    expect(averagePerfView([completed, ...hidden])).toEqual(expected);
    expect(await loadAveragePerf(loadPage)).toEqual(expected);
    expect(loadPage.mock.calls).toEqual([[{}], [{ direction: 'older', cursor: 'older' }]]);
  });

  it('stops after the latest 200 messages', async () => {
    const loadPage = vi.fn(async (): Promise<TimelinePage> => ({
      entries: Array.from({ length: 50 }, () => message()),
      olderCursor: 'older',
      newerCursor: null,
      hasOlder: true,
      hasNewer: false,
    }));
    expect(await loadAveragePerf(loadPage)).toBeUndefined();
    expect(loadPage).toHaveBeenCalledTimes(4);
  });

  it('reads a partial or malformed perf field without failing the message', () => {
    expect(parseMessagePerf({ outputTokens: 40, elapsedMs: 1_000, estimated: false })).toEqual({
      outputTokens: 40,
      elapsedMs: 1_000,
      estimated: false,
    });
    expect(parseMessagePerf({ outputTokens: 40, elapsedMs: 1_000 })).toEqual({
      outputTokens: 40,
      elapsedMs: 1_000,
      estimated: true,
    });
    expect(parseMessagePerf({ outputTokens: '40', elapsedMs: 1_000 })).toBeUndefined();
  });

  it('rounds to integers and hides the label for anything that must not render', () => {
    expect(
      messagePerfView(message({ perf: { outputTokens: 125, elapsedMs: 3_000, estimated: false } })),
    ).toEqual({ tokensPerSecond: 42, estimated: false });
    expect(messagePerfView(message())).toBeUndefined();
    expect(
      messagePerfView(
        message({ streaming: true, perf: { outputTokens: 40, elapsedMs: 1_000, estimated: true } }),
      ),
    ).toBeUndefined();
    expect(
      messagePerfView(
        message({ failed: 'x', perf: { outputTokens: 40, elapsedMs: 1_000, estimated: true } }),
      ),
    ).toBeUndefined();
    expect(
      messagePerfView({
        ...message({ perf: { outputTokens: 40, elapsedMs: 1_000, estimated: true } }),
        author: { kind: 'human' },
      }),
    ).toBeUndefined();
  });

  it('token-weights the last replies and flags any estimated one', () => {
    const fast = message({
      id: 'a',
      perf: { outputTokens: 100, elapsedMs: 1_000, estimated: false },
    });
    const slow = message({
      id: 'b',
      perf: { outputTokens: 300, elapsedMs: 3_000, estimated: true },
    });
    expect(averagePerfView([fast, slow])).toEqual({
      tokensPerSecond: 100,
      estimated: true,
      count: 2,
    });
    expect(averagePerfView([message()])).toBeUndefined();
    expect(averagePerfView([])).toBeUndefined();
    const many = Array.from({ length: AVERAGE_PERF_WINDOW + 5 }, (_, index) =>
      message({
        id: String(index),
        perf: { outputTokens: 10, elapsedMs: 1_000, estimated: false },
      }),
    );
    expect(averagePerfView(many)).toEqual({
      tokensPerSecond: 10,
      estimated: false,
      count: AVERAGE_PERF_WINDOW,
    });
  });
});

it('does not follow an empty pagination page indefinitely', async () => {
  const load = vi.fn(async (): Promise<TimelinePage> => ({
    entries: [],
    hasOlder: true,
    olderCursor: 'empty',
    hasNewer: false,
    newerCursor: null,
  }));
  expect(await loadAveragePerf(load)).toBeUndefined();
  expect(load).toHaveBeenCalledTimes(1);
});

it('ignores purged measurements', () => {
  const purged = message({
    contentPurged: true,
    perf: { outputTokens: 100, elapsedMs: 1000, estimated: false },
  });
  expect(messagePerfView(purged)).toBeUndefined();
  expect(averagePerfView([purged])).toBeUndefined();
});
