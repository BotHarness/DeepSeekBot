// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { channelNavigationHarness } from './channel-navigation-harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosterBot, RosterChannel } from '@botharness/host-client/client';
import { Keyboard, Platform } from 'react-native';
import { ConversationScreen, type ChatPlace } from '../src/ui/chat/conversation-screen';
import { t } from '../src/ui/strings';

const {
  state,
  visibility,
  navigation,
  mockReanimated,
  mockHostSession,
  mockNativeHeader,
  mockChatHeaderActions,
  mockSwipeOpen,
  mockConversationTopBar,
  mockHeaderChrome,
  mockKeyboardFrame,
  mockMessageBubble,
  resetConversation,
} = await vi.hoisted(() => import('./conversation-navigation-mocks'));

import { focusConversation } from './conversation-navigation-fixtures';

let profileHistory = channelNavigationHarness();

vi.mock('../src/ui/chat/model-brand-icon', () => ({ ModelBrandIcon: () => null }));

vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ icon: { kind: 'symbol', id: 'desktop' } }),
}));

vi.mock('../src/ui/chat/skill-suggestions', () => ({ SkillSuggestions: () => null }));

vi.mock('../src/ui/chat/mark-read', () => ({ useMarkRead: () => visibility.read }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('expo-image', () => ({ Image: () => null }));

vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));

vi.mock('react-native-view-shot', () => ({ captureRef: vi.fn(), releaseCapture: vi.fn() }));

vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));

vi.mock('../src/ui/chat/delivery-sheet', () => ({ DeliverySheet: () => null }));

vi.mock('../src/ui/shell/recent-chats', () => ({
  chatHref: () => '',
  useRecentChat: () => visibility.recent,
}));

vi.mock('../src/host/native-source-drafts', () => ({
  useSourceDraft: () => ['', () => {}, { loaded: true, failed: false, retry: async () => true }],
}));

vi.mock('../src/host/native-live-activity', () => ({
  useRequestActivity: () => ({ ready: true, busy: false, tracking: false }),
  requestActivitySession: { start: async () => {}, stop: async () => {} },
}));

vi.mock('expo-router', () => ({
  useNavigationContainerRef: () => profileHistory.navigation,
  useIsFocused: () => state.focused,
  usePreventRemove: () => {},
  Stack: {
    Screen: ({
      options,
    }: {
      options: {
        headerLeft?: () => ReactNode;
        headerRight?: () => ReactNode;
        headerTitle?: string | (() => ReactNode);
        headerBackVisible?: boolean;
        headerBlurEffect?: string;
        unstable_headerLeftItems?: () => Array<{
          type: string;
          element?: ReactNode;
          label?: string;
          onPress?: () => void;
        }>;
        unstable_headerRightItems?: () => Array<{
          type?: string;
          element?: ReactNode;
          label?: string;
          onPress?(): void;
        }>;
      };
    }) => (
      <header
        data-back-visible={String(options.headerBackVisible)}
        data-blur={options.headerBlurEffect ?? 'none'}
      >
        {options.unstable_headerLeftItems?.().map((item, index) => (
          <span key={index} data-item={item.type}>
            {item.type === 'button' ? (
              <button type="button" onClick={item.onPress}>
                {item.label}
              </button>
            ) : (
              item.element
            )}
          </span>
        )) ??
          options.headerLeft?.() ??
          null}
        <aside data-testid="trailing-header">
          {typeof options.headerTitle === 'function' ? options.headerTitle() : null}
          {options.unstable_headerRightItems?.().map((item, index) =>
            item.type === 'custom' ? (
              <span key={index}>{item.element}</span>
            ) : (
              <button type="button" key={index} onClick={item.onPress}>
                {item.label}
              </button>
            ),
          ) ?? options.headerRight?.()}
        </aside>
      </header>
    ),
  },
  useRouter: () => ({
    push: (href: { pathname: string; params?: object }) => {
      navigation.push(href);
      profileHistory.push(href.pathname.slice(1), href.params);
    },
    canGoBack: () => state.history.length > 1,
    back: () => state.history.pop(),
    replace: (href: string) => state.history.splice(-1, 1, href),
    dismissTo: (href: string) => {
      const index = state.history.lastIndexOf(href);
      if (index < 0) state.history.splice(-1, 1, href);
      else state.history.splice(index + 1);
    },
  }),
}));

vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));

vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return { ...shim, KeyboardAvoidingView: shim.View };
});

vi.mock('react-native-reanimated', mockReanimated);

vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));

vi.mock('../src/host/host-session', mockHostSession);

vi.mock('../src/host/share-attachment', () => ({ shareAttachment: vi.fn() }));

vi.mock('../src/host/native-dm-activity', () => ({ useHiddenDmActivity: () => [] }));

vi.mock('../src/host/native-message-display', () => ({
  useMessageDisplay: () => state.display,
}));

vi.mock('../src/host/native-send-jump', () => ({
  sendJumpPreferences: {
    getSnapshot: () => ({ enabled: false, loaded: true, storageError: false }),
  },
}));

vi.mock('../src/host/native-delivery-receipts', () => ({
  useDeliveryReceiptPreferences: () => ({
    enabled: state.receipts,
    loaded: true,
    storageError: false,
  }),
}));

vi.mock('../src/host/native-chat-background', () => ({
  useChatBackgrounds: () => undefined,
  chatBackgrounds: { resolve: () => ({ kind: 'default' }) },
  backgroundImageUri: (id: string) => id,
}));

vi.mock('../src/ui/chat/chat-background', () => ({ ChatBackground: () => null }));

vi.mock('../src/host/pick-files', () => ({ MAX_PICKED: 10, pickFiles: vi.fn() }));

vi.mock('../src/host/speech', () => ({
  useDictation: () => ({ state: { status: 'idle' }, mountRef: () => undefined }),
}));

vi.mock('../src/ui/chat/native-header', mockNativeHeader);

vi.mock('../src/ui/chat/chat-header-actions', mockChatHeaderActions);

vi.mock('../src/ui/chat/bot-profile-screen', () => ({ BotProfileScreen: () => null }));

vi.mock('../src/ui/chat/group-profile-screen', () => ({ GroupProfileScreen: () => null }));

vi.mock('../src/ui/chat/channel-details-screen', () => ({ ChannelDetailsScreen: () => null }));

vi.mock('../src/ui/shell/swipe-open', mockSwipeOpen);

vi.mock('../src/ui/chat/conversation-top-bar', mockConversationTopBar);

vi.mock('../src/ui/chat/header-chrome', mockHeaderChrome);

vi.mock('../src/ui/primitives/keyboard-frame', mockKeyboardFrame);

vi.mock('../src/ui/chat/speaker-row', async () => {
  const { createContext } = await import('react');
  return {
    SpeakerStageContext: createContext(undefined),
    createSpeakerRegistry: () => ({ setGroups() {} }),
  };
});

vi.mock('../src/ui/chat/approval-card', () => ({ ApprovalCard: () => null }));

vi.mock('../src/ui/chat/grant-request-card', () => ({ GrantRequestCard: () => null }));

vi.mock('../src/ui/chat/private-input-card', () => ({ PrivateInputCard: () => null }));

vi.mock('../src/ui/chat/activity-row', () => ({ ActivityRow: () => null }));

vi.mock('../src/ui/chat/question-card', () => ({ QuestionCard: () => null }));

vi.mock('../src/ui/chat/channel-title', () => ({
  ChannelTitle: ({ channel, fallback }: { channel?: RosterChannel; fallback: string }) => (
    <span data-testid="channel-title">{channel?.name ?? fallback}</span>
  ),
}));

vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null, BotPortrait: () => null }));

vi.mock('../src/ui/chat/composer', () => ({
  Composer: ({
    sessionControls,
  }: import('react').ComponentProps<typeof import('../src/ui/chat/composer').Composer>) => (
    <div
      data-testid="composer-input"
      data-session-controls={sessionControls === undefined ? undefined : 'present'}
    />
  ),
}));

vi.mock('../src/ui/chat/image-viewer', () => ({ ImageViewer: () => null }));

vi.mock('../src/ui/chat/jump-to-latest', () => ({ JumpToLatest: () => null }));

vi.mock('../src/ui/chat/pull-to-compose-hint', () => ({ PullToComposeHint: () => null }));

vi.mock('../src/ui/chat/clipboard-image', () => ({
  ClipboardImageOffer: () => null,
  useClipboardImage: () => ({ offered: false, used: () => {} }),
}));

vi.mock('expo-haptics', () => import('./expo-haptics-shim'));

vi.mock('../src/ui/chat/message-actions', () => ({ MessageActions: () => null }));

vi.mock('../src/ui/chat/message-bubble', mockMessageBubble);

vi.mock('../src/ui/chat/message-menu', () => ({ copyMessage: vi.fn(), shareText: vi.fn() }));

vi.mock('../src/ui/chat/mention-suggestions', () => ({ MentionSuggestions: () => null }));

vi.mock('../src/ui/chat/working-status', () => ({
  WorkingStatus: ({ bots }: { bots: RosterBot[] }) =>
    bots.length ? <span data-testid="pending">pending</span> : null,
}));

vi.mock('../src/ui/chat/time-separator', () => ({ TimeSeparator: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;

let container: HTMLElement | undefined;

beforeEach(() => {
  profileHistory = channelNavigationHarness();
  resetConversation();
});

it('refuses a retained route after switching Computers even when its Bot slug collides', async () => {
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  const view = await render(place);
  state.hostId = 'computer_b';
  await act(async () =>
    root!.render(
      <ConversationScreen place={place} focus={undefined} expectedHostId="computer_a" />,
    ),
  );
  expect(view.textContent).toContain(t.sourceChanged);
  expect(view.querySelector('[data-testid="chat-controls"]')).toBeNull();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

async function render(place: ChatPlace, focus?: string) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<ConversationScreen place={place} focus={focus} />));
  return container;
}

async function press(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll('button')].find((node) => node.textContent === label);
  expect(button, `button ${label}`).toBeDefined();
  await act(async () => button!.click());
}

describe('missing conversation navigation', () => {
  const places: Array<{ name: string; place: ChatPlace; route: string; notice: string }> = [
    { name: 'DM', place: { kind: 'dm', slug: 'gone' }, route: '/dm/gone', notice: t.noBot },
    {
      name: 'Channel',
      place: { kind: 'channel', channelId: 'gone' },
      route: '/channel/gone',
      notice: t.groupUnavailableTitle,
    },
  ];

  for (const { name, place, route, notice } of places) {
    for (const previous of [[], ['/activity'], ['/', '/activity']]) {
      it(`${name}: Back to Chats targets Chats with history ${JSON.stringify(previous)}`, async () => {
        state.history = [...previous, route];
        const view = await render(place);
        expect(view.textContent).toContain(notice);
        await press(view, t.backToChats);
        expect(state.history.at(-1)).toBe('/');
        expect(state.history).not.toContain(route);
      });
    }

    it(`${name}: leaves back to Activity to the native header back button`, async () => {
      state.history = ['/activity', route];
      const view = await render(place);
      expect(
        [...view.querySelectorAll('header button')].some(
          (button) => button.textContent === 'Header back' || button.textContent === t.back,
        ),
      ).toBe(false);
      expect(state.history).toEqual(['/activity', route]);
    });

    it(`${name}: header back falls back to Chats without history`, async () => {
      state.history = [route];
      await press(await render(place), 'Header back');
      expect(state.history).toEqual(['/']);
    });

    it(`${name}: iOS keeps the whole control row in the native title view`, async () => {
      const os = Platform.OS;
      Object.assign(Platform, { OS: 'ios' });
      try {
        state.history = [route];
        const alone = await render(place);
        const header = alone.querySelector('header')!;
        expect(header.dataset['backVisible']).toBe('false');
        expect(
          [...header.children]
            .filter((item) => item.hasAttribute('data-item'))
            .map((item) => (item as HTMLElement).dataset['item']),
        ).toEqual([]);
        await press(alone, t.back);
        expect(state.history).toEqual(['/']);
        act(() => root?.unmount());
        state.history = ['/activity', route];
        const stacked = (await render(place)).querySelector('header')!;
        expect(stacked.dataset['backVisible']).toBe('false');
        expect(stacked.querySelector('[data-item="button"]')).toBeNull();
        expect(
          [...stacked.children]
            .filter((item) => item.hasAttribute('data-item'))
            .map((item) => (item as HTMLElement).dataset['item']),
        ).toEqual([]);
      } finally {
        Object.assign(Platform, { OS: os });
      }
    });
  }

  it('keeps pairing recovery when the Host refuses the phone', async () => {
    state.host.connection.status = 'refused';
    const view = await render({ kind: 'dm', slug: 'gone' });
    expect(view.textContent).toContain(t.pairAgain);
    expect(view.textContent).not.toContain(t.backToChats);
  });
});

it('preloads inline chat without marking read or recording recents until it settles open', async () => {
  const os = Platform.OS;
  Object.assign(Platform, { OS: 'android' });
  const place = focusConversation();
  container = document.createElement('div');
  root = createRoot(container);
  const onClose = vi.fn(),
    onNestedChange = vi.fn();
  const show = (active: boolean) =>
    act(async () =>
      root!.render(
        <ConversationScreen
          place={place}
          focus={undefined}
          presentation={{ active, onClose, onNestedChange }}
        />,
      ),
    );
  visibility.read.mockClear();
  visibility.recent.mockClear();
  try {
    await show(false);
    expect(visibility.read.mock.calls.every(([node]) => node === null)).toBe(true);
    expect(visibility.recent.mock.calls.every(([node]) => node === null)).toBe(true);
    expect(container.querySelector('header')).toBeNull();
    await show(true);
    expect(visibility.read.mock.calls.some(([node]) => node !== null)).toBe(true);
    expect(visibility.recent.mock.calls.some(([node]) => node !== null)).toBe(true);
    await press(container, 'Header back');
    expect(onClose).toHaveBeenCalledOnce();
    visibility.read.mockClear();
    visibility.recent.mockClear();
    await show(false);
    expect(visibility.read.mock.calls.every(([node]) => node === null)).toBe(true);
    expect(visibility.recent.mock.calls.every(([node]) => node === null)).toBe(true);
  } finally {
    Object.assign(Platform, { OS: os });
  }
});

it('closes an inline deleted conversation through its recovery action', async () => {
  const os = Platform.OS;
  Object.assign(Platform, { OS: 'android' });
  container = document.createElement('div');
  root = createRoot(container);
  const onClose = vi.fn();
  try {
    await act(async () =>
      root!.render(
        <ConversationScreen
          place={{ kind: 'dm', slug: 'gone' }}
          focus={undefined}
          presentation={{ active: true, onClose, onNestedChange: () => {} }}
        />,
      ),
    );
    await press(container, t.backToChats);
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    Object.assign(Platform, { OS: os });
  }
});

describe('disbanded group presentation', () => {
  const os = Platform.OS;
  beforeEach(() => {
    Object.assign(Platform, { OS: 'ios' });
  });
  afterEach(() => {
    Object.assign(Platform, { OS: os });
  });
  it('does not show loading for an authoritatively missing group', async () => {
    state.conversation.status = 'opening';
    const view = await render({ kind: 'channel', channelId: 'gone' });
    expect(view.textContent).toContain(t.groupUnavailableTitle);
    expect(view.querySelector('[data-testid="group-unavailable"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="composer-input"]')).toBeNull();
    expect(view.querySelector('[data-testid="message-skeleton"]')).toBeNull();
    expect(view.querySelector('[data-testid="channel-title"]')?.textContent).toBe(t.groupInfo);
  });
  it('dismisses the keyboard only when the missing group becomes focused', async () => {
    const dismiss = vi.spyOn(Keyboard, 'dismiss');
    state.focused = false;
    const place: ChatPlace = { kind: 'channel', channelId: 'gone' };
    await render(place);
    expect(dismiss).not.toHaveBeenCalled();
    state.focused = true;
    await act(async () => root!.render(<ConversationScreen place={place} focus={undefined} />));
    expect(dismiss).toHaveBeenCalledOnce();
    dismiss.mockRestore();
  });
  it('keeps a short drop out of view and shows offline as a chip once it lasts', async () => {
    state.host.roster.channels = [
      { id: 'cached', name: 'Offline group', members: [], memberCount: 0 },
    ];
    Object.assign(state.host.connection, { status: 'unreachable' });
    Object.assign(state.host, { disruptedSince: Date.now() });
    state.conversation.fromCache = true;
    const view = await render({ kind: 'channel', channelId: 'cached' });
    expect(view.textContent).not.toContain(t.offline);
    expect(view.querySelector('[data-testid="chat-status-chip"]')).toBeNull();
    Object.assign(state.host, { disruptedSince: Date.now() - 60_000 });
    await act(async () =>
      root!.render(
        <ConversationScreen place={{ kind: 'channel', channelId: 'cached' }} focus={undefined} />,
      ),
    );
    expect(view.querySelector('[data-testid="chat-status-chip"]')?.textContent).toContain(
      t.offline,
    );
    expect(view.querySelector('[data-testid="chat-connection-retry"]')).not.toBeNull();
  });
  it('retains cached conversation controls until reconnect confirms absence', async () => {
    state.host.roster.channels = [
      { id: 'cached', name: 'Offline group', members: [], memberCount: 0 },
    ];
    Object.assign(state.host.connection, { status: 'unreachable' });
    Object.assign(state.host, { disruptedSince: Date.now() - 60_000 });
    state.conversation.fromCache = true;
    const view = await render({ kind: 'channel', channelId: 'cached' });
    expect(view.textContent).toContain(t.offline);
    expect(view.querySelector('[data-testid="group-unavailable"]')).toBeNull();
    expect(view.querySelector('[data-testid="composer-input"]')).not.toBeNull();
    state.host.roster.channels = [];
    Object.assign(state.host.connection, { status: 'connected' });
    state.conversation.fromCache = false;
    await act(async () =>
      root!.render(
        <ConversationScreen place={{ kind: 'channel', channelId: 'cached' }} focus={undefined} />,
      ),
    );
    expect(view.textContent).not.toContain(t.offline);
    expect(view.textContent).toContain(t.groupUnavailableTitle);
    expect(view.querySelector('[data-testid="composer-input"]')).toBeNull();
  });
  it('keeps the last group name after disband without leaking it to another Host', async () => {
    const place: ChatPlace = { kind: 'channel', channelId: 'group-a' };
    state.host.roster.channels = [
      { id: 'group-a', name: 'Review group', members: [], memberCount: 0 },
    ];
    const view = await render(place);
    state.host.roster.channels = [];
    state.conversation.status = 'opening';
    await act(async () => root!.render(<ConversationScreen place={place} focus={undefined} />));
    expect(view.querySelector('[data-testid="channel-title"]')?.textContent).toBe('Review group');
    expect(view.querySelector('[data-testid="message-skeleton"]')).toBeNull();
    state.hostId = 'computer_b';
    await act(async () => root!.render(<ConversationScreen place={place} focus={undefined} />));
    expect(view.textContent).toContain(t.sourceChanged);
    expect(view.textContent).not.toContain('Review group');
  });
  it('still shows loading for an existing group opening its history', async () => {
    state.host.roster.channels = [
      { id: 'group-a', name: 'Review group', members: [], memberCount: 0 },
    ];
    state.conversation.status = 'opening';
    const view = await render({ kind: 'channel', channelId: 'group-a' });
    expect(view.querySelector('[data-testid="message-skeleton"]')).not.toBeNull();
  });
});
