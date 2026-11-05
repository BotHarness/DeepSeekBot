import { hostStore, hostStoreAvailable } from './host-store';
import { redactLocalConversations } from './local-conversation-cache';
import { forgetMedia } from './media-cache';
import { redactHostConversationCache } from './native-cache';
import type { PurgeTargets } from './purge-caches';
import { forgetSharedCopies } from './share-attachment';

export const nativePurgeTargets: PurgeTargets = {
  forgetMedia,
  forgetShared: forgetSharedCopies,
  redactTail(hostId, purged, placements) {
    redactHostConversationCache(hostId, purged);
    if (hostStoreAvailable())
      void hostStore(hostId)
        .then((db) => redactLocalConversations(db, placements))
        .catch(() => undefined);
  },
};
