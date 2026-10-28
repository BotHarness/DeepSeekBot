import type { ChatsSearchResult } from '../shell/chats-search-bar';
import type { MessageSearchHit } from '../../host/message-search';
import { avatarFile } from '../../host/notification-avatars';
import { previewText, shortTime, titleOf, type Conversation } from './conversations';
import type { EnvironmentChatItem, EnvironmentChatRow } from './environment-chat-list';

export type AvatarImage = (hostId: string, file: string) => string | undefined;

function titleOfRow(row: EnvironmentChatRow): string {
  return row.type === 'cloud' ? row.conversation.channel.name : titleOf(row.conversation);
}

function previewOfRow(row: EnvironmentChatRow): string {
  if (row.type === 'cloud') return '';
  const preview =
    row.conversation.kind === 'bot'
      ? row.conversation.bot.preview
      : row.conversation.channel.preview;
  return preview === undefined || preview === '' ? '' : previewText(preview);
}

function avatarOfRow(
  row: EnvironmentChatRow,
  title: string,
  image: AvatarImage,
): Pick<ChatsSearchResult, 'initial' | 'image' | 'dimmed'> {
  if (row.type === 'cloud') return { initial: '#', image: '', dimmed: false };
  return avatarOfConversation(row.conversation, row.host.saved.hostId, title, image);
}

function avatarOfConversation(
  conversation: Conversation,
  hostId: string,
  title: string,
  image: AvatarImage,
): Pick<ChatsSearchResult, 'initial' | 'image' | 'dimmed'> {
  if (conversation.kind === 'channel')
    return {
      initial: '#',
      image:
        conversation.channel.avatar === undefined
          ? ''
          : (image(hostId, avatarFile('channel', conversation.channel.id)) ?? ''),
      dimmed: false,
    };
  return {
    initial: (Array.from(title.trim())[0] ?? '#').toLocaleUpperCase(),
    image: image(hostId, avatarFile('bot', conversation.bot.slug)) ?? '',
    dimmed: conversation.bot.paused === true,
  };
}

export function chatsSearchResults(
  items: readonly EnvironmentChatItem[],
  query: string,
  recent: number,
  image: AvatarImage = () => undefined,
): ChatsSearchResult[] {
  const rows = items.filter((item): item is EnvironmentChatRow => item.type !== 'section');
  return (query.trim() === '' ? rows.slice(0, recent) : rows).map((row) => {
    const title = titleOfRow(row);
    return {
      key: row.key,
      title,
      subtitle: previewOfRow(row),
      ...avatarOfRow(row, title, image),
    };
  });
}

export function messageSearchResults(
  items: readonly { key: string; hit: MessageSearchHit; conversation: Conversation }[],
  heading: string,
  now: Date,
  image: AvatarImage = () => undefined,
): ChatsSearchResult[] {
  return items.map(({ key, hit, conversation }, index) => {
    const title = titleOf(conversation);
    return {
      key,
      title,
      subtitle: hit.snippet,
      ...avatarOfConversation(conversation, hit.hostId, title, image),
      trailing: shortTime(hit.at, now),
      ...(index === 0 ? { section: heading } : {}),
    };
  });
}
