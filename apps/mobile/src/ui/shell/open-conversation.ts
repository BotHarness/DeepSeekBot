import type { Conversation } from '../chat/conversations';
import {
  navigateChannel,
  type ChannelDestination,
  type ChannelNavigation,
} from './channel-navigation';

type ConversationTarget =
  | { kind: 'bot'; bot: { slug: string } }
  | { kind: 'channel'; channel: { id: string } };

export function conversationHref(
  row: ConversationTarget,
  hostId: string,
  focus?: string,
  focusRequest?: string,
): ChannelDestination {
  const target =
    focus === undefined ? {} : { focus, ...(focusRequest === undefined ? {} : { focusRequest }) };
  return row.kind === 'bot'
    ? { pathname: '/dm/[slug]', params: { slug: row.bot.slug, hostId, ...target } }
    : { pathname: '/channel/[id]', params: { id: row.channel.id, hostId, ...target } };
}

export function openConversation(
  navigation: ChannelNavigation,
  row: Conversation,
  hostId?: string,
): boolean {
  return hostId !== undefined && navigateChannel(navigation, conversationHref(row, hostId));
}
