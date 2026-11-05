import type { ConversationCache } from './conversation';
import { deleteHostStore, hostStore, hostStoreAvailable } from './host-store';
import { createLocalConversationCache, pruneLocalConversations } from './local-conversation-cache';
import {
  clearHostConversationCache,
  nativeConversationCache,
  pruneHostConversationCache,
  removeCachedConversation,
} from './native-cache';

const local = createLocalConversationCache({
  store: hostStore,
  legacy: { read: nativeConversationCache.read, remove: removeCachedConversation },
});

const LOCAL_CACHE_WAIT_MS = 5000;

export function conversationCache(): ConversationCache {
  return hostStoreAvailable() ? local : nativeConversationCache;
}

export function conversationCacheWaitMs(): number | undefined {
  return hostStoreAvailable() ? LOCAL_CACHE_WAIT_MS : undefined;
}

export function warmHostConversations(hostId: string): void {
  if (hostStoreAvailable()) void hostStore(hostId).catch(() => undefined);
}

export function forgetHostConversations(hostId: string): void {
  clearHostConversationCache(hostId);
  void deleteHostStore(hostId).catch(() => undefined);
}

export function pruneHostConversations(hostId: string, stale: (key: string) => boolean): void {
  pruneHostConversationCache(hostId, stale);
  if (hostStoreAvailable())
    void hostStore(hostId)
      .then((db) => pruneLocalConversations(db, stale))
      .catch(() => undefined);
}
