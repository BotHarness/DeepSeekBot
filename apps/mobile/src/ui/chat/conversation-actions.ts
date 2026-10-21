import type { HostClient } from '../../host/client';
import type { Inbox } from '../../host/inbox';
import { t } from '../strings';
import type { Conversation } from './conversations';

export type ConversationActionKey = 'pin' | 'unpin' | 'read' | 'mute' | 'unmute';

export type ConversationAction = { key: ConversationActionKey; label: string };

export function conversationChannelId(conversation: Conversation): string | undefined {
  return conversation.kind === 'bot' ? conversation.bot.dmChannelId : conversation.channel.id;
}

function latestMessageId(conversation: Conversation): string | undefined {
  return conversation.kind === 'bot'
    ? conversation.bot.latestMessageId
    : conversation.channel.latestMessageId;
}

export function conversationActions(
  conversation: Conversation,
  state: { pinned: boolean; hostMuted: boolean },
): ConversationAction[] {
  if (conversationChannelId(conversation) === undefined) return [];
  const keys: ConversationActionKey[] = [
    state.hostMuted ? 'unmute' : 'mute',
    state.pinned ? 'unpin' : 'pin',
  ];
  if (conversation.unread > 0 && latestMessageId(conversation) !== undefined) keys.push('read');
  return keys.map((key) => ({ key, label: t.rowActions[key] }));
}

export async function runConversationAction(
  client: Pick<HostClient, 'call' | 'refresh'>,
  inbox: Pick<Inbox, 'refresh'> | undefined,
  conversation: Conversation,
  key: ConversationActionKey,
): Promise<void> {
  const channelId = conversationChannelId(conversation);
  if (channelId === undefined) return;
  if (key === 'read') {
    const messageId = latestMessageId(conversation);
    if (messageId === undefined) return;
    await client.call('channelMarkRead', { channelId, messageId });
    await inbox?.refresh();
    return;
  }
  if (key === 'mute' || key === 'unmute')
    await client.call('channelMuteSet', { channelId, muted: key === 'mute' });
  else await client.call('rosterBatch', { action: key, channelIds: [channelId] });
  await client.refresh();
}
