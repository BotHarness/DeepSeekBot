// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createHostClient } from '@botharness/host-client/client';
import { CONNECTION_OFFLINE_MS, CONNECTION_QUIET_MS } from '../src/ui/connection-presence';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudClient, type CloudRow } from '../src/cloud/client';
import { createHash } from 'node:crypto';
import { createCloudConversations } from '../src/cloud/conversations';
import { channelNavigationHarness } from './channel-navigation-harness';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import { cloudViewScope } from '../src/cloud/workspace-directory';
import { computerEnvironmentKey, cloudEnvironmentKey } from '../src/host/conversation-environments';
import { HOST_COLORS } from '@botharness/host-client/ui/design/host-look';
import { Platform } from 'react-native';
import { HostAccentProvider } from '../src/ui/shell/host-accent-provider';
import { HomeHeader } from '../src/ui/shell/home-header';
import { DesignThemeProvider, resolveTheme, useDesignTheme } from '../src/ui/design/theme';
import { hostDrawer } from '../src/ui/shell/host-drawer';
import { conversationFilter } from '../src/host/native-conversation-filter';
import HomeScreen from '../app/(tabs)/(home)/index';
import { t } from '../src/ui/strings';

const {
  push,
  cloudState,
  directoryState,
  hostState,
  menus,
  roster,
  whoami,
  mockConversationPeek,
  mockConversationFilter,
  mockCloudNative,
  mockCloudConversations,
  mockReactNative,
  mockHostSession,
  mockSectionCollapse,
  mockHostDrawer,
} = await vi.hoisted(() => import('./home-search-mocks'));

import { rows, prepareHomeState, resetHomeState } from './home-search-fixtures';

let channelHistory = channelNavigationHarness();

vi.mock('../src/ui/primitives/app-dialog', () => ({
  showActionMenu: (_title: string, actions: { text: string; onPress?: () => unknown }[]) =>
    menus.push(actions),
  showAppDialog: vi.fn(),
}));

vi.mock('../src/ui/shell/conversation-peek', mockConversationPeek);

vi.mock('../src/host/native-conversation-filter', mockConversationFilter);

vi.mock('../src/cloud/native', mockCloudNative);

vi.mock('../src/cloud/native-conversations', mockCloudConversations);

vi.mock('expo-haptics', () => import('./expo-haptics-shim'));

vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}));

vi.mock('expo-quick-actions', () => ({ setItems: async () => undefined }));

vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));

vi.mock('../src/ui/shell/last-chat-swipe', () => ({
  LastChatPreview: () => null,
  LastChatSwipe: ({ enabled, children }: { enabled: boolean; children: ReactNode }) => (
    <div data-testid="last-chat-swipe" data-enabled={String(enabled)}>
      {children}
    </div>
  ),
}));

vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));

vi.mock('react-native-tab-view', () => import('./tab-view-shim'));

vi.mock('react-native', mockReactNative);

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

vi.mock('../src/host/host-session', mockHostSession);

vi.mock('../src/host/native-section-collapse', mockSectionCollapse);

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

vi.mock('../src/ui/shell/host-drawer', mockHostDrawer);

vi.mock('../src/ui/shell/human-avatar', () => ({ HumanAvatarButton: () => null }));

vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));

vi.mock('../src/host/native-notification-avatars', () => ({ avatarImageUri: () => undefined }));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;

let host: HTMLElement | undefined;

beforeEach(() => {
  channelHistory = channelNavigationHarness();
  prepareHomeState();
});

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  resetHomeState();
});

async function home(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<HomeScreen />));
  return host;
}

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
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    expect(identity().querySelector('[data-testid="connection-progress"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(CONNECTION_QUIET_MS));
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
    expect(identity().querySelector('[data-testid="connection-progress"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(CONNECTION_QUIET_MS));
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
  it('waits for the quick automatic retry before reporting a first failed load', async () => {
    const transport = new FakeHost();
    transport.kill();
    const client = createHostClient({
      routes: ['https://studio.tailnet-example.ts.net'],
      credential: transport.credential,
      carrier: transport.carrier,
      backoff: (attempt) => (attempt === 1 ? 1_500 : 60_000),
    });
    hostState.live = client;
    client.start();
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('unreachable'));
    const view = await home();
    await act(async () => conversationFilter.set(computerEnvironmentKey('h1')));
    expect(view.textContent).not.toContain(t.hostListLoadFailed);
    expect(view.textContent).not.toContain(t.cloudChannels.empty);
    expect(view.querySelector('[data-testid="connection-progress"]')).toBeNull();
    await act(async () => {
      await vi.waitFor(
        () =>
          expect(client.getSnapshot().connection).toMatchObject({
            status: 'unreachable',
            attempt: 2,
          }),
        { timeout: 3_000 },
      );
    });
    expect(view.textContent).toContain(t.hostListLoadFailed);
  });
  it.each(['list', 'channels', 'rosterGet', 'settings/describe'])(
    'diagnoses initial %s transport failure without treating the generic Chats error as a root cause',
    async (method) => {
      const transport = new FakeHost();
      transport.failing.add(method);
      const route = 'https://studio.tailnet-example.ts.net';
      const client = createHostClient({
        routes: [route],
        credential: transport.credential,
        carrier: transport.carrier,
        backoff: () => 60_000,
      });
      hostState.live = client;
      client.start();
      await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('unreachable'));
      expect(client.getSnapshot().roster).toBeUndefined();
      expect(transport.calls.map((request) => request.method)).toContain(method);
      const view = await home();
      await act(async () => conversationFilter.set(computerEnvironmentKey('h1')));
      expect(view.textContent).toContain(t.hostListLoadFailed);
      expect(view.textContent).not.toContain(t.hostListUnavailable);
      expect(view.textContent).not.toContain(t.cloudChannels.empty);
      transport.failing.delete(method);
      await act(async () =>
        view.querySelector<HTMLButtonElement>('[data-testid="chat-list-retry"]')!.click(),
      );
      await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
      expect(client.getSnapshot().connection.route).toBe(route);
      expect(client.getSnapshot().roster?.bots.length).toBeGreaterThan(0);
      expect(view.textContent).not.toContain(t.hostListLoadFailed);
    },
  );
  it('keeps a dropped Computer list quiet, then shows it offline once the drop lasts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    expect(view.querySelector('[data-testid="home-status-chip"]')).toBeNull();
    expect(view.textContent).toContain(loadedRoster!.bots[0]!.displayName);
    await act(async () => vi.advanceTimersByTime(CONNECTION_OFFLINE_MS));
    expect(view.querySelector('[data-testid="home-status-chip"]')?.textContent).toContain(
      t.hostListOffline,
    );
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
    expect(view.querySelector('[data-testid="chats-view-button"]')?.textContent).toBe(t.chats);
    expect(rows(view)).toHaveLength(3);
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
