// @vitest-environment jsdom
import { Platform, Alert } from 'react-native';
import { act, use, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import type { ConversationSnapshot } from '../src/host/conversation';
import { createHostClient, type HostClient, type HostSnapshot } from '../src/host/client';
import {
  channelRouteId,
  channelStackRouter,
  navigateChannel,
} from '../src/ui/shell/channel-navigation';
import { t } from '../src/ui/strings';
import { FakeHost } from './fake-host';
import { ChannelFilesScreen } from '../src/ui/chat/channel-files-screen';
import { ChannelFilesTab } from '../src/ui/chat/channel-files-tab';
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
    fileClient: undefined as HostClient | undefined,
    params: {} as Record<string, string>,
    activity: { ready: true, busy: false, tracking: false },
    conversation: {
      status: 'live',
      messages: [],
      drafts: [],
      hasOlder: false,
      loadingOlder: false,
      fromCache: false,
    } as ConversationSnapshot,
    conversationListeners: new Set<() => void>(),
    startActivity: vi.fn(async () => {}),
    stopActivity: vi.fn(async () => {}),
    hostId: 'host-a',
    pairedSourceAvailable: false,
    client: {
      call: async () => ({}),
      subscribe: () => () => {},
      follow: () => () => {},
      getSnapshot: () => snapshot,
      retryNow: vi.fn(),
    },
    otherClient: { call: async () => ({}), subscribe: () => () => {} },
    resetTabs: () => {},
  };
});
vi.mock('../src/host/native-live-activity', () => ({
  useRequestActivity: () => fixture.activity,
  requestActivitySession: {
    start: fixture.startActivity,
    stop: fixture.stopActivity,
  },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('expo-file-system', () => ({
  File: class {
    exists = false;
  },
  Paths: { document: '' },
}));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: () => void) => callback(),
}));
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
vi.mock('../src/ui/chat/native-profile-tab-memory', async () => {
  const { createProfileTabMemory } = await import('../src/ui/chat/profile-tabs');
  const memory = {
    current: createProfileTabMemory({
      read: async () => ({}),
      write: () => {},
    }),
  };
  fixture.resetTabs = () => {
    memory.current = createProfileTabMemory({
      read: async () => ({}),
      write: () => {},
    });
  };
  return {
    profileTabMemory: {
      get: (kind: 'bot') => memory.current.get(kind),
      remember: (kind: 'bot', tab: Parameters<typeof memory.current.remember>[1]) =>
        memory.current.remember(kind, tab),
      subscribe: (listener: () => void) => memory.current.subscribe(listener),
    },
  };
});
vi.mock('../src/host/pick-avatar-image', () => ({
  pickAvatarImage: async () => undefined,
}));
vi.mock('../src/host/host-session', () => ({
  useConversation: () => ({
    subscribe: (listener: () => void) => {
      fixture.conversationListeners.add(listener);
      return () => fixture.conversationListeners.delete(listener);
    },
    getSnapshot: () => fixture.conversation,
  }),
  useHostSession: (hostId?: string) => {
    const scope = use(HostScope);
    const source = fixture.pairedSourceAvailable
      ? (hostId ?? scope ?? fixture.hostId)
      : fixture.hostId;
    return {
      saved: { hostId: source },
      client:
        fixture.pairedSourceAvailable && source === 'host-b'
          ? fixture.otherClient
          : (fixture.fileClient ?? fixture.client),
    };
  },
  useHostSnapshot: (client: unknown) =>
    client === fixture.fileClient && fixture.fileClient
      ? fixture.fileClient.getSnapshot()
      : client === fixture.otherClient
        ? {
            ...fixture.snapshot,
            roster: {
              bots: [],
              channels: [
                {
                  id: 'group-a',
                  name: 'Wrong B group',
                  memberCount: 0,
                  members: [],
                },
              ],
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
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({
    slug: 'ada',
    id: 'group-a',
    hostId: 'host-a',
    ...fixture.params,
  }),
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
  fixture.fileClient?.stop();
  fixture.fileClient = undefined;
  fixture.params = {};
  fixture.snapshot.roster!.activityChannels = [];
  fixture.startActivity.mockClear();
  fixture.conversation = { ...fixture.conversation, messages: [] };
  fixture.activity.busy = false;
  fixture.activity.ready = true;
  fixture.snapshot.connection = {
    status: 'connected',
    route: 'https://qa.test',
  };
  vi.restoreAllMocks();
  fixture.pairedSourceAvailable = false;
  fixture.snapshot.roster!.channels = [];
  fixture.resetTabs();
});

async function openFilesTab() {
  const tab = node!.querySelector<HTMLElement>('[data-testid="profile-tab-files"]');
  expect(tab).not.toBeNull();
  await act(async () => tab!.click());
}

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
      {
        key: 'profile',
        name: 'bot/[slug]',
        params: { slug: 'ada', hostId: 'host-a' },
      },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<BotProfileScreen />));
  expect(node.textContent).toContain(t.sourceChanged);
  expect(node.querySelector('[data-testid="profile-tab-heading"]')).toBeNull();
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
      {
        key: 'profile',
        name: 'bot/[slug]',
        params: { slug: 'ada', hostId: 'host-a' },
      },
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
    {
      id: 'group-a',
      name: 'Other Host group',
      memberCount: 1,
      members: ['ada'],
    },
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
      {
        key: 'group',
        name: 'group/[id]',
        params: { id: 'group-a', hostId: 'host-a' },
      },
    ],
  };
  const settings = node.querySelector<HTMLElement>('[data-testid="profile-tab-settings"]');
  expect(settings).not.toBeNull();
  await act(async () => settings!.click());
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
      {
        key: 'profile',
        name: 'bot/[slug]',
        params: { slug: 'ada', hostId: 'host-a' },
      },
    ],
  };
  navigation.dispatch({
    type: 'NAVIGATE',
    payload: {
      name: 'channel/[id]',
      params: {
        id: 'team',
        hostId: 'host-a',
        __internal__PreviewKey: 'preview',
      },
    },
  });
  expect(state.routes.map((route) => route.name)).toEqual(['(tabs)', 'bot/[slug]', 'channel/[id]']);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('profile');
});

it('shows the DM files in the Files tab and keeps the profile and conversation', async () => {
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
        key: 'original-dm',
        name: 'dm/[slug]',
        params: { slug: 'ada', hostId: 'host-a' },
      },
      {
        key: 'original-profile',
        name: 'bot/[slug]',
        params: { slug: 'ada', hostId: 'host-a' },
      },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<BotProfileScreen />));
  await openFilesTab();
  expect(node.querySelector('[data-testid="profile-tab-heading"]')?.textContent).toBe(
    t.profileTabs.files,
  );
  expect(node.querySelector('[data-testid="profile-files-none"]')).toBeNull();
  expect(state.routes[state.index]?.key).toBe('original-profile');
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('original-dm');
});

it('shows the group files in the Group Profile without leaving the parent Channel', async () => {
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
      {
        key: 'group-details',
        name: 'group/[id]',
        params: { id: 'group-a', hostId: 'host-a' },
      },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(<GroupInfoScreen />));
  expect(node.querySelector('[data-testid="profile-tab-heading"]')?.textContent).toBe(
    t.profileTabs.members,
  );
  await openFilesTab();
  expect(node.querySelector('[data-testid="profile-tab-heading"]')?.textContent).toBe(
    t.profileTabs.files,
  );
  expect(node.querySelector('[data-testid="channel-files-segments"]')).not.toBeNull();
  expect(node.querySelector('[data-testid="profile-files-none"]')).toBeNull();
  expect(state.routes[state.index]?.key).toBe('group-details');
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.key).toBe('original-channel');
});

it('keeps iOS tracking explicit and scoped to the request passed from the chat Chip', async () => {
  const previousOS = Platform.OS;
  Object.assign(Platform, { OS: 'ios' });
  try {
    fixture.params = { channelId: 'dm-ada', activityMessageId: 'request-a' };
    fixture.conversation = {
      ...fixture.conversation,
      messages: [
        {
          id: 'request-a',
          at: '',
          author: 'human',
          body: 'Hello',
          attachments: [],
          delivery: 'pending',
        },
      ],
    };
    const alert = vi.spyOn(Alert, 'alert');
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
    await act(async () => root!.render(<BotProfileScreen />));
    const control = node.querySelector<HTMLButtonElement>('[data-testid="request-activity"]');
    expect(control).not.toBeNull();
    expect(control!.disabled).toBe(true);
    await act(async () => {
      fixture.conversation = {
        ...fixture.conversation,
        messages: [
          {
            id: 'request-a',
            at: '',
            author: 'human',
            body: 'Hello',
            attachments: [],
            delivery: 'committed',
            source: {
              channelId: 'dm-ada',
              revision: 1,
              message: {
                id: 'request-a',
                at: '',
                body: 'Hello',
                author: { kind: 'human' },
              },
            },
          },
        ],
      };
      fixture.conversationListeners.forEach((listener) => listener());
    });
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
    if (reason === 'other-host') {
      expect(node.querySelector('[data-testid="profile-tab-heading"]')).toBeNull();
      return;
    }
    await openFilesTab();
    expect(node.querySelector('[data-testid="profile-files-none"]')).not.toBeNull();
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
    await openFilesTab();
    expect(node.querySelector('[data-testid="profile-files-none"]')).toBeNull();
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
      {
        key: 'chat',
        name: 'channel/[id]',
        params: { id: 'bot-dm', hostId: 'host-a' },
      },
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
  expect(node.querySelector(`[role="tablist"][aria-label="${t.profileTabsLabel}"]`)).toBeNull();
  expect(node.querySelector('[data-testid="profile-tab-heading"]')?.textContent).toBe(
    t.profileTabs.files,
  );
  expect(node.querySelector('[data-testid="profile-files-none"]')).toBeNull();
  fixture.snapshot.connection = {
    status: 'refused',
    reason: 'denied',
    route: 'https://qa.test',
    code: 'device-revoked',
  };
  await act(async () => root!.render(<ChannelDetailsScreen hostId="host-a" channelId="bot-dm" />));
  expect(node.querySelector('[data-testid="channel-files-list"]')).toBeNull();
  expect(node.textContent).toContain(t.refused);
});

it('loads the file destination from its routed Host while a different Host is selected', async () => {
  const fake = new FakeHost();
  fake.channel('dm-ada').append(
    {
      id: 'file-message',
      author: { kind: 'human' },
      attachments: [
        {
          fileId: 'file:00000000-0000-4000-8000-000000000001',
          name: 'host-a-only.pdf',
          mime: 'application/pdf',
          size: 8,
        },
      ],
    },
    false,
  );
  fixture.fileClient = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
  });
  fixture.fileClient.start();
  fixture.hostId = 'host-b';
  fixture.pairedSourceAvailable = true;
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => {
    await vi.waitFor(() =>
      expect(fixture.fileClient!.getSnapshot().connection.status).toBe('connected'),
    );
    root!.render(<ChannelFilesScreen hostId="host-a" channelId="dm-ada" botSlug="ada" />);
  });
  await act(async () => {
    await vi.waitFor(() => expect(node!.textContent).toContain('host-a-only.pdf'));
  });
  expect(node.textContent).not.toContain(t.sourceChanged);
  expect(fixture.hostId).toBe('host-b');
});

it('offers recovery instead of indefinite loading when Bot-to-Bot details open offline', async () => {
  const roster = fixture.snapshot.roster!;
  delete fixture.snapshot.roster;
  fixture.snapshot.connection = {
    status: 'unreachable',
    route: 'https://qa.test',
    attempt: 1,
    reason: 'offline',
  };
  try {
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
    await act(async () =>
      root!.render(<ChannelDetailsScreen hostId="host-a" channelId="bot-dm" />),
    );
    expect(node.textContent).toContain(t.channelFiles.disconnected);
    const retry = node.querySelector<HTMLButtonElement>('[data-testid="channel-details-retry"]');
    expect(retry).not.toBeNull();
    await act(async () => retry!.click());
    expect(fixture.client.retryNow).toHaveBeenCalled();
  } finally {
    fixture.snapshot.roster = roster;
  }
});

it('splits the profile Files tab into Media and Files segments with their own empty states', async () => {
  const fake = new FakeHost();
  fake.channel('dm-ada').append(
    {
      id: 'shared',
      author: { kind: 'human' },
      attachments: [
        {
          fileId: 'file:00000000-0000-4000-8000-000000000002',
          name: 'sunset.png',
          mime: 'image/png',
          size: 8,
        },
        {
          fileId: 'file:00000000-0000-4000-8000-000000000003',
          name: 'report.pdf',
          mime: 'application/pdf',
          size: 8,
        },
      ],
    },
    false,
  );
  fake.channel('dm-empty');
  const client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
  });
  fixture.fileClient = client;
  client.start();
  const tab = (channelId: string) => (
    <ChannelFilesTab client={client} hostId="host-a" channelId={channelId} botSlug="ada" active>
      {(body) => (
        <div>
          {body.rows.map((row) => (
            <div key={row.key}>{row.render()}</div>
          ))}
          {body.overlay}
        </div>
      )}
    </ChannelFilesTab>
  );
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => {
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    root!.render(tab('dm-ada'));
  });
  await act(async () => {
    await vi.waitFor(() =>
      expect(node!.querySelector(`[aria-label^="${t.openImage('sunset.png')}"]`)).not.toBeNull(),
    );
  });
  expect(node.textContent).not.toContain('report.pdf');
  const segment = (label: string) =>
    node!.querySelector<HTMLButtonElement>(
      `[data-testid="channel-files-segments"] [role="tab"][aria-label="${label}"]`,
    )!;
  expect(segment(t.channelFiles.media).getAttribute('aria-selected')).toBe('true');

  await act(async () =>
    node!.querySelector<HTMLButtonElement>(`[aria-label^="${t.openImage('sunset.png')}"]`)!.click(),
  );
  expect(node.querySelector('[role="dialog"]')).not.toBeNull();

  await act(async () => segment(t.channelFiles.files).click());
  expect(node.textContent).toContain('report.pdf');
  expect(node.textContent).toContain('PDF');
  expect(node.querySelector(`[aria-label^="${t.openImage('sunset.png')}"]`)).toBeNull();

  await act(async () => root!.render(tab('dm-empty')));
  await act(async () => {
    await vi.waitFor(() =>
      expect(node!.querySelector('[data-testid="channel-files-empty"]')?.textContent).toBe(
        t.channelFiles.empty,
      ),
    );
  });
  await act(async () => segment(t.channelFiles.media).click());
  expect(node.querySelector('[data-testid="channel-media-empty"]')?.textContent).toBe(
    t.channelFiles.mediaEmpty,
  );
});
