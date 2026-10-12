import { paintBotName } from './bot-primary-color.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useRef, useState, type ReactElement } from 'react';
import {
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { OverviewUsage } from '../../../core/src/bridge/methods.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  UsageChart,
  UsageLegend,
  UsageToneLegend,
  type UsageSummary,
} from './model-usage-charts.js';
import { useMountedResource } from './mounted-resource.js';
export function OverviewUsageView({
  actions,
  t,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [value, setValue] = useState<OverviewUsage>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useRef<(after?: string) => void>(() => {});
  const mount = useMountedResource<HTMLElement>(() => {
    let active = true;
    let pending = false;
    let current: OverviewUsage | undefined;
    let loadedPages = 1;
    let midnight: ReturnType<typeof setTimeout> | undefined;
    setValue(undefined);
    setError(false);
    const load = async (after?: string): Promise<void> => {
      if (!active || pending) return;
      pending = true;
      setBusy(true);
      try {
        let next = await actions.overviewUsage(period, after);
        if (!active) return;
        const sameRange = current && next.start === current.start && next.end === current.end;
        if (after && !sameRange) {
          next = await actions.overviewUsage(period);
          after = undefined;
          if (!active) return;
        }
        let pages = 1;
        if (after && current) {
          next = {
            ...next,
            bots: [
              ...current.bots,
              ...next.bots.filter(
                (row) => !current!.bots.some((existing) => existing.slug === row.slug),
              ),
            ],
          };
          pages = loadedPages + 1;
        } else if (sameRange) {
          while (pages < loadedPages && next.nextCursor) {
            const page = await actions.overviewUsage(period, next.nextCursor);
            if (!active) return;
            if (page.start !== next.start || page.end !== next.end) {
              next = await actions.overviewUsage(period);
              pages = 1;
              if (!active) return;
              break;
            }
            next = {
              ...page,
              bots: [
                ...next.bots,
                ...page.bots.filter(
                  (row) => !next.bots.some((existing) => existing.slug === row.slug),
                ),
              ],
            };
            pages++;
          }
        }
        if (!active) return;
        loadedPages = pages;
        current = next;
        setValue(current);
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
    refresh.current = (after) => void load(after);
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
      if (midnight !== undefined) clearTimeout(midnight);
      refresh.current = () => {};
    };
  }, [actions, period]);
  const count = (tokens: number | null): string =>
    tokens === null ? t('profile.usage.unknown') : tokens.toLocaleString();
  const rows: UsageSummary[] =
    value?.days.map((row) => ({ ...row, key: row.day, label: row.day })) ?? [];
  const bots: UsageSummary[] =
    value?.bots.map(({ primaryColor, ...bot }) => ({
      ...bot,
      key: bot.slug,
      label: bot.displayName,
      ...(typeof primaryColor === 'string' ? { identityColor: primaryColor } : {}),
    })) ?? [];
  return (
    <section
      ref={mount}
      className="bh-profile-card bh-overview-usage"
      aria-label={t('overviewUsage.title')}
    >
      <header className="bh-profile-card-head">
        <h3 className="bh-profile-card-label">{t('overviewUsage.title')}</h3>
        <div className="bh-overview-usage-controls">
          <div className="bh-usage-grouping" role="group" aria-label={t('overviewUsage.range')}>
            {(['today', 'week'] as const).map((range) => (
              <button
                key={range}
                type="button"
                aria-pressed={range === period}
                data-usage-period={range}
                onClick={() => setPeriod(range)}
              >
                {t(`overviewUsage.${range}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="bh-profile-pin"
            aria-label={t('overviewUsage.refresh')}
            title={t('overviewUsage.refresh')}
            aria-busy={busy}
            disabled={busy}
            onClick={() => refresh.current()}
          >
            <IconRefreshOutlineRegular size={16} />
          </button>
        </div>
      </header>
      <div className="bh-model-usage bh-model-usage-overview">
        {busy && !value ? (
          <p className="bh-note" role="status">
            {t('overviewUsage.loading')}
          </p>
        ) : null}
        {error ? (
          <p className="bh-note" role="alert">
            {t('overviewUsage.error')}
          </p>
        ) : null}
        {value ? (
          <>
            <span className="bh-note bh-overview-usage-period">
              {value.start} – {value.end} · {value.timezone}
            </span>
            <strong className="bh-profile-card-total" aria-live="polite">
              {t('overviewUsage.total')}:{' '}
              <span data-usage-total>{count(value.totals.totalTokens)}</span> tokens
            </strong>
            {value.freshness !== 'ready' ? (
              <p className="bh-note" role="status">
                {t(`overviewUsage.${value.freshness}`)}
              </p>
            ) : null}
            {value.legacyBaseline ? <p className="bh-note">{t('overviewUsage.legacy')}</p> : null}
            {value.days.some((row) => Object.values(row).some((amount) => amount === null)) ? (
              <p className="bh-note">{t('overviewUsage.partial')}</p>
            ) : null}
            {rows.some((row) => row.totalTokens !== null && row.totalTokens > 0) ? (
              <div className="bh-usage-daily">
                <strong>{t('profile.usage.daily')}</strong>
                <UsageLegend rows={rows} t={t} />
                <UsageChart rows={rows} kind="daily" label={t('overviewUsage.trend')} t={t} />
                <div className="bh-usage-axis-labels">
                  <span>{value.start}</span>
                  <span>{value.end}</span>
                </div>
              </div>
            ) : null}
            <div className="bh-usage-models">
              <div className="bh-usage-model-heading">
                <strong>{t('overviewUsage.bots')}</strong>
                {value.bots.length === 0 ? null : <UsageToneLegend t={t} />}
              </div>
              {value.bots.length === 0 ? (
                <p className="bh-profile-empty">{t('overviewUsage.empty')}</p>
              ) : (
                <div className="bh-usage-model-plot">
                  <div>
                    {value.bots.map((bot) => (
                      <div
                        className="bh-usage-model-label"
                        key={bot.slug}
                        data-usage-bot={bot.slug}
                      >
                        <span className="bh-overview-usage-bot-name" title={bot.displayName}>
                          <span
                            ref={(element) => paintBotName(element, bot.primaryColor)}
                            data-usage-bot-name=""
                          >
                            {bot.displayName}
                          </span>
                          {!bot.current ? <span>{t('overviewUsage.retained')}</span> : null}
                        </span>
                        <strong>{count(bot.totalTokens)}</strong>
                        {bot.current ? (
                          <button
                            type="button"
                            className="bh-profile-pin"
                            aria-label={`${t('profile.open')}: ${bot.displayName}`}
                            title={`${t('profile.open')}: ${bot.displayName}`}
                            onClick={() => void actions.openBot(bot.slug, 'profile')}
                          >
                            <IconRightUpOutlineRegular size={16} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <UsageChart rows={bots} kind="model" label={t('overviewUsage.bots')} t={t} />
                </div>
              )}
              {value.nextCursor ? (
                <button
                  type="button"
                  className="bh-profile-action"
                  disabled={busy}
                  onClick={() => refresh.current(value.nextCursor)}
                >
                  {t('overviewUsage.more')}
                </button>
              ) : null}
            </div>
            <details className="bh-usage-details bh-overview-usage-days">
              <summary>{t('profile.usage.details')}</summary>
              <div>
                <p className="bh-note">{t('overviewUsage.scope')}</p>
                <div className="bh-usage-table-scroll">
                  <table className="bh-usage-day-table">
                    <caption>{t('overviewUsage.daily')}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('profile.usage.day')}</th>
                        <th scope="col">{t('profile.usage.total')}</th>
                        <th scope="col">{t('profile.tokens.uncachedInput')}</th>
                        <th scope="col">{t('profile.usage.cacheRead')}</th>
                        <th scope="col">{t('profile.usage.cacheWrite')}</th>
                        <th scope="col">{t('profile.tokens.output')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {value.days.map((row) => (
                        <tr key={row.day}>
                          <td>{row.day}</td>
                          <td>{count(row.totalTokens)}</td>
                          <td>{count(row.inputTokens)}</td>
                          <td>{count(row.cacheReadTokens)}</td>
                          <td>{count(row.cacheWriteTokens)}</td>
                          <td>{count(row.outputTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </>
        ) : null}
      </div>
    </section>
  );
}
