import { Menu } from './appearance-primitives.js';
import { useRef, useState, type ReactElement } from 'react';
import {
  IconEllipsisOutlineRegular,
  IconRefreshOutlineRegular,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { useMountedResource } from './mounted-resource.js';
import type { UsageFilter, UsageQueryResult, ProfileModelUsageRow } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  UsageChart,
  UsageLegend,
  UsageToneLegend,
  type UsageSummary,
} from './model-usage-charts.js';

const bucketKeys = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'totalTokens',
] as const;
function sumBucket(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left + right;
}

function summaries(
  rows: readonly ProfileModelUsageRow[],
  group: (row: ProfileModelUsageRow) => Pick<UsageSummary, 'key' | 'label'>,
): UsageSummary[] {
  const result = new Map<string, UsageSummary>();
  for (const row of rows) {
    const identity = group(row);
    const previous = result.get(identity.key);
    if (previous === undefined)
      result.set(identity.key, {
        ...identity,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        totalTokens: row.totalTokens,
      });
    else for (const key of bucketKeys) previous[key] = sumBucket(previous[key], row[key]);
  }
  return [...result.values()];
}

function offsetDay(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const result = new Date(year!, month! - 1, date!);
  result.setDate(result.getDate() + amount);
  return `${result.getFullYear()}-${`${result.getMonth() + 1}`.padStart(2, '0')}-${`${result.getDate()}`.padStart(2, '0')}`;
}

const RANGES = ['7', '30', '90', 'all'] as const;

export function ModelUsageBreakdown({
  rows: initialRows,
  status: initialStatus,
  loadUsage,
  today,
  firstDay,
  identityColor,
  t,
}: {
  identityColor?: string | undefined;
  loadUsage?: (filter: UsageFilter) => Promise<UsageQueryResult>;
  rows: readonly ProfileModelUsageRow[];
  status: 'ready' | 'unavailable';
  today: string;
  firstDay: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [refresh, setRefresh] = useState(0);
  const [resource, setResource] = useState<{
    key: string;
    result?: UsageQueryResult;
    error?: boolean;
    loading?: boolean;
  }>();
  const request = useRef(0);
  const [preset, setPreset] = useState<(typeof RANGES)[number] | 'custom'>('7');
  const [customStart, setStart] = useState(firstDay);
  const [customEnd, setEnd] = useState(today);
  const [view, setView] = useState<'daily' | 'model'>('daily');
  const [menuOpen, setMenuOpen] = useState(false);
  const start =
    preset === 'custom'
      ? customStart
      : preset === 'all'
        ? firstDay
        : [firstDay, offsetDay(today, 1 - Number(preset))].sort().at(-1)!;
  const end = preset === 'custom' ? customEnd : today;
  const valid =
    /^\d{4}-\d{2}-\d{2}$/u.test(start) &&
    /^\d{4}-\d{2}-\d{2}$/u.test(end) &&
    start >= firstDay &&
    end <= today &&
    start <= end;
  const filter: UsageFilter = { start, end };
  const key = JSON.stringify(filter);
  const mount = useMountedResource<HTMLElement>(() => {
    const generation = ++request.current;
    if (!valid || loadUsage === undefined) return;
    setResource((previous) => ({
      key,
      loading: true,
      ...(previous?.key === key && previous.result ? { result: previous.result } : {}),
    }));
    void loadUsage(filter).then(
      (result) => {
        if (generation === request.current) setResource({ key, result });
      },
      () => {
        if (generation === request.current)
          setResource((previous) => ({
            key,
            error: true,
            ...(previous?.key === key && previous.result ? { result: previous.result } : {}),
          }));
      },
    );
    return () => {
      ++request.current;
    };
  }, [key, valid, loadUsage, refresh]);
  const query = resource?.key === key ? resource.result : undefined;
  const loading =
    loadUsage !== undefined && valid && (resource?.key !== key || resource.loading === true);
  const error = resource?.key === key && resource.error === true;
  const rows = loadUsage === undefined ? initialRows : (query?.rows ?? []);
  const status =
    loadUsage === undefined ? initialStatus : query === undefined ? 'unavailable' : 'ready';
  const disabled = loadUsage === undefined && status !== 'ready';
  const selected = valid ? rows.filter((row) => row.day >= start && row.day <= end) : [];
  const models = summaries(selected, (row) => ({ key: row.model, label: row.model }));
  models.sort(
    (left, right) =>
      (right.totalTokens ?? -1) - (left.totalTokens ?? -1) || left.label.localeCompare(right.label),
  );
  const days = summaries(selected, (row) => ({ key: row.day, label: row.day }));
  const daily = new Map(days.map((row) => [row.key, row]));
  const series: UsageSummary[] = [];
  if (valid)
    for (let day = start; day <= end; day = offsetDay(day, 1))
      series.push(
        daily.get(day) ?? {
          key: day,
          label: day,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0,
        },
      );
  const calculatedTotal = models.reduce<number | null>(
    (sum, row) => sumBucket(sum, row.totalTokens),
    0,
  );
  const total = query === undefined ? calculatedTotal : query.periodTotal;
  const count = (value: number | null) =>
    value === null ? t('profile.usage.unknown') : value.toLocaleString();
  const menuItems: readonly MenuEntry[] = [{ id: 'custom', label: t('profile.usage.customRange') }];
  return (
    <section
      ref={mount}
      aria-busy={loading}
      className="bh-model-usage bh-model-usage-overview"
      aria-label={t('profile.card.tokens')}
    >
      <div className="bh-model-usage-header">
        <div className="bh-usage-grouping" role="group" aria-label={t('profile.usage.view')}>
          {(['daily', 'model'] as const).map((value) => (
            <button
              type="button"
              key={value}
              data-view={value}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {t(value === 'daily' ? 'profile.usage.view.daily' : 'profile.usage.view.model')}
            </button>
          ))}
        </div>
        <div className="bh-usage-range-controls">
          <div className="bh-usage-grouping" role="group" aria-label={t('profile.usage.range')}>
            {RANGES.map((value) => (
              <button
                type="button"
                key={value}
                data-range={value}
                aria-pressed={preset === value}
                disabled={disabled}
                onClick={() => setPreset(value)}
              >
                {value === 'all'
                  ? t('profile.usage.rangeAll')
                  : t('profile.usage.days', { count: value })}
              </button>
            ))}
          </div>
          <Menu
            open={menuOpen}
            portal
            dense
            align="end"
            anchor={
              <button
                type="button"
                className="bh-profile-pin"
                aria-label={t('profile.usage.more')}
                title={t('profile.usage.more')}
                aria-pressed={preset === 'custom'}
                disabled={disabled}
                onClick={() => setMenuOpen((value) => !value)}
              >
                <IconEllipsisOutlineRegular size={16} />
              </button>
            }
            items={menuItems}
            onSelect={(id) => {
              setMenuOpen(false);
              if (id === 'custom') setPreset('custom');
            }}
            onClose={() => setMenuOpen(false)}
          />
          {loadUsage !== undefined ? (
            <button
              type="button"
              className="bh-profile-pin"
              aria-label={t('profile.usage.refresh')}
              title={t('profile.usage.refresh')}
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <IconRefreshOutlineRegular size={16} />
            </button>
          ) : null}
        </div>
      </div>
      {preset === 'custom' ? (
        <div className="bh-model-usage-range">
          <label>
            {t('profile.usage.start')}
            <input
              className="bh-profile-policy-select"
              type="date"
              min={firstDay}
              max={today}
              value={customStart}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            {t('profile.usage.end')}
            <input
              className="bh-profile-policy-select"
              type="date"
              min={firstDay}
              max={today}
              value={customEnd}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      {error && query !== undefined ? (
        <p className="bh-note" role="status">
          {t('profile.usage.stale', { at: new Date(query.readAt).toLocaleString() })}
        </p>
      ) : null}
      {query !== undefined && query.freshness !== 'ready' ? (
        <p className="bh-note" role="status">
          {t(
            query.freshness === 'reconciling'
              ? 'profile.usage.reconciling'
              : 'profile.usage.degraded',
          )}
        </p>
      ) : null}
      {query?.legacyBaseline === true ? (
        <p className="bh-note" role="status">
          {t('profile.usage.legacy')}
        </p>
      ) : null}
      {status === 'unavailable' ? (
        <p className="bh-note" role="status">
          {t(
            error
              ? 'profile.usage.loadFailed'
              : loading
                ? 'profile.usage.loading'
                : 'profile.usage.unavailable',
          )}
        </p>
      ) : !valid ? (
        <p className="bh-note" role="alert">
          {t('profile.usage.invalidRange')}
        </p>
      ) : (
        <>
          <div className="bh-usage-totals">
            <strong className="bh-profile-card-total" aria-live="polite">
              {t('profile.usage.periodTotal', { count: count(total) })}
            </strong>
            <span className="bh-note">
              {start} – {end}
              {query === undefined
                ? ''
                : ` · ${t('profile.usage.allTime', { count: count(query.allTimeTotal) })}`}
            </span>
          </div>
          {query?.truncated === true ? (
            <p className="bh-note" role="status">
              {t('profile.usage.truncated')}
            </p>
          ) : selected.length === 0 ? (
            <p className="bh-profile-empty">{t('profile.usage.periodEmpty')}</p>
          ) : view === 'daily' ? (
            <div className="bh-usage-daily">
              {identityColor === undefined ? (
                <UsageLegend rows={series} t={t} />
              ) : (
                <UsageToneLegend t={t} />
              )}
              <UsageChart
                rows={series}
                kind="daily"
                label={t('profile.usage.daily')}
                identityColor={identityColor}
                t={t}
              />
              <div className="bh-usage-axis-labels">
                <span>{start}</span>
                <span>{end}</span>
              </div>
            </div>
          ) : (
            <div className="bh-usage-models">
              <UsageLegend rows={models} t={t} />
              <div className="bh-usage-model-plot">
                <div className="bh-usage-model-labels">
                  {models.map((row) => (
                    <div className="bh-usage-model-label" key={row.key}>
                      <span title={row.label}>{row.label}</span>
                      <strong>{count(row.totalTokens)} tokens</strong>
                    </div>
                  ))}
                </div>
                <UsageChart rows={models} kind="model" label={t('profile.usage.byModel')} t={t} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
