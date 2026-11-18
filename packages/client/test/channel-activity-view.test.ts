// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/client/overview-usage-view.js', () => ({ OverviewUsageView: () => null }));
vi.mock('../src/client/overview-memory-view.js', () => ({ OverviewMemoryView: () => null }));
vi.mock('../src/client/channel-activity-chart.js', () => ({ ChannelActivityChart: () => null }));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  IconRefreshOutlineRegular: () => null,
  IconRightUpOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
    createElement('button', props, children as ReactNode),
}));
import { ChannelActivityView } from '../src/client/channel-activity-view.js';
import { loadChannelActivityToday, type BridgeCall } from '../src/client/bridge.js';
import { createActions } from '../src/client/actions.js';
import { store } from '../src/client/store.js';
import { zhTranslate } from '../src/client/locale.js';
const today = {
  day: '2026-10-02',
  timezone: 'UTC',
  from: '2026-10-02T00:00:00Z',
  to: '2026-10-03T00:00:00Z',
  total: 3,
  channels: [
    {
      channelId: 'group-team',
      name: 'Team',
      type: 'group',
      total: 3,
      human: 1,
      bot: 2,
      other: 0,
      senders: [
        { author: { kind: 'human' }, displayName: 'Captain', count: 1 },
        { author: { kind: 'bot', slug: 'ada' }, displayName: 'Ada', count: 2 },
      ],
    },
  ],
};
afterEach(() => vi.useRealTimers());
it('expands current sender names without opening or reading the Channel, refreshes, and stops on unmount', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T23:59:59Z'));
  let response = today;
  const call = vi.fn<BridgeCall>(async (endpoint) => {
    if (endpoint === 'channelActivityToday') return { ok: true, value: response };
    throw new Error('Unexpected ' + endpoint);
  });
  const actions = createActions(call, store);
  const open = vi.spyOn(actions, 'openChannel').mockResolvedValue();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(ChannelActivityView, { actions, t: zhTranslate })),
    );
    expect(container.querySelector('[data-activity-total]')?.textContent).toBe('3');
    expect(container.textContent).not.toContain('Captain');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.bh-channel-activity-toggle')!.click(),
    );
    expect(container.textContent).toContain('Captain');
    expect(container.textContent).toContain('Ada');
    expect(open).not.toHaveBeenCalled();
    expect(call.mock.calls.every(([endpoint]) => endpoint === 'channelActivityToday')).toBe(true);
    response = {
      ...today,
      day: '2026-10-03',
      from: '2026-10-03T00:00:00Z',
      to: '2026-10-04T00:00:00Z',
    };
    await act(async () => vi.advanceTimersByTimeAsync(1200));
    expect(container.textContent).toContain('2026-10-03');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="打开 Channel: Team"]')!.click(),
    );
    expect(open).toHaveBeenCalledWith('group-team');
    await act(async () => root.unmount());
    const count = call.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(call.mock.calls).toHaveLength(count);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
it('rejects inconsistent totals instead of showing fabricated zero', async () => {
  await expect(
    loadChannelActivityToday(async () => ({ ok: true, value: { ...today, total: 4 } })),
  ).rejects.toThrow('Invalid Channel activity');
});

it('disables refresh while awaiting the Host and allows retry after an unavailable query', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let complete: ((value: Awaited<ReturnType<BridgeCall>>) => void) | undefined;
  const call = vi.fn<BridgeCall>(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const actions = createActions(call, store);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(ChannelActivityView, { actions, t: zhTranslate })),
    );
    const refresh = container.querySelector<HTMLButtonElement>('header button[aria-busy]')!;
    expect(refresh.disabled).toBe(true);
    expect(refresh.getAttribute('aria-busy')).toBe('true');
    refresh.click();
    expect(call).toHaveBeenCalledTimes(1);
    await act(async () =>
      complete?.({
        ok: false,
        error: { code: 'storage-unavailable', message: 'Unavailable', details: {} },
      }),
    );
    expect(container.querySelector('[role=alert]')).not.toBeNull();
    expect(container.querySelector('[data-activity-total]')).toBeNull();
    expect(refresh.disabled).toBe(false);
    await act(async () => refresh.click());
    expect(refresh.disabled).toBe(true);
    await act(async () => complete?.({ ok: true, value: today }));
    expect(refresh.disabled).toBe(false);
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(container.querySelector('[data-activity-total]')?.textContent).toBe('3');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('persists statistics disclosure without changing message read state', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const calls: string[] = [];
  const actions = createActions(async (endpoint) => {
    calls.push(endpoint);
    return { ok: true, value: today };
  }, store);
  const container = document.createElement('div');
  document.body.append(container);
  let root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(ChannelActivityView, { actions, t: zhTranslate, storage })),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.bh-statistics-toggle')!.click(),
    );
    expect(container.querySelector<HTMLElement>('.bh-statistics-content')?.hidden).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () =>
      root.render(createElement(ChannelActivityView, { actions, t: zhTranslate, storage })),
    );
    expect(container.querySelector('.bh-statistics-toggle')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.bh-statistics-toggle')!.click(),
    );
    expect(container.querySelector<HTMLElement>('.bh-statistics-content')?.hidden).toBe(false);
    expect(calls.every((endpoint) => endpoint === 'channelActivityToday')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
