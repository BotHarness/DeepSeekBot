// @vitest-environment jsdom
import { Platform, Alert } from 'react-native';
import { act, use, useLayoutEffect } from 'react';
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
import { HostScope } from '../src/host/host-scope';

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
    params: {} as Record<string, string>,
    activity: { ready: true, busy: false, tracking: false },
    startActivity: vi.fn(async () => {}),
    stopActivity: vi.fn(async () => {}),
    hostId: 'host-a',
    pairedSourceAvailable: false,
    client: { call: async () => ({}), subscribe: () => () => {} },
    otherClient: { call: async () => ({}), subscribe: () => () => {} },
  };
});
vi.mock('../src/host/native-live-activity', () => ({
  useRequestActivity: () => fixture.activity,
  requestActivitySession: { start: fixture.startActivity, stop: fixture.stopActivity },
}));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('expo-file-system', () => ({
  File: class {
    exists = false;
  },
  Paths: { document: '' },
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Alert: { alert: vi.fn() },
}));
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
  useHostSession: (hostId?: string) => {
    const scope = use(HostScope);
    const source = fixture.pairedSourceAvailable
      ? (hostId ?? scope ?? fixture.hostId)
      : fixture.hostId;
    return {
      saved: { hostId: source },
      client:
        fixture.pairedSourceAvailable && source === 'host-b' ? fixture.otherClient : fixture.client,
    };
  },
  useHostSnapshot: (client: unknown) =>
    client === fixture.otherClient
      ? {
          ...fixture.snapshot,
          roster: {
            bots: [],
            channels: [{ id: 'group-a', name: 'Wrong B group', memberCount: 0, members: [] }],
          },
        }
      : fixture.snapshot,
}));
vi.mock('../src/ui/shell/channel-notification-screen', () => ({
  default: ({ channelId }: { channelId: string }) => (
    <span>
      {use(HostScope)}:{channelId}
    </span>
  ),
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ slug: 'ada', id: 'group-a', hostId: 'host-a', ...fixture.params }),
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
import { ChannelDetailsScreen } from '../src/ui/chat/channel-details-screen';
import GroupInfoScreen from '../app/group/[id]/index';
import GroupNotificationsScreen from '../app/group/[id]/notifications';

const originalStack = StackRouter({ initialRouteName: '(tabs)' }) as Parameters<
  typeof channelStackRouter
>[0];
const stack = { ...originalStack, ...channelStackRouter(originalStack) };
const options = {
  routeNames: [
    '(tabs)',
    'settings',
    'group/[id]',
    'group/[id]/notifications',
    'bot/[slug]',
    'dm/[slug]',
    'channel/[id]',
    'channel-files',
    'channel-details',
  ],
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
  fixture.params = {};
  fixture.snapshot.roster!.activityChannels = [];
  fixture.startActivity.mockClear();
  fixture.activity.busy = false;
  fixture.activity.ready = true;
  fixture.snapshot.connection = { status: 'connected', route: 'https://qa.test' };
  vi.restoreAllMocks();
  fixture.pairedSourceAvailable = false;
  fixture.snapshot.roster!.channels = [];
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

it('All opens the routed Group Profile even when the enclosing sheet still has another Host scope', async () => {
  fixture.hostId = 'host-b';
  fixture.pairedSourceAvailable = true;
  fixture.snapshot.roster!.channels = [
    { id: 'group-a', name: 'QA Planning A', memberCount: 1, members: ['ada'] },
  ];
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () =>
    root!.render(
      <HostScope value="host-b">
        <GroupInfoScreen />
      </HostScope>,
    ),
  );
  expect(node.textContent).not.toContain(t.sourceChanged);
  expect(node.textContent).toContain('QA Planning A');
  expect(node.textContent).not.toContain('Wrong B group');
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 2,
    index: 1,
    routeNames: options.routeNames,
    routes: [
      { key: 'tabs', name: '(tabs)' },
      { key: 'group', name: 'group/[id]', params: { id: 'group-a', hostId: 'host-a' } },
    ],
  };
  const notifications = [...node.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes(t.notifications),
  );
  expect(notifications).toBeDefined();
  await act(async () => notifications!.click());
  expect(state.routes[state.index]).toMatchObject({
    name: 'group/[id]/notifications',
    params: { id: 'group-a', hostId: 'host-a' },
  });
  await act(async () =>
    root!.render(
      <HostScope value="host-b">
        <GroupNotificationsScreen />
      </HostScope>,
    ),
  );
  expect(node.textContent).toBe('host-a:group-a');
});

it('a routed member Profile can open its own DM from another enclosing Host scope', async () => {
  fixture.hostId = 'host-b';
  fixture.pairedSourceAvailable = true;
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 3,
    index: 2,
    routeNames: options.routeNames,
    routes: [
      { key: 'tabs', name: '(tabs)' },
      { key: 'group', name: 'group/[id]', params: { id: 'group-a', hostId: 'host-a' } },
      { key: 'profile', name: 'bot/[slug]', params: { slug: 'ada', hostId: 'host-a' } },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () =>
    root!.render(
      <HostScope value="host-b">
        <BotProfileScreen />
      </HostScope>,
    ),
  );
  expect(node.textContent).not.toContain(t.sourceChanged);
  const message = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === t.profileMessage,
  );
  expect(message).toBeDefined();
  await act(async () => message!.click());
  expect(state.routes[state.index]).toMatchObject({
    name: 'dm/[slug]',
    params: { slug: 'ada', hostId: 'host-a' },
  });
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('group');
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

it('opens DM files from Profile and returns to the retained profile and conversation', async () => {
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
      { key: 'original-profile', name: 'bot/[slug]', params: { slug: 'ada', hostId: 'host-a' } },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<BotProfileScreen />));
  const files = node.querySelector<HTMLButtonElement>('[data-testid="channel-files-open"]');
  expect(files).not.toBeNull();
  await act(async () => files!.click());
  expect(state.routes[state.index]).toMatchObject({
    name: 'channel-files',
    params: { hostId: 'host-a', channelId: 'dm-ada', botSlug: 'ada' },
  });
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('original-profile');
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('original-dm');
});

it('opens the exact group files from details without changing the parent Channel', async () => {
  fixture.snapshot.roster!.channels = [
    { id: 'group-a', name: 'Group', members: [], memberCount: 0 },
  ];
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 3,
    index: 2,
    routeNames: options.routeNames,
    routes: [
      { key: 'tabs', name: '(tabs)' },
      {
        key: 'original-channel',
        name: 'channel/[id]',
        params: { id: 'group-a', hostId: 'host-a' },
      },
      { key: 'group-details', name: 'group/[id]', params: { id: 'group-a', hostId: 'host-a' } },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<GroupInfoScreen />));
  const files = node.querySelector<HTMLButtonElement>('[data-testid="channel-files-open"]');
  expect(files).not.toBeNull();
  await act(async () => files!.click());
  expect(state.routes[state.index]).toMatchObject({
    name: 'channel-files',
    params: { hostId: 'host-a', channelId: 'group-a' },
  });
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('group-details');
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('original-channel');
});

it('keeps iOS tracking explicit and scoped to the request passed from the chat Chip', async () => {
  const previousOS = Platform.OS;
  Object.assign(Platform, { OS: 'ios' });
  try {
    fixture.params = { channelId: 'dm-ada', activityMessageId: 'request-a' };
    const alert = vi.spyOn(Alert, 'alert');
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
    await act(async () => root!.render(<BotProfileScreen />));
    const control = node.querySelector<HTMLButtonElement>('[data-testid="request-activity"]');
    expect(control).not.toBeNull();
    expect(control!.disabled).toBe(false);
    await act(async () => control!.click());
    expect(alert).toHaveBeenCalledWith(
      t.lockScreen.title,
      t.lockScreen.startBody,
      expect.any(Array),
    );
    expect(fixture.startActivity).not.toHaveBeenCalled();
    await act(async () =>
      alert.mock.lastCall![2]!.find((action) => action.text === t.lockScreen.track)!.onPress!(),
    );
    expect(fixture.startActivity).toHaveBeenCalledWith({
      hostId: 'host-a',
      channelId: 'dm-ada',
      botSlug: 'ada',
      messageId: 'request-a',
    });
    fixture.activity.busy = true;
    await act(async () => root!.render(<BotProfileScreen />));
    expect(
      node.querySelector<HTMLButtonElement>('[data-testid="request-activity"]')!.disabled,
    ).toBe(true);
  } finally {
    Object.assign(Platform, { OS: previousOS });
  }
});

it.each(['refused', 'other-channel', 'other-host'])(
  'does not expose DM files for %s context',
  async (reason) => {
    if (reason === 'refused')
      fixture.snapshot.connection = {
        status: 'refused',
        reason: 'denied',
        route: 'https://qa.test',
        code: 'device-revoked',
      };
    if (reason === 'other-channel') fixture.params = { channelId: 'someone-else' };
    if (reason === 'other-host') fixture.hostId = 'host-b';
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
    await act(async () => root!.render(<BotProfileScreen />));
    expect(node.querySelector('[data-testid="channel-files-open"]')).toBeNull();
  },
);

it('does not add lock-screen actions on Android', async () => {
  const previousOS = Platform.OS;
  Object.assign(Platform, { OS: 'android' });
  try {
    fixture.params = { channelId: 'dm-ada', activityMessageId: 'request-a' };
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
    await act(async () => root!.render(<BotProfileScreen />));
    expect(node.querySelector('[data-testid="request-activity"]')).toBeNull();
    expect(node.querySelector('[data-testid="channel-files-open"]')).not.toBeNull();
  } finally {
    Object.assign(Platform, { OS: previousOS });
  }
});

it('disables iOS tracking without a committed request supplied by the chat', async () => {
  const previousOS = Platform.OS;
  Object.assign(Platform, { OS: 'ios' });
  try {
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
    await act(async () => root!.render(<BotProfileScreen />));
    expect(
      node.querySelector<HTMLButtonElement>('[data-testid="request-activity"]')!.disabled,
    ).toBe(true);
  } finally {
    Object.assign(Platform, { OS: previousOS });
  }
});

it('keeps Bot-to-Bot details limited to its own files and refuses removed access', async () => {
  fixture.snapshot.roster!.activityChannels = [
    { id: 'bot-dm', type: 'dm', name: 'Ada and Bob', members: ['ada', 'bob'] },
  ];
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 2,
    index: 1,
    routeNames: options.routeNames,
    routes: [
      { key: 'chat', name: 'channel/[id]', params: { id: 'bot-dm', hostId: 'host-a' } },
      {
        key: 'details',
        name: 'channel-details',
        params: { channelId: 'bot-dm', hostId: 'host-a' },
      },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<ChannelDetailsScreen hostId="host-a" channelId="bot-dm" />));
  expect(node.textContent).not.toContain(t.groupDisband);
  expect(node.textContent).not.toContain(t.groupRename);
  await act(async () =>
    node!.querySelector<HTMLButtonElement>('[data-testid="channel-files-open"]')!.click(),
  );
  expect(state.routes[state.index]).toMatchObject({
    name: 'channel-files',
    params: { channelId: 'bot-dm', hostId: 'host-a' },
  });
  fixture.snapshot.connection = {
    status: 'refused',
    reason: 'denied',
    route: 'https://qa.test',
    code: 'device-revoked',
  };
  await act(async () => root!.render(<ChannelDetailsScreen hostId="host-a" channelId="bot-dm" />));
  expect(node.querySelector('[data-testid="channel-files-open"]')).toBeNull();
  expect(node.textContent).toContain(t.refused);
});
