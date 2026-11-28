import {
  applyRosterBatch,
  readRoster,
  setRosterHidden,
} from '@botharness/host-client/roster-readers';
import { setChannelMuted } from '@botharness/host-client/channel-management';
import { markChannelRead } from '@botharness/host-client/channel-messages';
import type { HostClient } from '@botharness/host-client/client';
import type { Inbox } from '@botharness/host-client/inbox';
import { t } from '../strings';
import type { Conversation } from './conversations';

export type ConversationActionKey =
  | 'pin'
  | 'unpin'
  | 'section'
  | 'read'
  | 'mute'
  | 'unmute'
  | 'hide';

export type ConversationAction = { key: ConversationActionKey; label: string };

export function conversationChannelId(conversation: Conversation): string | undefined {
  return conversation.kind === 'bot' ? conversation.bot.dmChannelId : conversation.channel.id;
}

export function conversationActionSymbol(
  key: ConversationActionKey,
): 'folder' | 'checkmark' | 'pin' | 'bell.slash' | 'bell' | 'eye.slash' {
  if (key === 'section') return 'folder';
  if (key === 'read') return 'checkmark';
  if (key === 'pin' || key === 'unpin') return 'pin';
  if (key === 'mute') return 'bell.slash';
  if (key === 'hide') return 'eye.slash';
  return 'bell';
}

export function conversationActionGlyph(
  key: ConversationActionKey,
): Exclude<ConversationActionKey, 'section' | 'read'> | 'folder' | 'check' {
  return key === 'section' ? 'folder' : key === 'read' ? 'check' : key;
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
    state.pinned ? 'unpin' : 'pin',
    'section',
    state.hostMuted ? 'unmute' : 'mute',
    'hide',
  ];
  if (conversation.unread > 0 && latestMessageId(conversation) !== undefined) keys.push('read');
  return keys.map((key) => ({ key, label: t.rowActions[key] }));
}

export async function setConversationHidden(
  client: Pick<HostClient, 'call' | 'refresh'>,
  channelId: string,
  hidden: boolean,
): Promise<void> {
  const current = (await readRoster(client)).hidden;
  if (current.includes(channelId) !== hidden)
    await setRosterHidden(
      client,
      hidden ? [...current, channelId] : current.filter((candidate) => candidate !== channelId),
    );
  await client.refresh();
}

export async function runConversationAction(
  client: Pick<HostClient, 'call' | 'refresh'>,
  inbox: Pick<Inbox, 'refresh'> | undefined,
  conversation: Conversation,
  key: ConversationActionKey,
): Promise<void> {
  const channelId = conversationChannelId(conversation);
  if (channelId === undefined) return;
  if (key === 'section') return;
  if (key === 'read') {
    const messageId = latestMessageId(conversation);
    if (messageId === undefined) return;
    await markChannelRead(client, channelId, messageId);
    await inbox?.refresh();
    return;
  }
  if (key === 'hide') return setConversationHidden(client, channelId, true);
  if (key === 'mute' || key === 'unmute') await setChannelMuted(client, channelId, key === 'mute');
  else await applyRosterBatch(client, { action: key, channelIds: [channelId] });
  await client.refresh();
}
