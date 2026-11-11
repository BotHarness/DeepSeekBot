// @vitest-environment jsdom
import { channelNavigationHarness } from './channel-navigation-harness';
const channelHistory = channelNavigationHarness();
import { expect, it, onTestFinished, vi } from 'vitest';

import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';
vi.mock('../src/host/app-version', () => ({ installedAppVersion: () => '1.7.0' }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native-tab-view', () => import('./tab-view-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Circle: () => null }));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return {
    Redirect: () => null,
    Stack,
    router: { push },
    useIsFocused: () => true,
    useNavigationContainerRef: () => channelHistory.navigation,
    useFocusEffect: (work: () => void) => useLayoutEffect(work, [work]),
    useRouter: () => ({ push, prefetch: () => undefined }),
  };
});
vi.mock('../src/ui/shell/use-workspace-panel', () => ({ useWorkspacePanel: () => undefined }));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ icon: { kind: 'symbol', id: 'desktop' } }),
}));

vi.mock('../src/ui/shell/home-header', () => ({
  HomeHeader: ({
    actions,
    search,
    children,
    connection,
  }: {
    connection?: { status: string };
    actions?: ReactNode;
    search?: ReactNode;
    children: ReactNode | ((height: number) => ReactNode);
  }) => (
    <div data-connection={connection?.status}>
      {search ?? actions}
      {typeof children === 'function' ? children(0) : children}
    </div>
  ),
}));
vi.mock('../src/ui/shell/host-drawer', () => ({
  useHostDrawerOpen: () => false,
  HostDrawerEdge: ({ children }: { children: ReactNode | ((height: number) => ReactNode) }) =>
    typeof children === 'function' ? children(0) : children,
}));
vi.mock('../src/ui/shell/human-avatar', () => ({ HumanAvatarButton: () => null }));
vi.mock('../src/ui/primitives/item-menu', () => ({
  ItemMenu: ({
    title,
    actions,
    children,
  }: {
    title: string;
    actions: Array<{ key: string; run(): void }>;
    children(open: () => void): ReactNode;
  }) => (
    <div data-menu={title}>
      {children(() => {})}
      {actions.map((action) => (
        <button key={action.key} data-menu-action={action.key} onClick={action.run}>
          {action.key}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));

import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHostLooks } from '../src/host/host-look';
import { createSectionCollapse } from '../src/host/section-collapse';
const push = vi.fn();
const looks = createHostLooks({ read: async () => undefined, write() {} });
vi.mock('../src/host/native-host-look', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    hostLooks: looks,
    useHostLook: (id: string) => useSyncExternalStore(looks.subscribe, () => looks.look(id)),
  };
});
const collapse = createSectionCollapse({ read: async () => undefined, write() {} });
vi.mock('../src/host/native-section-collapse', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    sectionCollapse: collapse,
    useCollapsedSections: (id: string) =>
      useSyncExternalStore(collapse.subscribe, () => collapse.collapsed(id ?? '')),
  };
});
vi.mock('../src/cloud/native', () => ({ useCloudSnapshot: () => ({ ready: true, rows: [] }) }));
vi.mock('../src/cloud/native-conversations', () => ({
  useCloudConversations: () => ({ ready: true, rows: [], workspaces: [], errors: [] }),
  cloudConversations: { refresh: async () => undefined },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function remote(id: string, ping: ((host: FakeHost) => void) | undefined) {
  const host = new FakeHost(id);
  host.methods.set('list', () => ({
    bots: [
      {
        slug: 'ada',
        displayName: `Bot ${id}`,
        roles: [],
        state: 'idle',
        paused: false,
        dmChannelId: 'dm-ada',
      },
    ],
  }));
  ping?.(host);
  remotes.set(`${id}.tailnet.ts.net`, host);
  return host;
}

const saved = (hostId: string, credential: string) => ({
  hostId,
  hostName: `Studio ${hostId}`,
  routes: [`https://${hostId}.tailnet.ts.net`],
  deviceId: 'device-1',
  credential,
});

const olderComputer = (host: FakeHost) => host.absent.add('ping');
const newerComputer = (host: FakeHost) =>
  host.methods.set('ping', () => ({ ok: true, version: '1.9.0', minAppVersion: '1.8.0' }));
const sameRelease = (host: FakeHost) =>
  host.methods.set('ping', () => ({ ok: true, version: '1.7.0', minAppVersion: '1.6.0' }));

it('suggests updating either side for saved and newly paired computers without blocking them', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  vi.stubGlobal('requestIdleCallback', () => 1);
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  const old = remote('old', olderComputer);
  remote('same', sameRelease);
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      current: 'old',
      hosts: [saved('old', old.credential), saved('same', old.credential)],
    }),
  );
  const { hostSession } = await import('../src/host/host-session');
  const { conversationFilter } = await import('../src/host/native-conversation-filter');
  const { t } = await import('../src/ui/strings');
  const { default: HomeScreen } = await import('../app/(tabs)/(home)/index');
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  const chips = () => [
    ...view.querySelectorAll(
      '[data-testid="host-compatibility-host"], [data-testid="host-compatibility-app"]',
    ),
  ];
  const dismiss = () =>
    view.querySelector<HTMLButtonElement>('[data-testid="host-compatibility-dismiss"]');
  try {
    await act(async () => root.render(<HomeScreen />));
    await act(async () => conversationFilter.set(JSON.stringify(['computer', 'old'])));
    await act(async () => {
      await vi.waitFor(() => expect(view.textContent).toContain(t.hostCompatibility.updateHost));
    });
    expect(view.textContent).toContain('Bot old');
    await act(async () => dismiss()?.click());
    expect(view.textContent).not.toContain(t.hostCompatibility.updateHost);
    expect(view.textContent).toContain('Bot old');

    await act(async () => conversationFilter.set(JSON.stringify(['computer', 'same'])));
    await act(async () => {
      await vi.waitFor(() => expect(view.textContent).toContain('Bot same'));
    });
    expect(chips()).toEqual([]);

    const fresh = remote('fresh', newerComputer);
    await act(async () => hostSession.pair(saved('fresh', fresh.credential)));
    await act(async () => conversationFilter.set(JSON.stringify(['computer', 'fresh'])));
    await act(async () => {
      await vi.waitFor(() => expect(view.textContent).toContain(t.hostCompatibility.updateApp));
    });
    await act(async () => {
      await vi.waitFor(() => expect(view.textContent).toContain('Bot fresh'));
    });
    expect(chips().map((chip) => chip.getAttribute('data-testid'))).toEqual([
      'host-compatibility-app',
    ]);
  } finally {
    act(() => root.unmount());
    view.remove();
  }
});
