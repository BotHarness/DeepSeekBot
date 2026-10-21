import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { BridgeActions } from './actions.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import { store, type BotSummary, type ChannelSummary } from './store.js';
import { OverviewUsageView } from './overview-usage-view.js';
import {
  PersonaBotAvatar,
  normalizePersonaBotActivity,
  personaBotActivityLabel,
} from './avatar.js';
import { errorMessage } from './bridge.js';
import { keepClientState, sameFields, useClientStore } from './use-client-store.js';
import { color, space, radius, text } from './ds/tokens.stylex.js';

const overviewInputs = sameFields(['bots', 'channels', 'status', 'activitySync']);

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
    alignItems: 'start',
    gap: space.x5,
    minWidth: 0,
  },
  section: { minWidth: 0, overflow: 'hidden' },
  card: {
    minWidth: 0,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.x4,
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
  },
  title: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  list: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
    gap: space.x3,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: color.fg,
    borderWidth: 0,
    borderRadius: radius.sm,
    padding: space.x3,
    textAlign: 'start',
    cursor: 'pointer',
    font: 'inherit',
  },
  labels: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 },
  name: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    fontWeight: text.strong,
  },
  note: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  error: { color: color.danger },
});

export function homeActiveBots(bots: readonly BotSummary[], channels: readonly ChannelSummary[]) {
  const recent = new Map<string, number>();
  for (const channel of channels) {
    const message = channel.latestMessage;
    if (message?.author.kind !== 'bot') continue;
    const at = Date.parse(message.at);
    if (Number.isFinite(at))
      recent.set(message.author.slug, Math.max(recent.get(message.author.slug) ?? 0, at));
  }
  return bots
    .filter((bot) => !bot.deleted)
    .flatMap((bot) => {
      const active = bot.aggregateState === 'thinking' || bot.aggregateState === 'working';
      const at = Math.max(
        bot.lastActivityAt ?? 0,
        recent.get(bot.slug) ?? 0,
        bot.activity?.startedAt ?? 0,
        ...(bot.sessionActivity ?? []).map((session) => session.at),
      );
      return active || at > 0 ? [{ bot, active, at }] : [];
    })
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || b.at - a.at || a.bot.slug.localeCompare(b.bot.slug),
    );
}

export function HomeOverview({
  actions,
  registry,
  t,
}: {
  actions: BridgeActions;
  registry: DockPanelRegistry;
  t: BotHarnessTranslate;
}): ReactElement {
  const state = useClientStore(keepClientState, overviewInputs);
  const [error, setError] = useState<string>();
  const rows = homeActiveBots(state.bots, state.channels);
  const open = async (slug: string) => {
    setError(undefined);
    if (!store.getSnapshot().bots.some((bot) => bot.slug === slug && !bot.deleted)) return;
    try {
      await actions.openBot(slug);
      registry.open(CHANNEL_BODY_PANEL);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <div {...stylex.props(styles.grid)} data-home-overview>
      <div {...stylex.props(styles.section)}>
        <OverviewUsageView actions={actions} t={t} historyOnly />
      </div>
      <section {...stylex.props(styles.card)} aria-label={t('home.botActivity')}>
        <h3 {...stylex.props(styles.title)}>{t('home.botActivity')}</h3>
        {(state.activitySync === 'stale' || state.status === 'error') && (
          <p role="status" {...stylex.props(styles.note)}>
            {t('home.activityUnavailable')}
          </p>
        )}
        {(state.status === 'idle' || state.status === 'loading') && !rows.length && (
          <p role="status" {...stylex.props(styles.note)}>
            {t('roster.loading')}
          </p>
        )}
        <div {...stylex.props(styles.list)}>
          {rows.map(({ bot, at }) => (
            <button
              key={bot.slug}
              type="button"
              {...stylex.props(styles.row)}
              onClick={() => void open(bot.slug)}
              data-home-bot={bot.slug}
              aria-label={bot.displayName}
            >
              <PersonaBotAvatar
                personaBotId={bot.slug}
                name={bot.displayName}
                src={bot.avatar}
                appearance={bot.appearance}
                avatarSeed={bot.avatarSeed}
                size={32}
                state={
                  state.activitySync === 'live'
                    ? normalizePersonaBotActivity(bot.aggregateState)
                    : 'idle'
                }
                indicator={state.activitySync === 'live'}
                t={t}
              />
              <span {...stylex.props(styles.labels)}>
                <span {...stylex.props(styles.name)} title={bot.displayName}>
                  {bot.displayName}
                </span>
                <span {...stylex.props(styles.note)}>
                  {state.activitySync === 'live'
                    ? personaBotActivityLabel(normalizePersonaBotActivity(bot.aggregateState), t)
                    : t('home.activityUnavailable')}
                  {at > 0 ? ` · ${new Date(at).toLocaleString()}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
        {!rows.length && state.status === 'ready' && state.activitySync === 'live' && (
          <p {...stylex.props(styles.note)}>{t('home.noBotActivity')}</p>
        )}
        {error && (
          <p role="alert" {...stylex.props(styles.note, styles.error)}>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
