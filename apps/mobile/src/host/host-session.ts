import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { createHostClient, type HostClient, type HostSnapshot } from './client';
import { createInbox, type Inbox, type InboxSnapshot } from './inbox';
import { createConversation, type Conversation, type ConversationSnapshot } from './conversation';
import { clearConversationCache, nativeConversationCache } from './native-cache';
import { nativeCarrier } from './native-carrier';
import { forgetHost, loadSavedHost, saveHost, type SavedHost } from './saved-host';

export interface HostSessionState {
  saved: SavedHost | null | undefined;
  client: HostClient | undefined;
  inbox: Inbox | undefined;
}

const listeners = new Set<() => void>();
let state: HostSessionState = { saved: undefined, client: undefined, inbox: undefined };

function adopt(saved: SavedHost | null): void {
  state.inbox?.stop();
  state.client?.stop();
  const client =
    saved === null
      ? undefined
      : createHostClient({
          route: saved.route,
          token: saved.token,
          carrier: nativeCarrier(saved.route),
        });
  state = { saved, client, inbox: client === undefined ? undefined : createInbox(client) };
  client?.start();
  for (const listener of listeners) listener();
}

void loadSavedHost().then(
  (saved) => adopt(saved ?? null),
  () => adopt(null),
);

AppState.addEventListener('change', (next) => {
  if (next !== 'active') return;
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
    await saveHost(host);
    adopt(host);
  },
  async unpair(): Promise<void> {
    await forgetHost();
    adopt(null);
    try {
      clearConversationCache();
    } catch {}
  },
};

export function useHostSession(): HostSessionState {
  return useSyncExternalStore(hostSession.subscribe, hostSession.getState);
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

function conversationFor(client: HostClient, bot: DmTarget): Conversation {
  let byBot = conversations.get(client);
  if (byBot === undefined) {
    byBot = new Map();
    conversations.set(client, byBot);
  }
  const existing = byBot.get(bot.slug);
  if (existing !== undefined) return existing;
  const inner = createConversation({
    host: client,
    botSlug: bot.slug,
    ...(bot.displayName === undefined ? {} : { displayName: bot.displayName }),
    ...(bot.dmChannelId === undefined ? {} : { channelId: bot.dmChannelId }),
    cache: nativeConversationCache,
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
          byBot.delete(bot.slug);
        }, 0);
      };
    },
  };
  byBot.set(bot.slug, conversation);
  return conversation;
}

export function useConversation(
  client: HostClient | undefined,
  bot: DmTarget | undefined,
): Conversation | undefined {
  const slug = bot?.slug;
  return useMemo(
    () => (client === undefined || bot === undefined ? undefined : conversationFor(client, bot)),
    [client, slug],
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
