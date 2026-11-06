import { hostStore, hostStoreAvailable } from './host-store';
import type { AccountOwner } from './account-owner';
import { removeAccountConnections } from './account-connections';
import { sourceDrafts } from './native-source-drafts';
import { use, useCallback, useMemo, useSyncExternalStore } from 'react';
import { HostScope } from './host-scope';
import { useFocusEffect } from 'expo-router';
import { AppState, Platform } from 'react-native';

import { createHostClient, type HostClient, type HostSnapshot } from './client';
import { createInbox, type Inbox, type InboxSnapshot } from './inbox';
import { createConversation, type Conversation, type ConversationSnapshot } from './conversation';
import { createConversationPlayback, type ConversationPlayback } from './conversation-playback';
import { useVisibleSnapshot } from './use-visible-snapshot';
import { hostAvailabilitySource } from './host-availability';
import { currentHost, selectHost, withHost, withoutHost, type SavedHosts } from './hosts';
import {
  catchUpHostConversations,
  conversationCache,
  conversationCacheWaitMs,
  forgetHostConversations,
  pruneHostConversations,
  warmHostConversations,
} from './native-conversations';
import { purgeCaches } from './purge-caches';
import { watchDisbandedGroups } from './disbanded-groups';
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
import { connectionMode } from './native-connection-mode';
import { createDeviceAlerts } from './device-alerts';
import { alertBanners } from './alert-banners';
import { createConnectionLifetime } from './connection-lifetime';
import { connectionSummary } from './connection-summary';
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

export interface ConnectedHost {
  saved: SavedHost;
  client: HostClient;
  inbox: Inbox;
  snapshot: HostSnapshot;
  attention: InboxSnapshot;
}

const sessions = new Map<string, { host: ConnectedHost; dispose(): void }>();
const connectionLifetime = createConnectionLifetime(AppState.currentState === 'active');
const feedListeners = new Set<() => void>();
const visibleConversations = new Map<Conversation, { hostId: string; channelId: string }>();
let feeds: readonly ConnectedHost[] = [];
function publishFeeds(): void {
  feeds = [...sessions.values()].map(({ host }) => ({
    ...host,
    snapshot: host.client.getSnapshot(),
    attention: host.inbox.getSnapshot(),
  }));
  for (const listener of feedListeners) listener();
  scheduleAlerts();
}

const deviceAlerts = createDeviceAlerts(connectionMode, {
  ready: notificationPreferences.ready,
  failed: () => connectionMode.reportAlertFailure(),
  read: () => {
    const preferences = notificationPreferences.getSnapshot().preferences;
    const enabled = preferences !== undefined && Object.values(preferences).some(Boolean);
    return {
      approvalsEnabled: enabled,
      ...(preferences ? { preferences } : {}),
      hosts: feeds
        .filter((host) => host.snapshot.connection.status !== 'refused')
        .map((host) => ({
          hostId: host.saved.hostId,
          hostName: host.saved.hostName,
          language: locale,
          connected: host.snapshot.connection.status === 'connected',
          items:
            host.attention.status === 'ready' && !host.attention.stale
              ? host.attention.notificationItems
              : undefined,
          foreground: AppState.currentState === 'active',
          approvalsEnabled: enabled,
          botName: (slug: string) =>
            host.snapshot.roster?.bots.find((bot) => bot.slug === slug)?.displayName,
          approvalText: t.localApprovalText,
          ...(preferences ? { preferences } : {}),
          quietChannelIds: quietChannels.get(host.saved.hostId),
          visibleChannelId: [...visibleConversations.values()].find(
            (entry) => entry.hostId === host.saved.hostId,
          )?.channelId,
          text: {
            approval: t.localApprovalText,
            question: t.localQuestionText,
            'private-input': t.localPrivateInputText,
            reply: t.localReplyText,
          },
        })),
    };
  },
});
function scheduleAlerts(): void {
  if (!connectionMode.supported) return;
  connectionMode.updateSummary(
    connectionSummary(
      feeds.map((host) => ({
        hostId: host.saved.hostId,
        enabled: connectionLifetime.backgroundAllowed(host.client),
        snapshot: host.snapshot,
        attention: host.attention,
      })),
    ),
    locale,
  );
  deviceAlerts.refresh();
}
if (connectionMode.supported) notificationPreferences.subscribe(scheduleAlerts);
let previousMode = connectionMode.getSnapshot();
connectionMode.subscribe(() => {
  const mode = connectionMode.getSnapshot();
  if (mode.enabled === previousMode.enabled && mode.running === previousMode.running) return;
  previousMode = mode;
  deviceAlerts.invalidate();
  connectionLifetime.backgroundRunning(connectionMode.getSnapshot().running);
  scheduleAlerts();
});

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
  await deviceAlerts.forget(host.hostId);
  await Promise.allSettled([...removalListeners].map((listener) => listener(host)));
};
export function setHostNotificationsEnabled(hostId: string, enabled: boolean): void {
  deviceAlerts.setHostEnabled(hostId, enabled);
  const client = sessions.get(hostId)?.host.client;
  if (client) connectionLifetime.allowBackground(client, enabled);
  scheduleAlerts();
}
let state: HostSessionState = { saved: undefined, hosts: [], client: undefined, inbox: undefined };
let stored: SavedHosts = { hosts: [] };
let selectionIntent = 0;
let sourceChangeRevision = 0;

export const hostPush = createHostPush(nativeCarrier());
export const pushSession = createPushSession({
  notifications: nativeNotifications(t.notificationsChannel, {
    always: t.alwaysAllow,
    approve: t.allowOnce,
    reject: t.reject,
    'remove-device': t.removeDevice,
  }),
  hostPush: {
    ...hostPush,
    register: (host, registration) =>
      notificationPreferences.withPrepared(host, () => hostPush.register(host, registration)),
  },
  beforeRegister: () => notificationPreferences.ready,
  platform: Platform.OS === 'android' ? 'android' : 'ios',
  locale: locale === 'zh' ? 'zh' : 'en',
});

function reflectInbox(hostId: string, inbox: Inbox): void {
  const snapshot = inbox.getSnapshot();
  if (snapshot.status !== 'ready') return;
  if (connectionMode.supported && snapshot.notificationItems === undefined) return;
  const unresolved = new Set(
    (snapshot.notificationItems ?? snapshot.sections.action)
      .filter((item) => item.category === 'action')
      .map((item) => item.id),
  );
  pushSession.reflect(hostId, unresolved, unresolved.size);
}

connectionMode.onApproval(({ hostId, itemId }) => {
  const host = sessions.get(hostId)?.host;
  if (
    !host ||
    !deviceAlerts.includes(hostId) ||
    host.client.getSnapshot().connection.status !== 'connected'
  )
    return;
  void host.inbox
    .refresh()
    .then(async () => {
      const latest = host.inbox.getSnapshot();
      if (
        sessions.get(hostId)?.host !== host ||
        latest.status !== 'ready' ||
        latest.stale ||
        latest.notificationItems === undefined
      )
        return;
      if (!latest.notificationItems.some((item) => item.id === itemId))
        await connectionMode.verifiedAbsent(hostId, itemId);
    })
    .catch(() => connectionMode.reportAlertFailure());
});

function connect(saved: SavedHost, trigger: ConnectionTrigger) {
  deviceAlerts.paired(saved.hostId);
  const client = createHostClient({
    ...saved,
    onPurged: (placements) => {
      const fresh = purgeCaches.apply(saved.hostId, placements);
      if (fresh.length === 0) return;
      for (const conversation of conversations.get(client)?.values() ?? [])
        conversation.redact?.(fresh);
    },
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
    routes: saved.routes,
    credential: saved.credential,
    carrier: nativeCarrier(),
    localStore: () => (hostStoreAvailable() ? hostStore(saved.hostId) : Promise.resolve(undefined)),
    telemetry: createConnectionTelemetry(mobileTelemetry, trigger),
  });
  clientHosts.set(client, saved.hostId);
  warmHostConversations(saved.hostId);
  const inbox = createInbox(client, { notifications: connectionMode.supported });
  const offInbox = inbox.subscribe(() => {
    reflectInbox(saved.hostId, inbox);
    publishFeeds();
  });

  let connected = false;
  let revoked = false;
  let disposed = false;
  let avatars: string | undefined;
  let avatarRetryAt = Infinity;
  const disbanded = watchDisbandedGroups();
  const offConnection = client.subscribe(() => {
    const snapshot = client.getSnapshot();
    if (snapshot.connection.status === 'refused' && deviceAlerts.includes(saved.hostId)) {
      connectionLifetime.refused(client);
      void clearPresentations(saved).catch(() => connectionMode.reportAlertFailure());
    }
    if (snapshot.roster !== undefined) {
      const change = disbanded(snapshot.roster);
      const live = conversations.get(client);
      const ended = new Set(change.gone.map((id) => `channel:${id}`));
      for (const key of live?.keys() ?? []) if (change.stale?.(key)) ended.add(key);
      for (const key of ended) {
        live?.get(key)?.stop();
        live?.delete(key);
      }
      if (saved !== null && change.stale !== undefined)
        pruneHostConversations(saved.hostId, change.stale);
    }
    if (
      snapshot.connection.status === 'refused' &&
      snapshot.connection.code === 'device-revoked' &&
      !revoked
    ) {
      revoked = true;
      const live = conversations.get(client);
      for (const conversation of live?.values() ?? []) conversation.stop();
      live?.clear();
      try {
        forgetHostConversations(saved.hostId);
      } catch {}
      purgeCaches.forgetHost(saved.hostId);
    }
    const now = snapshot.connection.status === 'connected';
    if (now && !connected) {
      if (connectionMode.supported)
        void hostPush
          .settings(saved)
          .then((settings) => {
            if (
              sessions.get(saved.hostId)?.host.client === client &&
              client.getSnapshot().connection.status !== 'refused'
            ) {
              quietChannels.set(saved.hostId, settings.quietChannelIds);
              setHostNotificationsEnabled(saved.hostId, settings.enabled);
            }
          })
          .catch(() => undefined);
      void pushSession.retryFailed();
      void notificationPreferences.retry().catch(() => undefined);
      catchUpHostConversations(
        saved.hostId,
        (method, args) =>
          disposed
            ? Promise.reject(new Error('This Computer session has ended.'))
            : client.call(method, args),
        () => liveKeys(client, saved.hostId),
      );
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
    publishFeeds();
  });
  return {
    host: { saved, client, inbox, snapshot: client.getSnapshot(), attention: inbox.getSnapshot() },
    dispose() {
      disposed = true;
      offInbox();
      offConnection();
      inbox.stop();
      for (const conversation of conversations.get(client)?.values() ?? []) conversation.stop();
      conversations.delete(client);
      if (connectionMode.supported) connectionLifetime.remove(client);
      else client.stop();
    },
  };
}

function adopt(next: SavedHosts, trigger: ConnectionTrigger = 'open'): void {
  const previous = state.saved;
  mobileTelemetry.foreground(AppState.currentState === 'active', next.hosts.length);
  notificationPreferences.setForeground(AppState.currentState === 'active');
  stored = next;
  void notificationPreferences.sync(next.hosts).catch(() => undefined);
  for (const [id, session] of sessions) {
    const saved = next.hosts.find((host) => host.hostId === id);
    if (
      !saved ||
      saved.credential !== session.host.saved.credential ||
      JSON.stringify(saved.encryption) !== JSON.stringify(session.host.saved.encryption)
    ) {
      sessions.delete(id);
      session.dispose();
    }
  }
  for (const saved of next.hosts) {
    const existing = sessions.get(saved.hostId);
    if (existing) {
      existing.host.saved = saved;
      existing.host.client.updateRoutes?.(saved.routes);
      continue;
    }
    const session = connect(saved, trigger);
    sessions.set(saved.hostId, session);
    if (connectionMode.supported) connectionLifetime.add(session.host.client);
    else session.host.client.start();
  }
  connectionLifetime.backgroundRunning(connectionMode.getSnapshot().running);
  const saved = currentHost(next) ?? null;
  const selected = saved ? sessions.get(saved.hostId)?.host : undefined;
  if (
    previous !== undefined &&
    (previous?.hostId !== saved?.hostId ||
      previous?.deviceId !== saved?.deviceId ||
      previous?.credential !== saved?.credential ||
      JSON.stringify(previous?.encryption) !== JSON.stringify(saved?.encryption))
  )
    sourceChangeRevision++;
  state = { saved, hosts: next.hosts, client: selected?.client, inbox: selected?.inbox };
  publishFeeds();
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
  if (AppState.currentState === 'active') void connectionMode.resume().catch(() => undefined);
};
const hostsReady = loadSavedHosts().then(restoreHosts, () => adopt({ hosts: [] }));

AppState.addEventListener('change', (next) => {
  if (next === 'active') deviceAlerts.invalidate();
  else alertBanners.clear();
  connectionLifetime.foreground(next === 'active');
  mobileTelemetry.foreground(next === 'active', state.hosts.length);
  notificationPreferences.setForeground(next === 'active');
  scheduleAlerts();
  if (next !== 'active') return;
  void connectionMode.resume().catch(() => undefined);
  void notificationPreferences.retry().catch(() => undefined);
  pushSession.reflectAgain();
  void pushSession.refreshPermission();
  for (const { host } of sessions.values()) {
    host.client.retryNow('resume');
    if (host.client.getSnapshot().connection.status === 'connected') void host.inbox.refresh();
  }
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
  getHost: (hostId: string): ConnectedHost | undefined =>
    feeds.find((host) => host.saved.hostId === hostId),
  getSelectionRevision: (): number => selectionIntent,
  getSourceChangeRevision: (): number => sourceChangeRevision,
  async pair(host: SavedHost): Promise<void> {
    selectionIntent++;
    if (state.saved?.hostId !== host.hostId) sourceChangeRevision++;
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
    if (stored.hosts.some((host) => host.hostId === hostId)) sourceChangeRevision++;
    return serialize(async () => {
      if (!ownsSelection()) return false;
      if (stored.current === hostId) return true;
      const next = selectHost(stored, hostId);
      if (next === undefined) return false;
      sourceChangeRevision++;
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
          forgetHostConversations(host.hostId);
          purgeCaches.forgetHost(host.hostId);
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
        forgetHostConversations(host.hostId);
        purgeCaches.forgetHost(host.hostId);
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

export function useHostSession(hostId?: string): HostSessionState {
  const scope = use(HostScope);
  const selected = useSyncExternalStore(hostSession.subscribe, hostSession.getState);
  const id = hostId ?? scope;
  return useMemo(() => {
    if (id === undefined) return selected;
    const host = sessions.get(id)?.host;
    return {
      hosts: selected.hosts,
      saved: selected.saved === undefined ? undefined : (host?.saved ?? null),
      client: host?.client,
      inbox: host?.inbox,
    };
  }, [selected, id]);
}

const feedSource = {
  subscribe(listener: () => void) {
    feedListeners.add(listener);
    return () => {
      feedListeners.delete(listener);
    };
  },
  getSnapshot: () => feeds,
};

export function useHostSessions(visible = true): readonly ConnectedHost[] {
  return useVisibleSnapshot(feedSource, visible);
}

export function useConnectionSummary() {
  const current = useHostSessions();
  return connectionSummary(
    current.map((host) => ({
      hostId: host.saved.hostId,
      enabled: connectionLifetime.backgroundAllowed(host.client),
      snapshot: host.snapshot,
      attention: host.attention,
    })),
  );
}

const availability = hostAvailabilitySource(feedSource);

export function useHostAvailability(visible = true) {
  return useVisibleSnapshot(availability, visible);
}

export function usePushStatus(): PushStatus {
  return useSyncExternalStore(pushSession.subscribe, pushSession.getSnapshot);
}

export const quietChannels = createQuietChannels();
quietChannels.subscribe(publishFeeds);

export function refreshQuietChannels(saved: SavedHost): void {
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

function liveKeys(client: HostClient, hostId: string): string[] {
  return [...(conversations.get(client)?.keys() ?? [])].map((key) =>
    JSON.stringify(['computer', hostId, key]),
  );
}

export function liveConversationKeys(hostId: string): string[] {
  const client = sessions.get(hostId)?.host.client;
  return client === undefined ? [] : liveKeys(client, hostId);
}
const preparedConversations = new WeakMap<
  HostClient,
  { conversation: Conversation; release(): void }
>();

function releasePreparedConversation(client: HostClient, conversation?: Conversation): void {
  const prepared = preparedConversations.get(client);
  if (prepared && (conversation === undefined || prepared.conversation === conversation))
    prepared.release();
}

export function prepareConversation(
  client: HostClient,
  hostId: string,
  target: { channelId: string; bot?: DmTarget },
): void {
  if (sessions.get(hostId)?.host.client !== client) return;
  const roster = client.getSnapshot().roster;
  const { channelId, bot } = target;
  const available = bot
    ? roster?.bots.some((entry) => entry.slug === bot.slug && entry.dmChannelId === channelId)
    : roster?.channels.some((entry) => entry.id === channelId) ||
      roster?.activityChannels?.some((entry) => entry.id === channelId);
  if (!available) return;
  releasePreparedConversation(client);
  const conversation = conversationFor(
    client,
    bot?.slug ?? `channel:${channelId}`,
    bot
      ? {
          botSlug: bot.slug,
          ...(bot.displayName === undefined ? {} : { displayName: bot.displayName }),
          channelId,
        }
      : { channelId, cacheKey: `channel:${channelId}` },
  );
  const off = conversation.subscribe(() => {});
  const release = () => {
    if (preparedConversations.get(client)?.release !== release) return;
    preparedConversations.delete(client);
    clearTimeout(timeout);
    off();
  };
  const timeout = setTimeout(release, 2_000);
  preparedConversations.set(client, { conversation, release });
}

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
  const cacheWaitMs = conversationCacheWaitMs();
  const cacheWait = cacheWaitMs === undefined ? {} : { cacheWaitMs };
  const inner = createConversation({
    host: client,
    ...options,
    cache: conversationCache(),
    ...cacheWait,
    cacheKey: JSON.stringify(['computer', clientHosts.get(client), key]),
    telemetry: { send: () => mobileTelemetry.send(options.botSlug === undefined ? 'group' : 'dm') },
  });
  let watchers = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let offRetained: (() => void) | undefined;
  const reconcileIdle = () => {
    if (watchers > 0) return;
    const outgoing = inner
      .getSnapshot()
      .messages.filter((message) => message.author === 'human' && message.revision === undefined);
    if (outgoing.length > 0) {
      if (outgoing.every((message) => message.delivery === 'failed')) inner.stop();
      return;
    }
    offRetained?.();
    offRetained = undefined;
    inner.stop();
    if (byKey.get(key) === conversation) byKey.delete(key);
  };
  const conversation: Conversation = {
    ...inner,
    setForeground(active) {
      inner.setForeground?.(active);
      const hostId = clientHosts.get(client);
      if (active && hostId && options.channelId)
        visibleConversations.set(conversation, { hostId, channelId: options.channelId });
      else visibleConversations.delete(conversation);
      scheduleAlerts();
    },
    stop() {
      visibleConversations.delete(conversation);
      releasePreparedConversation(client, conversation);
      clearTimeout(idle);
      offRetained?.();
      offRetained = undefined;
      inner.stop();
      if (byKey.get(key) === conversation) byKey.delete(key);
    },
    subscribe(listener) {
      watchers += 1;
      clearTimeout(idle);
      offRetained?.();
      offRetained = undefined;
      inner.start();
      const off = inner.subscribe(listener);
      releasePreparedConversation(client, conversation);
      return () => {
        off();
        watchers -= 1;
        if (watchers > 0) return;
        idle = setTimeout(() => {
          if (watchers > 0) return;
          offRetained = inner.subscribe(reconcileIdle);
          reconcileIdle();
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
  const source = channelId === undefined ? detachedSource : (client ?? detachedSource);
  const available = useSyncExternalStore(
    source.subscribe,
    useCallback(() => {
      const roster = source.getSnapshot().roster;
      return (
        roster === undefined ||
        roster.channels.some((channel) => channel.id === channelId) ||
        roster.activityChannels?.some((channel) => channel.id === channelId) === true
      );
    }, [source, channelId]),
  );
  return useMemo(
    () =>
      client === undefined || channelId === undefined || !available
        ? undefined
        : conversationFor(client, `channel:${channelId}`, {
            channelId,
            cacheKey: `channel:${channelId}`,
          }),
    [client, channelId, available],
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
  visible = true,
) {
  useFocusEffect(
    useCallback(() => {
      if (!visible) return;
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
    }, [conversation, playback, visible]),
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
  visible = true,
) {
  useConversationForeground(conversation, playback, visible);
  const source = useMemo(
    () => ({
      subscribe: (listener: () => void) =>
        (playback ?? conversation)?.subscribe(listener) ?? (() => {}),
      getSnapshot: () => conversation?.getTimelineSnapshot() ?? closed,
    }),
    [conversation, playback],
  );
  return useVisibleSnapshot(source, visible, true);
}
