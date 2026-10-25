import type { Href, useRouter } from 'expo-router';

import type { Conversation } from '../chat/conversations';

type ConversationTarget =
  | { kind: 'bot'; bot: { slug: string } }
  | { kind: 'channel'; channel: { id: string } };

export function conversationHref(
  row: ConversationTarget,
  hostId?: string,
  focus?: string,
  focusRequest?: string,
): Href {
  const target =
    focus === undefined ? {} : { focus, ...(focusRequest === undefined ? {} : { focusRequest }) };
  return row.kind === 'bot'
    ? { pathname: '/dm/[slug]', params: { slug: row.bot.slug, hostId, ...target } }
    : { pathname: '/channel/[id]', params: { id: row.channel.id, hostId, ...target } };
}

export function openConversation(
  router: Pick<ReturnType<typeof useRouter>, 'push'>,
  row: Conversation,
  hostId?: string,
): void {
  router.push(conversationHref(row, hostId));
}
