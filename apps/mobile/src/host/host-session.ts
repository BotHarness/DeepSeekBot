import type { AccountOwner } from './account-owner';
import { removeAccountConnections } from './account-connections';
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
import { clearHostConversationCache, nativeConversationCache } from './native-cache';
import { conversationFilter } from './native-conversation-filter';
import { computerEnvironmentKey } from './conversation-environments';
import { nativeCarrier } from './native-carrier';
import { nativeNotifications } from './native-notifications';
import { notificationAvatars } from './native-notification-avatars';
import { avatarInputs } from './notification-avatars';
import { revokePairing } from './pairing';
import { createHostPush } from './push';
import { createPushSession, type PushStatus } from './push-session';
import { notificationPreferences } from './native-notification-preferences';
import { createQuietChannels } from './quiet-channels';
import { loadSavedHosts, saveHosts, type SavedHost } from './saved-host';
import { mobileTelemetry } from '../telemetry/native';
import { createConnectionTelemetry } from '../telemetry/connection';
import type { ConnectionTrigger } from '../telemetry/schema';
import { forgetRecentChats } from '../ui/shell/recent-chats';
import { locale, t } from '../ui/strings';

export interface HostSessionState {
  saved: SavedHost | null | undefined;
  hosts: SavedHost[];
  client: HostClient | undefined;
  inbox: Inbox | undefined;
}

const clientHosts = new WeakMap<HostClient, string>();
const listeners = new Set<() => void>();
const removalListeners = new Set<(host: SavedHost) => Promise<void>>();
export function onHostRemoval(listener: (host: SavedHost) => Promise<void>): () => void {
  removalListeners.add(listener);
  return () => {
    removalListeners.delete(listener);
  };
}
const clearPresentations = async (host: SavedHost) => {
  await Promise.allSettled([...removalListeners].map((listener) => listener(host)));
};
let state: HostSessionState = { saved: undefined, hosts: [], client: undefined, inbox: undefined };
let stored: SavedHosts = { hosts: [] };
let offInbox: (() => void) | undefined;
let offConnection: (() => void) | undefined;
let selectionIntent = 0;

export const hostPush = createHostPush(nativeCarrier());
export const pushSession = createPushSession({
  notifications: nativeNotifications(t.notificationsChannel, {
    always: t.alwaysAllow,
    approve: t.allowOnce,
    reject: t.reject,
    'remove-device': t.removeDevice,
  }),
  hostPush,
  beforeRegister: () => notificationPreferences.retry(),
  prepareRegistration: (host) => notificationPreferences.prepare(host),
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
  notificationPreferences.setForeground(AppState.currentState === 'active');
  const previous = state.saved;
  stored = next;
  void notificationPreferences.sync(next.hosts).catch(() => undefined);
  const saved = currentHost(next) ?? null;
  if (
    previous !== undefined &&
    previous?.hostId === saved?.hostId &&
    previous?.credential === saved?.credential
  ) {
    state = { ...state, saved, hosts: next.hosts };
    if (saved) state.client?.updateRoutes?.(saved.routes);
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
          ...saved,
          routes: saved.routes,
          credential: saved.credential,
          carrier: nativeCarrier(),
          telemetry: createConnectionTelemetry(mobileTelemetry, trigger),
          onRoutesChanged: (routes) =>
            serialize(async () => {
              const existing = stored.hosts.find((host) => host.hostId === saved.hostId);
              if (!existing || existing.credential !== saved.credential) return;
              await commit({
                ...stored,
                hosts: stored.hosts.map((host) =>
                  host.hostId === saved.hostId ? { ...host, routes } : host,
                ),
              });
              void pushSession.sync(stored.hosts);
            }),
        });
  if (client && saved) clientHosts.set(client, saved.hostId);
  const inbox = client === undefined ? undefined : createInbox(client);
  offInbox =
    saved === null || inbox === undefined
      ? undefined
      : inbox.subscribe(() => reflectInbox(saved.hostId, inbox));
  let connected = false;
  let avatars: string | undefined;
  let avatarRetryAt = Infinity;
  offConnection = client?.subscribe(() => {
    const snapshot = client.getSnapshot();
    const now = snapshot.connection.status === 'connected';
    if (now && !connected) {
      void pushSession.retryFailed();
      void notificationPreferences.retry().catch(() => undefined);
    }
    connected = now;
    const inputs = snapshot.roster === undefined ? undefined : avatarInputs(snapshot.roster);
    if (
      saved !== null &&
      snapshot.roster !== undefined &&
      (inputs !== avatars || Date.now() >= avatarRetryAt)
    ) {
      avatars = inputs;
      avatarRetryAt = Infinity;
      void notificationAvatars.sync(saved.hostId, snapshot.roster).then((complete) => {
        if (!complete && avatars === inputs) avatarRetryAt = Date.now() + 60_000;
      });
    }
  });
  state = { saved, hosts: next.hosts, client, inbox };
  client?.start();
  for (const listener of listeners) listener();
}

async function commit(
  next: SavedHosts,
  trigger: ConnectionTrigger = 'switch',
  current: () => boolean = () => true,
): Promise<boolean> {
  if (!current()) return false;
  await saveHosts(next);
  if (!current()) {
    await saveHosts(stored);
    return false;
  }
  adopt(next, trigger);
  return true;
}

let hostsLoaded = false;
const restoreHosts = (hosts: SavedHosts) => {
  adopt(hosts);
  hostsLoaded = true;
  void pushSession.sync(hosts.hosts);
};
const hostsReady = loadSavedHosts().then(restoreHosts, () => adopt({ hosts: [] }));

AppState.addEventListener('change', (next) => {
  mobileTelemetry.foreground(next === 'active', state.hosts.length);
  notificationPreferences.setForeground(next === 'active');
  if (next !== 'active') return;
  void notificationPreferences.retry().catch(() => undefined);
  pushSession.reflectAgain();
  void pushSession.retryFailed();
  state.client?.retryNow('resume');
  if (state.client?.getSnapshot().connection.status === 'connected') void state.inbox?.refresh();
});

let mutation: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = mutation.then(async () => {
    await hostsReady;
    if (!hostsLoaded) restoreHosts(await loadSavedHosts());
    return work();
  });
  mutation = next.catch(() => undefined);
  return next;
}

export const hostSession = {
  async replaceApprovedPairing(host: SavedHost, previousCredential: string): Promise<void> {
    return serialize(async () => {
      const previous = stored.hosts.find((item) => item.hostId === host.hostId);
      if (
        !previous ||
        previous.credential !== previousCredential ||
        (previous.encryption && previous.encryption.hostKey !== host.encryption?.hostKey)
      )
        throw new Error('pairing-changed');
      const replacement = {
        ...host,
        ...(previous.accountOwner ? { accountOwner: previous.accountOwner } : {}),
      };
      await commit({
        ...stored,
        hosts: stored.hosts.map((item) => (item.hostId === host.hostId ? replacement : item)),
      });
      void pushSession.sync(stored.hosts);
      void revokePairing({ host: previous, carrier: nativeCarrier() });
    });
  },
  async updateRoutes(hostId: string, credential: string, routes: string[]): Promise<void> {
    return serialize(async () => {
      const existing = stored.hosts.find((host) => host.hostId === hostId);
      if (!existing || existing.credential !== credential) throw new Error('pairing-changed');
      await commit({
        ...stored,
        hosts: stored.hosts.map((host) => (host.hostId === hostId ? { ...host, routes } : host)),
      });
      void pushSession.sync(stored.hosts);
    });
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getState: (): HostSessionState => state,
  getSelectionRevision: (): number => selectionIntent,
  async pair(host: SavedHost): Promise<void> {
    selectionIntent++;
    return serialize(async () => {
      await commit(withHost(stored, host), 'pair');
      void pushSession.enable(stored.hosts);
    });
  },
  async switchTo(hostId: string, current: () => boolean = () => true): Promise<boolean> {
    const intent = ++selectionIntent;
    const ownsSelection = () => current() && intent === selectionIntent;
    if (!ownsSelection()) return false;
    if (hostsLoaded && stored.current === hostId) return true;
    return serialize(async () => {
      if (!ownsSelection()) return false;
      if (stored.current === hostId) return true;
      const next = selectHost(stored, hostId);
      if (next === undefined) return false;
      return commit(next, 'switch', ownsSelection);
    });
  },
  async removeAccount(owner: AccountOwner): Promise<void> {
    selectionIntent++;
    return serialize(async () => {
      await sourceDrafts.ready;
      await removeAccountConnections({
        owner,
        state: stored,
        persist: saveHosts,
        adopt,
        clearLocal: async (host) => {
          await clearPresentations(host);
          await sourceDrafts.removePersistedWhere((key) => {
            try {
              const parts = JSON.parse(key);
              return parts[0] === 'computer' && parts[1] === host.hostId;
            } catch {
              return false;
            }
          });
          clearHostConversationCache(host.hostId);
          await forgetRecentChats(host.hostId);
          await conversationFilter.clearPersisted(computerEnvironmentKey(host.hostId));
          await pushSession.forget(host).catch(() => undefined);
        },
      });
    });
  },
  async unpair(
    hostId?: string,
  ): Promise<{ current: boolean; revoked: Promise<boolean> } | undefined> {
    selectionIntent++;
    return serialize(async () => {
      const host =
        hostId === undefined ? state.saved : stored.hosts.find((entry) => entry.hostId === hostId);
      if (host === null || host === undefined) return undefined;
      const current = host.hostId === state.saved?.hostId;
      await sourceDrafts.ready;
      sourceDrafts.removeWhere((key) => {
        try {
          const parts = JSON.parse(key);
          return parts[0] === 'computer' && parts[1] === host.hostId;
        } catch {
          return false;
        }
      });
      await clearPresentations(host);
      await commit(withoutHost(stored, host.hostId));
      try {
        clearHostConversationCache(host.hostId);
      } catch {}
      void forgetRecentChats(host.hostId).catch(() => undefined);
      void conversationFilter.ready.then(() => {
        if (conversationFilter.getSnapshot() === computerEnvironmentKey(host.hostId))
          conversationFilter.set('all');
      });
      const revoked = pushSession
        .forget(host)
        .then(() => revokePairing({ host, carrier: nativeCarrier() }))
        .then((result) => result === 'revoked');
      return { current, revoked };
    });
  },
};

export function useHostSession(): HostSessionState {
  return useSyncExternalStore(hostSession.subscribe, hostSession.getState);
}

export function usePushStatus(): PushStatus {
  return useSyncExternalStore(pushSession.subscribe, pushSession.getSnapshot);
}

export const quietChannels = createQuietChannels();

export function refreshQuietChannels(saved: SavedHost): void {
  if (pushSession.getSnapshot().status !== 'on') return;
  hostPush.settings(saved).then(
    (settings) => quietChannels.set(saved.hostId, settings.quietChannelIds),
    () => undefined,
  );
}

export function useQuietChannels(hostId: string | undefined): readonly string[] {
  return useSyncExternalStore(quietChannels.subscribe, () => quietChannels.get(hostId));
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
  const existing = byKey.get(key);
  if (existing !== undefined) return existing;
  const inner = createConversation({
    host: client,
    ...options,
    cache: nativeConversationCache,
    cacheKey: JSON.stringify(['computer', clientHosts.get(client), key]),
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
