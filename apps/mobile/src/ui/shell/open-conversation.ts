import type { Conversation } from '../chat/conversations';
import {
  navigateChannel,
  type ChannelDestination,
  type ChannelNavigation,
} from './channel-navigation';

export function conversationHref(row: Conversation, hostId: string): ChannelDestination {
  return row.kind === 'bot'
    ? { pathname: '/dm/[slug]', params: { slug: row.bot.slug, hostId } }
    : { pathname: '/channel/[id]', params: { id: row.channel.id, hostId } };
}

export function openConversation(
  navigation: ChannelNavigation,
  row: Conversation,
  hostId?: string,
): boolean {
  return hostId !== undefined && navigateChannel(navigation, conversationHref(row, hostId));
}
