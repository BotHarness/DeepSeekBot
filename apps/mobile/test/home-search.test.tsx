// @vitest-environment jsdom
import { act, memo, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { channelNavigationHarness } from './channel-navigation-harness';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import { Platform } from 'react-native';
import { conversationFilter } from '../src/host/native-conversation-filter';
import HomeScreen from '../app/(tabs)/(home)/index';
import { t } from '../src/ui/strings';
import { interfacePreferences } from '../src/ui/interface-preferences';
import { ConversationRow } from '../src/ui/chat/conversation-row';
import type { Conversation } from '../src/ui/chat/conversations';

const {
  push,
  hostState,
  call,
  menus,
  roster,
  mockConversationPeek,
  mockConversationFilter,
  mockCloudNative,
  mockCloudConversations,
  mockReactNative,
  mockHostSession,
  mockSectionCollapse,
  mockHostDrawer,
} = await vi.hoisted(() => import('./home-search-mocks'));

import {
  rowCalls,
  rowMenuAction,
  rows,
  prepareHomeState,
  resetHomeState,
} from './home-search-fixtures';

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

describe('Search in the Chats header', () => {
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

  it('does not send a pending message search after leaving Home', async () => {
    vi.useFakeTimers();
    try {
      const view = await home();
      await type(view, 'launch');
      expect(call.mock.calls.filter(([method]) => method === 'messageSearch')).toEqual([]);
      await act(async () => root?.unmount());
      root = undefined;
      await act(async () => vi.advanceTimersByTimeAsync(150));
      expect(call.mock.calls.filter(([method]) => method === 'messageSearch')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
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
  it('drops a pending message search when the screen goes away', async () => {
    vi.useFakeTimers();
    try {
      const view = await home();
      await type(view, 'zed');
      act(() => root?.unmount());
      root = undefined;
      await vi.advanceTimersByTimeAsync(1000);
      expect(call).not.toHaveBeenCalledWith('messageSearch', expect.anything());
    } finally {
      vi.useRealTimers();
    }
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
  it('closes search, clearing the query, from the button beside the field', async () => {
    const view = await home();
    expect(view.querySelector(`button[aria-label="${t.closeSearch}"]`)).toBeNull();
    await type(view, 'ada');
    expect(view.textContent).not.toContain('Launch team');
    await act(async () =>
      view.querySelector<HTMLButtonElement>(`button[aria-label="${t.closeSearch}"]`)!.click(),
    );
    expect(view.querySelector(`textarea[aria-label="${t.searchPlaceholder}"]`)).toBeNull();
    expect(view.querySelector('[data-testid="search-button"]')).not.toBeNull();
    expect(view.textContent).toContain('Launch team');
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="search-button"]')!.click(),
    );
    expect(
      view.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${t.searchPlaceholder}"]`)!
        .value,
    ).toBe('');
  });
  it('replaces the title and Search with the field, and keeps a query after editing ends', async () => {
    const view = await home();
    expect(view.querySelector(`textarea[aria-label="${t.searchPlaceholder}"]`)).toBeNull();
    await type(view, 'ada');
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
    expect(view.querySelector('[data-testid="search-button"]')).not.toBeNull();
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
    expect(rowCalls()).toEqual([]);
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
      expect(rowCalls().at(-1)).toEqual([
        'rosterBatch',
        { action: 'unpin', channelIds: ['dm-ada'] },
      ]);
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
