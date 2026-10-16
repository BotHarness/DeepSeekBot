// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { useReplyPerf } from '../src/client/use-reply-perf.js';
import type { ChannelMessage } from '../src/client/store.js';
import type { AveragePerfView } from '../src/client/message-perf.js';

it('does no work while hidden and refreshes only for a completed measurement, aborting stale requests', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  let resolve: ((value: AveragePerfView) => void) | undefined;
  const actions = {
    averageReplyPerf: vi.fn(
      (_channel: string, _signal?: AbortSignal) =>
        new Promise<AveragePerfView>((done) => {
          resolve = done;
        }),
    ),
  };
  function View({
    enabled,
    latest,
    channel = 'a',
    purgeRevision = 0,
  }: {
    enabled: boolean;
    latest?: ChannelMessage;
    channel?: string;
    purgeRevision?: number;
  }) {
    const { mount, average } = useReplyPerf(actions, channel, latest, enabled, purgeRevision);
    return createElement('span', { ref: mount }, average?.tokensPerSecond);
  }
  const measured: ChannelMessage = {
    id: 'b1',
    at: '2026-10-17',
    author: { kind: 'bot', slug: 'qa' },
    body: 'reply',
    perf: { outputTokens: 100, elapsedMs: 1000, estimated: false },
  };
  await act(() => root.render(createElement(View, { enabled: false, latest: measured })));
  expect(actions.averageReplyPerf).not.toHaveBeenCalled();
  await act(() => root.render(createElement(View, { enabled: true, latest: measured })));
  expect(actions.averageReplyPerf).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 100; i++)
    await act(() =>
      root.render(
        createElement(View, {
          enabled: true,
          latest: { ...measured, id: 'stream', streaming: true, body: 'x'.repeat(i) },
        }),
      ),
    );
  await act(() =>
    root.render(
      createElement(View, {
        enabled: true,
        latest: { ...measured, id: 'human', author: { kind: 'human' } },
      }),
    ),
  );
  expect(actions.averageReplyPerf).toHaveBeenCalledTimes(1);
  await act(() =>
    root.render(createElement(View, { enabled: true, latest: { ...measured, id: 'b2' } })),
  );
  expect(actions.averageReplyPerf).toHaveBeenCalledTimes(2);
  expect(actions.averageReplyPerf.mock.calls[0]![1]!.aborted).toBe(true);
  const stale = resolve;
  await act(() =>
    root.render(createElement(View, { enabled: false, latest: { ...measured, id: 'b2' } })),
  );
  expect(actions.averageReplyPerf.mock.calls[1]![1]!.aborted).toBe(true);
  await act(() => stale?.({ tokensPerSecond: 100, estimated: false, count: 1 }));
  expect(host.textContent).toBe('');
  await act(() => root.render(createElement(View, { enabled: true, channel: 'other' })));
  expect(actions.averageReplyPerf).toHaveBeenCalledTimes(3);
  await act(() => resolve?.({ tokensPerSecond: 100, estimated: false, count: 1 }));
  expect(host.textContent).toBe('100');
  await act(() =>
    root.render(createElement(View, { enabled: true, channel: 'other', purgeRevision: 1 })),
  );
  expect(host.textContent).toBe('');
  expect(actions.averageReplyPerf).toHaveBeenCalledTimes(4);
  await act(() => root.unmount());
  expect(actions.averageReplyPerf.mock.calls[3]![1]!.aborted).toBe(true);
});
