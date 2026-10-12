import type { MessagingInboundEvent } from './provider.js';

export type ChatSenderNamespace = 'lark-app-open-id' | 'slack-workspace-user-id';

export function chatPairingApplies(event: Omit<MessagingInboundEvent, 'text'>): boolean {
  return (
    event.channel === 'feishu' || (event.channel === 'slack' && event.conversation.kind === 'dm')
  );
}

export function chatSenderIdentity(
  event: Omit<MessagingInboundEvent, 'text'>,
): { providerId: string; namespace: ChatSenderNamespace } | undefined {
  if (event.actor.kind !== 'user') return undefined;
  if (event.channel === 'feishu' && /^ou_[A-Za-z0-9]+$/.test(event.actor.id))
    return { providerId: 'dsh-im/feishu', namespace: 'lark-app-open-id' };
  if (
    event.channel === 'slack' &&
    event.conversation.kind === 'dm' &&
    /^[UW][A-Z0-9]+$/.test(event.actor.id) &&
    /^D[A-Z0-9]+$/.test(event.conversation.id) &&
    event.reply.actorId === event.actor.id &&
    event.reply.conversationId === event.conversation.id &&
    event.reply.messageId === event.messageId
  )
    return { providerId: 'dsh-im/slack', namespace: 'slack-workspace-user-id' };
  return undefined;
}

export function chatSenderNamespace(platform: string): ChatSenderNamespace | undefined {
  if (platform === 'feishu') return 'lark-app-open-id';
  if (platform === 'slack') return 'slack-workspace-user-id';
  return undefined;
}
