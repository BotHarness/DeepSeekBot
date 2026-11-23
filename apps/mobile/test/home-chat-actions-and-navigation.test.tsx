// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { channelNavigationHarness } from './channel-navigation-harness';
import { Platform } from 'react-native';
import HomeScreen from '../app/(tabs)/(home)/index';
import ActivityScreen from '../app/(tabs)/(activity)/activity';
import { t } from '../src/ui/strings';

const {
  push,
  hostState,
  call,
  menus,
  rowProps,
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

import { rowCalls, rowMenuAction, prepareHomeState, resetHomeState } from './home-search-fixtures';

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
        const fromMenu = rowCalls();
        const navigation = [...push.mock.calls];
        call.mockClear();
        push.mockClear();
        await act(async () => invoke({ nativeEvent: { actionName: key } }));
        expect(rowCalls()).toEqual(fromMenu);
        expect(push.mock.calls).toEqual(navigation);
      }
      call.mockClear();
      await act(async () => invoke({ nativeEvent: { actionName: 'unknown' } }));
      expect(rowCalls()).toEqual([]);
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
    call.mockResolvedValueOnce({ muted: ['dm-ada'] });
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
    call.mockResolvedValueOnce({ muted: ['dm-ada'] });
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
    call.mockResolvedValueOnce({ muted: [] });
    await rowMenuAction(view, 'unmute');
    expect(call).toHaveBeenLastCalledWith('channelMuteSet', { channelId: 'dm-ada', muted: false });
  });
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
        channelName: 'Ada',
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
