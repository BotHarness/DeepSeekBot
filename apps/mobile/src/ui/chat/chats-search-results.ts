import type { ChatsSearchResult } from '../shell/chats-search-bar';
import { previewText, titleOf } from './conversations';
import type { EnvironmentChatItem, EnvironmentChatRow } from './environment-chat-list';

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

export function chatsSearchResults(
  items: readonly EnvironmentChatItem[],
  query: string,
  recent: number,
): ChatsSearchResult[] {
  const rows = items.filter((item): item is EnvironmentChatRow => item.type !== 'section');
  return (query.trim() === '' ? rows.slice(0, recent) : rows).map((row) => {
    const title = titleOfRow(row);
    return {
      key: row.key,
      title,
      subtitle: previewOfRow(row),
      initial: (Array.from(title.trim())[0] ?? '#').toLocaleUpperCase(),
    };
  });
}
