import { forgetMedia } from './media-cache';
import { redactHostConversationCache } from './native-cache';
import type { PurgeTargets } from './purge-caches';
import { forgetSharedCopies } from './share-attachment';

export const nativePurgeTargets: PurgeTargets = {
  forgetMedia,
  forgetShared: forgetSharedCopies,
  redactTail: redactHostConversationCache,
};
