import { useSyncExternalStore } from 'react';
import { observeHumanAttention } from './messaging-defaults-live.js';
import type { BridgeActions } from './actions.js';
import { store, type ClientStore, type HumanInboxState } from './store.js';

export const ACTIVITY_SECTIONS = ['action', 'replies', 'unread'] as const;
export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number] | 'handled';
export interface ActivityQuery {
  category: ActivitySection | 'all';
  sort: 'default' | 'newest' | 'oldest';
  botSlug: string | undefined;
  channelId: string | undefined;
  snoozed: boolean;
  search: string;
}
const INITIAL_QUERY: ActivityQuery = {
  category: 'all',
  sort: 'default',
  botSlug: undefined,
  channelId: undefined,
  snoozed: false,
  search: '',
};
const empty = (category: ActivitySection): HumanInboxState => ({
  category,
  sort: category === 'action' ? 'oldest' : 'newest',
  botSlug: undefined,
  channelId: undefined,
  snoozed: false,
  items: [],
  status: 'idle',
  nextCursor: undefined,
  error: undefined,
  unreadCount: 0,
  hasAction: false,
  channelUnread: {},
});
const preferenceKey = 'botharness:activity:collapsed:v1';
function readCollapsed(): Partial<Record<ActivitySection, boolean>> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      [...ACTIVITY_SECTIONS, 'handled'].map((key) => [key, Reflect.get(value, key) === true]),
    );
  } catch {
    return {};
  }
}

export function createActivityFeed(
  actions: Pick<BridgeActions, 'activityPage'>,
  clientStore: Pick<ClientStore, 'getSnapshot' | 'subscribe'> = store,
) {
  let state = {
    query: { ...INITIAL_QUERY },
    collapsed: readCollapsed(),
    pages: {
      action: empty('action'),
      replies: empty('replies'),
      unread: empty('unread'),
      handled: empty('handled'),
    },
  };
  const listeners = new Set<() => void>();
  const publish = () => {
    state = { ...state };
    listeners.forEach((fn) => fn());
  };
  let generation = 0;
  let users = 0;
  let stopLive: (() => void) | undefined;
  const loaded = new Set<ActivitySection>();
  let unsubscribeMute: (() => void) | undefined;
  const pending = new Map<ActivitySection, Promise<void>>();
  const visible = (): ActivitySection[] =>
    state.query.category === 'all' ? [...ACTIVITY_SECTIONS] : [state.query.category];
  const load = async (section: ActivitySection, more = false): Promise<void> => {
    const waitingGeneration = generation;
    if (pending.has(section)) {
      await pending.get(section);
      if (more || waitingGeneration !== generation) return;
      if (pending.has(section)) return pending.get(section);
    }
    const version = generation;
    const before = state.pages[section];
    if (more && !before.nextCursor) return;
    const query = state.query;
    const sort =
      query.sort === 'default' ? (section === 'action' ? 'oldest' : 'newest') : query.sort;
    if (!loaded.has(section) || before.error !== undefined) {
      state.pages = {
        ...state.pages,
        [section]: {
          ...before,
          status: loaded.has(section) ? 'ready' : 'loading',
          error: undefined,
        },
      };
      publish();
    }
    const request = (async () => {
      try {
        const items = more ? [...before.items] : [];
        let cursor = more ? before.nextCursor : undefined;
        const pages = more ? 1 : Math.max(1, Math.ceil(before.items.length / 50));
        for (let page = 0; page < pages; page++) {
          const result = await actions.activityPage(
            section,
            {
              botSlug: query.botSlug,
              channelId: query.channelId,
              sort,
              snoozed: query.snoozed,
              search: query.search,
              mentionsFirst: query.sort === 'default' && section === 'replies',
            },
            cursor,
          );
          if (version !== generation) return;
          for (const item of result.items)
            if (!items.some((entry) => entry.id === item.id)) items.push(item);
          cursor = result.nextCursor;
          if (!cursor) break;
        }
        if (version !== generation) return;
        loaded.add(section);
        const next: HumanInboxState = {
          ...before,
          items,
          nextCursor: cursor,
          status: 'ready',
          error: undefined,
          sort,
          botSlug: query.botSlug,
          channelId: query.channelId,
          snoozed: query.snoozed,
        };
        if (JSON.stringify(next) !== JSON.stringify(state.pages[section])) {
          state.pages = { ...state.pages, [section]: next };
          publish();
        }
      } catch (error) {
        if (version !== generation) return;
        state.pages = {
          ...state.pages,
          [section]: {
            ...state.pages[section],
            status: loaded.has(section) ? 'ready' : 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        };
        publish();
      } finally {
        if (version === generation) {
          pending.delete(section);
        }
      }
    })();
    pending.set(section, request);
    await request;
  };
  const refresh = async () => {
    await Promise.all(visible().map((section) => load(section)));
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    visible,
    refresh,
    loadMore: (section: ActivitySection) => load(section, true),
    setQuery(patch: Partial<ActivityQuery>) {
      const query = { ...state.query, ...patch };
      if (JSON.stringify(query) === JSON.stringify(state.query)) return;
      generation++;
      pending.clear();
      loaded.clear();
      state = {
        ...state,
        query,
        pages: {
          action: empty('action'),
          replies: empty('replies'),
          unread: empty('unread'),
          handled: empty('handled'),
        },
      };
      publish();
      void refresh();
    },
    toggle(section: ActivitySection) {
      state = { ...state, collapsed: { ...state.collapsed, [section]: !state.collapsed[section] } };
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(state.collapsed));
      } catch {}
      publish();
    },
    acquire() {
      if (users++ === 0) {
        stopLive = observeHumanAttention(() => void refresh());
        let muted = JSON.stringify([...clientStore.getSnapshot().roster.muted].sort());
        unsubscribeMute = clientStore.subscribe(() => {
          const next = JSON.stringify([...clientStore.getSnapshot().roster.muted].sort());
          if (next === muted) return;
          muted = next;
          generation++;
          pending.clear();
          void refresh();
        });
        void refresh();
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--users === 0) {
          stopLive?.();
          stopLive = undefined;
          unsubscribeMute?.();
          unsubscribeMute = undefined;
          generation++;
          pending.clear();
        }
      };
    },
  };
}
export type ActivityFeed = ReturnType<typeof createActivityFeed>;
const feeds = new WeakMap<BridgeActions, ActivityFeed>();
export function activityFeedFor(actions: BridgeActions): ActivityFeed {
  let feed = feeds.get(actions);
  if (!feed) {
    feed = createActivityFeed(actions);
    feeds.set(actions, feed);
  }
  return feed;
}
export function useActivityFeed(actions: BridgeActions) {
  const feed = activityFeedFor(actions);
  const snapshot = useSyncExternalStore(feed.subscribe, feed.getSnapshot);
  return { feed, ...snapshot };
}

export function activitySectionActions(
  actions: BridgeActions,
  feed: ActivityFeed,
  section: ActivitySection,
): BridgeActions {
  const after =
    <Args extends unknown[], Result>(command: (...args: Args) => Promise<Result>) =>
    async (...args: Args): Promise<Result> => {
      try {
        return await command(...args);
      } finally {
        await feed.refresh();
      }
    };
  return {
    ...actions,
    refreshHumanInbox: () => feed.refresh(),
    loadMoreHumanInbox: () => feed.loadMore(section),
    answerUserQuestion: after(actions.answerUserQuestion),
    decideToolApproval: after(actions.decideToolApproval),
    resolveWorkspaceGrantRequest: after(actions.resolveWorkspaceGrantRequest),
    replyToHumanAssignment: after(actions.replyToHumanAssignment),
    decideGroupJoin: after(actions.decideGroupJoin),
    dismissHumanInbox: after(actions.dismissHumanInbox),
    allowAutoRejectionOnce: after(actions.allowAutoRejectionOnce),
    snoozeHumanInbox: after(actions.snoozeHumanInbox),
    markRead: after(actions.markRead),
  };
}
