// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { channelNavigationHarness } from './channel-navigation-harness';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RosterBot, RosterChannel } from '@botharness/host-client/client';
import { Platform } from 'react-native';
import { ConversationScreen, type ChatPlace } from '../src/ui/chat/conversation-screen';
import { t } from '../src/ui/strings';

const {
  state,
  visibility,
  navigation,
  nativeList,
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

it('preserves the reading position on ordinary Back and repositions the same message only for a fresh request', async () => {
  state.active = true;
  state.conversation.messages = ['first', 'second'].map((id) => ({
    id,
    at: '2026-10-25T01:00:00Z',
    author: 'human',
    body: id,
    attachments: [],
    delivery: 'committed',
  }));
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  await render(place);
  await act(async () => root!.render(<ConversationScreen place={place} focus="first" />));
  expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
  const index = nativeList.scrollToIndex.mock.calls[0]![0].index as number;
  expect(nativeList.rows[index]?.message?.id).toBe('first');
  state.focused = false;
  await act(async () => root!.render(<ConversationScreen place={place} focus="first" />));
  state.focused = true;
  await act(async () => root!.render(<ConversationScreen place={place} focus="first" />));
  expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
  state.focused = false;
  await act(async () => root!.render(<ConversationScreen place={place} focus="first" />));
  await act(async () =>
    root!.render(
      <ConversationScreen place={place} focus="first" focusRequest="view-message-again" />,
    ),
  );
  expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
  state.focused = true;
  await act(async () =>
    root!.render(
      <ConversationScreen place={place} focus="first" focusRequest="view-message-again" />,
    ),
  );
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
  state.focused = false;
  await act(async () =>
    root!.render(
      <ConversationScreen place={place} focus="first" focusRequest="view-message-again" />,
    ),
  );
  state.focused = true;
  await act(async () =>
    root!.render(
      <ConversationScreen place={place} focus="first" focusRequest="view-message-again" />,
    ),
  );
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
});

it('lets notification focus own Android positioning across cached-to-live layout, then restores anchoring', async () => {
  const previousOS = Platform.OS;
  Object.assign(Platform, { OS: 'android' });
  try {
    state.active = true;
    const old = {
      id: 'old',
      at: '2026-11-05T04:00:00Z',
      author: 'human' as const,
      body: 'old',
      attachments: [],
      delivery: 'committed' as const,
    };
    state.conversation.messages = [old];
    state.conversation.fromCache = true;
    const place: ChatPlace = { kind: 'dm', slug: 'ada' };
    await render(place);
    expect(nativeList.events.maintainVisibleContentPosition).toBeDefined();
    await act(async () =>
      root!.render(<ConversationScreen place={place} focus="notification" focusRequest="tap-1" />),
    );
    const anchorDuringMount = nativeList.events.maintainVisibleContentPosition;
    let nativeOffset = 0;
    nativeList.scrollToIndex.mockImplementation(() => {
      nativeOffset = 0;
    });
    state.conversation.messages = [old, { ...old, id: 'notification', body: 'notification' }];
    state.conversation.fromCache = false;
    await act(async () =>
      root!.render(<ConversationScreen place={place} focus="notification" focusRequest="tap-1" />),
    );
    expect(nativeList.rows[nativeList.scrollToIndex.mock.lastCall![0].index]?.message?.id).toBe(
      'notification',
    );
    const oldAnchorLayoutDelta = 121.6667;
    if (anchorDuringMount !== undefined) nativeOffset += oldAnchorLayoutDelta;
    await act(async () => nativeList.events.onContentSizeChange?.(406.67, 2590.3333));
    expect(nativeOffset).toBe(0);
    const target = nativeList.rows.find((row) => row.message?.id === 'notification')!;
    await act(async () =>
      nativeList.events.onViewableItemsChanged?.({
        viewableItems: [{ item: target, isViewable: true }],
      }),
    );
    expect(nativeList.events.maintainVisibleContentPosition).toBeDefined();
  } finally {
    Object.assign(Platform, { OS: previousOS });
  }
});

it('keeps Android notification positioning pending when viewability precedes live content layout', async () => {
  const previousOS = Platform.OS;
  Object.assign(Platform, { OS: 'android' });
  try {
    state.active = true;
    state.conversation.status = 'opening';
    state.conversation.fromCache = true;
    state.conversation.messages = [
      {
        id: 'notification',
        at: '2026-11-05T04:00:00Z',
        author: 'human',
        body: 'notification',
        attachments: [],
        delivery: 'committed',
      },
    ];
    const place: ChatPlace = { kind: 'dm', slug: 'ada' };
    await render(place);
    await act(async () =>
      root!.render(<ConversationScreen place={place} focus="notification" focusRequest="tap-1" />),
    );
    const target = nativeList.rows.find((row) => row.message?.id === 'notification')!;
    await act(async () =>
      nativeList.events.onViewableItemsChanged?.({
        viewableItems: [{ item: target, isViewable: true }],
      }),
    );
    expect(nativeList.events.maintainVisibleContentPosition).toBeUndefined();
    nativeList.scrollToIndex.mockClear();
    state.conversation.status = 'live';
    state.conversation.fromCache = false;
    await act(async () =>
      root!.render(<ConversationScreen place={place} focus="notification" focusRequest="tap-1" />),
    );
    await act(async () => nativeList.events.onContentSizeChange?.(406.67, 1266));
    expect(nativeList.scrollToIndex).toHaveBeenCalled();
    expect(nativeList.rows[nativeList.scrollToIndex.mock.lastCall![0].index]?.message?.id).toBe(
      'notification',
    );
    expect(nativeList.events.maintainVisibleContentPosition).toBeUndefined();
    await act(async () =>
      nativeList.events.onViewableItemsChanged?.({
        viewableItems: [{ item: target, isViewable: true }],
      }),
    );
    expect(nativeList.events.maintainVisibleContentPosition).toBeDefined();
    nativeList.scrollToIndex.mockClear();
    await act(async () => nativeList.events.onContentSizeChange?.(406.67, 1400));
    expect(nativeList.scrollToIndex).not.toHaveBeenCalled();
  } finally {
    Object.assign(Platform, { OS: previousOS });
  }
});

it('returns anchor ownership to a user drag while an explicit Android focus is pending', async () => {
  const previousOS = Platform.OS;
  Object.assign(Platform, { OS: 'android' });
  try {
    state.active = true;
    const place: ChatPlace = { kind: 'dm', slug: 'ada' };
    await render(place);
    await act(async () =>
      root!.render(<ConversationScreen place={place} focus="not-loaded" focusRequest="tap-1" />),
    );
    expect(nativeList.events.maintainVisibleContentPosition).toBeUndefined();
    await act(async () =>
      nativeList.events.onScrollBeginDrag?.({
        nativeEvent: {
          contentOffset: { y: 100 },
          contentSize: { height: 2000 },
          layoutMeasurement: { height: 800 },
          contentInset: { top: 0, bottom: 0 },
        },
      }),
    );
    expect(nativeList.events.maintainVisibleContentPosition).toBeDefined();
    nativeList.scrollToIndex.mockClear();
    await act(async () => nativeList.events.onContentSizeChange?.(406.67, 2200));
    expect(nativeList.scrollToIndex).not.toHaveBeenCalled();
    await act(async () =>
      root!.render(<ConversationScreen place={place} focus="not-loaded" focusRequest="tap-2" />),
    );
    expect(nativeList.events.maintainVisibleContentPosition).toBeUndefined();
  } finally {
    Object.assign(Platform, { OS: previousOS });
  }
});

it('asks the existing history owner for an uncached focus and positions it when the page arrives', async () => {
  state.active = true;
  state.conversation.hasOlder = true;
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  await render(place);
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  expect(navigation.loadOlder).toHaveBeenCalledOnce();
  state.conversation.hasOlder = false;
  state.conversation.messages = [
    {
      id: 'older',
      at: '2026-10-25T01:00:00Z',
      author: 'human',
      body: 'older',
      attachments: [],
      delivery: 'committed',
    },
  ];
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
  expect(nativeList.rows[nativeList.scrollToIndex.mock.calls[0]![0].index]?.message?.id).toBe(
    'older',
  );
});

it('retries an unmeasured old message after layout without requiring a second focus request', async () => {
  state.active = true;
  state.conversation.messages = ['old', 'new'].map((id) => ({
    id,
    at: '2026-10-25T01:00:00Z',
    author: 'human',
    body: id,
    attachments: [],
    delivery: 'committed',
  }));
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  await render(place);
  nativeList.scrollToIndex.mockImplementationOnce(({ index }) => {
    nativeList.events.onScrollToIndexFailed?.({
      index,
      highestMeasuredFrameIndex: 0,
      averageItemLength: 80,
    });
  });
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="old" focusRequest="first" />),
  );
  expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
  await act(async () => nativeList.events.onContentSizeChange?.(400, 1800));
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
  const index = nativeList.scrollToIndex.mock.calls[1]![0].index;
  expect(nativeList.rows[index]?.message?.id).toBe('old');
});

it('resolves a failed focus against prepended rows and lets a new request replace it', async () => {
  state.active = true;
  state.conversation.messages = ['040', '090'].map((id) => ({
    id,
    at: '2026-10-25T01:00:00Z',
    author: 'human',
    body: id,
    attachments: [],
    delivery: 'committed',
  }));
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  await render(place);
  nativeList.scrollToIndex.mockImplementationOnce(({ index }) => {
    nativeList.events.onScrollToIndexFailed?.({
      index,
      highestMeasuredFrameIndex: 0,
      averageItemLength: 80,
    });
  });
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="040" focusRequest="1" />),
  );
  const initialIndex = nativeList.scrollToIndex.mock.calls[0]![0].index;
  state.conversation.messages = [
    { ...state.conversation.messages[0]!, id: '001' },
    ...state.conversation.messages,
  ];
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="040" focusRequest="1" />),
  );
  expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
  await act(async () => nativeList.events.onViewableItemsChanged?.());
  const retryIndex = nativeList.scrollToIndex.mock.calls[1]![0].index;
  expect(retryIndex).toBeGreaterThan(initialIndex);
  expect(nativeList.rows[retryIndex]?.message?.id).toBe('040');
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="090" focusRequest="2" />),
  );
  expect(nativeList.rows[nativeList.scrollToIndex.mock.lastCall![0].index]?.message?.id).toBe(
    '090',
  );
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="040" focusRequest="3" />),
  );
  expect(nativeList.rows[nativeList.scrollToIndex.mock.lastCall![0].index]?.message?.id).toBe(
    '040',
  );
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(4);
});

it('does not repeat an unchanged failed estimate or retry from an unfocused screen', async () => {
  state.active = true;
  state.conversation.messages = [
    {
      id: 'old',
      at: '2026-10-25T01:00:00Z',
      author: 'human',
      body: 'old',
      attachments: [],
      delivery: 'committed',
    },
  ];
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  await render(place);
  nativeList.scrollToIndex.mockImplementation(({ index }) => {
    nativeList.events.onScrollToIndexFailed?.({
      index,
      highestMeasuredFrameIndex: 0,
      averageItemLength: 80,
    });
  });
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="old" focusRequest="1" />),
  );
  expect(nativeList.scrollToOffset).toHaveBeenCalledOnce();
  await act(async () => nativeList.events.onViewableItemsChanged?.());
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
  expect(nativeList.scrollToOffset).toHaveBeenCalledOnce();
  state.focused = false;
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="old" focusRequest="1" />),
  );
  await act(async () => nativeList.events.onViewableItemsChanged?.());
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
});

it('cancels an unmeasured focus retry on user drag until another explicit request', async () => {
  state.active = true;
  state.conversation.messages = [
    {
      id: 'old',
      at: '2026-10-25T01:00:00Z',
      author: 'human',
      body: 'old',
      attachments: [],
      delivery: 'committed',
    },
  ];
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  await render(place);
  nativeList.scrollToIndex.mockImplementationOnce(({ index }) => {
    nativeList.events.onScrollToIndexFailed?.({
      index,
      highestMeasuredFrameIndex: 0,
      averageItemLength: 80,
    });
  });
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="old" focusRequest="1" />),
  );
  await act(async () =>
    nativeList.events.onScrollBeginDrag?.({
      nativeEvent: {
        contentOffset: { y: 100 },
        contentSize: { height: 2000 },
        layoutMeasurement: { height: 800 },
        contentInset: { top: 0, bottom: 0 },
      },
    }),
  );
  await act(async () => nativeList.events.onContentSizeChange?.(400, 2000));
  await act(async () => nativeList.events.onViewableItemsChanged?.());
  expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="old" focusRequest="2" />),
  );
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
});

it('retries source paging only after a new history boundary or an explicit repeated request', async () => {
  state.active = true;
  state.conversation.hasOlder = true;
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  await render(place);
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  state.conversation.loadingOlder = true;
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  state.conversation.loadingOlder = false;
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  expect(navigation.loadOlder).toHaveBeenCalledOnce();
  state.conversation.messages = [
    {
      id: 'middle',
      at: '2026-10-25T01:00:00Z',
      author: 'human',
      body: 'middle',
      attachments: [],
      delivery: 'committed',
    },
  ];
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  expect(navigation.loadOlder).toHaveBeenCalledTimes(2);
  state.focused = false;
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  state.focused = true;
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  expect(navigation.loadOlder).toHaveBeenCalledTimes(2);
  await act(async () =>
    root!.render(<ConversationScreen place={place} focus="older" focusRequest="retry-source" />),
  );
  expect(navigation.loadOlder).toHaveBeenCalledTimes(3);
});

it('shows a missing source message after the existing history owner reaches the beginning', async () => {
  const place: ChatPlace = { kind: 'channel', channelId: 'group-a' };
  const view = await render(place);
  await act(async () => root!.render(<ConversationScreen place={place} focus="gone" />));
  state.host.roster.channels = [{ id: 'group-a', name: 'Group', members: [], memberCount: 0 }];
  await act(async () => root!.render(<ConversationScreen place={place} focus="gone" />));
  expect(view.textContent).toContain(t.messageFocusUnavailable);
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

it('scrolls a retained conversation to a new message focus without a content resize', async () => {
  const place = focusConversation();
  const view = await render(place);
  const list = view.querySelector('[data-testid="chat-list"]');
  await act(async () => root!.render(<ConversationScreen place={place} focus="second" />));
  expect(view.querySelector('[data-testid="chat-list"]')).toBe(list);
  expect(nativeList.scrollToIndex).toHaveBeenLastCalledWith({
    index: 2,
    viewPosition: 0.5,
    animated: true,
  });
});

it('loads older history for a new focus on a retained conversation', async () => {
  const place = focusConversation();
  state.conversation.hasOlder = true;
  await render(place);
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  expect(navigation.loadOlder).toHaveBeenCalledTimes(1);
  state.conversation.messages = [
    {
      id: 'older',
      at: '',
      author: 'bot',
      bot: 'ada',
      body: 'older',
      attachments: [],
      delivery: 'committed',
    },
    ...state.conversation.messages,
  ];
  state.conversation.hasOlder = false;
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  expect(nativeList.scrollToIndex).toHaveBeenLastCalledWith({
    index: 1,
    viewPosition: 0.5,
    animated: true,
  });
});

it('reapplies the same message only for a fresh explicit request on its retained screen', async () => {
  const place = focusConversation();
  await render(place, 'first');
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(1);
  state.focused = false;
  await act(async () => root!.render(<ConversationScreen place={place} focus="first" />));
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(1);
  state.focused = true;
  await act(async () =>
    root!.render(
      <ConversationScreen place={place} focus="first" focusRequest="explicit-revisit" />,
    ),
  );
  expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
  expect(nativeList.scrollToIndex).toHaveBeenLastCalledWith({
    index: 1,
    viewPosition: 0.5,
    animated: true,
  });
});

it('does not loop older-history requests when a page fails to advance', async () => {
  const place = focusConversation();
  state.conversation.hasOlder = true;
  await render(place, 'older');
  expect(navigation.loadOlder).toHaveBeenCalledTimes(1);
  state.conversation.loadingOlder = true;
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  state.conversation.loadingOlder = false;
  await act(async () => root!.render(<ConversationScreen place={place} focus="older" />));
  expect(navigation.loadOlder).toHaveBeenCalledTimes(1);
});

it('keeps the correct DM open and explains when the linked message is unavailable', async () => {
  state.host.roster.bots = [
    {
      slug: 'ada',
      displayName: 'Ada',
      state: 'idle',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      paused: false,
    },
  ];
  state.history = ['/', '/dm/ada'];
  const view = await render({ kind: 'dm', slug: 'ada' }, 'removed-message');
  expect(view.textContent).toContain(t.messageFocusUnavailable);
  expect(view.querySelector('[data-testid="chat-controls"]')).not.toBeNull();
  expect(state.history).toEqual(['/', '/dm/ada']);
});
