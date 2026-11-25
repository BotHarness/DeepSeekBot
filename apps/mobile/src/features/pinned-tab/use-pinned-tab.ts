import { useMemo } from 'react';
import { quietChannels, useHostSession, useHostSessions } from '../../host/host-session';
import { useConversationFilter } from '../../host/native-conversation-filter';
import type { ChatPlace } from '../../ui/chat/chat-place';
import { countBadge, titleOf, type Conversation } from '../../ui/chat/conversations';
import { badgeCount } from '../../ui/primitives/badge-count';
import { recentHostIds, useRecentChats } from '../../ui/shell/recent-chats';
import { useStrings } from '../../ui/strings';
import { usePinnedBinding, usePinnedBindingsSettled } from './native-pinned-binding';
import { pinnedHostId, resolvePinnedTarget } from './pinned-target';

export type PinnedTab = {
  key: string;
  hostId: string;
  conversation: Conversation;
  place: ChatPlace;
  name: string;
  count: number;
  label: string;
  countedLabel: string;
};

export function placeOf(conversation: Conversation): ChatPlace {
  return conversation.kind === 'bot'
    ? { kind: 'dm', slug: conversation.bot.slug }
    : { kind: 'channel', channelId: conversation.channel.id };
}

export type PinnedTabState =
  | { kind: 'loading'; failed: boolean; retry: () => void }
  | { kind: 'none' }
  | { kind: 'ready'; tab: PinnedTab };

export function usePinnedTab(): PinnedTab | undefined {
  const state = usePinnedTabState();
  return state.kind === 'ready' ? state.tab : undefined;
}

export function usePinnedTabState(): PinnedTabState {
  const t = useStrings();
  const hosts = useHostSessions();
  const [scope] = useConversationFilter();
  const recent = useRecentChats();
  const { saved } = useHostSession();
  const hostId = pinnedHostId(
    scope,
    hosts.map((host) => host.saved.hostId),
    recentHostIds(recent),
    saved?.hostId,
  );
  const binding = usePinnedBinding(hostId);
  const bindingsSettled = usePinnedBindingsSettled();
  const host = hosts.find((entry) => entry.saved.hostId === hostId);
  const ready = host?.attention.status === 'ready' ? host.attention : undefined;
  const target =
    host === undefined
      ? undefined
      : resolvePinnedTarget(
          {
            hostId: host.saved.hostId,
            roster: host.snapshot.roster,
            action: ready?.sections.action,
            unread: ready?.unread,
            quiet: quietChannels.get(host.saved.hostId),
          },
          binding,
        );
  const conversation = target?.conversation;
  const badge = conversation === undefined ? undefined : countBadge(conversation);
  const count = badge === undefined || badge.tone === 'muted' ? 0 : badge.count;
  const name = conversation === undefined ? t.pinnedTab.title : titleOf(conversation);
  const key = conversation === undefined ? undefined : `${target?.hostId}:${conversation.key}`;
  const loading = host !== undefined && (host.snapshot.roster === undefined || !bindingsSettled);
  const status = host?.snapshot.connection.status;
  const failed =
    host?.snapshot.roster === undefined &&
    (status === 'unreachable' || status === 'refused' || status === 'stopped');
  const client = host?.client;
  return useMemo((): PinnedTabState => {
    if (loading)
      return {
        kind: 'loading',
        failed,
        retry: () => {
          void client?.refresh().catch(() => undefined);
        },
      };
    if (target === undefined || conversation === undefined || key === undefined)
      return { kind: 'none' };
    const label = t.pinnedTab.tabLabel(name);
    const tab: PinnedTab = {
      key,
      hostId: target.hostId,
      conversation,
      place: placeOf(conversation),
      name,
      count,
      label,
      countedLabel: count > 0 ? t.pinnedTab.tabLabel(name, badgeCount(count)) : label,
    };
    return { kind: 'ready', tab };
  }, [key, name, count, t, conversation, target, loading, failed, client]);
}
