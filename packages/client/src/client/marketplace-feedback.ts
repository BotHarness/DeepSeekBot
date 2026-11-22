import { BridgeCallError, errorMessage } from './bridge.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';

const marketplaceErrorKeys: Record<string, BotHarnessKey> = {
  'marketplace-unavailable': 'market.error.unavailable',
  'invalid-repository-url': 'market.error.invalidUrl',
  'repository-not-found': 'market.error.notFound',
  'repository-private': 'market.error.private',
  'repository-archived': 'market.error.archived',
  'repository-missing-topic': 'market.error.missingTopic',
  'repository-blocked': 'market.error.blocked',
  'upstream-unavailable': 'market.error.upstream',
  'bot-not-found': 'market.error.botNotFound',
  'file-not-found': 'market.error.fileNotFound',
  'challenge-unavailable': 'market.error.challengeUnavailable',
  'challenge-invalid': 'market.error.challenge',
  'challenge-expired': 'market.error.challenge',
  'challenge-replayed': 'market.error.challenge',
  'rate-limited': 'market.error.rateLimited',
  'repository-rate-limited': 'market.error.repositoryRateLimited',
  'invalid-report': 'market.error.invalidReport',
  'sign-in-required': 'market.error.signIn',
  'sign-in-rejected': 'market.error.signInRejected',
  'author-required': 'market.error.authorRequired',
  'terms-required': 'market.error.terms',
  'invalid-author-name': 'market.error.authorName',
  'uploads-unavailable': 'market.error.uploadsUnavailable',
  'too-many-files': 'market.error.tooManyFiles',
  'too-large': 'market.error.tooLarge',
  'bot-limit': 'market.error.botLimit',
  'avatar-limit': 'market.avatar.limit',
  'avatar-not-found': 'market.avatar.notFound',
  'no-stored-avatar': 'market.avatar.sourceMissing',
  'unprocessed-image': 'market.avatar.unprocessed',
  'author-changed': 'market.avatar.authorChanged',
  'avatars-unavailable': 'market.error.unavailable',
  'nothing-to-upload': 'market.error.nothingToUpload',
  'listing-not-installable': 'market.error.botNotFound',
  'not-an-uploaded-bot': 'market.error.botNotFound',
  'replace-limit': 'market.error.replaceLimit',
};

export type Phase = 'idle' | 'verifying' | 'sending';

export function marketplaceError(error: unknown, t: BotHarnessTranslate): string {
  if (error instanceof BridgeCallError) {
    const key = marketplaceErrorKeys[error.code];
    if (key !== undefined) return t(key);
  }
  return errorMessage(error);
}
