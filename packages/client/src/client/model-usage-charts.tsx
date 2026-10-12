import { useMemo, useState, type ReactElement } from 'react';

import { barX, barY, defineChart, dot, stack } from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/charts/react/tooltip';

import type { ProfileModelUsageRow } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  botChartTones,
  REFERENCE_SURFACES,
  renderedBackground,
  type ChartTone,
} from './bot-primary-color.js';
import { useProfileChartTokens } from './profile-chart-theme.js';

export type UsageSummary = Omit<ProfileModelUsageRow, 'day' | 'purpose' | 'provider' | 'model'> & {
  key: string;
  label: string;
  identityColor?: string;
};
type UsageSeries = 'cached' | 'uncached' | 'output' | 'unclassified';
type ChartDatum = UsageSummary & { series?: UsageSeries; tokens?: number; ratio?: number };

function inputTotal(row: UsageSummary): number | null {
  return row.inputTokens === null || row.cacheReadTokens === null || row.cacheWriteTokens === null
    ? null
    : row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
}
function ratio(part: number | null, whole: number | null): number | null {
  return part === null || whole === null || whole <= 0 || part < 0 || part > whole
    ? null
    : (part / whole) * 100;
}
function percent(value: number | null, t: BotHarnessTranslate): string {
  return value === null
    ? t('profile.usage.unknown')
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
function count(value: number | null, t: BotHarnessTranslate): string {
  return value === null ? t('profile.usage.unknown') : value.toLocaleString();
}

export function UsageMeasures({
  row,
  t,
}: {
  row: UsageSummary;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <dl className="bh-usage-measures">
      <div>
        <dt>{t('profile.usage.inputTotal')}</dt>
        <dd>{count(inputTotal(row), t)}</dd>
      </div>
      <div className="bh-usage-cached-measure">
        <dt>{t('profile.usage.inputCached')}</dt>
        <dd>
          {count(row.cacheReadTokens, t)} ·{' '}
          {percent(ratio(row.cacheReadTokens, inputTotal(row)), t)}
        </dd>
      </div>
      <div>
        <dt>{t('profile.tokens.output')}</dt>
        <dd>
          {count(row.outputTokens, t)} · {percent(ratio(row.outputTokens, row.totalTokens), t)}
        </dd>
      </div>
    </dl>
  );
}

export function CacheRatio({
  row,
  t,
}: {
  row: UsageSummary;
  t: BotHarnessTranslate;
}): ReactElement {
  return <strong>{percent(ratio(row.cacheReadTokens, inputTotal(row)), t)}</strong>;
}

export function UsageLegend({
  rows,
  t,
}: {
  rows: UsageSummary[];
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div className="bh-usage-legend">
      <span>
        <i data-series="cached" />
        {t('profile.usage.cacheRead')}
      </span>
      <span>
        <i data-series="uncached" />
        {t('profile.usage.otherInput')}
      </span>
      <span>
        <i data-series="output" />
        {t('profile.tokens.output')}
      </span>
      {rows.some(
        (row) =>
          inputTotal(row) === null ||
          row.outputTokens === null ||
          row.totalTokens !== inputTotal(row)! + row.outputTokens,
      ) ? (
        <span>
          <i data-series="unclassified" />
          {t('profile.usage.unclassified')}
        </span>
      ) : null}
    </div>
  );
}

function segments(rows: UsageSummary[]): ChartDatum[] {
  return rows.flatMap<ChartDatum>((row) => {
    const input = inputTotal(row);
    if (input !== null && row.outputTokens !== null && row.totalTokens === input + row.outputTokens)
      return [
        { ...row, series: 'cached' as const, tokens: row.cacheReadTokens! },
        {
          ...row,
          series: 'uncached' as const,
          tokens: row.inputTokens! + row.cacheWriteTokens!,
        },
        { ...row, series: 'output' as const, tokens: row.outputTokens },
      ];
    return [{ ...row, series: 'unclassified' as const, tokens: row.totalTokens ?? 0 }];
  });
}

export function UsageToneLegend({ t }: { t: BotHarnessTranslate }): ReactElement {
  return (
    <div className="bh-usage-legend bh-usage-tone-legend">
      <span>{t('overviewUsage.botTones')}</span>
      <span>
        <i data-tone="cached" />
        {t('profile.usage.cacheRead')}
      </span>
      <span>
        <i data-tone="uncached" />
        {t('profile.usage.otherInput')}
      </span>
      <span>
        <i data-tone="output" />
        {t('profile.tokens.output')}
      </span>
    </div>
  );
}

function chartSurface(host: HTMLElement | null): string {
  return (
    (host === null ? undefined : renderedBackground(host)) ??
    REFERENCE_SURFACES[
      typeof document !== 'undefined' && document.body.hasAttribute('data-ds-dark-theme')
        ? 'dark'
        : 'light'
    ].background
  );
}

export function useIdentityTones(
  source: string | undefined,
  revision: unknown,
): { host: (element: HTMLElement | null) => void; tones: Record<ChartTone, string> | undefined } {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const tones = useMemo(
    () => (source === undefined ? undefined : botChartTones(source, chartSurface(element))),
    [source, element, revision],
  );
  return { host: setElement, tones };
}

export function UsageChart({
  rows,
  kind,
  t,
  label,
  identityColor,
}: {
  identityColor?: string | undefined;
  rows: UsageSummary[];
  kind: 'daily' | 'model' | 'cache';
  t: BotHarnessTranslate;
  label: string;
}): ReactElement {
  const colors = useProfileChartTokens();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const identity =
    (kind === 'model' && rows.some((row) => row.identityColor !== undefined)) ||
    (kind === 'daily' && identityColor !== undefined);
  const tones = useMemo(() => {
    if (!identity) return undefined;
    const surface = chartSurface(host);
    return new Map(
      rows.flatMap((row) => {
        const source = kind === 'daily' ? identityColor : row.identityColor;
        return source === undefined ? [] : [[row.key, botChartTones(source, surface)] as const];
      }),
    );
  }, [identity, host, rows, colors, kind, identityColor]);
  const definition = useMemo(() => {
    const theme = {
      foreground: colors.foreground,
      muted: colors.muted,
      grid: colors.grid,
      background: 'transparent',
    };
    const categories = rows.map((row) => row.key);
    if (kind === 'cache') {
      const points = rows.flatMap<ChartDatum>((row) => {
        const value = ratio(row.cacheReadTokens, inputTotal(row));
        return value === null ? [] : [{ ...row, ratio: value }];
      });
      return defineChart({
        marks: [
          barX<ChartDatum>(rows, { x: () => 100, y: 'key', fill: colors.grid, maxThickness: 6 }),
          dot<ChartDatum>(points, { x: 'ratio', y: 'key', r: 4, fill: colors.cached }),
        ],
        scales: {
          x: { scale: scaleLinear, domain: [0, 100] },
          y: { scale: () => scalePoint<string>().padding(0.5), domain: categories },
        },
        guides: false,
        margin: { top: 0, right: 6, bottom: 0, left: 6 },
        tooltip,
        theme,
      });
    }
    const data = segments(rows);
    const fill =
      tones === undefined
        ? undefined
        : (datum: ChartDatum): string =>
            (datum.series === undefined || datum.series === 'unclassified'
              ? undefined
              : tones.get(datum.key)?.[datum.series as ChartTone]) ??
            (datum.series === 'unclassified' ? colors.muted : colors[datum.series ?? 'cached']);
    const magnitude = {
      scale: scaleLinear,
      domain: [0, Math.max(1, ...rows.map((row) => row.totalTokens ?? 0))],
      nice: true,
    };
    const categorical = { scale: () => scalePoint<string>().padding(0.5), domain: categories };
    return defineChart({
      marks:
        kind === 'model'
          ? [
              barX<ChartDatum>(data, {
                x: 'tokens',
                y: 'key',
                z: 'series',
                ...(fill === undefined ? { color: 'series' as const } : { fill }),
                layout: stack({ order: ['cached', 'uncached', 'output', 'unclassified'] }),
                radius: 2,
                maxThickness: 18,
              }),
            ]
          : [
              barY<ChartDatum>(data, {
                x: 'key',
                y: 'tokens',
                z: 'series',
                ...(fill === undefined ? { color: 'series' as const } : { fill }),
                layout: stack({ order: ['cached', 'uncached', 'output', 'unclassified'] }),
                radius: 2,
                maxThickness: 18,
              }),
            ],
      scales:
        kind === 'model' ? { x: magnitude, y: categorical } : { x: categorical, y: magnitude },
      color: {
        domain: ['cached', 'uncached', 'output', 'unclassified'],
        range: [colors.cached, colors.uncached, colors.output, colors.muted],
      },
      guides: false,
      margin: kind === 'model' ? 0 : { top: 4, right: 0, bottom: 0, left: 0 },
      tooltip,
      theme,
    });
  }, [colors, rows, kind, tones]);
  const chart = (
    <Chart
      definition={definition}
      ariaLabel={label}
      height={kind === 'daily' ? 128 : rows.length * (kind === 'model' ? 36 : 32)}
      className="bh-profile-bar-chart"
      renderTooltipBody={({ points }) => {
        const datum = points[0]?.datum as { key: string } | undefined;
        const row = rows.find((entry) => entry.key === datum?.key);
        return row === undefined ? null : (
          <div className="bh-profile-chart-tip">
            <strong>
              {tones?.get(row.key) === undefined ? null : (
                <i
                  className="bh-usage-identity-marker"
                  data-usage-identity={row.key}
                  style={{ background: tones.get(row.key)!.cached }}
                />
              )}
              {row.label}
            </strong>
            <span>
              {t('profile.usage.total')}: {count(row.totalTokens, t)} tokens
            </span>
            <UsageMeasures row={row} t={t} />
            {kind === 'cache' ? (
              <span>
                {t('profile.usage.cachedShare')}: <CacheRatio row={row} t={t} />
              </span>
            ) : null}
          </div>
        );
      }}
    />
  );
  return identity ? (
    <div
      ref={setHost}
      className="bh-usage-identity-chart"
      data-usage-tones={
        tones === undefined
          ? undefined
          : JSON.stringify(Object.fromEntries([...tones].map(([key, value]) => [key, value])))
      }
    >
      {chart}
    </div>
  ) : (
    chart
  );
}
