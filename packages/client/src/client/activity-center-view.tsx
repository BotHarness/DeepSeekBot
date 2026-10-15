import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  Button,
  IconRefreshOutlineRegular,
  IconCheckOutlineRegular,
  IconInfoOutlineRegular,
  IconAgentPresetOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { useClientState } from './bot-sidebar.js';
import { PersonaBotAvatar, personaBotActivityLabel, personaBotActivitySummary } from './avatar.js';
import { ChannelActivityView } from './channel-activity-view.js';
import { HumanInboxView } from './human-inbox-view.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import type { ActivityCenterTab } from './last-view.js';
import type { NativeSessionCatalog } from './sessions-entry.js';
import { SessionRoleIcon } from './session-role-icon.js';

const EMPTY_NATIVE_SESSIONS = { ids: [], byId: {} };
const fallbackSessions: NativeSessionCatalog = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY_NATIVE_SESSIONS,
};

export function ActivityCenterView({
  actions,
  t = zhTranslate,
  nativeSessions = fallbackSessions,
  placement = 'page',
}: {
  actions: BridgeActions;
  t?: BotHarnessTranslate;
  nativeSessions?: NativeSessionCatalog | undefined;
  placement?: 'page' | 'panel';
}): ReactElement {
  const panel = placement === 'panel';
  const [panelView, setPanelView] = useState<ActivityCenterTab>('overview');
  const state = useClientState();
  const native = useSyncExternalStore(
    nativeSessions.subscribe,
    nativeSessions.getSnapshot,
    nativeSessions.getSnapshot,
  );
  const [showIdle, setShowIdle] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [readBusy, setReadBusy] = useState(false);
  const [readError, setReadError] = useState(false);
  const reading = useRef(false);
  const refreshing = useRef(false);
  const active = useRef(false);
  const refresh = async (): Promise<void> => {
    if (refreshing.current) return;
    refreshing.current = true;
    setRefreshBusy(true);
    try {
      await Promise.allSettled([
        actions.refreshOverview(),
        actions.refreshHumanInboxStatus(),
        nativeSessions.refresh?.(),
      ]);
    } finally {
      refreshing.current = false;
      if (active.current) setRefreshBusy(false);
    }
  };
  const markRead = async (): Promise<void> => {
    if (reading.current) return;
    reading.current = true;
    setReadBusy(true);
    setReadError(false);
    try {
      await actions.markAllRead();
    } catch {
      if (active.current) setReadError(true);
    } finally {
      reading.current = false;
      if (active.current) setReadBusy(false);
    }
  };
  const overview = panel
    ? panelView === 'overview'
    : state.selection?.kind === 'inbox' && state.selection.view === 'overview';
  const panelMount = useMountedResource<HTMLSpanElement>(() => {
    if (!panel) return;
    const detach = actions.attachActivityCenterPanel();
    void actions.refreshHumanInboxStatus();
    void actions.refreshOverview();
    return detach;
  }, [actions, panel]);
  const showOverview = (): void => {
    if (!panel) {
      void actions.openActivityCenter('overview');
      return;
    }
    setPanelView('overview');
    void actions.refreshOverview();
  };
  const showInbox = (category?: 'action'): void => {
    if (!panel) {
      void actions
        .openHumanInbox()
        .then(() => (category === undefined ? undefined : actions.refreshHumanInbox(category)));
      return;
    }
    setPanelView('inbox');
    void actions.refreshHumanInbox(category);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!overview) return;
    active.current = true;
    setReadBusy(reading.current);
    setRefreshBusy(refreshing.current);
    void nativeSessions.refresh?.().catch(() => undefined);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      active.current = false;
      window.clearInterval(timer);
    };
  }, [actions, overview, nativeSessions]);
  const value = state.overview.value;
  const bots =
    value?.bots
      .filter(
        (bot) =>
          showIdle ||
          bot.state !== 'idle' ||
          bot.hasAction ||
          (bot.attention?.informationalCount ?? 0) > 0 ||
          bot.sessions.length > 0,
      )
      .sort((a, b) => Number(b.hasAction) - Number(a.hasAction)) ?? [];
  return (
    <div
      className={
        panel ? 'bh-activity-center bh-activity-center-panel' : 'bh-root bh-main bh-activity-center'
      }
      ref={mount}
    >
      <span ref={panelMount} hidden />
      <header className="bh-activity-center-header">
        {panel ? null : <h1>{t('activityCenter.title')}</h1>}
        <div className="bh-human-inbox-tabs" role="tablist" aria-label={t('activityCenter.title')}>
          <button type="button" role="tab" aria-selected={overview} onClick={showOverview}>
            {t('activityCenter.overview')}
          </button>
          <button type="button" role="tab" aria-selected={!overview} onClick={() => showInbox()}>
            {t('activityCenter.inbox')}
          </button>
        </div>
      </header>
      {overview ? (
        <section className="bh-overview" aria-label={t('activityCenter.overview')}>
          <div className="bh-overview-toolbar">
            {value === undefined ? null : (
              <Button
                className="bh-overview-action-count"
                variant={value.actionCount > 0 ? 'primary' : 'outline'}
                size="sm"
                onClick={() => showInbox('action')}
              >
                <IconInfoOutlineRegular size={16} />
                <span>{t('activityCenter.actions')}</span>
                <strong>{value.actionCount}</strong>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              aria-label={t('activityCenter.showIdle')}
              aria-pressed={showIdle}
              onClick={() => setShowIdle(!showIdle)}
            >
              <IconAgentPresetOutlineRegular size={16} />
              {t(showIdle ? 'activityCenter.hideIdle' : 'activityCenter.showIdle')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={refreshBusy}
              aria-busy={refreshBusy}
              onClick={() => void refresh()}
            >
              <IconRefreshOutlineRegular size={16} />
              {t('activityCenter.refresh')}
            </Button>
          </div>
          <div className="bh-overview-unread">
            <div>
              <strong>{state.humanInbox.unreadCount}</strong> {t('activityCenter.unread')}
              <p>{t('activityCenter.readHint')}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              data-mark-all-read
              disabled={readBusy || state.humanInbox.unreadCount === 0}
              aria-busy={readBusy}
              onClick={() => void markRead()}
            >
              <IconCheckOutlineRegular size={16} /> {t('activityCenter.markAllRead')}
            </Button>
          </div>
          {readError ? <p role="alert">{t('activityCenter.readError')}</p> : null}
          <h2 className="bh-overview-work-heading">{t('activityCenter.work')}</h2>
          {state.overview.status === 'loading' ? (
            <p role="status">{t('activityCenter.loading')}</p>
          ) : null}
          {state.overview.status === 'error' ? (
            <p role="alert">{t('activityCenter.error')}</p>
          ) : null}
          {value === undefined || bots.length > 0 ? null : (
            <p>{t(value.bots.length === 0 ? 'activityCenter.empty' : 'activityCenter.allIdle')}</p>
          )}
          <div className="bh-overview-bots">
            {bots.map((bot) => (
              <article className="bh-overview-bot" key={bot.slug} data-bot-id={bot.slug}>
                <button
                  className="bh-overview-bot-header"
                  type="button"
                  onClick={() => void actions.openBot(bot.slug)}
                >
                  <PersonaBotAvatar
                    personaBotId={bot.slug}
                    name={bot.displayName}
                    src={bot.avatar}
                    appearance={bot.appearance}
                    avatarSeed={bot.avatarSeed}
                    size={28}
                    state={bot.state}
                    activity={bot.activity}
                    attention={bot.attention}
                    t={t}
                  />
                  <span className="bh-overview-bot-name">{bot.displayName}</span>
                  <span className="bh-overview-bot-state">
                    {bot.paused
                      ? t('activityCenter.paused')
                      : bot.state === 'idle' && bot.hasAction
                        ? t('activityCenter.actionPending')
                        : personaBotActivitySummary(bot.state, bot.activity, t)}
                  </span>
                </button>
                {bot.hasAction ? (
                  <section
                    className="bh-overview-bot-actions"
                    aria-label={t('activityCenter.actions')}
                  >
                    <h2>{t('activityCenter.actions')}</h2>
                    <HumanInboxView actions={actions} t={t} embedded actionBotSlug={bot.slug} />
                  </section>
                ) : null}
                {bot.sessions.length === 0 ? null : (
                  <>
                    <h2>
                      {t('activityCenter.sessions')} <span>{bot.sessions.length}</span>
                    </h2>
                    <ul>
                      {bot.sessions.map((session) => {
                        const role = t(
                          session.role === 'orchestrator'
                            ? 'activityCenter.orchestrator'
                            : 'activityCenter.assignment',
                        );
                        const title =
                          native.byId[session.sessionId]?.displayTitle ||
                          session.purpose ||
                          t('activityCenter.orchestratorPurpose');
                        return (
                          <li key={session.sessionId} data-session-id={session.sessionId}>
                            <button
                              className="bh-overview-session"
                              type="button"
                              aria-label={`${role}: ${title}`}
                              onClick={() => actions.openSession(session.sessionId)}
                            >
                              <SessionRoleIcon role={session.role} label={role} />
                              <span className="bh-overview-session-purpose" title={title}>
                                {title}
                              </span>
                              <span className="bh-overview-session-state">
                                {personaBotActivityLabel(session.state, t)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {bot.sessions.length === 0 && !bot.hasAction ? (
                  <p className="bh-overview-idle">{t('activityCenter.idle')}</p>
                ) : null}
              </article>
            ))}
          </div>
          <ChannelActivityView actions={actions} t={t} />
        </section>
      ) : (
        <HumanInboxView actions={actions} t={t} embedded />
      )}
    </div>
  );
}
