import type { ExternalSource } from './inbound-types.js';

export function sourceReplyCapability(source: ExternalSource) {
  if (source.platform !== 'qq' || source.event.conversation.kind !== 'group') return undefined;
  return source.event.mentionedAccount
    ? ({ state: 'requires-provider-check' } as const)
    : ({ state: 'unavailable', reason: 'qq-mention-required' } as const);
}
