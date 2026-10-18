import { createHostTransitions } from './host-transitions';
import { sourceDrafts } from './native-source-drafts';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Platform } from 'react-native';

import { createHostClient, type HostClient, type HostSnapshot } from './client';
import { createInbox, type Inbox, type InboxSnapshot } from './inbox';
import { createConversation, type Conversation, type ConversationSnapshot } from './conversation';
import { createConversationPlayback, type ConversationPlayback } from './conversation-playback';
import { useVisibleSnapshot } from './use-visible-snapshot';
import { currentHost, selectHost, withHost, withoutHost, type SavedHosts } from './hosts';
import { retainedCache } from './native-cache';
import { nativeCarrier } from './native-carrier';
import { nativeNotifications } from './native-notifications';
import { createHostPush } from './push';
import { createPushSession, type PushStatus } from './push-session';
import { loadSavedHosts, saveHosts, type SavedHost } from './saved-host';
import { mobileTelemetry } from '../telemetry/native';
import { createConnectionTelemetry } from '../telemetry/connection';
import type { ConnectionTrigger } from '../telemetry/schema';
import type { ComputerCacheSource, RetainedTarget } from './retained-search';
import { locale, t } from '../ui/strings';

export interface HostSessionState {
  saved: SavedHost | null | undefined;
  hosts: SavedHost[];
  client: HostClient | undefined;
  inbox: Inbox | undefined;
}

const clientHosts = new WeakMap<HostClient, ComputerCacheSource>();
const listeners = new Set<() => void>();
let state: HostSessionState = { saved: undefined, hosts: [], client: undefined, inbox: undefined };
let stored: SavedHosts = { hosts: [] };
let offInbox: (() => void) | undefined;
let offConnection: (() => void) | undefined;

export const hostPush = createHostPush(nativeCarrier());
export const pushSession = createPushSession({
  notifications: nativeNotifications(t.notificationsChannel, {
    always: t.alwaysAllow,
    approve: t.allowOnce,
    reject: t.reject,
  }),
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

function adopt(next: SavedHosts, trigger: ConnectionTrigger = 'open'): void {
  mobileTelemetry.foreground(AppState.currentState === 'active', next.hosts.length);
  const previous = state.saved;
  stored = next;
  const saved = currentHost(next) ?? null;
  if (
    previous !== undefined &&
    previous?.hostId === saved?.hostId &&
    previous?.credential === saved?.credential &&
    previous?.deviceId === saved?.deviceId
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
          telemetry: createConnectionTelemetry(mobileTelemetry, trigger),
        });
  if (client && saved) clientHosts.set(client, { hostId: saved.hostId, deviceId: saved.deviceId });
  const inbox = client === undefined ? undefined : createInbox(client);
  offInbox =
    saved === null || inbox === undefined
      ? undefined
      : inbox.subscribe(() => reflectInbox(saved.hostId, inbox));
  let connected = false;
  offConnection = client?.subscribe(() => {
    const status = client.getSnapshot().connection.status;
    const now = status === 'connected';
    if (saved && status === 'refused') retainedCache.forget(saved);
    if (saved && now) retainedCache.authorize(saved);
    if (now && !connected) void pushSession.retryFailed();
    connected = now;
  });
  state = { saved, hosts: next.hosts, client, inbox };
  client?.start();
  for (const listener of listeners) listener();
}

const commit = createHostTransitions<ConnectionTrigger>({
  read: () => stored,
  save: saveHosts,
  adopt,
});

void loadSavedHosts().then(
  (hosts) => {
    adopt(hosts);
    void pushSession.sync(hosts.hosts);
  },
  () => adopt({ hosts: [] }),
);

AppState.addEventListener('change', (next) => {
  mobileTelemetry.foreground(next === 'active', state.hosts.length);
  if (next !== 'active') return;
  pushSession.reflectAgain();
  void pushSession.retryFailed();
  state.client?.retryNow('resume');
  if (state.client?.getSnapshot().connection.status === 'connected') void state.inbox?.refresh();
});

export const hostSession = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getState: (): HostSessionState => state,
  async pair(host: SavedHost): Promise<void> {
    const previous = stored.hosts.find((item) => item.hostId === host.hostId);
    if (
      previous &&
      (previous.deviceId !== host.deviceId || previous.credential !== host.credential)
    )
      retainedCache.forget(previous);
    await commit((current) => withHost(current, host), 'pair');
    void pushSession.enable(stored.hosts);
  },
  async switchTo(hostId: string, valid = () => true): Promise<boolean> {
    if (stored.current === hostId) return valid();
    return commit((current) => selectHost(current, hostId), 'switch', valid);
  },
  async unpair(hostId?: string): Promise<void> {
    const host =
      hostId === undefined ? state.saved : stored.hosts.find((entry) => entry.hostId === hostId);
    if (host === null || host === undefined) return;
    retainedCache.forget(host);
    void pushSession.forget(host);
    await sourceDrafts.ready;
    sourceDrafts.removeWhere((key) => {
      try {
        const parts = JSON.parse(key);
        return parts[0] === 'computer' && parts[1] === host.hostId;
      } catch {
        return false;
      }
    });
    await commit((current) => withoutHost(current, host.hostId), 'switch');
  },
};

export function useHostSession(): HostSessionState {
  return useSyncExternalStore(hostSession.subscribe, hostSession.getState);
}

export function usePushStatus(): PushStatus {
  return useSyncExternalStore(pushSession.subscribe, pushSession.getSnapshot);
}

const detached: HostSnapshot = { connection: { status: 'stopped', route: '' } };
const detachedSource = { getSnapshot: () => detached, subscribe: () => () => {} };

export function useHostSnapshot(client: HostClient | undefined, visible = true): HostSnapshot {
  return useVisibleSnapshot(client ?? detachedSource, visible);
}

const idle: InboxSnapshot = { status: 'idle' };
const idleSource = { getSnapshot: () => idle, subscribe: () => () => {} };

export function useInbox(inbox: Inbox | undefined, visible = true): InboxSnapshot {
  return useVisibleSnapshot(inbox ?? idleSource, visible);
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
  const instanceKey = `${key}:${options.retainedOnly === true ? 'retained' : 'live'}`;
  const existing = byKey.get(instanceKey);
  if (existing !== undefined) return existing;
  const source = clientHosts.get(client);
  const descriptor = (): RetainedTarget => {
    const roster = client.getSnapshot().roster;
    return options.botSlug === undefined
      ? {
          kind: 'channel',
          id: options.channelId!,
          name:
            roster?.channels.find((c) => c.id === options.channelId)?.name ?? options.channelId!,
        }
      : {
          kind: 'dm',
          id: options.botSlug,
          name:
            roster?.bots.find((b) => b.slug === options.botSlug)?.displayName ??
            options.displayName ??
            options.botSlug,
        };
  };
  const inner = createConversation({
    host: client,
    ...options,
    ...(source ? { cache: retainedCache.conversation(source, descriptor) } : {}),
    cacheKey: key,
    telemetry: { send: () => mobileTelemetry.send(options.botSlug === undefined ? 'group' : 'dm') },
  });
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
          byKey.delete(instanceKey);
        }, 0);
      };
    },
  };
  byKey.set(instanceKey, conversation);
  return conversation;
}

export function useConversation(
  client: HostClient | undefined,
  bot: DmTarget | undefined,
  retainedOnly = false,
): Conversation | undefined {
  const slug = bot?.slug;
  return useMemo(
    () =>
      client === undefined || bot === undefined
        ? undefined
        : conversationFor(client, bot.slug, {
            botSlug: bot.slug,
            retainedOnly,
            ...(bot.displayName === undefined ? {} : { displayName: bot.displayName }),
            ...(bot.dmChannelId === undefined ? {} : { channelId: bot.dmChannelId }),
          }),
    [client, slug, retainedOnly],
  );
}

export function useChannelConversation(
  client: HostClient | undefined,
  channelId: string | undefined,
  retainedOnly = false,
): Conversation | undefined {
  return useMemo(
    () =>
      client === undefined || channelId === undefined
        ? undefined
        : conversationFor(client, `channel:${channelId}`, {
            channelId,
            retainedOnly,
            cacheKey: `channel:${channelId}`,
          }),
    [client, channelId, retainedOnly],
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

function useConversationForeground(
  conversation: Conversation | undefined,
  playback?: ConversationPlayback,
) {
  useFocusEffect(
    useCallback(() => {
      const foreground = (active: boolean) => {
        conversation?.setForeground?.(active);
        playback?.setActive(active);
      };
      foreground(AppState.currentState === 'active');
      const subscription = AppState.addEventListener('change', (next) =>
        foreground(next === 'active'),
      );
      return () => {
        subscription.remove();
        foreground(false);
      };
    }, [conversation, playback]),
  );
}

export function useConversationSnapshot(conversation: Conversation | undefined) {
  useConversationForeground(conversation);
  return useSyncExternalStore(
    useCallback(
      (listener: () => void) => conversation?.subscribe(listener) ?? (() => {}),
      [conversation],
    ),
    () => conversation?.getSnapshot() ?? closed,
  );
}

export function useStreamPlayback(conversation: Conversation | undefined, enabled: boolean) {
  return useMemo(
    () =>
      conversation === undefined || !enabled ? undefined : createConversationPlayback(conversation),
    [conversation, enabled],
  );
}

export function useConversationTimelineSnapshot(
  conversation: Conversation | undefined,
  playback?: ConversationPlayback,
) {
  useConversationForeground(conversation, playback);
  return useSyncExternalStore(
    useCallback(
      (listener: () => void) => (playback ?? conversation)?.subscribe(listener) ?? (() => {}),
      [conversation, playback],
    ),
    () => conversation?.getTimelineSnapshot() ?? closed,
  );
}
