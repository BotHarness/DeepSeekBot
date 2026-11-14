import { ActivityInboxHeader } from './activity-inbox-menu.js';
import { useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { ALL_HOSTS, THIS_HOST, remoteHosts } from './remote-hosts.js';
import { EnvironmentFilter } from './environment-panel.js';
import { useThisHost } from './this-host.js';
import { useHostName } from './host-looks.js';
import { ActivityHostHeading, RemoteActivityGroup } from './remote-activity.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { BridgeActions } from './actions.js';
import { ActivityListView } from './activity-list-view.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { activitySectionActions, useActivityFeed, type ActivitySection } from './activity-feed.js';
import {
  IconChevronDownOutlineMedium,
  IconChevronRightOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives';

const titles = {
  action: 'activityInbox.needsYou',
  replies: 'activityInbox.forYou',
  unread: 'activityList.unread',
  handled: 'activityList.handled',
} as const;

function LocalActivityHeading({ t }: { t: BotHarnessTranslate }): ReactElement {
  const local = useThisHost();
  const name = useHostName(local.id, local.name ?? t('remoteHosts.this'));
  return <ActivityHostHeading name={name} hostId={local.id ?? THIS_HOST} t={t} />;
}

export function ActivityCenterView({
  actions,
  t = zhTranslate,
  placement = 'page',
  registry,
}: {
  actions: BridgeActions;
  t?: BotHarnessTranslate;
  placement?: 'page' | 'panel';
  registry?: DockPanelRegistry | undefined;
}): ReactElement {
  const panel = placement === 'panel';
  const sources = remoteHosts();
  const remote = useSyncExternalStore(sources.subscribe, sources.getSnapshot);
  const { feed, query, pages, collapsed } = useActivityFeed(actions);
  const scoped = useMemo(
    () =>
      Object.fromEntries(
        (['action', 'replies', 'unread', 'handled'] as const).map((section) => [
          section,
          activitySectionActions(actions, feed, section),
        ]),
      ) as Record<ActivitySection, BridgeActions>,
    [actions, feed],
  );
  const filterKey = JSON.stringify(query);
  const mount = useMountedResource<HTMLDivElement>(() => {
    const detach = panel ? actions.attachActivityCenterPanel() : undefined;
    void actions.refreshActivityListStatus();
    const release = feed.acquire();
    return () => {
      release();
      detach?.();
    };
  }, [actions, panel, feed]);
  return (
    <div
      ref={mount}
      className={
        panel
          ? 'bh-activity-center bh-activity-center-panel bh-activity-triage'
          : 'bh-root bh-main bh-activity-center bh-activity-triage'
      }
    >
      {panel ? null : (
        <header className="bh-activity-center-header">
          <h1>{t('activityCenter.title')}</h1>
          <ActivityInboxHeader actions={actions} t={t} />
        </header>
      )}
      <div className="bh-activity-sections">
        <EnvironmentFilter t={t} />
        {remote.hosts.length > 0 && (remote.tab === ALL_HOSTS || remote.tab === THIS_HOST) ? (
          <LocalActivityHeading t={t} />
        ) : null}
        {(remote.tab === ALL_HOSTS || remote.tab === THIS_HOST ? feed.visible() : []).map(
          (section) => {
            const page = pages[section];
            const count =
              section === 'unread'
                ? page.items.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0)
                : page.items.length;
            const expanded = !collapsed[section];
            return (
              <ActivityListView
                key={section + filterKey}
                actions={scoped[section]}
                t={t}
                inboxOverride={page}
                emptyMessage={query.search ? t('activityInbox.noResults') : undefined}
                collapsed={!expanded}
                sectionHeading={
                  <button
                    type="button"
                    className="bh-activity-section-toggle"
                    aria-expanded={expanded}
                    aria-label={t(titles[section])}
                    onClick={() => feed.toggle(section)}
                  >
                    {expanded ? (
                      <IconChevronDownOutlineMedium />
                    ) : (
                      <IconChevronRightOutlineMedium />
                    )}
                    <span>{t(titles[section])}</span>
                    <span
                      className="bh-activity-section-count"
                      data-attention={(section === 'action' && count > 0) || undefined}
                    >
                      {count}
                      {page.nextCursor ? '+' : ''}
                    </span>
                  </button>
                }
              />
            );
          },
        )}
        {remote.hosts
          .filter((host) => remote.tab === ALL_HOSTS || remote.tab === host.host.hostId)
          .map((host) => (
            <RemoteActivityGroup
              key={host.host.hostId}
              host={host}
              sources={sources}
              avatars={remote.avatars}
              registry={registry}
              query={query}
              t={t}
            />
          ))}
      </div>
    </div>
  );
}
