import { t } from '../ui/strings';
import type { HostClient } from './client';
import type { HumanAttentionItem, HumanAttentionPage } from './wire';

export const INBOX_SECTIONS = ['action', 'replies', 'unread', 'handled'] as const;
export type InboxSection = (typeof INBOX_SECTIONS)[number];
export type InboxSetAside = 'cleared' | 'snoozed';
const SET_ASIDE_SECTIONS: Record<InboxSetAside, readonly InboxSection[]> = {
  cleared: ['action', 'replies', 'unread'],
  snoozed: ['action', 'replies'],
};

interface UnreadCounts {
  channels: Array<{ channelId: string; unreadCount: number }>;
}

const LIMITS: Record<InboxSection, number> = { action: 100, replies: 30, unread: 30, handled: 30 };

export interface InboxQuery {
  botSlug?: string | undefined;
  channelId?: string | undefined;
  search?: string;
  unreadOnly?: boolean | undefined;
  sort?: 'default' | 'newest' | 'oldest';
  section?: InboxSection | InboxSetAside | 'all';
  activity?: boolean;
}

export type InboxSnapshot =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      botSlug?: string | undefined;
      cursors?: Partial<Record<InboxSection, string | undefined>>;
      loadingMore?: InboxSection[];
      sections: Record<InboxSection, HumanAttentionItem[]>;
      unread?: Readonly<Record<string, number>>;
      stale?: string | undefined;
    }
  | { status: 'error'; error: string };

export interface Inbox {
  getSnapshot(): InboxSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  loadMore?(section: InboxSection): Promise<void>;
  find(id: string): HumanAttentionItem | undefined;
  stop(): void;
}

export function createInbox(
  client: HostClient,
  options: InboxQuery = {},
  retained?: InboxSnapshot,
): Inbox {
  const listeners = new Set<() => void>();
  let snapshot: InboxSnapshot = retained?.status === 'ready' ? retained : { status: 'idle' };
  let reading: Promise<void> | undefined;
  let readAgain = false;
  let stopped = false;
  let revision = 0;
  const loading = new Set<InboxSection>();
  const setAside =
    options.section === 'cleared' || options.section === 'snoozed' ? options.section : undefined;
  const readPage = async (category: InboxSection, cursor?: string): Promise<HumanAttentionPage> => {
    const page = await client.call<HumanAttentionPage & { dismissed?: boolean }>('humanAttention', {
      category,
      limit: LIMITS[category],
      ...(options.botSlug ? { botSlug: options.botSlug } : {}),
      ...(options.channelId ? { channelId: options.channelId } : {}),
      ...(options.search ? { search: options.search } : {}),
      ...(options.unreadOnly ? { unreadOnly: true } : {}),
      ...(options.sort && options.sort !== 'default'
        ? { sort: options.sort }
        : options.activity && category === 'replies'
          ? { sort: 'mentions-first' }
          : options.activity && category === 'action'
            ? { sort: 'newest' }
            : {}),
      ...(setAside === 'cleared' ? { dismissed: true } : {}),
      ...(setAside === 'snoozed' ? { snoozed: true } : {}),
      ...(options.activity ? { queryVersion: 1 } : {}),
      ...(cursor ? { cursor } : {}),
    });
    if (options.activity && page.queryVersion !== 1) throw new Error(t.activityUpdateHost);
    if (setAside === 'cleared' && page.dismissed !== true) throw new Error(t.activityUpdateHost);
    if (setAside === 'snoozed' && page.items.some((item) => item.snoozedUntil === undefined))
      throw new Error(t.activityUpdateHost);
    return page;
  };

  const publish = (next: InboxSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const readOnce = async (): Promise<void> => {
    revision += 1;
    loading.clear();
    const retained =
      snapshot.status === 'ready' && options.activity ? snapshot.sections : undefined;
    const readWindow = async (category: InboxSection): Promise<HumanAttentionPage> => {
      let page = await readPage(category);
      const count = retained?.[category].length ?? 0;
      if (count <= page.items.length || !page.nextCursor || stopped) return page;
      const items = new Map(page.items.map((item) => [item.id, item]));
      const cursors = new Set<string>();
      while (!stopped && items.size < count && page.nextCursor && !cursors.has(page.nextCursor)) {
        cursors.add(page.nextCursor);
        const before = items.size;
        page = await readPage(category, page.nextCursor);
        for (const item of page.items) items.set(item.id, item);
        if (items.size === before) break;
      }
      return { ...page, items: [...items.values()] };
    };
    const [pages, counts] = await Promise.all([
      Promise.all(
        INBOX_SECTIONS.map((category) =>
          options.activity &&
          (setAside !== undefined
            ? !SET_ASIDE_SECTIONS[setAside].includes(category)
            : options.section && options.section !== 'all'
              ? category !== options.section
              : category === 'handled')
            ? Promise.resolve({ items: [] } as HumanAttentionPage)
            : readWindow(category),
        ),
      ),
      client.call<UnreadCounts>('channelUnreadCounts').catch(() => ({ channels: [] })),
    ]);
    const unread = Object.fromEntries(
      counts.channels.map((entry) => [entry.channelId, entry.unreadCount]),
    );
    if (stopped) return;
    const [action, replies, otherUnread, handled] = pages.map((page) => page.items) as [
      HumanAttentionItem[],
      HumanAttentionItem[],
      HumanAttentionItem[],
      HumanAttentionItem[],
    ];
    publish({
      status: 'ready',
      botSlug: options.botSlug,
      cursors: Object.fromEntries(
        INBOX_SECTIONS.flatMap((section, index) =>
          pages[index]?.nextCursor ? [[section, pages[index]!.nextCursor!]] : [],
        ),
      ),
      loadingMore: [],
      sections: { action, replies, unread: otherUnread, handled },
      unread,
    });
  };

  const refresh = (): Promise<void> => {
    if (reading !== undefined) {
      readAgain = true;
      return reading;
    }
    if (snapshot.status === 'idle' || snapshot.status === 'error') publish({ status: 'loading' });
    reading = (async () => {
      try {
        do {
          readAgain = false;
          await readOnce();
        } while (readAgain && !stopped);
      } catch (error) {
        if (stopped) return;
        const message = error instanceof Error ? error.message : String(error);
        publish(
          snapshot.status === 'ready'
            ? { ...snapshot, stale: message, loadingMore: [] }
            : { status: 'error', error: message },
        );
      } finally {
        reading = undefined;
      }
    })();
    return reading;
  };

  const background = (): void => {
    if (client.getSnapshot().connection.status === 'connected') void refresh();
  };

  let wasConnected = false;
  const offClient = client.subscribe(() => {
    const connected = client.getSnapshot().connection.status === 'connected';
    if (connected && !wasConnected) background();
    wasConnected = connected;
  });
  const offLive = client.onLive(background);
  background();
  wasConnected = client.getSnapshot().connection.status === 'connected';

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    async loadMore(section) {
      if (stopped || reading !== undefined || snapshot.status !== 'ready' || loading.has(section))
        return;
      const cursor = snapshot.cursors?.[section];
      if (!cursor) return;
      const at = revision;
      loading.add(section);
      publish({ ...snapshot, loadingMore: [...loading] });
      try {
        const page = await readPage(section, cursor);
        if (stopped || at !== revision || snapshot.status !== 'ready') return;
        const items = new Map(snapshot.sections[section].map((item) => [item.id, item]));
        for (const item of page.items) items.set(item.id, item);
        publish({
          ...snapshot,
          stale: undefined,
          sections: { ...snapshot.sections, [section]: [...items.values()] },
          cursors: { ...snapshot.cursors, [section]: page.nextCursor },
        });
      } catch (error) {
        if (!stopped && at === revision && snapshot.status === 'ready')
          publish({ ...snapshot, stale: error instanceof Error ? error.message : String(error) });
      } finally {
        if (!stopped && at === revision && snapshot.status === 'ready') {
          loading.delete(section);
          publish({ ...snapshot, loadingMore: [...loading] });
        }
      }
    },
    find(id) {
      if (snapshot.status !== 'ready') return undefined;
      for (const section of INBOX_SECTIONS) {
        const item = snapshot.sections[section].find((entry) => entry.id === id);
        if (item !== undefined) return item;
      }
      return undefined;
    },
    stop() {
      stopped = true;
      offClient();
      offLive();
    },
  };
}

export function actionCount(snapshot: InboxSnapshot): number {
  return snapshot.status === 'ready' ? snapshot.sections.action.length : 0;
}

type InboxObservation = {
  getSnapshot(): InboxSnapshot;
  getInbox(): Inbox | undefined;
  subscribe(listener: () => void): () => void;
  watching(): boolean;
};
const observations = new WeakMap<HostClient, Map<string, InboxObservation>>();
const INACTIVE_QUERY_LIMIT = 24;

export function observeInbox(client: HostClient, query: InboxQuery): InboxObservation {
  let cache = observations.get(client);
  if (cache === undefined) {
    cache = new Map();
    observations.set(client, cache);
  }
  const key = JSON.stringify([
    query.activity ?? false,
    query.section ?? 'all',
    query.botSlug ?? '',
    query.channelId ?? '',
    query.search ?? '',
    query.unreadOnly ?? false,
    query.sort ?? 'default',
  ]);
  const existing = cache.get(key);
  if (existing !== undefined) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const loading: InboxSnapshot = { status: 'loading' };
  let retained: InboxSnapshot = loading;
  let inbox: Inbox | undefined;
  let watchers = 0;
  const observed: InboxObservation = {
    getSnapshot: () => inbox?.getSnapshot() ?? retained,
    getInbox: () => inbox,
    watching: () => watchers > 0,
    subscribe(listener: () => void) {
      inbox ??= createInbox(client, query, retained);
      watchers += 1;
      const off = inbox.subscribe(listener);
      let closed = false;
      return () => {
        if (closed) return;
        closed = true;
        off();
        watchers -= 1;
        if (watchers !== 0) return;
        retained = inbox?.getSnapshot() ?? retained;
        inbox?.stop();
        inbox = undefined;
      };
    },
  };
  cache.set(key, observed);
  let inactive = [...cache.values()].filter((entry) => !entry.watching()).length;
  for (const [entryKey, entry] of cache) {
    if (inactive <= INACTIVE_QUERY_LIMIT) break;
    if (entry.watching()) continue;
    cache.delete(entryKey);
    inactive--;
  }
  return observed;
}

export function prefetchInbox(client: HostClient, query: InboxQuery): () => void {
  const observed = observeInbox(client, query);
  if (observed.getSnapshot().status === 'ready') return () => {};
  let off = () => {};
  const settled = () => {
    const { status } = observed.getSnapshot();
    if (status === 'ready' || status === 'error') off();
  };
  off = observed.subscribe(settled);
  settled();
  return off;
}
