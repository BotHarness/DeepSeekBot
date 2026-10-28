import type { RecentChat } from './recent-chats';
import type { ChatPlace } from '../chat/conversation-screen';
export function conversationTarget(
  href: string | undefined,
): { hostId: string; place: ChatPlace } | undefined {
  if (!href?.startsWith('/') || href.startsWith('//')) return undefined;
  try {
    const url = new URL(href, 'https://local.invalid');
    const match = /^\/(dm|channel)\/([^/]+)$/.exec(url.pathname);
    const hostId = url.searchParams.get('hostId');
    if (!match || !hostId) return undefined;
    const id = decodeURIComponent(match[2]!);
    return {
      hostId,
      place: match[1] === 'dm' ? { kind: 'dm', slug: id } : { kind: 'channel', channelId: id },
    };
  } catch {
    return undefined;
  }
}
export function swipeChatTarget(
  recent: readonly RecentChat[],
  candidates: readonly RecentChat[],
): RecentChat | undefined {
  const available = new Map(candidates.map((chat) => [chat.href, chat]));
  for (const chat of recent) {
    const candidate = available.get(chat.href);
    if (candidate) return candidate;
  }
  return candidates[0];
}
