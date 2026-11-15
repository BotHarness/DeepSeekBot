import { ActivityInboxHeader } from './activity-inbox-menu.js';
import { useMemo, useRef, useSyncExternalStore, type ReactElement } from 'react';
import { ALL_HOSTS, THIS_HOST, remoteHosts, type RemoteHosts } from './remote-hosts.js';
import {
  ActivityEnvironmentBadge,
  ActivityEnvironmentStatus,
} from './activity-environment-badge.js';
import { observeActivityEnvironments, combineActivityPages } from './activity-environments.js';
import { useThisHost } from './this-host.js';
import { hostLooks } from './host-looks.js';
import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import type { HumanAttentionItem } from './store.js';
import { createRemoteActivitySource, remoteActivityPage } from './remote-activity.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { BridgeActions } from './actions.js';
import { ActivityListView, type ActivityListSource } from './activity-list-view.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { activitySectionActions, useActivityFeed } from './activity-feed.js';
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

export function ActivityCenterView({
  actions,
  t = zhTranslate,
  placement = 'page',
  registry,
  sources = remoteHosts(),
}: {
  actions: BridgeActions;
  t?: BotHarnessTranslate;
  placement?: 'page' | 'panel';
  registry?: DockPanelRegistry | undefined;
  sources?: RemoteHosts;
}): ReactElement {
  const panel = placement === 'panel';
  const remote = useSyncExternalStore(sources.subscribe, sources.getSnapshot);
  const { feed, query, pages, collapsed } = useActivityFeed(actions);
  const scoped = useMemo(
    () => ({
      action: activitySectionActions(actions, feed, 'action'),
      replies: activitySectionActions(actions, feed, 'replies'),
      unread: activitySectionActions(actions, feed, 'unread'),
      handled: activitySectionActions(actions, feed, 'handled'),
    }),
    [actions, feed],
  );
  const local = useThisHost();
  const includeLocal = remote.tab === ALL_HOSTS || remote.tab === THIS_HOST;
  const hosts = remote.hosts.filter(
    (host) =>
      (remote.tab === ALL_HOSTS || remote.tab === host.host.hostId) &&
      query.botSlug === undefined &&
      query.channelId === undefined,
  );
  const hostIds = JSON.stringify(hosts.map((host) => host.host.hostId));
  const observations = useMemo(
    () =>
      observeActivityEnvironments(
        sources,
        hosts.map((host) => host.host.hostId),
        query,
      ),
    [sources, hostIds, query],
  );
  const snapshots = useSyncExternalStore(observations.subscribe, observations.getSnapshot);
  const bindings = useRef(new WeakMap<HumanAttentionItem, ActivityListSource>());
  const combined = useMemo(
    () =>
      new Map(
        feed.visible().map((section) => {
          const entries = includeLocal
            ? [{ name: local.name ?? t('remoteHosts.this'), page: pages[section] }]
            : [];
          const loads: Array<() => Promise<void>> = [];
          const refreshes: Array<() => Promise<void>> = [];
          if (includeLocal) {
            refreshes.push(() => scoped[section].refreshActivityList());
            if (pages[section].nextCursor) loads.push(() => feed.loadMore(section));
          }
          observations.entries.forEach(({ hostId, observation }, index) => {
            const host = hosts.find((host) => host.host.hostId === hostId);
            const inbox = snapshots[index];
            if (!host || !inbox || host.snapshot.connection.status === 'refused') return;
            const page = remoteActivityPage(inbox, section, t);
            const source = createRemoteActivitySource({
              host,
              sources,
              avatars: remote.avatars,
              registry,
              observation,
              section,
              t,
            });
            page.items.forEach((item) => bindings.current.set(item, source));
            entries.push({
              name: shownHostName(hostLooks().look(hostId), host.host.hostName),
              page,
            });
            refreshes.push(source.refresh);
            if (page.nextCursor) loads.push(source.loadMore);
          });
          return [
            section,
            {
              page: combineActivityPages(entries, section, query),
              refresh: async () => {
                await Promise.all(refreshes.map((refresh) => refresh()));
              },
              loadMore: async () => {
                await Promise.all(loads.map((load) => load()));
              },
            },
          ] as const;
        }),
      ),
    [
      feed,
      query,
      includeLocal,
      pages,
      local.name,
      scoped,
      observations,
      snapshots,
      remote,
      registry,
      t,
      sources,
    ],
  );
  const filterKey = JSON.stringify([remote.tab, query]);
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
        {hosts.map((host) => (
          <ActivityEnvironmentStatus key={host.host.hostId} host={host} t={t} />
        ))}
        {feed.visible().map((section) => {
          const entry = combined.get(section);
          if (!entry) return null;
          const page = entry.page;
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
              itemSource={(item) => bindings.current.get(item)}
              origin={<ActivityEnvironmentBadge t={t} />}
              refreshSources={entry.refresh}
              loadMoreSources={entry.loadMore}
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
                  {expanded ? <IconChevronDownOutlineMedium /> : <IconChevronRightOutlineMedium />}
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
        })}
      </div>
    </div>
  );
}
