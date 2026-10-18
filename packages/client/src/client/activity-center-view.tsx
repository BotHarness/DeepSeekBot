import { ActivityInboxHeader } from './activity-inbox-menu.js';
import { useMemo, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import { HumanInboxView } from './human-inbox-view.js';
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
  unread: 'humanInbox.unread',
  handled: 'humanInbox.handled',
} as const;

export function ActivityCenterView({
  actions,
  t = zhTranslate,
  placement = 'page',
}: {
  actions: BridgeActions;
  t?: BotHarnessTranslate;
  placement?: 'page' | 'panel';
}): ReactElement {
  const panel = placement === 'panel';
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
    void actions.refreshHumanInboxStatus();
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
        {feed.visible().map((section) => {
          const page = pages[section];
          const count =
            section === 'unread'
              ? page.items.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0)
              : page.items.length;
          const expanded = !collapsed[section];
          return (
            <HumanInboxView
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
