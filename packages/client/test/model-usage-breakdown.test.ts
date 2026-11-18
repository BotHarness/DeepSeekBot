// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  IconRefreshOutlineRegular: () => createElement('svg'),
  IconEllipsisOutlineRegular: () => createElement('svg'),
}));

import type { UsageFilter, UsageQueryResult, ProfileModelUsageRow } from '../src/client/bridge.js';
import { en } from '../src/client/locale.js';
import { ModelUsageBreakdown } from '../src/client/model-usage-breakdown.js';
import { UsageMeasures, type UsageSummary } from '../src/client/model-usage-charts.js';

function translate(key: string, params?: Record<string, unknown>): string {
  let text = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}
const base: ProfileModelUsageRow = {
  day: '2026-09-30',
  purpose: 'orchestrator',
  provider: 'provider-a',
  model: 'shared-name',
  inputTokens: 100,
  outputTokens: 40,
  cacheReadTokens: 10,
  cacheWriteTokens: 5,
  totalTokens: 155,
};
const props = { today: '2026-09-30', firstDay: '2026-04-02', t: translate };

function tooltipMeasures(row: ProfileModelUsageRow): string[] {
  const summary: UsageSummary = { ...row, key: row.model, label: row.model };
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    createElement(UsageMeasures, { row: summary, t: translate }),
  );
  return [...container.querySelectorAll('dd')].map((element) => element.textContent!);
}

async function renderUsage(
  rows: ProfileModelUsageRow[],
  status: 'ready' | 'unavailable' = 'ready',
  loadUsage?: (filter: UsageFilter) => Promise<UsageQueryResult>,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ModelUsageBreakdown, {
        ...props,
        rows,
        status,
        ...(loadUsage ? { loadUsage } : {}),
      }),
    ),
  );
  return {
    container,
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
async function choose(container: HTMLElement, value: string) {
  await act(async () => {
    if (value === 'custom') {
      document.body
        .querySelector<HTMLButtonElement>('button[aria-label="More time ranges"]')!
        .click();
    } else {
      document.body.querySelector<HTMLButtonElement>(`[data-range="${value}"]`)!.click();
    }
  });
  if (value === 'custom')
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click(),
    );
}
async function showView(container: HTMLElement, view: 'daily' | 'model') {
  await act(async () =>
    document.body.querySelector<HTMLButtonElement>(`[data-view="${view}"]`)!.click(),
  );
}
async function setDate(container: HTMLElement, index: number, value: string) {
  await act(async () => {
    const input = document.body.querySelectorAll<HTMLInputElement>('input[type="date"]')[index]!;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
describe('Token usage card', () => {
  it('shows the same period total in the daily and by-model views across ranges', async () => {
    const { container, cleanup } = await renderUsage([
      base,
      { ...base, provider: 'provider-b', cacheWriteTokens: null, totalTokens: 150 },
      { ...base, day: '2026-09-29', inputTokens: 145, totalTokens: 200 },
      { ...base, day: '2026-09-23', inputTokens: 445, totalTokens: 500 },
      { ...base, purpose: 'assignment', model: 'other-model', totalTokens: 20 },
    ]);
    try {
      expect(document.body.querySelector('[data-range="7"]')?.getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(document.body.querySelector('[data-view="daily"]')?.getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(document.body.querySelectorAll('.bh-profile-bar-chart')).toHaveLength(1);
      expect(document.body.querySelector('.bh-usage-axis-labels')?.textContent).toBe(
        '2026-09-242026-09-30',
      );
      expect(document.body.textContent).toContain('Selected period: 525 tokens');
      expect(document.body.querySelector('select')).toBeNull();
      expect(document.body.querySelector('details')).toBeNull();
      expect(document.body.textContent).not.toContain('Orchestrator');
      expect(document.body.textContent).not.toContain('provider-a');
      expect(document.body.querySelector('.bh-usage-cache')).toBeNull();

      await showView(container, 'model');
      expect(document.body.textContent).toContain('Selected period: 525 tokens');
      const labels = [...document.body.querySelectorAll('.bh-usage-model-label')].map(
        (row) => row.textContent,
      );
      expect(labels).toEqual(['shared-name505 tokens', 'other-model20 tokens']);

      await choose(container, 'all');
      expect(document.body.textContent).toContain('Selected period: 1,025 tokens');
      await choose(container, '30');
      expect(document.body.textContent).toContain('Selected period: 1,025 tokens');
      await choose(container, '7');
      await showView(container, 'daily');
      expect(document.body.textContent).toContain('Selected period: 525 tokens');

      await choose(container, 'custom');
      expect(
        container
          .querySelector('button[aria-label="More time ranges"]')
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
      await setDate(container, 0, '2026-09-29');
      await setDate(container, 1, '2026-09-29');
      expect(document.body.textContent).toContain('Selected period: 200 tokens');
      await setDate(container, 0, '2026-09-28');
      await setDate(container, 1, '2026-09-28');
      expect(document.body.textContent).toContain('No model calls recorded in this period');
      expect(document.body.querySelectorAll('.bh-profile-bar-chart')).toHaveLength(0);
      await setDate(container, 0, '2026-09-30');
      expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
        'Choose valid start and end dates',
      );
    } finally {
      await cleanup();
    }
  });
  it('keeps an independently known total when buckets are missing, and makes missing totals unknown', async () => {
    const { container, cleanup } = await renderUsage([
      { ...base, inputTokens: null, cacheReadTokens: null },
    ]);
    try {
      expect(document.body.textContent).toContain('Selected period: 155 tokens');
      expect(document.body.querySelector('.bh-usage-legend')?.textContent).toContain(
        'Total (breakdown unavailable)',
      );
    } finally {
      await cleanup();
    }
    const missing = await renderUsage([
      {
        ...base,
        totalTokens: null,
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
      },
    ]);
    try {
      expect(document.body.textContent).toContain('Selected period: Unknown tokens');
      expect(document.body.querySelector('.bh-profile-empty')).toBeNull();
      await showView(missing.container, 'model');
      expect(document.body.querySelector('.bh-usage-model-labels')?.textContent).not.toContain(
        '0 tokens',
      );
    } finally {
      await missing.cleanup();
    }
  });
  it('shows cache-write-inclusive input and independent output percentages in hover details', () => {
    expect(tooltipMeasures(base)).toEqual(['115', '10 · 8.7%', '40 · 25.8%']);
    expect(tooltipMeasures({ ...base, inputTokens: null })).toEqual([
      'Unknown',
      '10 · Unknown',
      '40 · 25.8%',
    ]);
    expect(
      tooltipMeasures({
        ...base,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 10,
        totalTokens: 10,
      }),
    ).toEqual(['0', '0 · Unknown', '10 · 100%']);
  });
  it('distinguishes unavailable usage from an empty ready range', async () => {
    const { container, cleanup } = await renderUsage([], 'unavailable');
    try {
      expect(document.body.textContent).toContain('Model usage is temporarily unavailable');
      expect(document.body.querySelector<HTMLButtonElement>('[data-range="7"]')?.disabled).toBe(
        true,
      );
      expect(document.body.querySelector('.bh-profile-card-total')).toBeNull();
    } finally {
      await cleanup();
    }
  });
});

function packet(filter: UsageFilter, rows: ProfileModelUsageRow[] = [base]): UsageQueryResult {
  const selected = rows.filter(
    (row) =>
      row.day >= filter.start &&
      row.day <= filter.end &&
      (!filter.model || row.model === filter.model) &&
      (!filter.provider || row.provider === filter.provider) &&
      (!filter.purpose || row.purpose === filter.purpose),
  );
  return {
    filter,
    rows: selected,
    periodTotal: selected.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
    allTimeTotal: 999,
    periodRecords: selected.length,
    allTimeRecords: 9,
    models: ['shared-name', 'unused'],
    providers: ['provider-a'],
    facetsTruncated: false,
    truncated: false,
    freshness: 'ready',
    readAt: '2026-09-30T12:00:00Z',
    reconciledAt: '2026-09-30T11:00:00Z',
    legacyBaseline: false,
  };
}
describe('Profile usage public-query interaction', () => {
  it('loads seven days, changes range through Host and shows all-time beside the period', async () => {
    const load = vi.fn(async (filter: UsageFilter) => packet(filter));
    const { container, cleanup } = await renderUsage([], 'unavailable', load);
    try {
      expect(load).toHaveBeenLastCalledWith({ start: '2026-09-24', end: '2026-09-30' });
      expect(document.body.textContent).toContain('All time: 999 tokens');
      expect(document.body.textContent).toContain('Selected period: 155 tokens');
      await choose(container, 'all');
      expect(load).toHaveBeenLastCalledWith({ start: '2026-04-02', end: '2026-09-30' });
      await choose(container, '90');
      expect(load.mock.calls.at(-1)?.[0]).toEqual({ start: '2026-07-03', end: '2026-09-30' });
      expect(document.body.textContent).toContain('999 tokens');
    } finally {
      await cleanup();
    }
  });
  it('marks a failed same-filter refresh stale, but never shows old counts under a failed new filter', async () => {
    let failing = false;
    const load = async (filter: UsageFilter) => {
      if (failing) throw new Error('offline');
      return packet(filter);
    };
    const { container, cleanup } = await renderUsage([], 'unavailable', load);
    try {
      failing = true;
      await act(async () =>
        [...document.body.querySelectorAll<HTMLButtonElement>('button')]
          .find((button) => button.getAttribute('aria-label') === 'Refresh')!
          .click(),
      );
      expect(document.body.textContent).toContain('Refresh failed; showing the last result');
      expect(document.body.textContent).toContain('Selected period: 155 tokens');
      await choose(container, '30');
      expect(document.body.textContent).toContain('Usage query failed');
      expect(document.body.textContent).not.toContain('155 tokens');
      expect(document.body.textContent).not.toContain('999 tokens');
    } finally {
      await cleanup();
    }
  });
  it('ignores late responses from a previous filter', async () => {
    let resolveInitial: (value: UsageQueryResult) => void = () => {};
    const initial = { start: '2026-09-24', end: '2026-09-30' };
    const load = (filter: UsageFilter) =>
      filter.start === '2026-09-01'
        ? Promise.resolve(packet(filter))
        : new Promise<UsageQueryResult>((resolve) => {
            resolveInitial = resolve;
          });
    const { container, cleanup } = await renderUsage([base], 'ready', load);
    try {
      expect(container.getAttribute('aria-busy')).toBeNull();
      await choose(container, '30');
      await act(async () =>
        resolveInitial({ ...packet(initial), periodTotal: 10000, allTimeTotal: 10000 }),
      );
      expect(document.body.textContent).toContain('Selected period: 155 tokens');
      expect(document.body.textContent).not.toContain('10,000');
    } finally {
      await cleanup();
    }
  });
});

it('keeps a successful result until manual refresh or filter change, without polling', async () => {
  vi.useFakeTimers();
  const load = vi.fn(async (filter: UsageFilter) => packet(filter));
  const { container, cleanup } = await renderUsage([], 'unavailable', load);
  try {
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(load).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Selected period: 155 tokens');
    expect(document.body.textContent).not.toContain('Refresh failed');
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('button[aria-label="Refresh"]')!.click(),
    );
    expect(load).toHaveBeenCalledTimes(2);
    await choose(container, '30');
    expect(load).toHaveBeenCalledTimes(3);
  } finally {
    await cleanup();
    vi.useRealTimers();
  }
});
