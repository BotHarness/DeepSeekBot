import { z } from 'zod';
import { MessagingProviderError } from '../../messaging/provider.js';

export const identifier = z.string().min(1).max(512);

export function providerFailure(error: unknown): MessagingProviderError {
  if (error instanceof MessagingProviderError) return error;
  const code =
    error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'provider-result-unknown';
  const definite = [
    'unknown-bot',
    'unknown-target',
    'account-changed',
    'account-unverified',
    'target-changed',
    'capability-unavailable',
    'bot-not-connected',
    'bad-request',
    'stale-route',
    'source-not-found',
    'source-unavailable',
    'cancelled',
    'reply-permission-denied',
    'reply-window-expired',
    'reply-limit-exceeded',
    'reply-rate-limited',
    'consumer-unavailable',
    'file-upload-failed',
    'file-provider-rejected',
    'card-provider-rejected',
    'private-context-unavailable',
    'private-context-rejected',
    'send-permission-denied',
    'send-preflight-unavailable',
    'send-rate-limited',
    'target-rejected',
    'reaction-permission-denied',
    'reaction-provider-rejected',
  ].includes(code);
  return new MessagingProviderError(
    definite ? code : 'provider-result-unknown',
    definite ? 'not-started' : 'unknown',
  );
}
