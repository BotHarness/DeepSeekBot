// @vitest-environment jsdom
import { channelNavigationHarness } from './channel-navigation-harness';
const channelHistory = channelNavigationHarness();
import { expect, it, vi } from 'vitest';

import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native-tab-view', () => import('./tab-view-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
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
vi.mock('../src/ui/connection-banner', () => ({ ConnectionBanner: () => null }));
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

it('All renders both real Host feeds and opens the tapped row on its own Host', async () => {
  vi.stubGlobal('requestIdleCallback', () => 1);
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  const a = new FakeHost('a');
  const b = new FakeHost('b');
  remotes.set('a.tailnet.ts.net', a);
  remotes.set('b.tailnet.ts.net', b);
  for (const [id, remote] of [
    ['a', a],
    ['b', b],
  ] as const) {
    remote.methods.set('list', () => ({
      bots: [
        {
          slug: 'same',
          displayName: `Bot ${id}`,
          roles: [],
          state: 'idle',
          paused: false,
          dmChannelId: 'dm-same',
        },
      ],
    }));
    remote.methods.set('channels', () => ({
      channels: [{ id: 'group', type: 'group', name: `Group ${id}`, members: [] }],
    }));
    remote.methods.set('rosterGet', () => ({
      pins: ['same'],
      hidden: [],
      sections: [{ id: 'work', name: `Work ${id}`, channelIds: ['group'] }],
      sectionOrder: ['work'],
    }));
  }
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      current: 'a',
      hosts: ['a', 'b'].map((hostId) => ({
        hostId,
        hostName: hostId,
        routes: [`https://${hostId}.tailnet.ts.net`],
        deviceId: 'device-1',
        credential: a.credential,
      })),
    }),
  );
  const { hostSession, useHostSession } = await import('../src/host/host-session');
  a.channel('dm-same');
  b.channel('dm-same');
  const { default: HomeScreen } = await import('../app/(tabs)/(home)/index');
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  try {
    await act(async () => {
      root.render(<HomeScreen />);
    });
    await act(async () => {
      await vi.waitFor(() =>
        expect(hostSession.getState().client?.getSnapshot().connection).toEqual({
          status: 'connected',
          route: 'https://a.tailnet.ts.net',
        }),
      );
    });
    expect(view.textContent).toContain('Bot a');
    expect(view.textContent).toContain('Bot b');
    const row = [...view.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('Bot b'),
    );
    expect(row).toBeDefined();
    channelHistory.push('dm/[slug]', { slug: 'same', hostId: 'a' });
    const originalRoute = channelHistory.state.routes.at(-1)?.key;
    await act(async () => row?.click());
    expect(channelHistory.state.routes.at(-1)).toMatchObject({
      name: 'dm/[slug]',
      params: { slug: 'same', hostId: 'b' },
    });
    expect(channelHistory.state.routes).toHaveLength(3);
    channelHistory.back();
    expect(channelHistory.state.routes.at(-1)).toMatchObject({
      key: originalRoute,
      params: { slug: 'same', hostId: 'a' },
    });
    expect(hostSession.getState().saved?.hostId).toBe('a');
    const { t } = await import('../src/ui/strings');
    const visible = () =>
      [...view.querySelectorAll<HTMLButtonElement>('button')].filter(
        (node) => !node.closest('[hidden]'),
      );
    const pinned = visible().filter((node) =>
      node.getAttribute('aria-label')?.startsWith(t.pinnedSection),
    );
    expect(pinned).toHaveLength(1);
    await act(async () => pinned[0]?.click());
    expect(visible().some((node) => node.textContent?.includes('Bot b'))).toBe(false);
    expect(visible().some((node) => node.textContent?.includes('Group b'))).toBe(true);
    await act(async () => pinned[0]?.click());
    const { conversationFilter } = await import('../src/host/native-conversation-filter');
    await act(async () => conversationFilter.set(JSON.stringify(['computer', 'b'])));
    expect(visible().some((node) => node.textContent?.includes('Work b'))).toBe(true);
    expect(visible().some((node) => node.textContent?.includes('Group a'))).toBe(false);
    await act(async () => conversationFilter.set('all'));
    function Target() {
      const { client } = useHostSession('b');
      return (
        <button
          onClick={() =>
            void client?.call('channelSend', {
              channelId: 'dm-same',
              messageId: 'from-b',
              body: 'Only B',
            })
          }
        >
          Send to B
        </button>
      );
    }
    await act(async () => root.render(<Target />));
    await act(async () => view.querySelector<HTMLButtonElement>('button')?.click());
    expect(b.channel('dm-same').messages.map((message) => message.body)).toEqual(['Only B']);
    expect(a.channel('dm-same').messages).toEqual([]);
    await act(async () => root.render(<HomeScreen />));
    await act(async () => conversationFilter.set(JSON.stringify(['computer', 'a'])));
    await act(async () =>
      b.push('botharness/followRoster', {
        type: 'latest',
        channelId: 'group',
        message: {
          id: 'new-b',
          at: '2026-10-25T12:00:00.000Z',
          author: { kind: 'human' },
          body: 'B updated while viewing A',
        },
      }),
    );
    expect(visible().some((node) => node.textContent?.includes('B updated while viewing A'))).toBe(
      false,
    );
    await act(async () => conversationFilter.set('all'));
    expect(visible().some((node) => node.textContent?.includes('B updated while viewing A'))).toBe(
      true,
    );
    const bClient = hostSession.getHost('b')?.client;
    await act(async () => b.kill());
    expect(visible().some((node) => node.textContent?.includes('Bot b'))).toBe(false);
    expect(visible().some((node) => node.textContent?.includes('Bot a'))).toBe(true);
    expect(hostSession.getHost('b')?.client).toBe(bClient);
    expect(view.textContent).not.toContain(t.hostListUnavailable);
    expect(view.querySelector('[data-testid="chat-list-retry"]')).toBeNull();
    await act(async () => {
      conversationFilter.set(JSON.stringify(['computer', 'b']));
      bClient?.retryNow();
      await vi.waitFor(() => expect(bClient?.getSnapshot().connection.status).toBe('unreachable'));
    });
    expect(hostSession.getState().saved?.hostId).toBe('a');
    expect(view.querySelector('[data-connection="unreachable"]')).not.toBeNull();
    expect(view.textContent).toContain(t.hostListUnavailable);
    expect(view.textContent).toContain('Bot b');
    expect(view.textContent).not.toContain('Bot a');
    const refreshA = vi.spyOn(hostSession.getHost('a')!.client, 'refresh');
    b.restart();
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="chat-list-retry"]')!.click();
      await vi.waitFor(() => expect(bClient?.getSnapshot().connection.status).toBe('connected'));
    });
    expect(refreshA).not.toHaveBeenCalled();
    refreshA.mockRestore();
    expect(view.textContent).not.toContain(t.hostListUnavailable);
    await act(async () => {
      conversationFilter.set('all');
      b.kill();
    });

    await act(async () => a.kill());
    expect(view.textContent).toContain(t.noOnlineChats);
    await act(async () => {
      b.restart();
      bClient?.retryNow();
      await vi.waitFor(() => expect(bClient?.getSnapshot().connection.status).toBe('connected'));
    });
    expect(visible().some((node) => node.textContent?.includes('Bot b'))).toBe(true);
    expect(b.channel('dm-same').messages).toHaveLength(1);
    b.methods.set('channelGroupDelete', () => ({ deleted: true }));
    const remove = view.querySelector<HTMLButtonElement>(
      '[data-menu="Group b"] [data-menu-action="delete"]',
    )!;
    await act(async () => remove.click());
    expect(view.textContent).toContain(t.deletion.scope('b'));
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="deletion-confirm"]')!.click(),
    );
    expect(b.calls.filter((call) => call.method === 'channelGroupDelete')).toEqual([
      { method: 'channelGroupDelete', args: { channelId: 'group' } },
    ]);
    expect(a.calls.some((call) => call.method === 'channelGroupDelete')).toBe(false);
  } finally {
    await act(async () => {
      root.unmount();
      for (const host of hostSession.getState().hosts) await hostSession.unpair(host.hostId);
    });
    view.remove();
    vi.unstubAllGlobals();
  }
});

vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));

vi.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
