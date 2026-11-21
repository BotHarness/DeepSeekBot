import type { ExternalSource } from './inbound-types.js';

export type SourceReplyCapability =
  | { state: 'unavailable'; reason: string }
  | { state: 'requires-provider-check' }
  | { state: 'provider-checked' };

const ROUTE_REFUSALS = new Set([
  'capability-unavailable',
  'grant-revoked',
  'grant-unavailable',
  'identity-unavailable',
  'own-reply-grant-unavailable',
  'provider-timeout',
  'provider-unavailable',
  'rebind-required',
  'reply-limit-exceeded',
  'reply-permission-denied',
  'reply-rate-limited',
  'reply-target-ambiguous',
  'reply-window-expired',
  'source-unavailable',
  'stale-route',
]);

export function qqReplyFailureCapability(reason: string | undefined): SourceReplyCapability {
  return reason !== undefined && ROUTE_REFUSALS.has(reason)
    ? { state: 'unavailable', reason }
    : { state: 'requires-provider-check' };
}

export function sourceReplyCapability(
  source: ExternalSource,
):
  | Extract<SourceReplyCapability, { state: 'unavailable' | 'requires-provider-check' }>
  | undefined {
  if (source.platform !== 'qq' || source.event.conversation.kind !== 'group') return undefined;
  return source.event.mentionedAccount
    ? { state: 'requires-provider-check' }
    : { state: 'unavailable', reason: 'qq-mention-required' };
}
