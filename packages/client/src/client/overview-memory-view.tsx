import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import {
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { barY, defineChart } from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/charts/react/tooltip';
import type { OverviewMemory } from '../../../core/src/memory/overview.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { useProfileChartTokens } from './profile-chart-theme.js';
import { useMountedResource } from './mounted-resource.js';

function MemoryTrend({
  days,
  counts,
  label,
}: {
  days: string[];
  counts: number[];
  label: string;
}): ReactElement {
  const colors = useProfileChartTokens();
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(
            days.map((day, i) => ({ day, count: counts[i]! })),
            { x: 'day', y: 'count', fill: colors.cached, maxThickness: 14, radius: 2 },
          ),
        ],
        scales: {
          x: { scale: () => scalePoint<string>().padding(0.5), domain: days },
          y: { scale: scaleLinear, domain: [0, Math.max(1, ...counts)] },
        },
        guides: false,
        margin: { top: 2, right: 2, bottom: 2, left: 2 },
        tooltip,
        theme: {
          foreground: colors.foreground,
          muted: colors.muted,
          grid: colors.grid,
          background: 'transparent',
        },
      }),
    [days, counts, colors],
  );
  return (
    <div className="bh-overview-memory-trend">
      <Chart
        definition={definition}
        height={32}
        ariaLabel={label}
        renderTooltipBody={({ points }) => {
          const point = points[0];
          return point ? (
            <div className="bh-profile-chart-tip">
              <strong>{point.datum.day}</strong>
              <span>{point.datum.count}</span>
            </div>
          ) : null;
        }}
      />
    </div>
  );
}

export function OverviewMemoryView({
  actions,
  t,
}: {
  actions: Pick<BridgeActions, 'overviewMemory'> & Partial<Pick<BridgeActions, 'openBot'>>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [value, setValue] = useState<OverviewMemory>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useRef<(more?: boolean) => void>(() => {});
  const mount = useMountedResource<HTMLElement>(() => {
    let active = true;
    let pending = false;
    let pages = 1;
    let current: OverviewMemory | undefined;
    let midnight: ReturnType<typeof setTimeout> | undefined;
    const load = async (more = false): Promise<void> => {
      if (!active || pending) return;
      pending = true;
      setBusy(true);
      try {
        let next = await actions.overviewMemory();
        if (!active) return;
        const target = current && current.start === next.start ? pages + (more ? 1 : 0) : 1;
        let readPages = 1;
        while (next.nextCursor && readPages < target) {
          const page = await actions.overviewMemory(next.nextCursor);
          if (!active) return;
          if (page.start !== next.start) {
            next = await actions.overviewMemory();
            readPages = 1;
            break;
          }
          next = {
            ...page,
            bots: [
              ...next.bots,
              ...page.bots.filter((bot) => !next.bots.some((old) => old.slug === bot.slug)),
            ],
          };
          readPages++;
        }
        if (!active) return;
        pages = readPages;
        current = next;
        setValue(next);
        setError(false);
        if (midnight !== undefined) clearTimeout(midnight);
        midnight = setTimeout(
          () => void load(),
          Math.max(1000, Date.parse(next.nextRefreshAt) - Date.now() + 100),
        );
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
        if (active) setBusy(false);
      }
    };
    refresh.current = (more) => void load(more);
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
      if (midnight !== undefined) clearTimeout(midnight);
      refresh.current = () => {};
    };
  }, [actions]);
  return (
    <section
      ref={mount}
      className="bh-profile-card bh-overview-memory"
      aria-label={t('overviewMemory.title')}
    >
      <header className="bh-profile-card-head">
        <h3 className="bh-profile-card-label">
          {t('overviewMemory.title')} · {t('overviewUsage.week')}
        </h3>
        <button
          type="button"
          className="bh-profile-pin"
          aria-label={t('overviewMemory.refresh')}
          title={t('overviewMemory.refresh')}
          disabled={busy}
          aria-busy={busy}
          onClick={() => refresh.current()}
        >
          <IconRefreshOutlineRegular size={16} />
        </button>
      </header>
      {busy && !value ? (
        <p className="bh-note" role="status">
          {t('overviewMemory.loading')}
        </p>
      ) : null}
      {error ? (
        <p className="bh-note" role="alert">
          {t('overviewMemory.error')}
        </p>
      ) : null}
      {value ? (
        <>
          <div className="bh-overview-memory-range">
            <span>
              {value.start} — {value.end}
            </span>
            <span>{value.timezone}</span>
          </div>
          {value.bots.length === 0 ? (
            <p className="bh-profile-empty">{t('overviewMemory.empty')}</p>
          ) : null}
          <ul className="bh-overview-memory-bots">
            {value.bots.map((bot) => (
              <li key={bot.slug} data-memory-bot={bot.slug}>
                <span className="bh-overview-memory-name" title={bot.displayName}>
                  {bot.displayName}
                </span>
                {bot.state === 'ready' ? (
                  <>
                    <strong data-memory-total>
                      {bot.total.toLocaleString()} <span>{t('overviewMemory.commits')}</span>
                    </strong>
                    <MemoryTrend
                      days={value.days}
                      counts={bot.counts}
                      label={`${bot.displayName}: ${t('overviewMemory.trend')}`}
                    />
                    <span
                      className={bot.dirty ? 'bh-overview-memory-dirty' : 'bh-note'}
                      data-memory-dirty={String(bot.dirty)}
                    >
                      {t(bot.dirty ? 'overviewMemory.dirty' : 'overviewMemory.clean')}
                    </span>
                  </>
                ) : (
                  <span className="bh-overview-memory-unavailable">
                    {t('overviewMemory.unavailable')}
                  </span>
                )}
                {actions.openBot === undefined ? null : (
                  <button
                    type="button"
                    className="bh-profile-pin"
                    aria-label={`${t('profile.open')}: ${bot.displayName}`}
                    title={`${t('profile.open')}: ${bot.displayName}`}
                    onClick={() => void actions.openBot?.(bot.slug, 'profile')}
                  >
                    <IconRightUpOutlineRegular size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {value.nextCursor ? (
            <button
              type="button"
              className="bh-profile-action"
              disabled={busy}
              onClick={() => refresh.current(true)}
            >
              {t('overviewUsage.more')}
            </button>
          ) : null}
          <details className="bh-usage-details bh-overview-memory-details">
            <summary>{t('profile.usage.details')}</summary>
            <p className="bh-note">{t('overviewMemory.scope')}</p>
            <div className="bh-usage-table-scroll">
              <table className="bh-usage-day-table">
                <caption>{t('overviewMemory.trend')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('overviewUsage.bots')}</th>
                    {value.days.map((day) => (
                      <th key={day} scope="col">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {value.bots.map((bot) => (
                    <tr key={bot.slug}>
                      <th scope="row">{bot.displayName}</th>
                      {value.days.map((day, i) => (
                        <td key={day}>
                          {bot.state === 'ready' ? bot.counts[i]!.toLocaleString() : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
