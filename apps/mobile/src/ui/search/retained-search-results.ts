import type { SearchHit } from '../../host/retained-search';
import type { MessageSearchHit } from '../../host/message-search';
import type { Conversation } from '../chat/conversations';
import { shortTime } from '../chat/conversations';
import type { ChatsSearchResult } from '../shell/chats-search-bar';

export function retainedTargetMatches(
  hit: SearchHit,
  hostId: string,
  conversation: Conversation,
): boolean {
  return (
    hit.source.hostId === hostId &&
    (conversation.kind === 'bot'
      ? hit.target.kind === 'dm' && hit.target.id === conversation.bot.slug
      : hit.target.kind === 'channel' && hit.target.id === conversation.channel.id)
  );
}

export function retainedMessageMatches(
  hit: SearchHit,
  online: MessageSearchHit,
  conversation: Conversation,
): boolean {
  return (
    retainedTargetMatches(hit, online.hostId, conversation) && hit.message?.id === online.messageId
  );
}

export function retainedSearchResults(
  hits: SearchHit[],
  heading: string | undefined,
  now: Date,
  you: string,
): ChatsSearchResult[] {
  return hits.map((hit, index) => ({
    key: hit.key,
    title: hit.target.name,
    subtitle: hit.message
      ? `${hit.source.name} · ${hit.message.author === 'human' ? you : hit.message.author}: ${hit.message.body}`
      : hit.source.name,
    initial: '#',
    image: '',
    dimmed: false,
    ...(hit.message ? { trailing: shortTime(hit.message.at, now) } : {}),
    ...(index === 0 && heading ? { section: heading } : {}),
  }));
}
