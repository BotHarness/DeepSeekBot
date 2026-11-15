import type { InboxSnapshot } from '../../../../apps/mobile/src/host/inbox.js';
import type { ActivityQuery, ActivitySection } from './activity-feed.js';
import type { RemoteHosts } from './remote-hosts.js';
import type { ActivityListState } from './store.js';

export function observeActivityEnvironments(
  sources: Pick<RemoteHosts, 'activity'>,
  hostIds: readonly string[],
  query: ActivityQuery,
) {
  const filtered =
    query.search !== '' ||
    query.sort !== 'default' ||
    query.snoozed ||
    query.category === 'handled';
  const entries = hostIds.flatMap((hostId) => {
    const observation = sources.activity(
      hostId,
      filtered
        ? {
            activity: true,
            search: query.search,
            sort: query.sort,
            section: query.snoozed ? 'snoozed' : query.category === 'handled' ? 'handled' : 'all',
          }
        : undefined,
    );
    return observation ? [{ hostId, observation }] : [];
  });
  let snapshots: readonly InboxSnapshot[] = [];
  return {
    entries,
    getSnapshot: () => {
      const next = entries.map((entry) => entry.observation.getSnapshot());
      if (
        next.length !== snapshots.length ||
        next.some((value, index) => value !== snapshots[index])
      )
        snapshots = next;
      return snapshots;
    },
    subscribe: (listener: () => void) => {
      const releases = entries.map((entry) => entry.observation.subscribe(listener));
      return () => releases.forEach((release) => release());
    },
  };
}

export function combineActivityPages(
  pages: readonly { name: string; page: ActivityListState }[],
  section: ActivitySection,
  query: ActivityQuery,
): ActivityListState {
  const sort = query.sort === 'default' ? (section === 'action' ? 'oldest' : 'newest') : query.sort;
  const items = pages
    .flatMap(({ page }) => page.items)
    .sort((left, right) => {
      if (query.sort === 'default' && section === 'replies') {
        const mentions =
          Number(right.kind === 'channel-mention') - Number(left.kind === 'channel-mention');
        if (mentions) return mentions;
      }
      return (sort === 'oldest' ? 1 : -1) * left.createdAt.localeCompare(right.createdAt);
    });
  const errors = pages.flatMap(({ name, page }) =>
    page.error === undefined ? [] : [name + ': ' + page.error],
  );
  return {
    category: section,
    sort,
    botSlug: query.botSlug,
    channelId: query.channelId,
    snoozed: query.snoozed,
    items,
    status: pages.some(({ page }) => page.status === 'loading' || page.status === 'idle')
      ? 'loading'
      : pages.length > 0 && pages.every(({ page }) => page.status === 'error')
        ? 'error'
        : 'ready',
    error: errors.length ? errors.join('\n') : undefined,
    nextCursor: pages.some(({ page }) => page.nextCursor) ? 'more' : undefined,
    unreadCount: pages.reduce((sum, { page }) => sum + page.unreadCount, 0),
    hasAction: section === 'action' && items.length > 0,
    channelUnread: {},
  };
}
