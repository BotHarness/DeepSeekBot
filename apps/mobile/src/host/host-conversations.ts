import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import type { HostClient, HostSnapshot } from '@botharness/host-client/client';
import {
  createConversation,
  type Conversation,
  type ConversationSnapshot,
} from '@botharness/host-client/conversation';
import { createConversationPlayback, type ConversationPlayback } from './conversation-playback';
import { useVisibleSnapshot } from './use-visible-snapshot';
import { conversationCache, conversationCacheWaitMs } from './native-conversations';
import { attentionFocus, dmChannel } from './attention-focus';
import { mobileTelemetry } from '../telemetry/native';

const visibleConversations = new Map<Conversation, () => void>();

export const clientHosts = new WeakMap<HostClient, string>();
export const clientSelves = new WeakMap<HostClient, string>();

const detached: HostSnapshot = { connection: { status: 'stopped', route: '' } };
export const detachedSource = { getSnapshot: () => detached, subscribe: () => () => {} };

export interface DmTarget {
  slug: string;
  displayName?: string;
  dmChannelId?: string;
}

export const conversations = new WeakMap<HostClient, Map<string, Conversation>>();

export function liveKeys(client: HostClient, hostId: string): string[] {
  return [...(conversations.get(client)?.keys() ?? [])].map((key) =>
    JSON.stringify(['computer', hostId, key]),
  );
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

export function prepareHostConversation(
  client: HostClient,
  target: { channelId: string; bot?: DmTarget },
): void {
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

export function dmChannelOf(client: HostClient, slug: string | undefined): string | undefined {
  if (slug === undefined) return undefined;
  const bot = client.getSnapshot().roster?.bots.find((entry) => entry.slug === slug);
  return bot?.dmChannelId ?? dmChannel(slug);
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
  const self = clientSelves.get(client);
  const inner = createConversation({
    host: client,
    ...options,
    ...(self === undefined ? {} : { selfHumanId: self }),
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
      const channelId = options.channelId ?? dmChannelOf(client, options.botSlug);
      visibleConversations.get(conversation)?.();
      visibleConversations.delete(conversation);
      if (active && hostId && channelId)
        visibleConversations.set(conversation, attentionFocus.hold({ hostId, channelId }));
    },
    stop() {
      visibleConversations.get(conversation)?.();
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
