import { useMemo, useRef, useState, type ReactElement } from 'react';

import { useMountedResource } from './mounted-resource.js';

import { barY, defineChart, stack } from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/charts/react/tooltip';

import type {
  ProfileActivity,
  ProfileActivityDay,
  ProfileActivityReasonDay,
  ProfileActivityTokensDay,
} from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ProfileCardDescriptor, ProfileCardViewProps } from './profile-cards.js';
import { ModelUsageBreakdown } from './model-usage-breakdown.js';
import { profileTokenSummaryText } from './profile-token-summary.js';
import { useProfileChartTokens } from './profile-chart-theme.js';

export const PROFILE_ACTIVITY_WEEKS = 26;

const HEAT_LEVEL_THRESHOLDS = [1, 3, 6, 11] as const;
const TOKEN_SERIES_STORAGE_DAYS = 14;

function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function anchorDate(todayKey: string | undefined): Date {
  if (todayKey !== undefined && /^\d{4}-\d{2}-\d{2}$/u.test(todayKey)) {
    const [year, month, day] = todayKey.split('-').map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  }
  return new Date();
}

export function trailingProfileDays(todayKey: string | undefined, count: number): string[] {
  const today = anchorDate(todayKey);
  const days: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    days.push(localDayKey(date));
  }
  return days;
}

function shiftDay(day: string, amount: number): string {
  const date = anchorDate(day);
  date.setDate(date.getDate() + amount);
  return localDayKey(date);
}

function weekStart(day: string): string {
  const date = anchorDate(day);
  return shiftDay(day, -((date.getDay() + 6) % 7));
}

function heatDays(newestWeek: string, weeks: number): string[] {
  const start = shiftDay(newestWeek, -(weeks - 1) * 7);
  return Array.from({ length: weeks * 7 }, (_, index) => shiftDay(start, index));
}

function weeksBetween(fromWeek: string, toWeek: string): number {
  return Math.round((anchorDate(toWeek).getTime() - anchorDate(fromWeek).getTime()) / 604_800_000);
}

function heatLevel(count: number): number {
  let level = 0;
  for (const threshold of HEAT_LEVEL_THRESHOLDS) {
    if (count >= threshold) level += 1;
  }
  return level;
}

export function countByDay(days: readonly ProfileActivityDay[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of days) {
    counts.set(entry.day, (counts.get(entry.day) ?? 0) + entry.count);
  }
  return counts;
}

function sumCounts(days: readonly ProfileActivityDay[]): number {
  return days.reduce((total, entry) => total + entry.count, 0);
}

export interface HeatmapPage {
  counts: ReadonlyMap<string, number>;
  details?: ReadonlyMap<string, readonly string[]>;
}

const HEAT_GAP = 2;

export function ProfileHeatmap({
  counts,
  details,
  label,
  today,
  firstDay,
  compact = false,
  loadOlder,
  t,
}: {
  counts: ReadonlyMap<string, number>;
  details?: ReadonlyMap<string, readonly string[]> | undefined;
  label: string;
  today: string | undefined;
  firstDay?: string | undefined;
  compact?: boolean | undefined;
  loadOlder?: ((before: string, weeks: number) => Promise<HeatmapPage>) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const todayKey = localDayKey(anchorDate(today));
  const newestWeek = weekStart(todayKey);
  const cell = compact ? 8 : 10;
  const [columns, setColumns] = useState(PROFILE_ACTIVITY_WEEKS);
  const [older, setOlder] = useState<{ from: string; pages: HeatmapPage[] }>({
    from: shiftDay(newestWeek, -(PROFILE_ACTIVITY_WEEKS - 1) * 7),
    pages: [],
  });
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState<
    { day: string; count: number; left: number; ratio: number } | undefined
  >(undefined);
  const scroller = useRef<HTMLDivElement | null>(null);
  const keepRight = useRef<number | undefined>(undefined);
  const creationWeek = firstDay === undefined ? undefined : weekStart(firstDay);
  const reachedStart = creationWeek !== undefined && older.from <= creationWeek;
  const loadedWeeks = weeksBetween(older.from, newestWeek) + 1;
  const lifetimeWeeks =
    creationWeek === undefined
      ? undefined
      : Math.max(1, weeksBetween(creationWeek, newestWeek) + 1);
  const weeks = compact
    ? Math.max(1, Math.min(columns, loadedWeeks))
    : loadOlder === undefined
      ? Math.min(columns, loadedWeeks)
      : Math.max(columns, Math.min(loadedWeeks, lifetimeWeeks ?? loadedWeeks));
  const days = heatDays(newestWeek, weeks);
  const allCounts = new Map(counts);
  const allDetails = new Map(details ?? []);
  for (const page of older.pages) {
    for (const [day, value] of page.counts) allCounts.set(day, value);
    for (const [day, value] of page.details ?? []) allDetails.set(day, value);
  }
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);

  const loadMore = (): void => {
    if (loadOlder === undefined || loading || reachedStart) return;
    const before = older.from;
    const pageWeeks = Math.max(columns, 8);
    setLoading(true);
    void loadOlder(before, pageWeeks).then(
      (page) => {
        keepRight.current =
          scroller.current === null
            ? undefined
            : scroller.current.scrollWidth - scroller.current.scrollLeft;
        setOlder((current) =>
          current.from === before
            ? { from: shiftDay(before, -pageWeeks * 7), pages: [...current.pages, page] }
            : current,
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  };

  const measure = useMountedResource<HTMLDivElement>(
    (node) => {
      scroller.current = node;
      const fit = (): void => {
        const width = node.clientWidth;
        if (width > 0) setColumns(Math.max(1, Math.floor((width + HEAT_GAP) / (cell + HEAT_GAP))));
      };
      fit();
      node.scrollLeft = node.scrollWidth;
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(fit);
      observer.observe(node);
      return () => {
        observer.disconnect();
        scroller.current = null;
      };
    },
    [cell],
  );
  const restoreScroll = useMountedResource<HTMLDivElement>(
    (grid) => {
      const node = scroller.current;
      if (node === null) return;
      if (keepRight.current !== undefined) node.scrollLeft = node.scrollWidth - keepRight.current;
      else node.scrollLeft = node.scrollWidth;
      keepRight.current = undefined;
      if (
        !compact &&
        loadOlder !== undefined &&
        !reachedStart &&
        (weeks > loadedWeeks || grid.scrollWidth <= node.clientWidth)
      )
        loadMore();
    },
    [weeks, older.from],
  );

  const show = (target: HTMLElement, day: string, count: number): void => {
    const box = target.closest('.bh-profile-heat')?.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const left = box === undefined ? 0 : rect.left + rect.width / 2 - box.left;
    const ratio = box === undefined || box.width === 0 ? 0.5 : left / box.width;
    setHovered({ day, count, left, ratio: Math.min(1, Math.max(0, ratio)) });
  };
  const tipLines = hovered === undefined ? [] : (allDetails.get(hovered.day) ?? []);
  return (
    <div className="bh-profile-heat" data-compact={compact ? 'true' : undefined}>
      <div
        ref={measure}
        className="bh-profile-heat-scroll"
        onScroll={(event) => {
          if (event.currentTarget.scrollLeft < (cell + HEAT_GAP) * 2) loadMore();
        }}
      >
        <div
          ref={restoreScroll}
          className="bh-profile-heat-grid"
          role="group"
          aria-label={t('profile.heat.aria', { label })}
          aria-busy={loading}
        >
          {days.map((day) => {
            if (day > todayKey || (firstDay !== undefined && day < firstDay)) {
              return (
                <span
                  key={day}
                  className="bh-profile-heat-cell"
                  data-level={day > todayKey ? 'future' : 'before'}
                  aria-hidden="true"
                />
              );
            }
            const count = allCounts.get(day) ?? 0;
            return (
              <button
                key={day}
                type="button"
                className="bh-profile-heat-cell"
                data-day={day}
                data-level={heatLevel(count)}
                aria-label={`${day} · ${t('profile.heat.tip', { count })}`}
                onMouseEnter={(event) => show(event.currentTarget, day, count)}
                onMouseLeave={() => setHovered(undefined)}
                onFocus={(event) => show(event.currentTarget, day, count)}
                onBlur={() => setHovered(undefined)}
              />
            );
          })}
        </div>
      </div>
      {hovered === undefined ? null : (
        <div
          className="bh-profile-heat-tip"
          role="tooltip"
          style={{
            left: `${hovered.left}px`,
            transform: `translateX(-${Math.round(hovered.ratio * 100)}%)`,
          }}
        >
          <span className="bh-profile-tip-head">
            <span className="bh-profile-tip-day">{hovered.day}</span>
            <span className="bh-profile-tip-value">
              {t('profile.heat.tip', { count: hovered.count })}
            </span>
          </span>
          {tipLines.map((line) => (
            <span key={line} className="bh-profile-tip-line">
              {line}
            </span>
          ))}
        </div>
      )}
      {total === 0 && older.pages.length === 0 ? (
        <div className="bh-profile-empty">{t('profile.empty')}</div>
      ) : null}
    </div>
  );
}

function reasonLabel(reason: string, t: BotHarnessTranslate): string {
  switch (reason) {
    case 'human-dm':
      return t('profile.reason.humanDm');
    case 'group-mention':
      return t('profile.reason.groupMention');
    case 'group-ordinary':
      return t('profile.reason.groupOrdinary');
    case 'bot-dm':
      return t('profile.reason.botDm');
    case 'group-invite':
      return t('profile.reason.groupInvite');
    case 'group-join-request':
    case 'group-join-decision':
      return t('profile.reason.groupJoin');
    case 'assignment-report':
      return t('profile.reason.assignmentReport');
    default:
      return reason;
  }
}

function reasonDetails(
  events: readonly ProfileActivityReasonDay[],
  t: BotHarnessTranslate,
): Map<string, string[]> {
  const byDay = new Map<string, Array<{ reason: string; count: number }>>();
  for (const entry of events) {
    const list = byDay.get(entry.day) ?? [];
    list.push({ reason: entry.reason, count: entry.count });
    byDay.set(entry.day, list);
  }
  return new Map(
    [...byDay].map(([day, list]) => [
      day,
      list
        .sort((left, right) => right.count - left.count)
        .map((entry) => `${reasonLabel(entry.reason, t)} · ${entry.count}`),
    ]),
  );
}

function olderPage(
  loadActivity: ProfileCardViewProps['loadActivity'],
  pick: (activity: ProfileActivity) => HeatmapPage,
): ((before: string, weeks: number) => Promise<HeatmapPage>) | undefined {
  return loadActivity === undefined
    ? undefined
    : (before, weeks) => loadActivity({ before, weeks }).then(pick);
}

function EventActivityCard({
  activity,
  compact,
  loadActivity,
  t,
}: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const events = activity?.events ?? [];
  const weeks = activity?.weeks ?? PROFILE_ACTIVITY_WEEKS;
  return (
    <div className="bh-profile-card-body">
      <div className="bh-profile-card-total">{totalText(sumCounts(events), weeks, t)}</div>
      <ProfileHeatmap
        counts={countByDay(events)}
        details={reasonDetails(events, t)}
        label={t('profile.card.events')}
        today={activity?.today}
        firstDay={activity?.createdDay}
        compact={compact}
        loadOlder={olderPage(loadActivity, (page) => ({
          counts: countByDay(page.events),
          details: reasonDetails(page.events, t),
        }))}
        t={t}
      />
    </div>
  );
}

function MemoryActivityCard({
  activity,
  compact,
  loadActivity,
  t,
}: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const commits = activity?.memoryCommits ?? [];
  const weeks = activity?.weeks ?? PROFILE_ACTIVITY_WEEKS;
  return (
    <div className="bh-profile-card-body">
      <div className="bh-profile-card-total">{totalText(sumCounts(commits), weeks, t)}</div>
      <ProfileHeatmap
        counts={countByDay(commits)}
        label={t('profile.card.memory')}
        today={activity?.today}
        firstDay={activity?.createdDay}
        compact={compact}
        loadOlder={olderPage(loadActivity, (page) => ({ counts: countByDay(page.memoryCommits) }))}
        t={t}
      />
    </div>
  );
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

type TokenSeries = 'cached' | 'uncached' | 'output';

interface TokenBarRow {
  id: string;
  day: string;
  series: TokenSeries;
  tokens: number;
}

interface TokenDayTotals {
  day: string;
  cached: number;
  uncached: number;
  output: number;
}

function tokenDayTotals(tokens: readonly ProfileActivityTokensDay[]): Map<string, TokenDayTotals> {
  const days = new Map<string, TokenDayTotals>();
  for (const entry of tokens) {
    const totals = days.get(entry.day) ?? {
      day: entry.day,
      cached: 0,
      uncached: 0,
      output: 0,
    };
    totals.cached += entry.cacheReadTokens;
    totals.uncached += entry.inputTokens + entry.cacheWriteTokens;
    totals.output += entry.outputTokens;
    days.set(entry.day, totals);
  }
  return days;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export interface TokenShares {
  read: number;
  output: number;
  cachedPercent: number;
  outputPercent: number;
}

export function tokenShares(totals: {
  cached: number;
  uncached: number;
  output: number;
}): TokenShares {
  const read = totals.cached + totals.uncached;
  return {
    read,
    output: totals.output,
    cachedPercent: percent(totals.cached, read),
    outputPercent: percent(totals.output, read + totals.output),
  };
}

function TokenTip({ totals, t }: { totals: TokenDayTotals; t: BotHarnessTranslate }): ReactElement {
  const shares = tokenShares(totals);
  return (
    <div className="bh-profile-chart-tip">
      <span className="bh-profile-tip-day">{totals.day}</span>
      <ul className="bh-profile-tip-rows">
        <li>
          <span>{t('profile.tokens.cached')}</span>
          <span>{formatTokenCount(totals.cached)}</span>
        </li>
        <li>
          <span>{t('profile.tokens.uncachedInput')}</span>
          <span>{formatTokenCount(totals.uncached)}</span>
        </li>
        <li>
          <span>{t('profile.tokens.output')}</span>
          <span>{formatTokenCount(totals.output)}</span>
        </li>
      </ul>
      <span className="bh-profile-tip-shares">
        {t('profile.tokens.shares', {
          cached: shares.cachedPercent,
          output: shares.outputPercent,
        })}
      </span>
    </div>
  );
}

function TokenUsageCard({
  loadUsage,
  activity,
  t,
  compact,
}: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const tokens = activity?.tokens ?? [];
  const entirelyUnknown = usageIsEntirelyUnknown(activity);
  const weeks = activity?.weeks ?? PROFILE_ACTIVITY_WEEKS;
  const days = useMemo(
    () => trailingProfileDays(activity?.today, TOKEN_SERIES_STORAGE_DAYS),
    [activity?.today],
  );
  const dayTotals = useMemo(() => tokenDayTotals(tokens), [tokens]);
  const windowTotals = useMemo(() => {
    let cached = 0;
    let uncached = 0;
    let output = 0;
    for (const totals of dayTotals.values()) {
      cached += totals.cached;
      uncached += totals.uncached;
      output += totals.output;
    }
    return { cached, uncached, output };
  }, [dayTotals]);
  const shares = tokenShares(windowTotals);
  const rows = useMemo<TokenBarRow[]>(
    () =>
      days.flatMap((day) => {
        const totals = dayTotals.get(day);
        return [
          { id: `${day}-cached`, day, series: 'cached' as const, tokens: totals?.cached ?? 0 },
          {
            id: `${day}-uncached`,
            day,
            series: 'uncached' as const,
            tokens: totals?.uncached ?? 0,
          },
          { id: `${day}-output`, day, series: 'output' as const, tokens: totals?.output ?? 0 },
        ];
      }),
    [dayTotals, days],
  );
  const colors = useProfileChartTokens();
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY<TokenBarRow>(rows, {
            x: 'day',
            y: 'tokens',
            z: 'series',
            color: 'series',
            layout: stack(),
            radius: 2,
            maxThickness: 10,
          }),
        ],
        scales: {
          x: { scale: () => scalePoint<string>().padding(0.4) },
          y: { scale: scaleLinear, nice: true },
        },
        guides: false,
        theme: {
          foreground: colors.foreground,
          muted: colors.muted,
          grid: colors.grid,
          background: 'transparent',
          palette: [colors.cached, colors.uncached, colors.output],
        },
        tooltip,
      }),
    [colors, rows],
  );
  const total = windowTotals.cached + windowTotals.uncached + windowTotals.output;
  if (!compact)
    return (
      <ModelUsageBreakdown
        {...(loadUsage === undefined ? {} : { loadUsage })}
        rows={activity?.modelUsageRows ?? []}
        status={activity?.modelUsageStatus ?? 'unavailable'}
        today={activity?.today ?? localDayKey(new Date())}
        firstDay={trailingProfileDays(activity?.today, weeks * 7)[0]!}
        t={t}
      />
    );
  return (
    <div className="bh-profile-card-body">
      <div className="bh-profile-card-total">
        {t('profile.tokens.window', {
          weeks,
          count: profileTokenSummaryText(activity, t),
        })}
      </div>
      <Chart
        definition={definition}
        ariaLabel={t('profile.tokens.sparkline')}
        height={48}
        className="bh-profile-bar-chart"
        renderTooltipBody={({ points }) => {
          const datum = points[0]?.datum as TokenBarRow | undefined;
          if (datum === undefined) return null;
          const totals = dayTotals.get(datum.day);
          if (totals === undefined) return null;
          return <TokenTip totals={totals} t={t} />;
        }}
      />
      {entirelyUnknown ? null : (
        <div className="bh-profile-token-shares">
          {t('profile.tokens.shares', {
            cached: shares.cachedPercent,
            output: shares.outputPercent,
          })}
        </div>
      )}
      {total === 0 && !activity?.modelUsageRows?.length ? (
        <div className="bh-profile-empty">{t('profile.empty')}</div>
      ) : null}
    </div>
  );
}

function usageIsEntirelyUnknown(activity: ProfileActivity | undefined): boolean {
  const rows = activity?.modelUsageRows ?? [];
  return (
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.inputTokens === null &&
        row.outputTokens === null &&
        row.cacheReadTokens === null &&
        row.cacheWriteTokens === null,
    )
  );
}

function totalText(count: number, weeks: number, t: BotHarnessTranslate): string {
  return t('profile.window.total', { weeks, count });
}

export function createProfileCardBuiltins(
  t: BotHarnessTranslate,
): readonly ProfileCardDescriptor[] {
  return [
    {
      id: 'token-usage',
      help: ({ activity, t }) =>
        activity?.modelUsageRows?.some(
          (row) =>
            row.inputTokens === null ||
            row.outputTokens === null ||
            row.cacheReadTokens === null ||
            row.cacheWriteTokens === null,
        )
          ? t('profile.usage.partial')
          : undefined,
      label: t('profile.card.tokens'),
      order: 5,
      render: (props) => <TokenUsageCard {...props} />,
    },
    {
      id: 'event-activity',
      label: t('profile.card.events'),
      order: 10,
      render: (props) => <EventActivityCard {...props} />,
    },
    {
      id: 'memory-activity',
      label: t('profile.card.memory'),
      order: 20,
      render: (props) => <MemoryActivityCard {...props} />,
    },
  ];
}
