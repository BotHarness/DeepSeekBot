import type { ChatPlace } from '../chat/conversation-screen';
import type { RecentChat } from './recent-chats';

export type LastChatSource = { expectedHostId: string; place: ChatPlace; focus: undefined };

export function lastChatSource(chat: RecentChat | undefined): LastChatSource | undefined {
  if (chat === undefined) return undefined;
  const query = chat.href.indexOf('?');
  const hostId =
    query < 0 ? undefined : new URLSearchParams(chat.href.slice(query + 1)).get('hostId');
  const match = /^\/(dm|channel)\/([^/?#]+)(?:\?|$)/u.exec(chat.href);
  if (!hostId || match === null) return undefined;
  try {
    const id = decodeURIComponent(match[2]!);
    if (!id) return undefined;
    return {
      expectedHostId: hostId,
      place: match[1] === 'dm' ? { kind: 'dm', slug: id } : { kind: 'channel', channelId: id },
      focus: undefined,
    };
  } catch {
    return undefined;
  }
}
