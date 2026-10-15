// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, SvgXml: () => null }));

import type { OverviewMemory, OverviewUsage, UsagePeriod } from '../src/host/usage';
import { MethodRefused } from '../src/host/client';
import { dayLabel, trailingDays } from '../src/host/usage-days';
import { SettingsView, type SettingsActions } from '../src/ui/settings-view';
import { daysLabel, tokenAmount } from '../src/ui/shell/usage-card';
import { t } from '../src/ui/strings';
import { UsageView, type UsageSources } from '../src/ui/usage-view';
import usageWire from './fixtures/usage-wire.json';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const active = usageWire.rpc.active;
const week = () => structuredClone(active.overviewUsage.week) as OverviewUsage;
const today = () => structuredClone(active.overviewUsage.today) as OverviewUsage;
const memory = () => structuredClone(active.overviewMemory) as OverviewMemory;

function longer(period: 'month' | 'quarter'): OverviewUsage {
  const value = week();
  value.period = period;
  value.days = trailingDays(value.end, period === 'month' ? 28 : 84).map((day) => ({
    ...value.days[0]!,
    day,
    totalTokens: 100,
  }));
  value.start = value.days[0]!.day;
  value.totals.totalTokens = value.days.length * 100;
  return value;
}

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

const button = (view: HTMLElement, label: string) =>
  view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

function actions(overrides: Partial<SettingsActions> = {}): SettingsActions {
  return {
    onClose: vi.fn(),
    onUsage: vi.fn(),
    onOpenFullClient: vi.fn(),
    onComputers: vi.fn(),
    onAppIcon: vi.fn(),
    onNotifications: vi.fn(),
    onUnpair: vi.fn(async () => undefined),
    onCopyVersion: vi.fn(),
    ...overrides,
  };
}

describe('Usage card in Settings', () => {
  it("shows the Host's 7-day total over a bar per day, and opens the Usage screen", async () => {
    const handlers = actions();
    const load = vi.fn(async () => week());
    const view = await render(
      <SettingsView
        hostName="studio"
        version="0.0.1"
        connection={{ status: 'connected', route: '' }}
        loadUsage={load}
        actions={handlers}
      />,
    );
    const amount = tokenAmount(active.overviewUsage.week.totals.totalTokens);
    const card = button(view, t.usageCard(amount));
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain(amount);
    const days = active.overviewUsage.week.days.map((row) => ({
      day: row.day,
      tokens: row.totalTokens,
    }));
    expect(card!.querySelector(`[aria-label="${daysLabel(days)}"]`)).not.toBeNull();
    expect(days).toHaveLength(7);
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => card!.click());
    expect(handlers.onUsage).toHaveBeenCalledTimes(1);
  });

  it('shows an idle Host as an empty week, not an error', async () => {
    const view = await render(
      <SettingsView
        hostName="studio"
        version="0.0.1"
        connection={{ status: 'connected', route: '' }}
        loadUsage={async () =>
          structuredClone(usageWire.rpc.idle.overviewUsage.week) as OverviewUsage
        }
        actions={actions()}
      />,
    );
    expect(button(view, t.usageCard('0'))).not.toBeNull();
    expect(view.textContent).not.toContain(t.usageFailed);
  });

  it('marks a week the Host could only partly count with +', async () => {
    const week = structuredClone(usageWire.rpc.active.overviewUsage.week) as OverviewUsage;
    week.totals.partial = true;
    const view = await render(
      <SettingsView
        hostName="studio"
        version="0.0.1"
        connection={{ status: 'connected', route: '' }}
        loadUsage={async () => week}
        actions={actions()}
      />,
    );
    const amount = tokenAmount(week.totals.totalTokens, true);
    expect(amount).toMatch(/\+$/u);
    expect([...view.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toContain(
      t.usageCard(amount),
    );
  });

  it('offers Try again when the Host cannot answer, and reads again', async () => {
    const load = vi
      .fn<() => Promise<OverviewUsage>>()
      .mockRejectedValueOnce(new Error('Usage statistics unavailable'))
      .mockResolvedValueOnce(week());
    const view = await render(
      <SettingsView
        hostName="studio"
        version="0.0.1"
        connection={{ status: 'connected', route: '' }}
        loadUsage={load}
        actions={actions()}
      />,
    );
    expect(view.textContent).toContain(`${t.usageFailed} Usage statistics unavailable`);
    await act(async () => button(view, t.tryAgain)!.click());
    await act(async () => undefined);
    expect(load).toHaveBeenCalledTimes(2);
    expect(view.textContent).not.toContain(t.usageFailed);
  });
});

describe('Usage screen', () => {
  function sources(overrides: Partial<UsageSources> = {}): UsageSources {
    return {
      loadUsage: vi.fn(async (period: UsagePeriod) =>
        period === 'week' ? week() : period === 'today' ? today() : longer(period),
      ),
      loadMoreUsage: vi.fn(async (current: OverviewUsage) => current),
      loadMemory: vi.fn(async () => memory()),
      loadMoreMemory: vi.fn(async (current: OverviewMemory) => current),
      ...overrides,
    };
  }

  it('splits the week by kind and by Bot, and lists Memory changes', async () => {
    const onOpenBot = vi.fn();
    const view = await render(<UsageView sources={sources()} roster={[]} onOpenBot={onOpenBot} />);
    const totals = active.overviewUsage.week.totals;
    expect(view.textContent).toContain(tokenAmount(totals.totalTokens));
    for (const kind of [
      'inputTokens',
      'outputTokens',
      'cacheReadTokens',
      'cacheWriteTokens',
    ] as const)
      expect(view.textContent).toContain(t.usageKind[kind]);
    const mika = active.overviewUsage.week.bots.find((bot) => bot.displayName === 'Mika')!;
    const row = [...view.querySelectorAll('button')].find((node) =>
      node.getAttribute('aria-label')?.startsWith('Mika'),
    );
    expect(row).toBeDefined();
    await act(async () => row!.click());
    expect(onOpenBot).toHaveBeenCalledWith(mika.slug);
    for (const bot of active.overviewMemory.bots)
      if (bot.state === 'ready') expect(view.textContent).toContain(t.memoryChanges(bot.total));
  });

  it('reads Today when the switch moves, and back', async () => {
    const source = sources();
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    expect(source.loadUsage).toHaveBeenCalledWith('week');
    await act(async () => button(view, t.usageToday)!.click());
    await act(async () => undefined);
    expect(source.loadUsage).toHaveBeenLastCalledWith('today');
    expect(view.textContent).toContain(tokenAmount(active.overviewUsage.today.totals.totalTokens));
    expect(button(view, t.usageToday)!.getAttribute('aria-selected')).toBe('true');
    await act(async () => button(view, t.usagePeriodWeek)!.click());
    expect(source.loadUsage).toHaveBeenLastCalledWith('week');
    expect(source.loadUsage).toHaveBeenCalledTimes(4);
    expect(source.loadMemory).toHaveBeenCalledTimes(1);
  });

  it('keeps Today when a Show more page for the week arrives late', async () => {
    const first = week();
    first.bots = first.bots.slice(0, 1);
    first.nextCursor = first.bots[0]!.slug;
    let late: (value: OverviewUsage) => void = () => undefined;
    const source = sources({
      loadUsage: vi.fn(async (period) => (period === 'week' ? first : today())),
      loadMoreUsage: vi.fn(() => new Promise<OverviewUsage>((done) => (late = done))),
    });
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    await act(async () => button(view, t.usageMore)!.click());
    await act(async () => button(view, t.usageToday)!.click());
    await act(async () => late(week()));
    expect(view.textContent).toContain(tokenAmount(active.overviewUsage.today.totals.totalTokens));
    expect(view.textContent).not.toContain(t.usageLoading);
  });

  it('loads more Bots from the cursor', async () => {
    const first = week();
    first.bots = first.bots.slice(0, 1);
    first.nextCursor = first.bots[0]!.slug;
    const source = sources({
      loadUsage: vi.fn(async () => first),
      loadMoreUsage: vi.fn(async () => week()),
    });
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    await act(async () => button(view, t.usageMore)!.click());
    await act(async () => undefined);
    expect(source.loadMoreUsage).toHaveBeenCalledWith(first);
    expect(button(view, t.usageMore)).toBeNull();
    expect(view.textContent).toContain('Juno');
    expect(view.textContent).toContain('Mika');
  });

  it('shows the tapped day in the headline, and the week again on a second tap', async () => {
    const source = sources();
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    const days = active.overviewUsage.week.days;
    const busy = days.findIndex((row) => (row.totalTokens ?? 0) > 0);
    const quiet = days.findIndex((row) => row.totalTokens === 0);
    const bar = (index: number) =>
      view.querySelector<HTMLButtonElement>(`[data-testid="day-bar-${days[index]!.day}"]`)!;
    const headline = () => view.querySelector('[role="header"]')!.textContent;
    const total = tokenAmount(active.overviewUsage.week.totals.totalTokens);
    expect(headline()).toContain(total);

    await act(async () => bar(quiet).click());
    expect(headline()).toBe(`0${t.usageUnit}`);
    expect(view.textContent).toContain(dayLabel(days[quiet]!.day));

    await act(async () => bar(busy).click());
    expect(headline()).toBe(`${tokenAmount(days[busy]!.totalTokens)}${t.usageUnit}`);

    await act(async () => bar(busy).click());
    expect(headline()).toContain(total);
    expect(view.textContent).not.toContain(dayLabel(days[quiet]!.day));
  });

  it('forgets the picked day when the period changes', async () => {
    const view = await render(<UsageView sources={sources()} roster={[]} onOpenBot={vi.fn()} />);
    const first = active.overviewUsage.week.days[0]!.day;
    await act(async () =>
      view.querySelector<HTMLButtonElement>(`[data-testid="day-bar-${first}"]`)!.click(),
    );
    await act(async () => button(view, t.usageToday)!.click());
    await act(async () => button(view, t.usagePeriodWeek)!.click());
    expect(view.querySelector('[role="header"]')!.textContent).toContain(
      tokenAmount(active.overviewUsage.week.totals.totalTokens),
    );
  });

  it('refetches 4 weeks as 28 daily bars and 12 weeks as 12 selectable weekly bars', async () => {
    const source = sources();
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    await act(async () => button(view, t.usageMonth)!.click());
    expect(source.loadUsage).toHaveBeenLastCalledWith('month');
    expect(view.querySelectorAll('[data-testid^="day-bar-"]')).toHaveLength(28);
    expect(view.textContent).toContain(`${longer('month').start} – ${longer('month').end}`);
    await act(async () => button(view, t.usageQuarter)!.click());
    expect(source.loadUsage).toHaveBeenLastCalledWith('quarter');
    expect(view.querySelectorAll('[data-testid^="day-bar-"]')).toHaveLength(12);
    expect(view.querySelector('[role="header"]')!.textContent).toContain(tokenAmount(8400));
    const days = longer('quarter').days;
    await act(async () =>
      view.querySelector<HTMLButtonElement>(`[data-testid="day-bar-${days[0]!.day}"]`)!.click(),
    );
    expect(view.querySelector('[role="header"]')!.textContent).toContain(tokenAmount(700));
    expect(view.textContent).toContain(`${dayLabel(days[0]!.day)} – ${dayLabel(days[6]!.day)}`);
  });

  it('keeps only Today and 7 days on a legacy Host without exposing its refusal', async () => {
    const source = sources({
      loadUsage: vi.fn(async (period: UsagePeriod) => {
        if (period === 'month' || period === 'quarter')
          throw new MethodRefused('invalid-input', 'Unsupported period');
        return period === 'week' ? week() : today();
      }),
    });
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    expect(view.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(button(view, t.usageMonth)).toBeNull();
    expect(button(view, t.usageQuarter)).toBeNull();
    expect(view.textContent).not.toContain('Unsupported period');
    expect(view.textContent).not.toContain(t.usageFailed);
    await act(async () => button(view, t.usageToday)!.click());
    expect(source.loadUsage).toHaveBeenLastCalledWith('today');
  });

  it('falls back to the week if a longer period is refused after capability detection', async () => {
    const source = sources({
      loadUsage: vi.fn(async (period: UsagePeriod) => {
        if (period === 'quarter') throw new MethodRefused('invalid-input', 'Unsupported period');
        return period === 'month' ? longer(period) : period === 'week' ? week() : today();
      }),
    });
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    await act(async () => button(view, t.usageQuarter)!.click());
    expect(button(view, t.usageMonth)).toBeNull();
    expect(button(view, t.usagePeriodWeek)!.getAttribute('aria-selected')).toBe('true');
    expect(view.textContent).not.toContain('Unsupported period');
    expect(view.textContent).not.toContain(t.usageFailed);
  });

  it('keeps real longer-period errors visible instead of treating them as incompatibility', async () => {
    const source = sources();
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    vi.mocked(source.loadUsage).mockRejectedValueOnce(new Error('Network unavailable'));
    await act(async () => button(view, t.usageMonth)!.click());
    expect(view.textContent).toContain('Network unavailable');
    expect(button(view, t.usageQuarter)).not.toBeNull();
  });

  it('preserves longer-period notes and passes its cursor through Show more', async () => {
    const quarter = longer('quarter');
    quarter.freshness = 'degraded';
    quarter.totals.partial = true;
    quarter.nextCursor = quarter.bots[0]!.slug;
    quarter.bots = quarter.bots.slice(0, 1);
    const source = sources({
      loadUsage: vi.fn(async (period: UsagePeriod) =>
        period === 'quarter' ? quarter : period === 'month' ? longer(period) : week(),
      ),
      loadMoreUsage: vi.fn(async () => longer('quarter')),
    });
    const view = await render(<UsageView sources={source} roster={[]} onOpenBot={vi.fn()} />);
    await act(async () => button(view, t.usageQuarter)!.click());
    expect(view.textContent).toContain(t.usageDegraded);
    expect(view.textContent).toContain(t.usagePartial);
    await act(async () => button(view, t.usageMore)!.click());
    expect(source.loadMoreUsage).toHaveBeenCalledWith(quarter);
    expect(button(view, t.usageMore)).toBeNull();
    expect(view.querySelectorAll('[data-testid^="day-bar-"]')).toHaveLength(12);
  });

  it('does not expose capabilities from a previous Host after sources change', async () => {
    let resolveProbe!: (value: OverviewUsage) => void;
    const first = sources({
      loadUsage: vi.fn((period: UsagePeriod) =>
        period === 'month'
          ? new Promise<OverviewUsage>((resolve) => {
              resolveProbe = resolve;
            })
          : Promise.resolve(week()),
      ),
    });
    const view = await render(<UsageView sources={first} roster={[]} onOpenBot={vi.fn()} />);
    const legacy = sources({
      loadUsage: vi.fn(async (period: UsagePeriod) => {
        if (period === 'month') throw new MethodRefused('invalid-input', 'Unsupported period');
        return week();
      }),
    });
    await act(async () =>
      root!.render(<UsageView sources={legacy} roster={[]} onOpenBot={vi.fn()} />),
    );
    await act(async () => resolveProbe(longer('month')));
    expect(button(view, t.usageMonth)).toBeNull();
    expect(view.textContent).not.toContain(t.usageFailed);
  });
});
