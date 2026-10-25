import type { NavigationAction, NavigationState } from 'expo-router/react-navigation';

import type { RosterView } from '../../host/client';
import type { ChatHref } from '../../host/push';

export type ChannelLink = { channelId?: string; botSlug: string; messageId?: string };
export type ChannelDestination = ChatHref & { params: { hostId: string } };

export function channelDestination(
  hostId: string,
  item: ChannelLink,
  roster: RosterView | undefined,
): ChannelDestination | undefined {
  if (!item.channelId || !roster) return undefined;
  const focus = item.messageId === undefined ? {} : { focus: item.messageId };
  const bot = roster.bots.find((entry) => entry.dmChannelId === item.channelId);
  if (bot) return { pathname: '/dm/[slug]', params: { hostId, slug: bot.slug, ...focus } };
  const peerDm = roster.activityChannels?.some(
    (entry) => entry.id === item.channelId && entry.type === 'dm' && entry.botSlug === undefined,
  );
  if (peerDm || roster.channels.some((entry) => entry.id === item.channelId))
    return { pathname: '/channel/[id]', params: { hostId, id: item.channelId, ...focus } };
  return undefined;
}

export function channelRouteId(name: string, params: Record<string, unknown>): string {
  return JSON.stringify([params['hostId'], name, params['slug'] ?? params['id']]);
}

export type ChannelNavigation = {
  isReady(): boolean;
  getRootState(): NavigationState;
  dispatch(action: NavigationAction): void;
};

export function navigateChannel(
  navigation: ChannelNavigation,
  destination: ChannelDestination,
): boolean {
  if (!navigation.isReady()) return false;
  navigation.dispatch({
    type: 'NAVIGATE',
    target: navigation.getRootState().key,
    payload: { name: destination.pathname.slice(1), params: destination.params, pop: true },
  });
  return true;
}
