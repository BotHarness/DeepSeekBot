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

export function conversationCache(): ConversationCache {
  return hostStoreAvailable() ? local : nativeConversationCache;
}

export function forgetHostConversations(hostId: string): void {
  clearHostConversationCache(hostId);
  void deleteHostStore(hostId).catch(() => undefined);
}

export async function clearHostConversations(hostId: string): Promise<void> {
  clearHostConversationCache(hostId);
  await deleteHostStore(hostId);
}

export function pruneHostConversations(hostId: string, stale: (key: string) => boolean): void {
  pruneHostConversationCache(hostId, stale);
  if (hostStoreAvailable())
    void hostStore(hostId)
      .then((db) => pruneLocalConversations(db, stale))
      .catch(() => undefined);
}
