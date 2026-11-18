import { Icon } from './ds/icon.js';
import { Button } from './ds/button.js';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useRef, useState, type ReactElement } from 'react';

import type { ChannelActivityToday } from '../../../core/src/channels/activity-today.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { OverviewMemoryView } from './overview-memory-view.js';
import { OverviewUsageView } from './overview-usage-view.js';
import { ChannelActivityChart } from './channel-activity-chart.js';
import { defaultStorage, type ConfigStorage } from './roster-config.js';
import { useMountedResource } from './mounted-resource.js';

export function ChannelActivityView({
  actions,
  t,
  storage = defaultStorage(),
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  storage?: ConfigStorage | undefined;
}): ReactElement {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return storage?.getItem('botharness/overview-statistics-collapsed.v1') === 'true';
    } catch {
      return false;
    }
  });
  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      storage?.setItem('botharness/overview-statistics-collapsed.v1', String(next));
    } catch {}
  };
  const [value, setValue] = useState<ChannelActivityToday>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(true);
  const refresh = useRef<() => void>(() => {});
  const mount = useMountedResource<HTMLElement>(() => {
    let active = true;
    let pending = false;
    let midnight: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      if (!active || pending) return;
      pending = true;
      setBusy(true);
      try {
        const next = await actions.channelActivityToday();
        if (!active) return;
        setValue(next);
        setStatus('ready');
        if (midnight !== undefined) clearTimeout(midnight);
        midnight = setTimeout(
          () => void load(),
          Math.max(1000, Date.parse(next.to) - Date.now() + 100),
        );
      } catch {
        if (active) setStatus('error');
      } finally {
        pending = false;
        if (active) setBusy(false);
      }
    };
    refresh.current = () => void load();
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
    <section className="bh-channel-activity" ref={mount} aria-label={t('channelActivity.title')}>
      <header>
        <h2>
          <button
            type="button"
            className="bh-statistics-toggle"
            aria-expanded={!collapsed}
            aria-label={t('channelActivity.toggle')}
            onClick={toggle}
          >
            <Icon
              name="chevron-down"
              size={16}
              className={collapsed ? 'bh-channel-activity-closed' : ''}
            />
            {t('channelActivity.statistics')}
          </button>
        </h2>
      </header>
      <div hidden={collapsed} className="bh-statistics-content">
        {!collapsed ? <OverviewUsageView actions={actions} t={t} /> : null}
        {!collapsed ? <OverviewMemoryView actions={actions} t={t} /> : null}
        <header>
          <div>
            <h3>{t('channelActivity.title')}</h3>
            {value ? (
              <p>
                {value.day} · {value.timezone} · <strong data-activity-total>{value.total}</strong>{' '}
                {t('channelActivity.messages')}
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-busy={busy}
            onClick={() => refresh.current()}
          >
            <Icon name="refresh-cw" size={16} /> {t('channelActivity.refresh')}
          </Button>
        </header>
        {status === 'loading' ? <p role="status">{t('channelActivity.loading')}</p> : null}
        {status === 'error' ? <p role="alert">{t('channelActivity.error')}</p> : null}
        {value ? (
          <>
            <div className="bh-channel-activity-legend">
              {(['human', 'bot', 'other'] as const).map((kind) => (
                <span key={kind}>
                  <i className={`bh-channel-activity-${kind}`} />
                  {t(`channelActivity.${kind}`)}
                </span>
              ))}
            </div>
            {value.total > 0 && !collapsed ? (
              <ChannelActivityChart
                rows={value.channels.slice(0, limit)}
                t={t}
                onSelect={(channelId) => setExpanded(new Set([channelId]))}
              />
            ) : null}
            {value.channels.length === 0 ? <p>{t('channelActivity.empty')}</p> : null}
            <ul>
              {value.channels.slice(0, limit).map((row) => {
                const open = expanded.has(row.channelId);
                return (
                  <li key={row.channelId} data-activity-channel={row.channelId}>
                    <div className="bh-channel-activity-row">
                      <button
                        className="bh-channel-activity-toggle"
                        type="button"
                        aria-expanded={open}
                        aria-label={`${row.name}: ${row.total} ${t('channelActivity.messages')}`}
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (open) next.delete(row.channelId);
                            else next.add(row.channelId);
                            return next;
                          })
                        }
                      >
                        <Icon
                          name="chevron-down"
                          size={16}
                          className={open ? '' : 'bh-channel-activity-closed'}
                        />
                        <span className="bh-channel-activity-name">{row.name}</span>
                        <strong>{row.total}</strong>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`${t('channelActivity.open')}: ${row.name}`}
                        onClick={() => void actions.openChannel(row.channelId)}
                      >
                        <Icon name="arrow-up-right" size={16} />
                      </Button>
                    </div>
                    {open ? (
                      <div className="bh-channel-activity-senders">
                        <p>
                          {t('channelActivity.human')} {row.human} · {t('channelActivity.bot')}{' '}
                          {row.bot} · {t('channelActivity.other')} {row.other}
                        </p>
                        {row.senders.length === 0 ? (
                          <p>{t('channelActivity.noSenders')}</p>
                        ) : (
                          <ul>
                            {row.senders.map((sender, index) => (
                              <li key={index}>
                                <span>{sender.displayName}</span>
                                <span className="bh-channel-activity-kind">
                                  {t(
                                    `channelActivity.${sender.author.kind === 'human' || sender.author.kind === 'bot' ? sender.author.kind : 'other'}`,
                                  )}
                                </span>
                                <strong>{sender.count}</strong>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {value.channels.length > limit ? (
              <Button variant="outline" size="sm" onClick={() => setLimit(limit + 20)}>
                {t('channelActivity.more')} ({value.channels.length - limit})
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
