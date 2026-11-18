// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BridgeCall } from '../src/client/bridge.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
vi.mock('@tanstack/charts/react/tooltip', () => ({ Chart: () => createElement('div') }));
import { OverviewMemoryView } from '../src/client/overview-memory-view.js';

it('shows unavailable separately from clean, refreshes loaded pages and navigates to Bot Profile without leaving a poll behind', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  const days = [
    '2026-09-26',
    '2026-09-27',
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
  ];
  let fail = false;
  const call = vi.fn<BridgeCall>(async (endpoint, args) => {
    if (endpoint !== 'overviewMemory' || fail) throw Error('unavailable');
    return {
      ok: true,
      value: {
        start: days[0],
        end: days[6],
        days,
        timezone: 'Asia/Tokyo',
        readAt: '2026-10-02T12:00:00Z',
        nextRefreshAt: '2026-10-03T00:00:00Z',
        bots: args['after']
          ? [{ slug: 'bea', displayName: 'Bea', state: 'unavailable' }]
          : [
              {
                slug: 'ada',
                displayName: 'Ada',
                state: 'ready',
                total: 2,
                counts: [1, 0, 0, 0, 0, 0, 1],
                dirty: true,
              },
            ],
        ...(args['after'] ? {} : { nextCursor: 'ada' }),
      },
    };
  });
  const actions = createActions(call, createStore());
  const open = vi.spyOn(actions, 'openBot').mockResolvedValue();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(OverviewMemoryView, { actions, t: zhTranslate })),
    );
    expect(container.querySelector('[data-memory-total]')?.textContent).toBe('2 次提交');
    expect(container.querySelector('[data-memory-dirty=true]')?.textContent).toBe('未提交改动');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.bh-profile-action')!.click(),
    );
    expect(container.querySelectorAll('[data-memory-bot]')).toHaveLength(2);
    expect(container.querySelector('[data-memory-bot=bea]')?.textContent).toContain('仓库不可用');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-memory-bot=ada] button')!.click(),
    );
    expect(open).toHaveBeenCalledWith('ada', 'profile');
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(container.querySelectorAll('[data-memory-bot]')).toHaveLength(2);
    fail = true;
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(container.querySelector('[role=alert]')?.textContent).toContain('可能不是最新');
    const called = call.mock.calls.length;
    await act(async () => root.unmount());
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(call).toHaveBeenCalledTimes(called);
  } finally {
    container.remove();
    vi.useRealTimers();
  }
});
