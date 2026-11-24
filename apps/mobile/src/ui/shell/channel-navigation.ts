import type { NavigationAction, NavigationState, PartialState } from 'expo-router/react-navigation';
import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';

import type { RosterView } from '@botharness/host-client/client';
import type { ChatHref } from '@botharness/host-client/push';
import { swipeEntryOptions } from './swipe-entry';

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

export function conversationRouteOptions({ route }: { route: { params?: object | undefined } }) {
  return {
    title: '',
    headerShown: false,
    fullScreenGestureEnabled: true,
    ...swipeEntryOptions(route),
  };
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
    return original.getStateForAction(
      state,
      { ...action, payload: { ...payload, pop: true } },
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

function routerState<T extends object>(state: T): T & { __internal__routerActionState: true } {
  return { ...state, __internal__routerActionState: true };
}

export function navigateChannel(
  navigation: ChannelNavigation,
  destination: ChannelDestination,
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
  const name = destination.pathname.slice(1);
  const chatsStack = routerState({ index: 1, routes: [{ name: 'index' }, { name, params }] });
  const tabsIndex = state.routes.findIndex((route) => route.name === '(tabs)');
  const tabs = state.routes[tabsIndex]?.state;
  if (tabsIndex < 0 || tabs?.stale !== false || tabs.key === undefined) {
    navigation.dispatch({
      type: 'NAVIGATE',
      target: state.key,
      payload: {
        name: '(tabs)',
        pop: true,
        state: routerState({ index: 0, routes: [{ name: '(home)', state: chatsStack }] }),
      },
    });
    return true;
  }
  if (state.index !== tabsIndex)
    navigation.dispatch({ type: 'POP_TO', target: state.key, payload: { name: '(tabs)' } });
  const stack = tabs.routes.find((route) => route.name === '(home)')?.state;
  if (stack?.stale !== false || stack.key === undefined) {
    navigation.dispatch({
      type: 'NAVIGATE',
      target: tabs.key,
      payload: { name: '(home)', state: chatsStack },
    });
    return true;
  }
  if (tabs.routes[tabs.index ?? 0]?.name !== '(home)')
    navigation.dispatch({ type: 'NAVIGATE', target: tabs.key, payload: { name: '(home)' } });
  navigation.dispatch({
    type: 'NAVIGATE',
    target: stack.key,
    payload: { name, params, pop: true },
  });
  return true;
}
