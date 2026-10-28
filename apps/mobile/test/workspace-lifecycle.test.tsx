// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { View } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import type { CloudRow } from '../src/cloud/client';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';

const fixture = vi.hoisted(() => ({
  rows: [] as CloudRow[],
  hosts: [
    { hostId: 'a', hostName: 'A', routes: ['https://a.test'], deviceId: 'qa', credential: 'first' },
    {
      hostId: 'b',
      hostName: 'B',
      routes: ['https://b.test'],
      deviceId: 'qa',
      credential: 'second',
    },
  ],
  selected: 'a',
  hostListeners: new Set<() => void>(),
  cloudListeners: new Set<() => void>(),
  invalidations: 0,
  filter: 'all',
}));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  BackHandler: { addEventListener: () => ({ remove() {} }) },
}));
vi.mock('expo-router', () => ({
  useNavigationContainerRef: () => navigation,
  usePathname: () => '/',
  useGlobalSearchParams: () => ({}),
  router: {},
}));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  Rect: () => null,
  Circle: () => null,
}));
vi.mock('react-native-gesture-handler', () => {
  const gesture = {
    enabled: () => gesture,
    hitSlop: () => gesture,
    activeOffsetX: () => gesture,
    failOffsetY: () => gesture,
    onStart: () => gesture,
    onUpdate: () => gesture,
    onEnd: () => gesture,
  };
  return {
    Gesture: { Pan: () => gesture },
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
});
vi.mock('react-native-reanimated', async () => ({
  default: { View: (await import('./react-native-shim')).View },
  makeMutable: (value: number) => ({ value }),
  ReduceMotion: {},
  useAnimatedStyle: () => ({}),
  useReducedMotion: () => true,
  withSpring: (value: number) => value,
  runOnJS: (callback: unknown) => callback,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/primitives/drawer-material', () => ({
  SidebarMaterial: () => null,
  DrawerMaterial: () => null,
  useLiquidGlass: () => false,
}));
vi.mock('../src/ui/primitives/action-menu-button', () => ({ ActionMenuButton: () => null }));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  showActionMenu: () => {},
  showAppDialog: () => {},
}));
vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ icon: { kind: 'symbol', id: 'desktop' } }),
}));
vi.mock('../src/host/native-conversation-filter', () => ({
  conversationFilter: {
    set: (value: string) => {
      fixture.filter = value;
    },
  },
  useConversationFilter: () => [fixture.filter],
}));
vi.mock('../src/host/native-connect-account', () => ({
  connectAccount: { email: async () => null },
}));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('../src/account/native-account-profile', () => ({
  accountProfile: { getSnapshot: () => ({ status: 'signed-out' }), refresh: async () => undefined },
  useAccountProfile: () => ({ status: 'signed-out' }),
}));
vi.mock('../src/host/native-carrier', () => ({ nativeCarrier: () => ({}) }));
vi.mock('../src/host/client', () => ({
  createHostClient: () => ({ call: async () => ({ items: [] }) }),
}));
vi.mock('../src/cloud/native', () => ({
  useCloudSnapshot: () => ({ rows: fixture.rows, ready: true, busy: false }),
  cloudClient: {
    getSnapshot: () => ({ rows: fixture.rows }),
    subscribe: (fn: () => void) => {
      fixture.cloudListeners.add(fn);
      return () => fixture.cloudListeners.delete(fn);
    },
  },
}));
vi.mock('../src/host/host-session', () => ({
  useHostSessions: () =>
    fixture.hosts.map((saved) => ({
      saved,
      snapshot: { connection: { status: 'connected', route: saved.routes[0] } },
      attention: {
        status: 'ready',
        sections: { action: [], replies: [], unread: [], handled: [] },
      },
    })),
  useHostSession: () => ({
    hosts: fixture.hosts,
    saved: fixture.hosts.find((host) => host.hostId === fixture.selected),
  }),
  useHostSnapshot: () => ({ connection: { status: 'connected', route: 'https://a.test' } }),
  useInbox: () => ({
    status: 'ready',
    sections: { action: [], replies: [], unread: [], handled: [] },
  }),
  hostSession: {
    switchTo: async (id: string, current: () => boolean) => {
      if (!current()) return false;
      fixture.selected = id;
      for (const listener of fixture.hostListeners) listener();
      return true;
    },
    getState: () => ({
      hosts: fixture.hosts,
      saved: fixture.hosts.find((host) => host.hostId === fixture.selected),
    }),
    subscribe: (fn: () => void) => {
      fixture.hostListeners.add(fn);
      return () => fixture.hostListeners.delete(fn);
    },
  },
}));
import { useWorkspaceNavigation } from '../src/ui/shell/native-workspace-navigation';
import { HostDrawer, hostDrawer } from '../src/ui/shell/host-drawer';

const stack = StackRouter({ initialRouteName: '(tabs)' });
const routeNames = ['(tabs)', 'dm/[slug]', 'cloud-channels', 'cloud-services'];
const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
function initialState(): Parameters<typeof stack.getStateForAction>[0] {
  return {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 0,
    index: 0,
    routeNames,
    routes: [{ key: 'tabs', name: '(tabs)' }],
  };
}
let state = initialState();
const navigation = {
  isReady: () => true,
  getRootState: () => state,
  dispatch(action: Parameters<typeof stack.getStateForAction>[1]) {
    const result = stack.getStateForAction(state, action, options);
    if (typeof result === 'object') state = result.state;
  },
};
const invalidate = () => {
  fixture.invalidations++;
};
function Entry() {
  const mounted = useWorkspaceNavigation(invalidate);
  return (
    <View ref={mounted}>
      <HostDrawer />
    </View>
  );
}
const row = (): CloudRow => ({
  config: publicInstance({
    instanceId: 'cloud',
    environment: 'uat',
    server: 'https://cloud.example.test',
    clientId: 'client_test',
    issuer: 'https://api.workos.com/user_management/client_test',
    authkitDomain: 'test-staging.authkit.app',
    mobileRedirectUri: MOBILE_REDIRECT_URI,
  }),
  hasSession: true,
  sessionUserId: 'user_a',
});
let root: Root;
let node: HTMLDivElement;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(async () => {
  state = initialState();
  fixture.rows = [row()];
  fixture.selected = 'a';
  fixture.invalidations = 0;
  fixture.hosts = [
    { hostId: 'a', hostName: 'A', routes: ['https://a.test'], deviceId: 'qa', credential: 'first' },
    {
      hostId: 'b',
      hostName: 'B',
      routes: ['https://b.test'],
      deviceId: 'qa',
      credential: 'second',
    },
  ];
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root.render(<Entry />));
});
afterEach(() => {
  hostDrawer.close();
  act(() => root.unmount());
  node.remove();
});
const push = (name: string, params: object) =>
  navigation.dispatch({ type: 'PUSH', payload: { name, params } });

it('pressing a Computer in the real drawer resets scoped pages and keeps the existing tab root', async () => {
  push('dm/[slug]', { hostId: 'a', slug: 'ada' });
  await act(async () => hostDrawer.open());
  const target = node.querySelector<HTMLButtonElement>('[data-testid="drawer-host-b"]');
  expect(target).not.toBeNull();
  await act(async () => target!.click());
  expect(fixture.selected).toBe('b');
  expect(state.routes).toEqual([{ key: 'tabs', name: '(tabs)' }]);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes).toHaveLength(1);
});

it('account logout removes stale Cloud pages from Back but leaves account management usable', async () => {
  push('cloud-channels', { instanceId: 'cloud', channelId: 'ch_a' });
  push('cloud-services', {});
  await act(async () => {
    fixture.rows = [{ ...row(), hasSession: false, sessionUserId: undefined }];
    for (const listener of fixture.cloudListeners) listener();
  });
  expect(state.routes.map((route) => route.name)).toEqual(['(tabs)', 'cloud-services']);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes).toHaveLength(1);
  expect(fixture.invalidations).toBe(1);
});

it('same-instance account replacement cannot revive an old Channel', async () => {
  push('cloud-channels', { instanceId: 'cloud', channelId: 'ch_a' });
  await act(async () => {
    fixture.rows = [{ ...row(), sessionUserId: 'user_b' }];
    for (const listener of fixture.cloudListeners) listener();
  });
  expect(state.routes).toHaveLength(1);
  expect(state.routes[0]?.key).toBe('tabs');
});

it('ordinary source selection and Cloud organization refresh preserve valid history', async () => {
  push('dm/[slug]', { hostId: 'a', slug: 'ada' });
  const before = state;
  await act(async () => {
    fixture.selected = 'b';
    for (const listener of fixture.hostListeners) listener();
    fixture.rows = [
      {
        ...row(),
        organization: {
          organizationId: 'org_other',
          name: 'Other',
          description: '',
          role: 'member',
          version: 1,
        },
      },
    ];
    for (const listener of fixture.cloudListeners) listener();
  });
  expect(state).toBe(before);
  expect(fixture.invalidations).toBe(0);
});

it('unpairing removes only routes whose explicit Host source was removed', async () => {
  push('dm/[slug]', { hostId: 'b', slug: 'ada' });
  push('dm/[slug]', { hostId: 'a', slug: 'ada' });
  await act(async () => {
    fixture.hosts = fixture.hosts.filter((host) => host.hostId !== 'a');
    for (const listener of fixture.hostListeners) listener();
  });
  expect(state.routes).toHaveLength(2);
  expect(state.routes[1]?.params).toMatchObject({ hostId: 'b' });
});
