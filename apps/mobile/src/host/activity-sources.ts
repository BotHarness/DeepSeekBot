import type { HostLook } from '../ui/design/host-look';
import { observeActivityCount, type createActivityCountPreferences } from './activity-count';
import type { HostClient, HostSnapshot } from './client';
import {
  INBOX_SECTIONS,
  observeInbox,
  type Inbox,
  type InboxQuery,
  type InboxSnapshot,
  type InboxSection,
} from './inbox';
import type { HumanAttentionItem } from './wire';

export interface ActivitySource {
  hostId: string;
  label: string;
  look?: HostLook;
  client: HostClient;
  inbox: Inbox;
  roster: HostSnapshot['roster'];
}
export interface ActivityItem extends HumanAttentionItem {
  activitySource?: ActivitySource;
}
export const activitySelection = (hostId: string, id: string): string =>
  JSON.stringify([hostId, id]);
export const activityKey = (item: ActivityItem): string =>
  item.activitySource ? activitySelection(item.activitySource.hostId, item.id) : item.id;
export const activityBotKey = (item: ActivityItem): string =>
  item.activitySource ? activitySelection(item.activitySource.hostId, item.botSlug) : item.botSlug;

function localSelection(
  value: string | undefined,
  source: ActivitySource,
): string | undefined | false {
  if (value === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    )
      return parsed[0] === source.hostId ? parsed[1] : false;
  } catch {}
  return false;
}

export function observeActivitySources(sources: readonly ActivitySource[], query: InboxQuery) {
  const entries = sources.flatMap((source) => {
    const botSlug = localSelection(query.botSlug, source);
    const channelId = localSelection(query.channelId, source);
    return botSlug === false || channelId === false
      ? []
      : [
          {
            source,
            observer: observeInbox(source.client, { ...query, botSlug, channelId }),
          },
        ];
  });
  let snapshot: InboxSnapshot = { status: 'loading' };
  const listeners = new Set<() => void>();
  let stops: Array<() => void> = [];
  function update() {
    const sections: Record<InboxSection, ActivityItem[]> = {
      action: [],
      replies: [],
      unread: [],
      handled: [],
    };
    const cursors: Partial<Record<InboxSection, string>> = {};
    const loadingMore: InboxSection[] = [];
    const errors: string[] = [];
    let ready = entries.length === 0;
    for (const { source, observer } of entries) {
      const next = observer.getSnapshot();
      if (next.status === 'error') errors.push(`${source.label}: ${next.error}`);
      if (next.status !== 'ready') continue;
      ready = true;
      if (next.stale) errors.push(`${source.label}: ${next.stale}`);
      for (const section of INBOX_SECTIONS) {
        sections[section].push(
          ...next.sections[section].map((item) => ({ ...item, activitySource: source })),
        );
        if (next.cursors?.[section]) cursors[section] = 'more';
        if (next.loadingMore?.includes(section) && !loadingMore.includes(section))
          loadingMore.push(section);
      }
    }
    for (const section of INBOX_SECTIONS) {
      sections[section].sort((a, b) => {
        if (query.sort !== 'newest' && query.sort !== 'oldest' && section === 'replies') {
          const mention =
            Number(b.kind === 'channel-mention') - Number(a.kind === 'channel-mention');
          if (mention) return mention;
        }
        const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
        return (
          (Number.isFinite(time) ? (query.sort === 'oldest' ? time : -time) : 0) ||
          activityKey(a).localeCompare(activityKey(b))
        );
      });
    }
    snapshot = ready
      ? {
          status: 'ready',
          sections,
          cursors,
          loadingMore,
          botSlug: query.botSlug,
          ...(errors.length ? { stale: errors.join('\n') } : {}),
        }
      : errors.length === entries.length
        ? { status: 'error', error: errors.join('\n') }
        : { status: 'loading' };
    for (const listener of listeners) listener();
  }
  const inbox: Inbox = {
    getSnapshot: () => snapshot,
    subscribe,
    refresh: async () => {
      await Promise.allSettled(entries.map((e) => e.observer.getInbox()?.refresh()));
    },
    loadMore: async (section) => {
      await Promise.allSettled(
        entries.map((e) => {
          const value = e.observer.getSnapshot();
          return value.status === 'ready' && value.cursors?.[section]
            ? e.observer.getInbox()?.loadMore?.(section)
            : undefined;
        }),
      );
    },
    find: (key) =>
      snapshot.status === 'ready'
        ? INBOX_SECTIONS.flatMap((s) =>
            snapshot.status === 'ready' ? snapshot.sections[s] : [],
          ).find((item) => activityKey(item) === key)
        : undefined,
    stop: () => {
      stops.splice(0).forEach((stop) => stop());
    },
  };
  function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) {
      stops = entries.map((e) => e.observer.subscribe(update));
      update();
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) inbox.stop();
    };
  }
  update();
  return { getSnapshot: () => snapshot, getInbox: () => inbox, subscribe };
}

export function observeActivitySourceCount(
  sources: readonly ActivitySource[],
  preferences: ReturnType<typeof createActivityCountPreferences>,
) {
  const counts = sources.map((source) =>
    observeActivityCount(source.client, source.inbox, preferences),
  );
  let snapshot: { count: number | undefined; stale: boolean } = {
    count: sources.length ? undefined : 0,
    stale: false,
  };
  const listeners = new Set<() => void>();
  let stops: Array<() => void> = [];
  const update = () => {
    const values = counts.map((count) => count.getSnapshot());
    const known = values.filter((value) => value.count !== undefined);
    snapshot = {
      count:
        known.length || !values.length
          ? Math.min(
              100,
              known.reduce((sum, value) => sum + (value.count ?? 0), 0),
            )
          : undefined,
      stale: values.some((value) => value.stale || value.count === undefined),
    };
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        stops = counts.map((count) => count.subscribe(update));
        update();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) stops.splice(0).forEach((stop) => stop());
      };
    },
  };
}
