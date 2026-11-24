import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import { TabRouter } from '../node_modules/expo-router/build/react-navigation/routers/TabRouter.js';
import type { NavigationAction } from 'expo-router/react-navigation';
import { channelRouteId, channelStackRouter } from '../src/ui/shell/channel-navigation';

type Router = ReturnType<typeof channelStackRouter>;
type AnyState = Parameters<NonNullable<Router['getStateForAction']>>[0];
type Route = { key: string; name: string; params?: object; state?: AnyState };
type Level = {
  router: { getStateForAction?: Router['getStateForAction'] };
  options: Parameters<NonNullable<Router['getStateForAction']>>[2];
};

export const rootRouteNames = [
  '(tabs)',
  'settings',
  'group/[id]',
  'group/[id]/notifications',
  'bot/[slug]',
  'inbox/[id]',
  'cloud-channels',
  'conversation-section',
  'request-activity',
  'channel-files',
  'channel-details',
  'host-look',
  '(bot-creation)',
  'pair',
];
export const tabRouteNames = ['(home)', '(activity)', '(sessions)', '(settings)'];
export const chatsRouteNames = ['index', 'dm/[slug]', 'channel/[id]', 'dm-tob', 'session/[id]'];

const chatsRoute = (name: string) => chatsRouteNames.includes(name) && name !== 'index';

function level(router: object, routeNames: string[], getIds = false): Level {
  return {
    router,
    options: {
      routeNames,
      routeGetIdList: getIds
        ? {
            'dm/[slug]': ({ params }: { params?: object }) =>
              channelRouteId('dm/[slug]', { ...params }),
            'channel/[id]': ({ params }: { params?: object }) =>
              channelRouteId('channel/[id]', { ...params }),
          }
        : {},
    },
  };
}

const chatsStack = StackRouter({ initialRouteName: 'index' }) as Parameters<
  typeof channelStackRouter
>[0];
const levels = {
  root: level(StackRouter({ initialRouteName: '(tabs)' }), rootRouteNames),
  tabs: level(TabRouter({ initialRouteName: '(home)' }), tabRouteNames),
  chats: level({ ...chatsStack, ...channelStackRouter(chatsStack) }, chatsRouteNames, true),
};

export function appNavigationState({
  root = [],
  chats = [],
  tab = '(home)',
}: {
  root?: Omit<Route, 'key'>[];
  chats?: Omit<Route, 'key'>[];
  tab?: string;
} = {}): AnyState {
  const chatsState = {
    stale: false,
    type: 'stack',
    key: 'chats',
    routeKeySeq: chats.length + 1,
    index: chats.length,
    routeNames: chatsRouteNames,
    routes: [
      { key: 'index', name: 'index' },
      ...chats.map((route, index) => ({ ...route, key: `chat-${index}` })),
    ],
  };
  const tabIndex = tabRouteNames.indexOf(tab);
  const tabsState = {
    stale: false,
    type: 'tab',
    key: 'tabs-state',
    index: tabIndex,
    routeNames: tabRouteNames,
    history: [{ type: 'route', key: tab }],
    routes: tabRouteNames.map((name) =>
      name === '(home)' ? { key: name, name, state: chatsState } : { key: name, name },
    ),
  };
  return {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: root.length + 1,
    index: root.length,
    routeNames: rootRouteNames,
    routes: [
      { key: 'tabs', name: '(tabs)', state: tabsState },
      ...root.map((route, index) => ({ ...route, key: `root-${index}` })),
    ],
  } as AnyState;
}

function tabsOf(state: AnyState): AnyState | undefined {
  return (state.routes.find((route) => route.name === '(tabs)') as Route | undefined)?.state;
}

function chatsOf(state: AnyState): AnyState | undefined {
  return (tabsOf(state)?.routes.find((route) => route.name === '(home)') as Route | undefined)
    ?.state;
}

const indexOf = (state: AnyState) => state.index ?? 0;

function withChild(parent: AnyState, name: string, child: AnyState): AnyState {
  return {
    ...parent,
    routes: parent.routes.map((route) =>
      route.name === name ? { ...route, state: child } : route,
    ),
  } as AnyState;
}

function reduce(at: Level, state: AnyState, action: NavigationAction): AnyState | null {
  const next = at.router.getStateForAction!(state, action as never, at.options as never);
  return next && typeof next === 'object' && 'state' in next ? (next.state as AnyState) : null;
}

function mountTabs(state: AnyState): AnyState {
  const tabs = tabsOf(state);
  if (tabs === undefined || tabs.stale === false) return state;
  const partial = (tabs.routes.find((route) => route.name === '(home)') as Route | undefined)
    ?.state;
  const chats = (partial?.routes ?? []).slice(1) as Omit<Route, 'key'>[];
  const mounted = appNavigationState({ chats }).routes[0] as Route;
  return withChild(state, '(tabs)', mounted.state!);
}

export function reduceAppNavigation(state: AnyState, action: NavigationAction): AnyState {
  return mountTabs(reduceMounted(state, action));
}

function reduceMounted(state: AnyState, action: NavigationAction): AnyState {
  const tabs = tabsOf(state)?.stale === false ? tabsOf(state) : undefined;
  const chats = tabs && chatsOf(state)?.stale === false ? chatsOf(state) : undefined;
  const replaceTabs = (nextTabs: AnyState) => withChild(state, '(tabs)', nextTabs);
  const attempts: [string | undefined, () => AnyState | null][] = [
    [
      chats?.key,
      () => {
        const next = chats && tabs && reduce(levels.chats, chats, action);
        return next ? replaceTabs(withChild(tabs!, '(home)', next)) : null;
      },
    ],
    [
      tabs?.key,
      () => {
        const next = tabs && reduce(levels.tabs, tabs, action);
        return next ? replaceTabs(next) : null;
      },
    ],
    [state.key, () => reduce(levels.root, state, action)],
  ];
  if (action.target !== undefined) {
    const handler = attempts.find(([key]) => key === action.target)?.[1];
    return handler?.() ?? state;
  }
  const rootFocused = state.routes[indexOf(state)]?.name === '(tabs)';
  const chatsFocused =
    rootFocused && chats !== undefined && tabs!.routes[indexOf(tabs!)]?.name === '(home)';
  const order = chatsFocused ? attempts : rootFocused ? attempts.slice(1) : attempts.slice(2);
  for (const [, attempt] of order) {
    const next = attempt();
    if (next) return next;
  }
  return state;
}

export function visibleRoute(state: AnyState): Route {
  const top = state.routes[indexOf(state)] as Route;
  const tabs = tabsOf(state);
  if (top.name !== '(tabs)' || !tabs) return top;
  const tab = tabs.routes[indexOf(tabs)] as Route;
  const chats = chatsOf(state);
  if (tab.name !== '(home)' || !chats) return tab;
  return chats.routes[indexOf(chats)] as Route;
}

export function chatsRoutes(state: AnyState): Route[] {
  return (chatsOf(state)?.routes ?? []) as Route[];
}

export function focusedTab(state: AnyState): string | undefined {
  const tabs = tabsOf(state);
  return tabs?.routes[indexOf(tabs)]?.name;
}

export function channelNavigationHarness(
  wrapped = false,
  seed?: Parameters<typeof appNavigationState>[0],
) {
  let state = appNavigationState(seed);
  const navigation = {
    isReady: () => true,
    getRootState: () =>
      wrapped
        ? {
            ...state,
            key: 'expo-root',
            routeNames: ['__root'],
            index: 0,
            routes: [{ key: 'expo-slot', name: '__root', state }],
          }
        : state,
    dispatch(action: NavigationAction) {
      state = reduceAppNavigation(state, action);
    },
  };
  return {
    navigation,
    get state() {
      return state;
    },
    get chats() {
      return chatsRoutes(state);
    },
    get visible() {
      return visibleRoute(state);
    },
    get tab() {
      return focusedTab(state);
    },
    push: (name: string, params: object = {}) =>
      navigation.dispatch({
        type: 'PUSH',
        target: chatsRoute(name) ? 'chats' : 'root',
        payload: { name, params },
      }),
    back: () => navigation.dispatch({ type: 'GO_BACK' }),
  };
}
