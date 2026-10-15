import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { createHostClient, type HostClient, type HostSnapshot } from './client';
import { createInbox, type Inbox, type InboxSnapshot } from './inbox';
import { createConversation, type Conversation, type ConversationSnapshot } from './conversation';
import { currentHost, selectHost, withHost, withoutHost, type SavedHosts } from './hosts';
import { clearConversationCache, nativeConversationCache } from './native-cache';
import { nativeCarrier } from './native-carrier';
import { nativeNotifications } from './native-notifications';
import { createHostPush } from './push';
import { createPushSession, type PushStatus } from './push-session';
import { loadSavedHosts, saveHosts, type SavedHost } from './saved-host';
import { locale, t } from '../ui/strings';

export interface HostSessionState {
  saved: SavedHost | null | undefined;
  hosts: SavedHost[];
  client: HostClient | undefined;
  inbox: Inbox | undefined;
}

const listeners = new Set<() => void>();
let state: HostSessionState = { saved: undefined, hosts: [], client: undefined, inbox: undefined };
let stored: SavedHosts = { hosts: [] };
let offInbox: (() => void) | undefined;
let offConnection: (() => void) | undefined;

export const hostPush = createHostPush(nativeCarrier());
export const pushSession = createPushSession({
  notifications: nativeNotifications(t.notificationsChannel),
  hostPush,
  platform: Platform.OS === 'android' ? 'android' : 'ios',
  locale: locale === 'zh' ? 'zh' : 'en',
});

function reflectInbox(hostId: string, inbox: Inbox): void {
  const snapshot = inbox.getSnapshot();
  if (snapshot.status !== 'ready') return;
  const unresolved = new Set(snapshot.sections.action.map((item) => item.id));
  pushSession.reflect(hostId, unresolved, unresolved.size);
}

function adopt(next: SavedHosts): void {
  const previous = state.saved;
  stored = next;
  const saved = currentHost(next) ?? null;
  if (
    previous !== undefined &&
    previous?.hostId === saved?.hostId &&
    previous?.credential === saved?.credential
  ) {
    state = { ...state, saved, hosts: next.hosts };
    for (const listener of listeners) listener();
    return;
  }
  offInbox?.();
  offConnection?.();
  state.inbox?.stop();
  state.client?.stop();
  const client =
    saved === null
      ? undefined
      : createHostClient({
          routes: saved.routes,
          credential: saved.credential,
          carrier: nativeCarrier(),
        });
  const inbox = client === undefined ? undefined : createInbox(client);
  offInbox =
    saved === null || inbox === undefined
      ? undefined
      : inbox.subscribe(() => reflectInbox(saved.hostId, inbox));
  let connected = false;
  offConnection = client?.subscribe(() => {
    const now = client.getSnapshot().connection.status === 'connected';
    if (now && !connected) void pushSession.retryFailed();
    connected = now;
  });
  state = { saved, hosts: next.hosts, client, inbox };
  client?.start();
  for (const listener of listeners) listener();
}

async function commit(next: SavedHosts): Promise<void> {
  await saveHosts(next);
  adopt(next);
}

void loadSavedHosts().then(
  (hosts) => {
    adopt(hosts);
    void pushSession.sync(hosts.hosts);
  },
  () => adopt({ hosts: [] }),
);

AppState.addEventListener('change', (next) => {
  if (next !== 'active') return;
  pushSession.reflectAgain();
  void pushSession.retryFailed();
  state.client?.retryNow();
  if (state.client?.getSnapshot().connection.status === 'connected') void state.inbox?.refresh();
});

export const hostSession = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getState: (): HostSessionState => state,
  async pair(host: SavedHost): Promise<void> {
    await commit(withHost(stored, host));
    void pushSession.enable(stored.hosts);
  },
  async switchTo(hostId: string): Promise<boolean> {
    if (stored.current === hostId) return true;
    const next = selectHost(stored, hostId);
    if (next === undefined) return false;
    await commit(next);
    return true;
  },
  async unpair(hostId?: string): Promise<void> {
    const host =
      hostId === undefined ? state.saved : stored.hosts.find((entry) => entry.hostId === hostId);
    if (host === null || host === undefined) return;
    const current = host.hostId === state.saved?.hostId;
    void pushSession.forget(host);
    await commit(withoutHost(stored, host.hostId));
    if (!current) return;
    try {
      clearConversationCache();
    } catch {}
  },
};

export function useHostSession(): HostSessionState {
  return useSyncExternalStore(hostSession.subscribe, hostSession.getState);
}

export function usePushStatus(): PushStatus {
  return useSyncExternalStore(pushSession.subscribe, pushSession.getSnapshot);
}

const detached: HostSnapshot = { connection: { status: 'stopped', route: '' } };

export function useHostSnapshot(client: HostClient | undefined): HostSnapshot {
  return useSyncExternalStore(
    useCallback((listener: () => void) => client?.subscribe(listener) ?? (() => {}), [client]),
    () => client?.getSnapshot() ?? detached,
  );
}

const idle: InboxSnapshot = { status: 'idle' };

export function useInbox(inbox: Inbox | undefined): InboxSnapshot {
  return useSyncExternalStore(
    useCallback((listener: () => void) => inbox?.subscribe(listener) ?? (() => {}), [inbox]),
    () => inbox?.getSnapshot() ?? idle,
  );
}

export interface DmTarget {
  slug: string;
  displayName?: string;
  dmChannelId?: string;
}

const conversations = new WeakMap<HostClient, Map<string, Conversation>>();

function conversationFor(
  client: HostClient,
  key: string,
  options: Omit<Parameters<typeof createConversation>[0], 'host' | 'cache'>,
): Conversation {
  let byKey = conversations.get(client);
  if (byKey === undefined) {
    byKey = new Map();
    conversations.set(client, byKey);
  }
  const existing = byKey.get(key);
  if (existing !== undefined) return existing;
  const inner = createConversation({ host: client, ...options, cache: nativeConversationCache });
  let watchers = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const conversation: Conversation = {
    ...inner,
    subscribe(listener) {
      watchers += 1;
      clearTimeout(idle);
      inner.start();
      const off = inner.subscribe(listener);
      return () => {
        off();
        watchers -= 1;
        if (watchers > 0) return;
        idle = setTimeout(() => {
          if (watchers > 0) return;
          inner.stop();
          byKey.delete(key);
        }, 0);
      };
    },
  };
  byKey.set(key, conversation);
  return conversation;
}

export function useConversation(
  client: HostClient | undefined,
  bot: DmTarget | undefined,
): Conversation | undefined {
  const slug = bot?.slug;
  return useMemo(
    () =>
      client === undefined || bot === undefined
        ? undefined
        : conversationFor(client, bot.slug, {
            botSlug: bot.slug,
            ...(bot.displayName === undefined ? {} : { displayName: bot.displayName }),
            ...(bot.dmChannelId === undefined ? {} : { channelId: bot.dmChannelId }),
          }),
    [client, slug],
  );
}

export function useChannelConversation(
  client: HostClient | undefined,
  channelId: string | undefined,
): Conversation | undefined {
  return useMemo(
    () =>
      client === undefined || channelId === undefined
        ? undefined
        : conversationFor(client, `channel:${channelId}`, {
            channelId,
            cacheKey: `channel:${channelId}`,
          }),
    [client, channelId],
  );
}

const closed: ConversationSnapshot = {
  status: 'opening',
  messages: [],
  drafts: [],
  hasOlder: false,
  loadingOlder: false,
  fromCache: false,
};

export function useConversationSnapshot(conversation: Conversation | undefined) {
  return useSyncExternalStore(
    useCallback(
      (listener: () => void) => conversation?.subscribe(listener) ?? (() => {}),
      [conversation],
    ),
    () => conversation?.getSnapshot() ?? closed,
  );
}
