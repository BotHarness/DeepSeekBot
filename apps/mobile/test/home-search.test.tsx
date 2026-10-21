// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CloudRow } from '../src/cloud/client';
import type { CloudConversation, ConversationWorkspace } from '../src/cloud/conversations';
import { publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import { cloudViewScope } from '../src/cloud/workspace-directory';
import type { RosterView } from '../src/host/client';

const { push, cloudState, directoryState, hostState } = vi.hoisted(() => ({
  push: vi.fn(),
  hostState: { connecting: false },
  cloudState: {
    error: undefined as string | undefined,
    ready: true,
    busy: false,
    rows: [] as CloudRow[],
  },
  directoryState: {
    busy: false,
    ready: true,
    rows: [] as CloudConversation[],
    workspaces: [] as ConversationWorkspace[],
    errors: [] as string[],
  },
}));
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

vi.mock('../src/host/native-conversation-filter', async () => {
  const { useState } = await import('react');
  return { useConversationFilter: () => useState('all') };
});
vi.mock('../src/cloud/native', () => ({
  useCloudSnapshot: () => cloudState,
  cloudClient: { getSnapshot: () => cloudState },
}));
vi.mock('../src/cloud/native-conversations', () => ({
  useCloudConversations: () => directoryState,
  cloudConversations: { refresh: async () => {} },
}));
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
    useFocusEffect: (work: () => void) => useLayoutEffect(work, [work]),
    useRouter: () => ({ push, prefetch: () => undefined }),
  };
});
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({
    saved: { hostId: 'h1', hostName: 'studio' },
    client: undefined,
    inbox: undefined,
  }),
  useHostSnapshot: () => ({
    connection: { status: hostState.connecting ? 'connecting' : 'connected', route: '' },
    roster: hostState.connecting ? undefined : roster,
  }),
  useInbox: () => ({ status: 'loading' }),
  useQuietChannels: () => [],
  refreshQuietChannels: () => {},
}));
vi.mock('../src/host/native-section-collapse', () => ({
  sectionCollapse: { toggle: () => {} },
  useCollapsedSections: () => new Set(),
}));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ icon: { kind: 'symbol', id: 'desktop' } }),
}));
vi.mock('../src/ui/chat/section-header', () => ({ SectionHeader: () => null }));
vi.mock('../src/ui/shell/home-header', () => ({
  HomeHeader: ({
    actions,
    search,
    children,
  }: {
    actions?: ReactNode;
    search?: ReactNode;
    children: ReactNode;
  }) => (
    <>
      {search ?? actions}
      {children}
    </>
  ),
}));
vi.mock('../src/ui/shell/host-drawer', () => ({
  HostDrawerEdge: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/ui/shell/human-avatar', () => ({ HumanAvatarButton: () => null }));
vi.mock('../src/ui/connection-banner', () => ({ ConnectionBanner: () => null }));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));

import HomeScreen from '../app/(tabs)/(home)/index';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
beforeEach(() => {
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
  hostState.connecting = false;
  cloudState.rows = [];
  cloudState.ready = true;
  cloudState.error = undefined;
  directoryState.rows = [];
  directoryState.workspaces = [];
});

async function home(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<HomeScreen />));
  return host;
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
    .filter((node) => !node.closest('[hidden]') && !node.dataset.testid?.startsWith('pager-'))
    .filter(
      (node) =>
        ![
          t.cloudJoin.newOrJoin,
          t.allEnvironments,
          'studio',
          t.closeSearch,
          t.openSearch,
          t.settings,
        ].includes(node.getAttribute('aria-label') ?? ''),
    )
    .map((node) => node.getAttribute('aria-label'));

describe('Search in the Chats header', () => {
  it('keeps the Computer usable when Cloud local state cannot load', async () => {
    cloudState.ready = false;
    cloudState.error = 'STORAGE_UNAVAILABLE';
    const view = await home();
    expect(view.textContent).toContain('Ada');
    expect(view.textContent).toContain(t.cloudListUnavailable);
  });
  it('opens a cloud row with its account and organization while leaving the paired Computer selected', async () => {
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
    const view = await home();
    const duplicate = view.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-label="Cloud team, https://uat.example.test, same-name-empty"]',
    )!;
    expect(duplicate).not.toBeNull();
    await act(async () => duplicate.click());
    expect(rows(view).join(' ')).not.toContain('Cloud general');
    await act(async () =>
      view
        .querySelector<HTMLButtonElement>(`[role="tab"][aria-label="${t.allEnvironments}"]`)!
        .click(),
    );
    expect(view.textContent).toContain('Cloud general');
    expect(view.textContent).toContain('Ada');
    await act(async () =>
      view
        .querySelector<HTMLButtonElement>(
          `button[aria-label="Cloud general, ${t.cloudChannels.cloudChannel}"]`,
        )!
        .click(),
    );
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/cloud-channels',
      params: {
        instanceId: 'uat',
        organizationId: 'org_a',
        channelId: 'ch_' + 'a'.repeat(64),
        guest: 'false',
        accountScope: scope,
      },
    });
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="pager-next"]')!.click(),
    );
    expect(rows(view).join(' ')).not.toContain('Cloud general');
    expect(view.textContent).toContain('Ada');
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="pager-next"]')!.click(),
    );
    expect(
      view
        .querySelector('[role="tab"][aria-label="Cloud team, https://uat.example.test, org_a"]')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(rows(view).join(' ')).not.toContain('Ada, Done');
    expect(rows(view).join(' ')).toContain('Cloud general');
    hostState.connecting = true;
    await act(async () =>
      view.querySelector<HTMLButtonElement>('button[aria-label="Empty workspace"]')!.click(),
    );
    expect(view.textContent).toContain(t.cloudChannels.empty);
  });

  it('filters the list in place and opens the chat the Human taps', async () => {
    const view = await home();
    expect(rows(view)).toHaveLength(3);

    await type(view, 'ＡＤ');
    expect(rows(view)).toEqual(['Ada, Done']);
    await act(async () =>
      view.querySelector<HTMLButtonElement>('button[aria-label="Ada, Done"]')!.click(),
    );
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/dm/[slug]',
      params: { slug: 'ada', hostId: 'h1' },
    });

    await type(view, '小明');
    expect(rows(view)).toEqual(['小明']);

    await type(view, 'launch');
    await act(async () =>
      [...view.querySelectorAll('button')]
        .find((node) => node.getAttribute('aria-label')?.startsWith('Launch team'))!
        .click(),
    );
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/channel/[id]',
      params: { id: 'launch-team', hostId: 'h1' },
    });
  });

  it('says plainly when nothing matches', async () => {
    const view = await home();
    await type(view, ' zed ');
    expect(rows(view)).toEqual([]);
    expect(view.textContent).toContain(t.searchNoMatch('zed'));
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
    expect(rows(view)).toEqual(['Ada, Done']);
    await type(view, '');
    await act(async () => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(view.querySelector(`textarea[aria-label="${t.searchPlaceholder}"]`)).toBeNull();
    expect(view.querySelector(`button[aria-label="${t.settings}"]`)).not.toBeNull();
  });
});
