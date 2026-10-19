import type { Href, useRouter } from 'expo-router';

import type { Conversation } from '../chat/conversations';

export function conversationHref(row: Conversation, hostId?: string): Href {
  return row.kind === 'bot'
    ? { pathname: '/dm/[slug]', params: { slug: row.bot.slug, hostId } }
    : { pathname: '/channel/[id]', params: { id: row.channel.id, hostId } };
}

export function openConversation(
  router: Pick<ReturnType<typeof useRouter>, 'push'>,
  row: Conversation,
  hostId?: string,
): void {
  router.push(conversationHref(row, hostId));
}
