import * as QuickActions from 'expo-quick-actions';
import * as SecureStore from 'expo-secure-store';
import { useCallback, type RefCallback } from 'react';

import { recentChats } from '../design/tokens';

export type RecentChat = { id: string; title: string; href: string };

const KEY = 'deepseekbot.recent-chats.v1';

export function chatHref(path: string, hostId: string | undefined): string {
  return hostId === undefined ? path : `${path}?hostId=${encodeURIComponent(hostId)}`;
}

export function rememberChat(
  list: readonly RecentChat[],
  chat: RecentChat,
  limit: number,
): RecentChat[] {
  return [chat, ...list.filter((item) => item.id !== chat.id)].slice(0, limit);
}

export function parseRecentChats(raw: string | null): RecentChat[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is RecentChat =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.href === 'string' &&
        item.href.startsWith('/'),
    );
  } catch {
    return [];
  }
}

export function quickAction(chat: RecentChat): QuickActions.Action {
  return {
    id: chat.id,
    title: chat.title,
    icon: 'symbol:bubble.left',
    params: { href: chat.href },
  };
}

let recent: Promise<RecentChat[]> | undefined;

function load(): Promise<RecentChat[]> {
  recent ??= SecureStore.getItemAsync(KEY).then(parseRecentChats, () => []);
  return recent;
}

export function recordRecentChat(chat: RecentChat): Promise<RecentChat[]> {
  recent = load().then(async (list) => {
    const first = list[0];
    if (first?.id === chat.id && first.title === chat.title && first.href === chat.href)
      return list;
    const next = rememberChat(list, chat, recentChats.limit);
    await Promise.all([
      SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => undefined),
      QuickActions.setItems(next.map(quickAction)).catch(() => undefined),
    ]);
    return next;
  });
  return recent;
}

export function useRecentChat(chat: RecentChat | undefined): RefCallback<unknown> {
  const id = chat?.id;
  const title = chat?.title;
  const href = chat?.href;
  return useCallback(
    (node: unknown) => {
      if (node === null || id === undefined || title === undefined || href === undefined) return;
      void recordRecentChat({ id, title, href });
    },
    [id, title, href],
  );
}
