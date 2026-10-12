// @vitest-environment jsdom
import { botNameColor } from '../src/client/bot-primary-color.js';
import { act, createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/client/model-usage-charts.js', () => ({
  UsageChart: ({ rows }: { rows: Array<{ key: string }> }) =>
    createElement('div', { 'data-trend': rows.length }),
  UsageLegend: () => null,
  UsageMeasures: () => null,
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconRefreshOutlineRegular: () => createElement('svg'),
  IconRightUpOutlineRegular: () => createElement('svg'),
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
    createElement('button', props, children as ReactNode),
}));
import { OverviewUsageView } from '../src/client/overview-usage-view.js';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';
import { loadOverviewUsage, type BridgeCall } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import type { OverviewUsage } from '../../core/src/bridge/methods.js';

function result(period: 'today' | 'week', total = 155): OverviewUsage {
  const buckets = {
    inputTokens: total - 40,
    outputTokens: 40,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: total,
  };
  return {
    period,
    start: period === 'week' ? '2026-09-26' : '2026-10-02',
    end: '2026-10-02',
    timezone: 'Asia/Tokyo',
    nextRefreshAt: '2026-10-03T00:00:00Z',
    totals: buckets,
    days: Array.from({ length: period === 'week' ? 7 : 1 }, (_, i) => ({
      ...buckets,
      day:
        period === 'week'
          ? [
              '2026-09-26',
              '2026-09-27',
              '2026-09-28',
              '2026-09-29',
              '2026-09-30',
              '2026-10-01',
              '2026-10-02',
            ][i]!
          : '2026-10-02',
    })),
    bots: [{ ...buckets, slug: 'ada', displayName: 'Ada', current: true, primaryColor: '#e2b04a' }],
    freshness: 'ready',
    readAt: '2026-10-02T12:00:00Z',
    reconciledAt: null,
    legacyBaseline: false,
  };
}
afterEach(() => vi.useRealTimers());
it('switches to seven days, opens Bot Profile and disposes read-only polling', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  const call = vi.fn<BridgeCall>(async (endpoint, args) => {
    if (endpoint === 'overviewUsage')
      return { ok: true, value: result(args['period'] === 'week' ? 'week' : 'today') };
    throw new Error(endpoint);
  });
  const actions = createActions(call, createStore());
  const open = vi.spyOn(actions, 'openBot').mockResolvedValue();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(OverviewUsageView, { actions, t: zhTranslate })),
    );
    expect(container.querySelector('[data-usage-total]')?.textContent).toBe('155');
    const name = container.querySelector<HTMLElement>(
      '[data-usage-bot=ada] [data-usage-bot-name]',
    )!;
    expect(name.textContent).toBe('Ada');
    expect(name.dataset['botNameSource']).toBe('#e2b04a');
    expect(name.dataset['botNameColor']).toBe(botNameColor('#e2b04a', '#ffffff'));
    expect(name.style.color).not.toBe('');
    expect(container.querySelector('[data-trend]')?.getAttribute('data-trend')).toBe('1');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-usage-period=week]')!.click(),
    );
    expect(container.querySelector('[data-trend]')?.getAttribute('data-trend')).toBe('7');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-usage-bot=ada] button')!.click(),
    );
    expect(open).toHaveBeenCalledWith('ada', 'profile');
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(call.mock.calls.every(([endpoint]) => endpoint === 'overviewUsage')).toBe(true);
    const count = call.mock.calls.length;
    await act(async () => root.unmount());
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(call).toHaveBeenCalledTimes(count);
  } finally {
    container.remove();
  }
});
it('drops a delayed Today refresh after changing range and surfaces unavailable usage with retry', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  let todayCalls = 0;
  let release: (() => void) | undefined;
  let fail = false;
  const call: BridgeCall = async (endpoint, args) => {
    if (endpoint !== 'overviewUsage') throw new Error(endpoint);
    if (fail) throw new Error('Usage unavailable');
    if (args['period'] === 'today' && ++todayCalls === 2)
      return new Promise((resolve) => {
        release = () => resolve({ ok: true, value: result('today', 999) });
      });
    return {
      ok: true,
      value: result(
        args['period'] === 'week' ? 'week' : 'today',
        args['period'] === 'week' ? 211 : 155,
      ),
    };
  };
  const actions = createActions(call, createStore());
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(OverviewUsageView, { actions, t: zhTranslate })),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="刷新用量"]')!.click(),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-usage-period=week]')!.click(),
    );
    await act(async () => release?.());
    expect(container.querySelector('[data-usage-total]')?.textContent).toBe('211');
    fail = true;
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="刷新用量"]')!.click(),
    );
    expect(container.querySelector('[role=alert]')?.textContent).toContain('暂不可用');
    fail = false;
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="刷新用量"]')!.click(),
    );
    expect(container.querySelector('[role=alert]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
it('preserves unknown totals and rejects malformed usage instead of reporting zero', async () => {
  const value = result('today');
  value.totals.totalTokens = null;
  value.days[0]!.totalTokens = null;
  const call: BridgeCall = async () => ({ ok: true, value });
  expect((await loadOverviewUsage(call, 'today')).totals.totalTokens).toBeNull();
  value.totals.totalTokens = -1;
  await expect(loadOverviewUsage(call, 'today')).rejects.toThrow('invalid Overview usage');
});
it('keeps all expanded Bot pages fresh during polling and manual refresh', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  let total = 155;
  const call = vi.fn<BridgeCall>(async (endpoint, args) => {
    if (endpoint !== 'overviewUsage') throw new Error(endpoint);
    const value = result('today', total);
    const offset = args['after'] ? 20 : 0;
    value.bots = Array.from({ length: offset ? 1 : 20 }, (_, i) => ({
      ...value.totals,
      slug: `bot-${String(offset + i).padStart(2, '0')}`,
      displayName: `Bot ${offset + i}`,
      current: true,
      primaryColor: '#1d1b22',
    }));
    if (!offset) value.nextCursor = 'bot-19';
    return { ok: true, value };
  });
  const actions = createActions(call, createStore());
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(OverviewUsageView, { actions, t: zhTranslate })),
    );
    await act(async () =>
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes(zhTranslate('overviewUsage.more')))!
        .click(),
    );
    expect(container.querySelectorAll('[data-usage-bot]')).toHaveLength(21);
    total = 211;
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(container.querySelectorAll('[data-usage-bot]')).toHaveLength(21);
    expect(container.querySelector('[data-usage-bot="bot-20"]')?.textContent).toContain('211');
    expect(container.querySelector('[data-usage-total]')?.textContent).toBe('211');
    total = 255;
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="刷新用量"]')!.click(),
    );
    expect(container.querySelectorAll('[data-usage-bot]')).toHaveLength(21);
    expect(container.querySelector('[data-usage-bot="bot-00"]')?.textContent).toContain('255');
    expect(container.querySelector('[data-usage-bot="bot-20"]')?.textContent).toContain('255');
    expect(call.mock.calls.filter(([, args]) => args['after'] === 'bot-19')).toHaveLength(3);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
