// @vitest-environment jsdom
import { act, memo, useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import { createHostClient, type HostClient } from '../src/host/client';
import { FakeHost } from './fake-host';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CloudClient, type CloudRow } from '../src/cloud/client';
import { createHash } from 'node:crypto';
import {
  createCloudConversations,
  type CloudConversation,
  type ConversationWorkspace,
} from '../src/cloud/conversations';
import { channelNavigationHarness } from './channel-navigation-harness';
let channelHistory = channelNavigationHarness();
const whoami = vi.fn(async (_id: string) => {});
import type { HumanAttentionItem } from '../src/host/wire';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import { cloudViewScope } from '../src/cloud/workspace-directory';
import { computerEnvironmentKey, cloudEnvironmentKey } from '../src/host/conversation-environments';
import { HOST_COLORS, type HostColorId } from '../src/ui/design/host-look';
import { Platform } from 'react-native';
import { HostAccentProvider } from '../src/ui/shell/host-accent-provider';
import { HomeHeader } from '../src/ui/shell/home-header';
import { DesignThemeProvider, resolveTheme, useDesignTheme } from '../src/ui/design/theme';
import type { RosterView } from '../src/host/client';
import { hostDrawer } from '../src/ui/shell/host-drawer';

const { push, cloudState, directoryState, hostState, call, refresh, menus, rowProps } = vi.hoisted(
  () => ({
    push: vi.fn(),
    call: vi.fn(async (..._args: unknown[]) => ({})),
    refresh: vi.fn(async () => undefined),
    menus: [] as Array<{ text: string; onPress?: () => unknown }[]>,
    rowProps: new Map<string, Record<string, unknown>>(),
    hostState: {
      connecting: false,
      removed: false,
      color: undefined as HostColorId | undefined,
      fontScale: 1,
      actions: false,
      unread: false,
      hostId: 'h1',
      live: undefined as HostClient | undefined,
      activityItems: [] as HumanAttentionItem[],
    },
    cloudState: {
      live: undefined as CloudClient | undefined,
      error: undefined as string | undefined,
      ready: true,
      busy: false,
      rows: [] as CloudRow[],
    },
    directoryState: {
      live: undefined as ReturnType<typeof createCloudConversations> | undefined,
      busy: false,
      ready: true,
      rows: [] as CloudConversation[],
      workspaces: [] as ConversationWorkspace[],
      errors: [] as string[],
    },
  }),
);
vi.mock('../src/ui/primitives/app-dialog', () => ({
  showActionMenu: (_title: string, actions: { text: string; onPress?: () => unknown }[]) =>
    menus.push(actions),
  showAppDialog: vi.fn(),
}));
vi.mock('../src/ui/shell/conversation-peek', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/shell/conversation-peek')>();
  const { Platform } = await import('react-native');
  return {
    ...actual,
    get conversationPeek() {
      return Platform.OS === 'ios';
    },
  };
});
const roster: RosterView = {
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
      preview: 'Done',
    },
    {
      slug: 'xiaoming',
      displayName: '小明',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
    },
  ],
  channels: [{ id: 'launch-team', name: 'Launch team', memberCount: 3, members: [] }],
};

const activityClient = {
  getSnapshot: () => ({ connection: { status: 'connected' }, roster }),
  subscribe: () => () => {},
  onLive: () => () => {},
  refresh,
  call: async (method: string, args?: { category?: string }) => {
    if (method === 'humanAttention')
      return { queryVersion: 1, items: args?.category === 'action' ? hostState.activityItems : [] };
    if (method === 'channelUnreadCounts') return { channels: [] };
    return call(method, args);
  },
};

vi.mock('../src/host/native-conversation-filter', async () => {
  const { useSyncExternalStore } = await import('react');
  const { createConversationFilter } = await import('../src/host/conversation-filter');
  const conversationFilter = createConversationFilter({
    read: async () => undefined,
    write: () => {},
  });
  return {
    conversationFilter,
    useConversationFilter: () => [
      useSyncExternalStore(conversationFilter.subscribe, conversationFilter.getSnapshot),
      conversationFilter.set,
    ],
  };
});
vi.mock('../src/cloud/native', () => ({
  useCloudSnapshot: () =>
    cloudState.live
      ? useSyncExternalStore(cloudState.live.subscribe, cloudState.live.getSnapshot)
      : cloudState,
  cloudClient: {
    getSnapshot: () => cloudState.live?.getSnapshot() ?? cloudState,
    whoami: (id: string) => (cloudState.live ? cloudState.live.whoami(id) : whoami(id)),
    useOrganization: (id: string, organizationId: string) =>
      cloudState.live!.useOrganization(id, organizationId),
  },
}));
vi.mock('../src/cloud/native-conversations', () => ({
  useCloudConversations: () =>
    directoryState.live
      ? useSyncExternalStore(directoryState.live.subscribe, directoryState.live.getSnapshot)
      : directoryState,
  cloudConversations: {
    refresh: async () => {
      await directoryState.live?.refresh();
    },
  },
}));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}));
vi.mock('expo-quick-actions', () => ({ setItems: async () => undefined }));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('../src/ui/shell/last-chat-swipe', () => ({
  LastChatSwipe: ({ enabled, children }: { enabled: boolean; children: ReactNode }) => (
    <div data-testid="last-chat-swipe" data-enabled={String(enabled)}>
      {children}
    </div>
  ),
}));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native-tab-view', () => import('./tab-view-shim'));
vi.mock('react-native', async () => {
  const native = await import('./react-native-shim');
  return {
    ...native,
    BackHandler: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
    Pressable: (props: Parameters<typeof native.Pressable>[0]) => {
      const id = props.testID;
      if (typeof id === 'string' && id.startsWith('conversation-row-')) rowProps.set(id, props);
      return native.Pressable(props);
    },
    useWindowDimensions: () => ({
      ...native.useWindowDimensions(),
      fontScale: hostState.fontScale,
    }),
    Dimensions: {
      get: () => ({
        ...native.useWindowDimensions(),
        fontScale: hostState.fontScale,
      }),
      addEventListener: (_event: string, _changed: () => void) => ({ remove() {} }),
    },
  };
});
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-svg', () => ({
  default: ({ width, height }: { width: number; height: number }) => (
    <svg width={width} height={height} />
  ),
  Path: () => null,
  Circle: () => null,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  const Link = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  Link.Trigger = ({ children }: { children: ReactNode }) => children;
  Link.Preview = () => <div data-testid="native-preview" />;
  Link.Menu = ({ children }: { children: ReactNode }) => (
    <div data-testid="native-context-menu">{children}</div>
  );
  Link.MenuAction = ({ children, onPress }: { children: ReactNode; onPress(): void }) => (
    <button data-menu-title={children} onClick={onPress}>
      {children}
    </button>
  );
  return {
    Link,
    Redirect: () => null,
    Stack,
    router: { push },
    useIsFocused: () => true,
    useFocusEffect: (work: () => void) => useLayoutEffect(work, [work]),
    useRouter: () => ({ push, prefetch: () => undefined }),
    useNavigationContainerRef: () => channelHistory.navigation,
  };
});
vi.mock('../src/host/host-session', () => ({
  useHostSessions: () =>
    hostState.removed
      ? []
      : [
          {
            saved: { hostId: hostState.hostId, hostName: 'studio' },
            client: hostState.live ?? activityClient,
            inbox: { refresh: async () => {} },
            snapshot: hostState.live
              ? useSyncExternalStore(hostState.live.subscribe, hostState.live.getSnapshot)
              : {
                  connection: {
                    status: hostState.connecting ? 'connecting' : 'connected',
                    route: '',
                  },
                  roster: hostState.connecting ? undefined : roster,
                },
            attention: hostState.unread
              ? { status: 'ready', sections: { action: [] }, unread: { 'dm-ada': 2 } }
              : { status: 'loading' },
          },
        ],
  quietChannels: { get: () => [] },
  useHostSession: () => ({
    saved: hostState.removed ? null : { hostId: hostState.hostId, hostName: 'studio' },
    client: hostState.live ?? (hostState.actions ? { call, refresh } : undefined),
    inbox: undefined,
  }),
  useHostSnapshot: () =>
    hostState.live
      ? useSyncExternalStore(hostState.live.subscribe, hostState.live.getSnapshot)
      : {
          connection: { status: hostState.connecting ? 'connecting' : 'connected', route: '' },
          roster: hostState.connecting ? undefined : roster,
        },
  useInbox: () =>
    hostState.activityItems.length
      ? {
          status: 'ready',
          sections: { action: hostState.activityItems, replies: [], unread: [], handled: [] },
        }
      : hostState.unread
        ? { status: 'ready', sections: { action: [] }, unread: { 'dm-ada': 2 } }
        : { status: 'loading' },
  useQuietChannels: () => [],
  refreshQuietChannels: () => {},
}));
vi.mock('../src/host/native-section-collapse', async () => {
  const { useSyncExternalStore } = await import('react');
  const { createSectionCollapse } = await import('../src/host/section-collapse');
  const sectionCollapse = createSectionCollapse({ read: async () => undefined, write: () => {} });
  return {
    sectionCollapse,
    useCollapsedSections: (hostId: string) =>
      useSyncExternalStore(sectionCollapse.subscribe, () => sectionCollapse.collapsed(hostId)),
  };
});
vi.mock('../src/ui/shell/use-workspace-panel', () => ({ useWorkspacePanel: () => undefined }));
vi.mock('expo-symbols', () => ({
  SymbolView: ({ size }: { size: number }) => <span data-symbol-size={size} />,
}));
vi.mock('../src/host/native-host-look', () => ({
  hostLooks: {
    look: () => ({ icon: { kind: 'symbol', id: 'desktop' }, color: hostState.color }),
    subscribe: () => () => {},
  },
  useHostLook: () => ({ icon: { kind: 'symbol', id: 'desktop' }, color: hostState.color }),
}));
vi.mock('../src/ui/shell/host-drawer', async () => {
  const { createHostDrawer } = await import('../src/ui/shell/host-drawer-model');
  return {
    HostDrawerEdge: ({ children }: { children: ReactNode }) => children,
    hostDrawer: createHostDrawer({
      switchTo: async () => true,
      showView: () => {},
      pair: () => {},
      notifications: () => {},
    }),
    focusOn: () => {},
    openHostDrawer: () => {},
    useHostDrawerOpen: () => false,
  };
});
vi.mock('../src/ui/shell/human-avatar', () => ({ HumanAvatarButton: () => null }));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));
vi.mock('../src/host/native-notification-avatars', () => ({ avatarImageUri: () => undefined }));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import { conversationFilter } from '../src/host/native-conversation-filter';
import { sectionCollapse } from '../src/host/native-section-collapse';
import HomeScreen from '../app/(tabs)/(home)/index';
import ActivityScreen from '../app/(tabs)/(activity)/activity';
import { t } from '../src/ui/strings';
import { interfacePreferences } from '../src/ui/interface-preferences';
import { ConversationRow } from '../src/ui/chat/conversation-row';
import type { Conversation } from '../src/ui/chat/conversations';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
beforeEach(() => {
  channelHistory = channelNavigationHarness();
  whoami.mockReset();
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelIdleCallback', vi.fn());
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  push.mockReset();
  vi.unstubAllGlobals();
  hostState.live?.stop();
  hostState.live = undefined;
  hostState.connecting = false;
  hostState.removed = false;
  hostState.color = undefined;
  hostState.fontScale = 1;
  hostState.actions = false;
  hostState.unread = false;
  hostState.activityItems = [];
  hostState.hostId = 'h1';
  delete roster.bots[0]!.latestMessageId;
  delete roster.arrangement;
  delete roster.sorting;
  for (const id of ['h1', 'h2', JSON.stringify(['view', 'all'])])
    for (const section of sectionCollapse.collapsed(id)) sectionCollapse.toggle(id, section);
  call.mockClear();
  refresh.mockClear();
  menus.length = 0;
  rowProps.clear();
  Platform.OS = 'web';
  conversationFilter.set('all');
  cloudState.live = undefined;
  cloudState.rows = [];
  cloudState.ready = true;
  cloudState.error = undefined;
  directoryState.rows = [];
  directoryState.workspaces = [];
  directoryState.live = undefined;
  directoryState.busy = false;
  directoryState.ready = true;
  directoryState.errors = [];
});

async function home(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<HomeScreen />));
  return host;
}

async function rowMenuAction(view: HTMLElement, key: keyof typeof t.rowActions) {
  if (Platform.OS === 'ios') {
    const row = view.querySelector('[data-testid="conversation-row-bot:ada"]')!;
    const menu = row.parentElement!.querySelector('[data-testid="native-context-menu"]')!;
    const action = [...menu.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === t.rowActions[key],
    )!;
    await act(async () => action.click());
  } else {
    await act(async () => (rowProps.get('conversation-row-bot:ada')!.onLongPress as () => void)());
    await act(async () =>
      menus.at(-1)!.find((action) => action.text === t.rowActions[key])!.onPress!(),
    );
  }
}

async function type(view: HTMLElement, text: string): Promise<void> {
  const open = view.querySelector<HTMLButtonElement>('[data-testid="search-button"]');
  if (open) await act(async () => open.click());
  const field = view.querySelector<HTMLTextAreaElement>(
    `textarea[aria-label="${t.searchPlaceholder}"]`,
  )!;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!;
  await act(async () => {
    setter.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const rows = (view: HTMLElement) =>
  [...view.querySelectorAll('button')]
    .filter((node) => node.dataset.testid !== 'action-menu-trigger')
    .filter((node) => node.dataset.testid !== 'chats-view-button')
    .filter((node) => !node.dataset.testid?.startsWith('chat-section-'))
    .filter((node) => !node.closest('[hidden]') && !node.dataset.testid?.startsWith('pager-'))
    .filter(
      (node) =>
        ![
          t.cloudJoin.newOrJoin,
          t.allEnvironments,
          'studio',
          t.closeSearch,
          t.openSearch,
          t.openTobMode,
          t.settings,
          t.workspaces,
        ].includes(node.getAttribute('aria-label') ?? ''),
    )
    .map((node) => node.getAttribute('aria-label'));

function cloudFixture(): CloudRow {
  const config = publicInstance({
    instanceId: 'uat',
    environment: 'uat',
    server: 'https://uat.example.test',
    clientId: 'client_test',
    issuer: 'https://api.workos.com/user_management/client_test',
    authkitDomain: 'test-staging.authkit.app',
    mobileRedirectUri: MOBILE_REDIRECT_URI,
  });
  const cloudRow: CloudRow = {
    config,
    hasSession: true,
    sessionUserId: 'user_a',
    identity: { instanceId: 'uat', userId: 'user_a', instanceRole: 'user' },
    organization: {
      organizationId: 'org_a',
      name: 'Cloud team',
      description: '',
      version: 1,
      role: 'member',
    },
  };
  return cloudRow;
}

async function openingFixture() {
  const config = cloudFixture().config;
  let storage: string | null = null;
  const access: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = { denied: false, userId: 'user_a' };
  const response = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status });
  const client = new CloudClient({
    read: async () => storage,
    write: async (value) => {
      storage = value;
    },
    now: () => 1_000_000,
    random: () => 'random-verifier-or-state-43-characters-00000000',
    challenge: async () => 's256-challenge',
    digest: async (value) => createHash('sha256').update(value).digest('hex'),
    authorize: async (url) =>
      MOBILE_REDIRECT_URI + '?code=fixture&state=' + new URL(url).searchParams.get('state'),
    request: async (url) => {
      if (url.endsWith('/.well-known/open-cloud-groups')) return response(config);
      if (url === config.auth.tokenEndpoint)
        return response({
          access_token: 'header.' + btoa(JSON.stringify({ exp: 4_000_000_000 })) + '.signature',
          refresh_token: 'fixture-refresh',
        });
      if (url.endsWith('/api/me'))
        return response({
          userId: state.userId,
          instanceId: config.instanceId,
          instanceRole: 'user',
        });
      if (url.endsWith('/api/onboarding')) return response({ organizationId: 'org_a' });
      if (url.endsWith('/access')) {
        access.push(url);
        await gate;
        return state.denied
          ? response({ error: { code: 'ACCESS_DENIED' } }, 403)
          : response({ allowed: true });
      }
      if (url.includes('/api/organizations/'))
        return response({
          organizationId: url.split('/').at(-1),
          name: 'Cloud team',
          description: '',
          version: 1,
          role: 'member',
        });
      throw Error('Unexpected cloud fixture request');
    },
  });
  await client.importConfig(JSON.stringify(config));
  await client.login(config.instanceId);
  cloudState.live = client;
  const source = client.getSnapshot().rows[0]!;
  directoryState.rows = ['a', 'b'].map((id) => ({
    key: 'cloud-' + id,
    scope: cloudViewScope(source),
    instanceId: config.instanceId,
    organizationId: 'org_' + id,
    organizationName: 'Cloud team',
    guest: false,
    channel: {
      channelId: 'ch_' + id.repeat(64),
      name: 'Cloud ' + id,
      creatorId: 'user_a',
      creatorType: 'human',
      createdAt: '2026-10-18T00:00:00Z',
    },
  }));
  directoryState.workspaces = directoryState.rows.map((row) => ({ ...row, server: config.server }));
  return { client, access, release, state };
}

describe('Search in the Chats header', () => {
  it('keeps actual Host connection progress at the selected identity through recovery', async () => {
    const transport = new FakeHost();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = createHostClient({
      routes: ['https://studio.tailnet-example.ts.net'],
      credential: transport.credential,
      carrier: {
        ...transport.carrier,
        openSocket: (...args) => {
          let socket: ReturnType<typeof transport.carrier.openSocket> | undefined;
          void held.then(() => {
            socket = transport.carrier.openSocket(...args);
          });
          return { send: (text) => socket?.send(text), close: () => socket?.close() };
        },
      },
      backoff: () => 60_000,
    });
    hostState.live = client;
    client.start();
    conversationFilter.set(computerEnvironmentKey('h1'));
    const view = await home();
    expect(client.getSnapshot().connection.status).toBe('connecting');
    const identity = () => view.querySelector('[data-testid="chats-view-button"]')!;
    expect(identity().getAttribute('aria-label')).toContain(t.connecting);
    expect(view.querySelector('[data-testid="list-skeleton"]')).not.toBeNull();
    expect(identity().querySelector('[data-testid="connection-progress"]')).not.toBeNull();
    expect(view.querySelector('[role="alert"]')).toBeNull();
    await act(async () => {
      release();
    });
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    expect(identity().querySelector('[data-testid="connection-progress"]')).toBeNull();
    await act(async () => {
      transport.kill();
    });
    expect(identity().getAttribute('aria-label')).toContain(t.reconnecting);
    expect(view.querySelector('[data-testid="list-skeleton"]')).toBeNull();
    expect(identity().querySelector('[data-testid="connection-progress"]')).not.toBeNull();
    expect(view.querySelector('[role="alert"]')).toBeNull();
  });
  it('keeps the Computer usable when Cloud local state cannot load', async () => {
    cloudState.ready = false;
    cloudState.error = 'STORAGE_UNAVAILABLE';
    const view = await home();
    expect(view.textContent).toContain('Ada');
    expect(view.textContent).toContain(t.cloudListUnavailable);
  });
  it('keeps All quiet and retries an initially unreachable selected Computer', async () => {
    const transport = new FakeHost();
    transport.kill();
    const client = createHostClient({
      routes: ['https://studio.tailnet-example.ts.net'],
      credential: transport.credential,
      carrier: transport.carrier,
      backoff: () => 60_000,
    });
    hostState.live = client;
    client.start();
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('unreachable'));
    const view = await home();
    expect(view.textContent).toContain(t.noOnlineChats);
    expect(view.textContent).not.toContain(t.hostListLoadFailed);
    expect(view.querySelector('[data-testid="chat-list-retry"]')).toBeNull();
    await act(async () => conversationFilter.set(computerEnvironmentKey('h1')));
    expect(view.textContent).toContain(t.hostListLoadFailed);
    expect(view.textContent).not.toContain(t.hostListUnavailable);
    expect(view.textContent).not.toContain(t.cloudChannels.empty);
    transport.restart();
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="chat-list-retry"]')!.click(),
    );
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'), {
      timeout: 200,
    });
    expect(view.textContent).not.toContain(t.hostListLoadFailed);
  });
  it('uses refresh copy only when the failed Computer still has a loaded list', async () => {
    const transport = new FakeHost();
    const client = createHostClient({
      routes: ['https://studio.tailnet-example.ts.net'],
      credential: transport.credential,
      carrier: transport.carrier,
      backoff: () => 5,
    });
    hostState.live = client;
    client.start();
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    conversationFilter.set(computerEnvironmentKey('h1'));
    const view = await home();
    const loadedRoster = client.getSnapshot().roster;
    expect(loadedRoster?.bots.length).toBeGreaterThan(0);
    await act(async () => {
      transport.kill();
      await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('unreachable'));
    });
    expect(client.getSnapshot().roster).toEqual(loadedRoster);
    expect(view.textContent).toContain(t.hostListUnavailable);
    expect(view.textContent).not.toContain(t.hostListLoadFailed);
    expect(view.textContent).toContain(loadedRoster!.bots[0]!.displayName);
  });
  it('shows cold skeleton, actionable failure, retry and empty through the cloud directory owner', async () => {
    const source = cloudFixture();
    cloudState.rows = [source];
    hostState.removed = true;
    let fail = true;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const directory = createCloudConversations({
      listOrganizations: async () => {
        await held;
        if (fail) throw new Error('offline');
        return { organizations: [], nextCursor: null };
      },
      listConversationChannels: async () => ({ channels: [], nextCursor: null }),
    });
    directory.enroll([source]);
    directoryState.live = directory;
    const view = await home();
    expect(view.querySelector('[data-testid="list-skeleton"]')).not.toBeNull();
    expect(view.textContent).not.toContain(t.cloudChannels.empty);
    await act(async () => {
      release();
      await directory.refresh();
    });
    expect(view.querySelector('[data-testid="list-skeleton"]')).toBeNull();
    expect(view.textContent).not.toContain(t.cloudChannels.empty);
    expect(view.textContent).toContain(t.cloudListUnavailable);
    fail = false;
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="cloud-list-retry"]')!.click(),
    );
    expect(view.textContent).not.toContain(t.cloudListUnavailable);
    expect(view.textContent).toContain(t.cloudChannels.empty);
  });
  it('retains same-account rows during refresh failure and drops them when the directory enrolls a new account', async () => {
    const source = cloudFixture();
    cloudState.rows = [source];
    hostState.removed = true;
    let offline = false;
    let gate: Promise<void> | undefined;
    let release!: () => void;
    const directory = createCloudConversations({
      listOrganizations: async () => {
        await gate;
        if (offline) throw new Error('offline');
        return { organizations: [source.organization!], nextCursor: null };
      },
      listConversationChannels: async (_instance, _org, _after, guest) => ({
        channels: guest
          ? []
          : [
              {
                channelId: 'ch_' + 'a'.repeat(64),
                name: 'Cached cloud',
                creatorId: 'user_a',
                creatorType: 'human',
                createdAt: '2026-10-18T00:00:00Z',
              },
            ],
        nextCursor: null,
      }),
    });
    directory.enroll([source]);
    await directory.refresh();
    directoryState.live = directory;
    const view = await home();
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pending!: Promise<void>;
    await act(async () => {
      pending = directory.refresh();
    });
    expect(view.textContent).toContain('Cached cloud');
    expect(view.querySelector('[data-testid="list-skeleton"]')).toBeNull();
    await act(async () =>
      view
        .querySelector<HTMLButtonElement>(
          '[data-testid="conversation-row-cloud:ch_' + 'a'.repeat(64) + '"]',
        )!
        .click(),
    );
    expect(channelHistory.state.routes.at(-1)?.name).toBe('cloud-channels');
    offline = true;
    await act(async () => {
      release();
      await pending;
    });
    expect(view.textContent).toContain('Cached cloud');
    expect(view.textContent).toContain(t.cloudListUnavailable);
    await act(async () => {
      cloudState.rows = [{ ...source, sessionUserId: 'user_b', identity: undefined }];
      directory.enroll(cloudState.rows);
    });
    expect(view.textContent).not.toContain('Cached cloud');
  });
  it('shows immediate target feedback, deduplicates taps and opens only the newer target after real access checks', async () => {
    const fixture = await openingFixture();
    const view = await home();
    const button = (id: string) =>
      view.querySelector<HTMLButtonElement>(
        '[data-testid="conversation-row-cloud:ch_' + id.repeat(64) + '"]',
      )!;
    await act(async () => {
      button('a').click();
      button('a').click();
    });
    expect(fixture.access).toHaveLength(1);
    expect(button('a').getAttribute('aria-label')).toContain(t.loading);
    expect(button('a').querySelector('[data-testid="connection-progress"]')).not.toBeNull();
    expect(button('b').disabled).toBe(false);
    await act(async () => button('b').click());
    expect(button('b').getAttribute('aria-label')).toContain(t.loading);
    expect(fixture.access).toHaveLength(1);
    await act(async () => fixture.release());
    await vi.waitFor(() => expect(channelHistory.state.routes.at(-1)?.name).toBe('cloud-channels'));
    expect(channelHistory.state.routes.at(-1)).toMatchObject({
      name: 'cloud-channels',
      params: { organizationId: 'org_b' },
    });
    expect(channelHistory.state.routes).toHaveLength(2);
    expect(fixture.access).toHaveLength(2);
  });
  it.each(['refusal', 'account change', 'leaving'] as const)(
    'does not navigate after %s during access',
    async (reason) => {
      const fixture = await openingFixture();
      const view = await home();
      await act(async () =>
        view
          .querySelector<HTMLButtonElement>(
            '[data-testid="conversation-row-cloud:ch_' + 'a'.repeat(64) + '"]',
          )!
          .click(),
      );
      if (reason === 'refusal') fixture.state.denied = true;
      if (reason === 'account change') fixture.state.userId = 'user_b';
      if (reason === 'leaving')
        await act(async () => {
          root?.unmount();
          root = undefined;
        });
      await act(async () => fixture.release());
      await vi.waitFor(() => expect(fixture.client.getSnapshot().busy).toBe(false));
      expect(channelHistory.state.routes.map((route) => route.name)).toEqual(['(tabs)']);
      if (reason === 'refusal') {
        expect(view.textContent).toContain(t.cloudListUnavailable);
        expect(view.querySelector('[data-testid="cloud-list-retry"]')).not.toBeNull();
        fixture.state.denied = false;
        await act(async () =>
          view.querySelector<HTMLButtonElement>('[data-testid="cloud-list-retry"]')!.click(),
        );
        expect(channelHistory.state.routes.at(-1)?.name).toBe('cloud-channels');
      }
    },
  );
  it.each(['none', 'reset', 'workspace-intent'])(
    'opens Cloud only while the originating navigation intent is current (reset=%s)',
    async (reset) => {
      const config = publicInstance({
        instanceId: 'uat',
        environment: 'uat',
        server: 'https://uat.example.test',
        clientId: 'client_test',
        issuer: 'https://api.workos.com/user_management/client_test',
        authkitDomain: 'test-staging.authkit.app',
        mobileRedirectUri: MOBILE_REDIRECT_URI,
      });
      const cloudRow: CloudRow = {
        config,
        hasSession: true,
        sessionUserId: 'user_a',
        identity: { instanceId: 'uat', userId: 'user_a', instanceRole: 'user' },
        organization: {
          organizationId: 'org_a',
          name: 'Cloud team',
          description: '',
          version: 1,
          role: 'member',
        },
      };
      const scope = cloudViewScope(cloudRow);
      cloudState.rows = [cloudRow];
      directoryState.rows = [
        {
          key: 'cloud-one',
          scope,
          instanceId: 'uat',
          organizationId: 'org_a',
          organizationName: 'Cloud team',
          guest: false,
          channel: {
            channelId: 'ch_' + 'a'.repeat(64),
            name: 'Cloud general',
            creatorId: 'user_a',
            creatorType: 'human',
            createdAt: '2026-10-18T00:00:00Z',
          },
        },
      ];
      directoryState.workspaces = [
        ...directoryState.rows.map((r) => ({ ...r, server: config.server })),
        {
          ...directoryState.rows[0]!,
          server: config.server,
          organizationId: 'empty',
          organizationName: 'Empty workspace',
        },
      ];
      directoryState.workspaces.push({
        ...directoryState.workspaces[0]!,
        organizationId: 'same-name-empty',
      });
      roster.arrangement = {
        pins: ['dm-ada'],
        hidden: [],
        sectionOrder: ['work'],
        sections: [{ id: 'work', name: 'Work', channelIds: ['launch-team'] }],
      };
      let finishIdentity: (() => void) | undefined;
      if (reset !== 'none') {
        cloudRow.identity = undefined;
        whoami.mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              finishIdentity = resolve;
            }),
        );
      }
      const view = await home();
      expect(view.querySelector('[data-testid="conversation-row-bot:ada"]')).not.toBeNull();
      expect(view.querySelector('[data-testid="chat-section-work"]')).toBeNull();
      expect(view.querySelector('[role="tab"]')).toBeNull();
      expect(view.querySelector('[data-testid="pager-next"]')).toBeNull();
      await act(async () => conversationFilter.set(cloudEnvironmentKey(scope, 'same-name-empty')));
      expect(rows(view).join(' ')).not.toContain('Cloud general');
      expect(view.querySelector('[data-testid="chats-view-button"]')?.textContent).toBe(
        'Cloud team',
      );
      await act(async () => conversationFilter.set('all'));
      expect(view.textContent).toContain('Cloud general');
      expect(view.textContent).toContain('Ada');
      await act(async () =>
        view
          .querySelector<HTMLButtonElement>(
            `button[aria-label="Cloud general, ${t.cloudChannels.cloudChannel}"]`,
          )!
          .click(),
      );
      if (reset !== 'none') {
        expect(whoami).toHaveBeenCalledOnce();
        const state = channelHistory.state;
        if (reset === 'workspace-intent') {
          hostDrawer.beginWorkspaceSelection();
          expect(channelHistory.state).toBe(state);
        } else {
          channelHistory.navigation.dispatch({
            type: 'RESET',
            payload: {
              ...state,
              index: 0,
              routes: [{ key: 'replacement-tabs', name: '(tabs)' }],
            },
          });
        }
        const replacement = channelHistory.state;
        await act(async () => finishIdentity?.());
        expect(channelHistory.state).toBe(replacement);
        if (reset === 'workspace-intent') expect(channelHistory.state).toBe(state);
        expect(view.querySelector('[data-testid="connection-progress"]')).toBeNull();
        expect(channelHistory.state.routes.map((r) => r.name)).toEqual(['(tabs)']);
      } else {
        expect(channelHistory.state.routes.at(-1)).toMatchObject({
          name: 'cloud-channels',
          params: {
            instanceId: 'uat',
            organizationId: 'org_a',
            channelId: 'ch_' + 'a'.repeat(64),
            guest: 'false',
            accountScope: scope,
          },
        });
      }
      await act(async () => conversationFilter.set(computerEnvironmentKey('h1')));
      expect(view.querySelector('[data-testid="chats-view-button"]')?.textContent).toBe('studio');
      expect(rows(view).join(' ')).not.toContain('Cloud general');
      expect(view.textContent).toContain('Ada');
      await act(async () => conversationFilter.set(cloudEnvironmentKey(scope, 'org_a')));
      expect(view.querySelector('[data-testid="chat-section-work"]')).toBeNull();
      expect(view.querySelector('[data-testid="chat-section-pinned"]')).toBeNull();
      expect(rows(view).join(' ')).not.toContain('Ada, Done, studio');
      expect(rows(view).join(' ')).toContain('Cloud general');
      hostState.connecting = true;
      await act(async () => conversationFilter.set(cloudEnvironmentKey(scope, 'empty')));
      expect(view.textContent).toContain(t.cloudChannels.empty);
    },
  );

  it('falls back to All when its selected Host is no longer available', async () => {
    const view = await home();
    await act(async () => conversationFilter.set(computerEnvironmentKey('removed-host')));
    expect(conversationFilter.getSnapshot()).toBe('all');
    expect(view.querySelector('[data-testid="chats-view-button"]')?.textContent).toBe(
      t.allEnvironments,
    );
    expect(rows(view)).toHaveLength(3);
  });

  it('updates an unchanged memoized empty row when the app language changes', async () => {
    const language = interfacePreferences.getSnapshot().language;
    const MemoRow = memo(ConversationRow);
    const row: Conversation = {
      kind: 'channel',
      key: 'channel:empty',
      channel: { id: 'empty', name: 'Empty channel', memberCount: 0, members: [] },
      needsYou: 0,
      unread: 0,
      muted: false,
    };
    try {
      await act(async () => interfacePreferences.setLanguage('en'));
      host = document.createElement('div');
      document.body.append(host);
      root = createRoot(host);
      await act(async () => root!.render(<MemoRow row={row} now={new Date()} />));
      expect(host.textContent).toContain('No messages yet');
      await act(async () => interfacePreferences.setLanguage('zh'));
      expect(host.textContent).toContain('暂无消息');
      expect(host.textContent).not.toContain('No messages yet');
    } finally {
      await act(async () => interfacePreferences.setLanguage(language));
    }
  });

  it('filters the list in place and opens the chat the Human taps', async () => {
    const view = await home();
    expect(rows(view)).toHaveLength(3);

    await type(view, 'ＡＤ');
    expect(rows(view)).toEqual(['Ada, Done, studio']);
    await act(async () =>
      view.querySelector<HTMLButtonElement>('button[aria-label="Ada, Done, studio"]')!.click(),
    );
    expect(channelHistory.state.routes.at(-1)).toMatchObject({
      name: 'dm/[slug]',
      params: { slug: 'ada', hostId: 'h1' },
    });

    await type(view, '小明');
    expect(rows(view)).toEqual([`小明, ${t.noMessagesYet}, studio`]);

    await type(view, 'launch');
    expect(rows(view)).toEqual([`Launch team, ${t.noMessagesYet}, studio`]);
    expect(view.textContent).toContain(t.noMessagesYet);
    await act(async () =>
      [...view.querySelectorAll('button')]
        .find((node) => node.getAttribute('aria-label')?.startsWith('Launch team'))!
        .click(),
    );
    expect(channelHistory.state.routes.at(-1)).toMatchObject({
      name: 'channel/[id]',
      params: { id: 'launch-team', hostId: 'h1' },
    });
  });

  it('lists matching messages under the Chats and opens the conversation at that message', async () => {
    vi.useFakeTimers();
    try {
      call.mockImplementation(async (method: unknown) =>
        method === 'messageSearch'
          ? {
              hits: [
                {
                  channelId: 'dm-ada',
                  snippet: 'the launch checklist',
                  message: {
                    id: 'm-launch',
                    at: '2026-10-01T00:00:00.000Z',
                    author: { kind: 'bot', slug: 'ada' },
                    body: 'the launch checklist',
                  },
                },
              ],
            }
          : {},
      );
      const view = await home();
      await type(view, 'checklist');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      expect(call).toHaveBeenCalledWith('messageSearch', { text: 'checklist', limit: 20 });
      const row = view.querySelector('[data-testid="message-search-row-m-launch"]')!;
      expect(row).not.toBeNull();
      expect(view.textContent).toContain(t.searchMessages);
      expect(row.textContent).toContain('Ada: the launch checklist');
    } finally {
      call.mockImplementation(async () => ({}));
      vi.useRealTimers();
    }
  });

  it('says plainly when nothing matches', async () => {
    const view = await home();
    await type(view, ' zed ');
    expect(rows(view)).toEqual([]);
    expect(view.textContent).toContain(t.searchNoMatch('zed'));
  });
  it('wraps the list in the last-chat swipe, off while searching', async () => {
    const view = await home();
    const swipe = () => view.querySelector<HTMLElement>('[data-testid="last-chat-swipe"]')!;
    expect(swipe().dataset.enabled).toBe('true');
    expect(swipe().querySelector('[data-testid="conversation-row-bot:ada"]')).not.toBeNull();
    await type(view, 'ada');
    expect(swipe().dataset.enabled).toBe('false');
    await act(async () =>
      view.querySelector<HTMLButtonElement>(`button[aria-label="${t.closeSearch}"]`)!.click(),
    );
    expect(swipe().dataset.enabled).toBe('true');
  });
  it("opens the computer's Tob DM from the Tob Mode action, through the top entrance", async () => {
    const tobButton = (view: HTMLElement) =>
      view.querySelector<HTMLButtonElement>(`button[aria-label="${t.openTobMode}"]`);
    let view = await home();
    expect(tobButton(view)).not.toBeNull();
    push.mockClear();
    await act(async () => tobButton(view)!.click());
    expect(push).not.toHaveBeenCalled();
    act(() => root?.unmount());
    host?.remove();
    roster.bots.push({
      slug: 'tob',
      displayName: 'Tob',
      tob: true,
      roles: [],
      computerAccess: false,
      browserAccess: false,
      state: 'idle',
      paused: false,
      dmChannelId: 'dm-tob',
    });
    try {
      view = await home();
      const href = { pathname: '/dm-top/[slug]', params: { slug: 'tob', hostId: 'h1' } };
      await act(async () => tobButton(view)!.click());
      expect(push).toHaveBeenLastCalledWith(href);
      await act(async () => conversationFilter.set(computerEnvironmentKey('h1')));
      expect(view.querySelector('[data-testid="conversation-row-bot:tob"]')).not.toBeNull();
      await act(async () => tobButton(view)!.click());
      expect(push).toHaveBeenLastCalledWith(href);
    } finally {
      roster.bots.pop();
    }
  });
  it('closes search, clearing the query, from the button beside the field', async () => {
    const view = await home();
    expect(view.querySelector(`button[aria-label="${t.closeSearch}"]`)).toBeNull();
    await type(view, 'ada');
    expect(view.textContent).not.toContain('Launch team');
    await act(async () =>
      view.querySelector<HTMLButtonElement>(`button[aria-label="${t.closeSearch}"]`)!.click(),
    );
    expect(view.querySelector(`textarea[aria-label="${t.searchPlaceholder}"]`)).toBeNull();
    expect(view.querySelector(`button[aria-label="${t.settings}"]`)).not.toBeNull();
    expect(view.textContent).toContain('Launch team');
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="search-button"]')!.click(),
    );
    expect(
      view.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${t.searchPlaceholder}"]`)!
        .value,
    ).toBe('');
  });
  it('replaces the title and Settings with the field, and keeps a query after editing ends', async () => {
    const view = await home();
    expect(view.querySelector(`textarea[aria-label="${t.searchPlaceholder}"]`)).toBeNull();
    await type(view, 'ada');
    expect(view.querySelector(`button[aria-label="${t.settings}"]`)).toBeNull();
    expect(view.querySelector('[data-testid="search-button"]')).toBeNull();
    const field = view.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${t.searchPlaceholder}"]`,
    )!;
    await act(async () => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(field.isConnected).toBe(true);
    expect(rows(view)).toEqual(['Ada, Done, studio']);
    await type(view, '');
    await act(async () => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(view.querySelector(`textarea[aria-label="${t.searchPlaceholder}"]`)).toBeNull();
    expect(view.querySelector(`button[aria-label="${t.settings}"]`)).not.toBeNull();
  });
});

describe('Selected view header accessibility', () => {
  it.each(['all', 'computer', 'cloud'] as const)(
    'announces the full %s view and scales its icon with live system text size',
    async (kind) => {
      const title = kind === 'all' ? t.allEnvironments : 'Studio team with a long complete name';
      const accessibilityLabel =
        kind === 'cloud' ? `${title}, cloud.example.test, team-one` : undefined;
      host = document.createElement('div');
      root = createRoot(host);
      for (const fontScale of [1, 1.4, 2]) {
        hostState.fontScale = fontScale;
        await act(async () =>
          root!.render(
            <DesignThemeProvider appearance={{ scheme: 'light' }}>
              <HomeHeader
                environment={{
                  key: kind,
                  kind,
                  title,
                  ...(accessibilityLabel === undefined ? {} : { accessibilityLabel }),
                  ...(kind === 'computer'
                    ? { hostIcon: { kind: 'symbol', id: 'desktop' } as const }
                    : {}),
                }}
              >
                {null}
              </HomeHeader>
            </DesignThemeProvider>,
          ),
        );
        const button = host.querySelector('[data-testid="chats-view-button"]')!;
        expect(button.getAttribute('aria-label')).toBe(
          `${t.workspaces}, ${accessibilityLabel ?? title}`,
        );
        const size = resolveTheme('light', {}, 'ios').type.title.line * fontScale;
        if (kind === 'computer') {
          expect(button.querySelector('[data-symbol-size]')?.getAttribute('data-symbol-size')).toBe(
            String(size),
          );
        } else {
          expect(button.querySelector('svg')?.getAttribute('width')).toBe(String(size));
          expect(button.querySelector('svg')?.getAttribute('height')).toBe(String(size));
        }
      }
    },
  );
});

describe('Selected current Host accent', () => {
  it.each(['light', 'dark'] as const)(
    'limits Android tint to the current Host filter and follows %s theme changes',
    async (scheme) => {
      const Probe = () => <span>{useDesignTheme().color.accent}</span>;
      host = document.createElement('div');
      root = createRoot(host);
      const render = (appearance = scheme) =>
        root!.render(
          <DesignThemeProvider appearance={{ scheme: appearance }}>
            <HostAccentProvider>
              <Probe />
            </HostAccentProvider>
          </DesignThemeProvider>,
        );
      const before = Platform.OS;
      try {
        Platform.OS = 'android';
        hostState.color = 'orange';
        await act(async () => render());
        expect(host.textContent).toBe(resolveTheme(scheme, {}, 'android').color.accent);
        await act(async () => conversationFilter.set(computerEnvironmentKey('h1')));
        expect(host.textContent).toBe(
          resolveTheme(scheme, { accent: HOST_COLORS.orange[scheme] }, 'android').color.accent,
        );
        const otherScheme = scheme === 'light' ? 'dark' : 'light';
        await act(async () => render(otherScheme));
        expect(host.textContent).toBe(
          resolveTheme(otherScheme, { accent: HOST_COLORS.orange[otherScheme] }, 'android').color
            .accent,
        );
        await act(async () => render());
        await act(async () => conversationFilter.set('all'));
        expect(host.textContent).toBe(resolveTheme(scheme, {}, 'android').color.accent);
        await act(async () => conversationFilter.set(computerEnvironmentKey('other-host')));
        expect(host.textContent).toBe(resolveTheme(scheme, {}, 'android').color.accent);
        await act(async () => conversationFilter.set(cloudEnvironmentKey('cloud', 'team')));
        expect(host.textContent).toBe(resolveTheme(scheme, {}, 'android').color.accent);
        await act(async () => conversationFilter.set(computerEnvironmentKey('h1')));
        hostState.color = 'teal';
        await act(async () => render());
        expect(host.textContent).toBe(
          resolveTheme(scheme, { accent: HOST_COLORS.teal[scheme] }, 'android').color.accent,
        );
        Platform.OS = 'ios';
        await act(async () => render());
        expect(host.textContent).toBe(resolveTheme(scheme, {}, 'ios').color.accent);
        await act(async () => conversationFilter.set('all'));
        expect(host.textContent).toBe(resolveTheme(scheme, {}, 'ios').color.accent);
        Platform.OS = 'android';
        await act(async () => conversationFilter.set(computerEnvironmentKey('h1')));
        hostState.color = undefined;
        await act(async () => render());
        expect(host.textContent).toBe(resolveTheme(scheme, {}, 'android').color.accent);
        hostState.color = 'orange';
        hostState.removed = true;
        await act(async () => render());
        expect(host.textContent).toBe(resolveTheme(scheme, {}, 'android').color.accent);
      } finally {
        Platform.OS = before;
      }
    },
  );
});

describe('Chats row actions share the Host path', () => {
  it.each(['android', 'ios'] as const)(
    'removes overflow while keeping complete accessible actions on %s',
    async (platform) => {
      Platform.OS = platform;
      hostState.actions = true;
      hostState.unread = true;
      roster.bots[0]!.latestMessageId = 'message-1';
      const view = await home();
      expect(view.querySelector('[data-testid="action-menu-trigger"]')).toBeNull();
      const props = rowProps.get('conversation-row-bot:ada')!;
      expect(typeof props.onLongPress).toBe(platform === 'android' ? 'function' : 'undefined');
      expect(props.accessibilityActions).toEqual([
        ...['pin', 'section', 'mute', 'read'].map((key) => ({
          name: key,
          label: t.rowActions[key as keyof typeof t.rowActions],
        })),
        { name: 'actions', label: t.deletion.actions('Ada') },
      ]);
      const invoke = props.onAccessibilityAction as (event: {
        nativeEvent: { actionName: string };
      }) => void;
      for (const key of ['pin', 'section', 'mute', 'read'] as const) {
        call.mockClear();
        push.mockClear();
        if (platform === 'android' && key === 'read') {
          await act(async () => invoke({ nativeEvent: { actionName: key } }));
          expect(call).toHaveBeenLastCalledWith('channelMarkRead', {
            channelId: 'dm-ada',
            messageId: 'message-1',
          });
          continue;
        }
        await rowMenuAction(view, key);
        const fromMenu = [...call.mock.calls];
        const navigation = [...push.mock.calls];
        call.mockClear();
        push.mockClear();
        await act(async () => invoke({ nativeEvent: { actionName: key } }));
        expect(call.mock.calls).toEqual(fromMenu);
        expect(push.mock.calls).toEqual(navigation);
      }
      call.mockClear();
      await act(async () => invoke({ nativeEvent: { actionName: 'unknown' } }));
      expect(call).not.toHaveBeenCalled();
      expect(typeof rowProps.get('conversation-row-bot:xiaoming')!.onLongPress).toBe(
        platform === 'android' ? 'function' : 'undefined',
      );
      expect(rowProps.get('conversation-row-bot:xiaoming')!.accessibilityActions).toEqual([
        {
          name: 'actions',
          label: t.deletion.actions(
            roster.bots.find((bot) => bot.slug === 'xiaoming')!.displayName,
          ),
        },
      ]);
      if (platform === 'ios') {
        const preview = view.querySelector(
          '[data-testid="conversation-row-bot:ada"]',
        )!.parentElement!;
        expect(preview.querySelector('[data-testid="native-preview"]')).not.toBeNull();
        expect(preview.querySelectorAll('[data-menu-title]')).toHaveLength(5);
      }
    },
  );
  it('Android scrolling has no row swipe recognizer; long press retains organization actions and adds deletion', async () => {
    Platform.OS = 'android';
    hostState.actions = true;
    hostState.unread = true;
    roster.bots[0]!.latestMessageId = 'message-1';
    const view = await home();
    expect(view.querySelector('[data-testid^="conversation-swipe"]')).toBeNull();
    await rowMenuAction(view, 'pin');
    expect(menus.at(-1)!.map((action) => action.text)).toEqual([
      t.rowActions.pin,
      t.rowActions.section,
      t.rowActions.mute,
      t.rowActions.read,
      t.deletion.deleteBot,
    ]);
    expect(call).toHaveBeenLastCalledWith('rosterBatch', { action: 'pin', channelIds: ['dm-ada'] });
    await rowMenuAction(view, 'mute');
    expect(call).toHaveBeenLastCalledWith('channelMuteSet', { channelId: 'dm-ada', muted: true });
    await rowMenuAction(view, 'section');
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/conversation-section',
      params: { hostId: 'h1', channelId: 'dm-ada' },
    });
  });
  it('iOS rows have no swipe actions; the context menu keeps pin, section, mute and read', async () => {
    Platform.OS = 'ios';
    hostState.actions = true;
    hostState.unread = true;
    roster.bots[0]!.latestMessageId = 'message-1';
    const view = await home();
    expect(view.querySelector('[data-testid^="conversation-swipe"]')).toBeNull();
    expect(view.querySelector('[data-testid="native-preview"]')).not.toBeNull();
    await rowMenuAction(view, 'read');
    expect(call).toHaveBeenLastCalledWith('channelMarkRead', {
      channelId: 'dm-ada',
      messageId: 'message-1',
    });
    await rowMenuAction(view, 'pin');
    expect(call).toHaveBeenLastCalledWith('rosterBatch', { action: 'pin', channelIds: ['dm-ada'] });
    await rowMenuAction(view, 'mute');
    expect(call).toHaveBeenLastCalledWith('channelMuteSet', { channelId: 'dm-ada', muted: true });
    await rowMenuAction(view, 'section');
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/conversation-section',
      params: { hostId: 'h1', channelId: 'dm-ada' },
    });
  });

  it('iOS menu offers the inverse operations', async () => {
    Platform.OS = 'ios';
    hostState.actions = true;
    roster.arrangement = {
      pins: ['dm-ada'],
      muted: ['dm-ada'],
      hidden: [],
      sections: [],
      sectionOrder: [],
    };
    const view = await home();
    await rowMenuAction(view, 'unpin');
    expect(call).toHaveBeenLastCalledWith('rosterBatch', {
      action: 'unpin',
      channelIds: ['dm-ada'],
    });
    await rowMenuAction(view, 'unmute');
    expect(call).toHaveBeenLastCalledWith('channelMuteSet', { channelId: 'dm-ada', muted: false });
  });
});

describe('Remote Host section and Pinned presentation', () => {
  it('ranks a title prefix ahead of a pinned substring when searching', async () => {
    roster.arrangement = { pins: ['launch-team'], hidden: [], sections: [], sectionOrder: [] };
    const view = await home();
    expect(
      view.querySelector('[data-testid="conversation-row-channel:launch-team"]'),
    ).not.toBeNull();
    await type(view, 'a');
    expect(rows(view)[0]).toBe('Ada, Done, studio');
    expect(rows(view)[1]).toContain('Launch team');
    expect(view.querySelector('[data-testid="chat-section-pinned"]')).toBeNull();
  });
  const seed = () => {
    conversationFilter.set(computerEnvironmentKey(hostState.hostId));
    roster.arrangement = {
      pins: ['dm-ada'],
      hidden: [],
      sections: [
        { id: 'work', name: 'Work', channelIds: ['dm-ada', 'launch-team'] },
        { id: 'empty', name: 'Empty', channelIds: [] },
      ],
      sectionOrder: ['work', 'empty'],
      topOrder: [
        { kind: 'section', id: 'work' },
        { kind: 'channel', id: 'bot:xiaoming' },
        { kind: 'section', id: 'empty' },
      ],
    };
    roster.sorting = { sortMode: 'manual', sortModes: {} };
  };
  const ordered = (view: HTMLElement) =>
    [...view.querySelectorAll('[data-testid]')]
      .map((node) => node.getAttribute('data-testid'))
      .filter((id) => id?.startsWith('chat-section-') || id?.startsWith('conversation-row-'));
  const toggle = async (view: HTMLElement, id: string) =>
    act(async () =>
      view.querySelector<HTMLButtonElement>(`[data-testid="chat-section-${id}"]`)!.click(),
    );

  it('renders pinned and section chats with the same full rows and restores arrangement after search', async () => {
    seed();
    hostState.unread = true;
    const view = await home();
    expect(ordered(view)).toEqual([
      'chat-section-pinned',
      'conversation-row-bot:ada',
      'chat-section-work',
      'conversation-row-channel:launch-team',
      'conversation-row-bot:xiaoming',
      'chat-section-empty',
    ]);
    const pinned = view.querySelector('[data-testid="conversation-row-bot:ada"]')!;
    expect(pinned.textContent).toContain('Ada');
    expect(pinned.textContent).toContain('Done');
    expect(pinned.textContent).toContain('2');
    expect(pinned.getAttribute('aria-label')).toContain(t.unreadCount(2));
    await type(view, 'Ada');
    expect(ordered(view)).toEqual(['conversation-row-bot:ada']);
    expect(view.textContent).toContain('Done');
    await type(view, '');
    expect(ordered(view)[0]).toBe('chat-section-pinned');
    expect(roster.arrangement?.sections[0]?.channelIds).toEqual(['dm-ada', 'launch-team']);
    expect(call).not.toHaveBeenCalled();
  });

  it('isolates section and Pinned collapse per Host and does not lose collapsed search matches', async () => {
    seed();
    const view = await home();
    await toggle(view, 'pinned');
    await toggle(view, 'work');
    expect(ordered(view)).not.toContain('conversation-row-bot:ada');
    expect(ordered(view)).not.toContain('conversation-row-channel:launch-team');
    await type(view, 'Ada');
    expect(ordered(view)).toEqual(['conversation-row-bot:ada']);
    await type(view, '');
    expect(ordered(view)).not.toContain('conversation-row-bot:ada');
    hostState.hostId = 'h2';
    conversationFilter.set(computerEnvironmentKey('h2'));
    await act(async () => root!.render(<HomeScreen />));
    expect(ordered(view)).toContain('conversation-row-bot:ada');
    expect(ordered(view)).toContain('conversation-row-channel:launch-team');
    hostState.hostId = 'h1';
    conversationFilter.set(computerEnvironmentKey('h1'));
    await act(async () => root!.render(<HomeScreen />));
    expect(ordered(view)).not.toContain('conversation-row-bot:ada');
    expect(call.mock.calls.filter(([method]) => method !== 'messageSearch')).toEqual([]);
  });

  it.each(['ios', 'android'] as const)(
    'keeps pinned row menu operations and native preview boundary on %s',
    async (platform) => {
      seed();
      hostState.actions = true;
      Platform.OS = platform;
      const view = await home();
      await rowMenuAction(view, 'unpin');
      expect(call).toHaveBeenLastCalledWith('rosterBatch', {
        action: 'unpin',
        channelIds: ['dm-ada'],
      });
      await rowMenuAction(view, 'section');
      expect(push).toHaveBeenLastCalledWith({
        pathname: '/conversation-section',
        params: { hostId: 'h1', channelId: 'dm-ada' },
      });
      expect(
        view
          .querySelector('[data-testid="conversation-row-bot:ada"]')
          ?.parentElement?.querySelector('[data-testid="native-preview"]') != null,
      ).toBe(platform === 'ios');
      roster.arrangement = { ...roster.arrangement!, pins: [] };
      await act(async () => root!.render(<HomeScreen />));
      expect(ordered(view)).not.toContain('chat-section-pinned');
      expect(ordered(view).slice(0, 3)).toEqual([
        'chat-section-work',
        'conversation-row-bot:ada',
        'conversation-row-channel:launch-team',
      ]);
    },
  );
});

describe('scoped conversation history', () => {
  it('reopening a Chats row unwinds to the original DM and preserves Back', async () => {
    const view = await home();
    const tapAda = () =>
      view.querySelector<HTMLButtonElement>('[data-testid="conversation-row-bot:ada"]')!.click();
    await act(async () => tapAda());
    const original = channelHistory.state.routes[channelHistory.state.index]?.key;
    channelHistory.push('channel/[id]', { id: 'another', hostId: 'h1' });
    await act(async () => tapAda());
    expect(channelHistory.state.routes[channelHistory.state.index]).toMatchObject({
      key: original,
      name: 'dm/[slug]',
      params: { hostId: 'h1', slug: 'ada' },
    });
    expect(channelHistory.state.routes).toHaveLength(2);
    channelHistory.back();
    expect(channelHistory.state.routes[channelHistory.state.index]?.name).toBe('(tabs)');
  });
});

describe('Activity Channel navigation', () => {
  it('opens a card in its scoped conversation and keeps the original route for Back', async () => {
    hostState.activityItems = [
      {
        id: 'approval',
        kind: 'workspace-grant-request',
        category: 'action',
        createdAt: '2026-10-25T00:00:00Z',
        botSlug: 'ada',
        channelId: 'dm-ada',
        messageId: 'card',
        summary: 'Check deployment',
      },
    ];
    channelHistory.push('dm/[slug]', { slug: 'ada', hostId: 'h1' });
    const key = channelHistory.state.routes.at(-1)!.key;
    channelHistory.push('channel/[id]', { id: 'other', hostId: 'h1' });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<ActivityScreen />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
    const row = [...host.querySelectorAll<HTMLButtonElement>('[data-testid]')].find(
      (element) => element.dataset.testid === 'inbox-row-["h1","approval"]',
    );
    expect(host.textContent).toContain('Check deployment');
    expect(row).not.toBeNull();
    await act(async () => row!.click());
    expect(channelHistory.state.routes.at(-1)).toMatchObject({
      key,
      name: 'dm/[slug]',
      params: { slug: 'ada', hostId: 'h1', focus: 'card' },
    });
    expect(channelHistory.state.routes).toHaveLength(2);
    channelHistory.back();
    expect(channelHistory.state.routes.at(-1)!.name).toBe('(tabs)');
  });
});
