// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import type { HostSnapshot } from '../src/host/client';
import {
  channelRouteId,
  channelStackRouter,
  navigateChannel,
} from '../src/ui/shell/channel-navigation';
import { t } from '../src/ui/strings';

const fixture = vi.hoisted(() => {
  const snapshot: HostSnapshot = {
    connection: { status: 'connected', route: 'https://qa.test' },
    roster: {
      bots: [
        {
          slug: 'ada',
          displayName: 'Ada',
          roles: [],
          computerAccess: false,
          browserAccess: false,
          state: 'idle',
          paused: false,
          dmChannelId: 'dm-ada',
        },
      ],
      channels: [],
    },
  };
  return {
    snapshot,
    hostId: 'host-a',
    client: { call: async () => ({}), subscribe: () => () => {} },
  };
});
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('expo-file-system', () => ({
  File: class {
    exists = false;
  },
  Paths: { document: '' },
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  Rect: () => null,
  Circle: () => null,
  G: () => null,
}));
vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/host/pick-avatar-image', () => ({ pickAvatarImage: async () => undefined }));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ saved: { hostId: fixture.hostId }, client: fixture.client }),
  useHostSnapshot: () => fixture.snapshot,
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'ada', id: 'group-a', hostId: 'host-a' }),
  useNavigationContainerRef: () => navigation,
  useNavigation: () => ({ addListener: () => () => {} }),
  useFocusEffect: (work: () => (() => void) | undefined) => useLayoutEffect(work, [work]),
  useRouter: () => ({
    canGoBack: () => state.index > 0,
    back: () => navigation.dispatch({ type: 'GO_BACK' }),
    push: (href: { pathname: string; params?: object }) =>
      navigation.dispatch({
        type: 'PUSH',
        payload: { name: href.pathname.slice(1), params: href.params },
      }),
  }),
}));
import BotProfileScreen from '../app/bot/[slug]/index';
import GroupInfoScreen from '../app/group/[id]/index';

const originalStack = StackRouter({ initialRouteName: '(tabs)' }) as Parameters<
  typeof channelStackRouter
>[0];
const stack = { ...originalStack, ...channelStackRouter(originalStack) };
const options = {
  routeNames: ['(tabs)', 'settings', 'group/[id]', 'bot/[slug]', 'dm/[slug]', 'channel/[id]'],
  routeParamList: {},
  routeGetIdList: {
    'dm/[slug]': ({ params }: { params?: object }) => channelRouteId('dm/[slug]', { ...params }),
    'channel/[id]': ({ params }: { params?: object }) =>
      channelRouteId('channel/[id]', { ...params }),
  },
};
let state: Parameters<typeof stack.getStateForAction>[0];
const navigation = {
  isReady: () => true,
  getRootState: () => state,
  dispatch(action: Parameters<typeof stack.getStateForAction>[1]) {
    const next = stack.getStateForAction(state, action, options);
    if (next && typeof next === 'object') state = next.state;
  },
};
let root: Root | undefined;
let node: HTMLDivElement | undefined;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  act(() => root?.unmount());
  node?.remove();
  fixture.hostId = 'host-a';
});

it('Profile Message from Usage opens its DM and Back returns to Usage', async () => {
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 3,
    index: 2,
    routeNames: options.routeNames,
    routes: [
      { key: 'tabs', name: '(tabs)' },
      { key: 'usage', name: 'settings', state: { stale: true, routes: [{ name: 'usage' }] } },
      { key: 'profile', name: 'bot/[slug]', params: { slug: 'ada', hostId: 'host-a' } },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<BotProfileScreen />));
  const message = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === t.profileMessage,
  );
  expect(message).toBeDefined();
  await act(async () => message!.click());
  expect(state.routes[state.index]).toMatchObject({
    name: 'dm/[slug]',
    params: { hostId: 'host-a', slug: 'ada' },
  });
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('usage');
});

it('Profile Message from Group Profile opens the member DM and retains the Group parent', async () => {
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 3,
    index: 2,
    routeNames: options.routeNames,
    routes: [
      { key: 'tabs', name: '(tabs)' },
      { key: 'group', name: 'group/[id]', params: { id: 'group-a' } },
      {
        key: 'profile',
        name: 'bot/[slug]',
        params: { slug: 'ada', hostId: 'host-a' },
        state: { stale: true, routes: [{ name: 'index' }, { name: 'model' }, { name: 'index' }] },
      },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<BotProfileScreen />));
  const message = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === t.profileMessage,
  )!;
  await act(async () => message.click());
  expect(state.routes[state.index]).toMatchObject({
    name: 'dm/[slug]',
    params: { hostId: 'host-a', slug: 'ada' },
  });
  expect(state.routes.map((route) => route.name)).toEqual(['(tabs)', 'group/[id]', 'dm/[slug]']);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('group');
});

it('Profile Message returns to the existing DM instead of duplicating it', async () => {
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 3,
    index: 2,
    routeNames: options.routeNames,
    routes: [
      { key: 'tabs', name: '(tabs)' },
      { key: 'original-dm', name: 'dm/[slug]', params: { slug: 'ada', hostId: 'host-a' } },
      { key: 'profile', name: 'bot/[slug]', params: { slug: 'ada', hostId: 'host-a' } },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<BotProfileScreen />));
  const message = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === t.profileMessage,
  )!;
  await act(async () => message.click());
  expect(state.routes[state.index]?.key).toBe('original-dm');
  expect(state.routes).toHaveLength(2);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('tabs');
});

it('an old Host Profile cannot open a same-named Bot after the source changes', async () => {
  fixture.hostId = 'host-b';
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 2,
    index: 1,
    routeNames: options.routeNames,
    routes: [
      { key: 'tabs', name: '(tabs)' },
      { key: 'profile', name: 'bot/[slug]', params: { slug: 'ada', hostId: 'host-a' } },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<BotProfileScreen />));
  expect(node.textContent).toContain(t.sourceChanged);
  expect(
    [...node.querySelectorAll('button')].some((button) => button.textContent === t.profileMessage),
  ).toBe(false);
  expect(state.routes[state.index]?.key).toBe('profile');
});

it('a notification opened over Profile preserves that Profile as its Back destination', () => {
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 2,
    index: 1,
    routeNames: options.routeNames,
    routes: [
      { key: 'tabs', name: '(tabs)' },
      { key: 'profile', name: 'bot/[slug]', params: { slug: 'ada', hostId: 'host-a' } },
    ],
  };
  navigateChannel(navigation, {
    pathname: '/dm/[slug]',
    params: { slug: 'bob', hostId: 'host-b' },
  });
  expect(state.routes.map((route) => route.name)).toEqual(['(tabs)', 'bot/[slug]', 'dm/[slug]']);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('profile');
});

it('a retained Group Profile refuses a colliding group on a different Host', async () => {
  fixture.snapshot.roster!.channels = [
    { id: 'group-a', name: 'Other Host group', memberCount: 1, members: ['ada'] },
  ];
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<GroupInfoScreen />));
  expect(node.textContent).toContain('Other Host group');
  fixture.hostId = 'host-b';
  await act(async () => root!.render(<GroupInfoScreen />));
  expect(node.textContent).toContain(t.sourceChanged);
  expect(node.textContent).not.toContain('Other Host group');
  expect(node.querySelector('button')).toBeNull();
  fixture.snapshot.roster!.channels = [];
});

it('a native preview commit over Profile preserves the Profile origin', () => {
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 2,
    index: 1,
    routeNames: options.routeNames,
    routes: [
      { key: 'tabs', name: '(tabs)' },
      { key: 'profile', name: 'bot/[slug]', params: { slug: 'ada', hostId: 'host-a' } },
    ],
  };
  navigation.dispatch({
    type: 'NAVIGATE',
    payload: {
      name: 'channel/[id]',
      params: { id: 'team', hostId: 'host-a', __internal__PreviewKey: 'preview' },
    },
  });
  expect(state.routes.map((route) => route.name)).toEqual(['(tabs)', 'bot/[slug]', 'channel/[id]']);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('profile');
});
