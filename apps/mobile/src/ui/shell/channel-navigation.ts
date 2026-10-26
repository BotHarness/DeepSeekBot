import type { NavigationAction, NavigationState, PartialState } from 'expo-router/react-navigation';
import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';

import type { RosterView } from '../../host/client';
import type { ChatHref } from '../../host/push';

export type ChannelLink = { channelId?: string; botSlug: string; messageId?: string };
export type ChannelDestination = ChatHref & { params: { hostId: string; focusRequest?: string } };

let focusSequence = 0;

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

export const channelStackRouter: NonNullable<ComponentProps<typeof Stack>['UNSTABLE_router']> = (
  original,
) => ({
  getStateForAction(state, action, options) {
    const payload = action.payload;
    if (
      action.type !== 'NAVIGATE' ||
      !payload ||
      !('name' in payload) ||
      (payload.name !== 'dm/[slug]' && payload.name !== 'channel/[id]') ||
      !('params' in payload) ||
      typeof payload.params !== 'object' ||
      !payload.params ||
      !('hostId' in payload.params) ||
      typeof payload.params.hostId !== 'string'
    )
      return original.getStateForAction(state, action, options);
    const identity = channelRouteId(payload.name, { ...payload.params });
    const existing = state.routes
      .slice(0, state.index + 1)
      .some((route) => channelRouteId(route.name, { ...route.params }) === identity);
    const dismissProfile =
      !existing &&
      'dismissProfile' in payload &&
      payload.dismissProfile === true &&
      state.routes[state.index]?.name === 'bot/[slug]';
    const dismissActivity =
      !existing &&
      'dismissActivity' in payload &&
      payload.dismissActivity === true &&
      state.routes[state.index]?.name === 'request-activity';
    return original.getStateForAction(
      state,
      {
        ...action,
        type: dismissProfile || dismissActivity ? 'REPLACE' : 'NAVIGATE',
        payload: { ...payload, pop: true },
      },
      options,
    );
  },
});

export type ChannelNavigation = {
  isReady(): boolean;
  getRootState(): NavigationState;
  dispatch(action: NavigationAction): void;
};

export function appStackState(
  state: NavigationState | PartialState<NavigationState>,
): NavigationState | undefined {
  if (state.stale === false && state.routeNames.includes('(tabs)')) return state;
  const child = state.routes[state.index ?? 0]?.state;
  return child ? appStackState(child) : undefined;
}

export function navigateChannel(
  navigation: ChannelNavigation,
  destination: ChannelDestination,
  intent?: 'dismiss-profile' | 'dismiss-activity',
): boolean {
  if (!navigation.isReady()) return false;
  const state = appStackState(navigation.getRootState());
  if (!state) return false;
  const params =
    destination.params.focus === undefined
      ? destination.params
      : {
          ...destination.params,
          focusRequest: destination.params.focusRequest ?? `channel-focus-${++focusSequence}`,
        };
  navigation.dispatch({
    type: 'NAVIGATE',
    target: state.key,
    payload: {
      name: destination.pathname.slice(1),
      params,
      pop: true,
      ...(intent === 'dismiss-profile' ? { dismissProfile: true } : {}),
      ...(intent === 'dismiss-activity' ? { dismissActivity: true } : {}),
    },
  });
  return true;
}
