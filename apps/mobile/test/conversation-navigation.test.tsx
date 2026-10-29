// @vitest-environment jsdom
import { act, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { channelNavigationHarness } from './channel-navigation-harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let profileHistory = channelNavigationHarness();
const visibility = vi.hoisted(() => ({ recent: vi.fn(), read: vi.fn() }));
vi.mock('../src/ui/chat/mark-read', () => ({ useMarkRead: () => visibility.read }));
import type { ChannelListItem } from '../src/host/wire';
import type { RosterBot, RosterChannel } from '../src/host/client';
import type { Conversation, ConversationSnapshot } from '../src/host/conversation';

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));
vi.mock('react-native-view-shot', () => ({ captureRef: vi.fn(), releaseCapture: vi.fn() }));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));
vi.mock('../src/ui/chat/delivery-sheet', () => ({ DeliverySheet: () => null }));

const state = vi.hoisted(() => ({
  history: [] as string[],
  hostId: 'computer_a',
  host: {
    connection: { status: 'connected' },
    roster: {
      bots: [] as RosterBot[],
      channels: [] as RosterChannel[],
      activityChannels: [] as ChannelListItem[],
    },
  },
  conversation: {
    status: 'live',
    messages: [],
    drafts: [],
    hasOlder: false,
    loadingOlder: false,
    fromCache: false,
  } as ConversationSnapshot,
  active: false,
  target: undefined as Conversation | undefined,
  focused: true,
  display: { mode: 'streaming', loaded: true },
  receipts: false,
  glassHeader: true,
}));
const navigation = vi.hoisted(() => ({ push: vi.fn(), loadOlder: vi.fn(async () => {}) }));
const nativeList = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
  cellLayouts: new Map<string, (event: unknown) => void>(),
  scrollToOffset: vi.fn(),
  rows: [] as Array<{ key: string; kind?: string; message?: { id: string } }>,
  events: {} as {
    onScrollToIndexFailed?(info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }): void;
    onContentSizeChange?(width: number, height: number): void;
    onViewableItemsChanged?(): void;
    onScrollBeginDrag?(event: unknown): void;
    onScroll?(event: unknown): void;
    onScrollEndDrag?(event: unknown): void;
  },
}));

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
        headerBackVisible?: boolean;
        headerBlurEffect?: string;
        unstable_headerLeftItems?: () => Array<{
          type: string;
          element?: ReactNode;
          label?: string;
          onPress?: () => void;
        }>;
        unstable_headerRightItems?: () => Array<{ label: string; onPress(): void }>;
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
          {options.unstable_headerRightItems?.().map((item) => (
            <button key={item.label} type="button" onClick={item.onPress}>
              {item.label}
            </button>
          )) ?? options.headerRight?.()}
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
  return {
    ...shim,
    KeyboardAvoidingView: shim.View,
    View: (props: Parameters<typeof shim.View>[0]) => {
      const id = props['testID'];
      const layout = props['onLayout'];
      if (
        typeof id === 'string' &&
        (id.startsWith('chat-cell-') || id === 'focused-message') &&
        typeof layout === 'function'
      )
        nativeList.cellLayouts.set(id, (event) => layout(event));
      return shim.View(props);
    },
  };
});
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  const React = await import('react');
  return {
    ...shim,
    useAnimatedRef: () =>
      React.useMemo(() => {
        const ref = Object.assign(
          (node: unknown) => {
            ref.current = node;
          },
          { current: null as unknown },
        );
        return ref;
      }, []),
    default: {
      ...shim.default,
      FlatList: ({
        ref,
        ...props
      }: Parameters<typeof shim.default.FlatList>[0] &
        typeof nativeList.events & { ref: React.Ref<unknown> }) => {
        nativeList.rows = props.data;
        nativeList.events = props;
        React.useImperativeHandle(
          ref,
          () => ({
            scrollToIndex: nativeList.scrollToIndex,
            scrollToOffset: nativeList.scrollToOffset,
            getNativeScrollRef: () => null,
          }),
          [],
        );
        return React.createElement(shim.default.FlatList, props);
      },
    },
  };
});
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('../src/host/host-session', async () => ({
  useHostSession: () => ({ client: undefined, inbox: undefined, saved: { hostId: state.hostId } }),
  useHostSnapshot: () => state.host,
  useConversation: () =>
    state.target ?? (state.active ? { loadOlder: navigation.loadOlder } : undefined),
  useChannelConversation: () => undefined,
  useConversationTimelineSnapshot: (() => {
    const subscribe = (listener: () => void) => state.target?.subscribe(listener) ?? (() => {});
    const read = () => state.target?.getTimelineSnapshot() ?? state.conversation;
    return () => useSyncExternalStore(subscribe, read);
  })(),
  useStreamPlayback: () => undefined,
}));
vi.mock('../src/host/share-attachment', () => ({ shareAttachment: vi.fn() }));
vi.mock('../src/host/native-dm-activity', () => ({ useHiddenDmActivity: () => [] }));
vi.mock('../src/host/native-message-display', () => ({
  useMessageDisplay: () => state.display,
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
vi.mock('../src/ui/chat/native-header', () => ({
  get glassHeader() {
    return state.glassHeader;
  },
  get headerIslands() {
    return !state.glassHeader;
  },
  barLabelStyle: {},
  useHeaderOverlap: () => 80,
  floatingHeader: false,
  useHeaderPadding: () => 0,
}));
vi.mock('../src/ui/chat/bot-profile-screen', () => ({ BotProfileScreen: () => null }));
vi.mock('../src/ui/chat/group-profile-screen', () => ({ GroupProfileScreen: () => null }));
vi.mock('../src/ui/chat/channel-details-screen', () => ({ ChannelDetailsScreen: () => null }));
vi.mock('../src/ui/shell/swipe-open', () => ({
  SwipeOpen: ({
    enabled,
    onOpen,
    testID,
    children,
  }: {
    enabled: boolean;
    onOpen(): void;
    testID?: string;
    children: ReactNode;
  }) => (
    <div data-testid={testID} data-enabled={String(enabled)}>
      <button type="button" data-testid={`${testID}-trigger`} onClick={onOpen} />
      {children}
    </div>
  ),
}));
vi.mock('../src/ui/chat/header-chrome', () => ({
  titleChipFill: () => ({}),
  useChatHeaderHeight: () => 56,
  HeaderCircleButton: ({ label, onPress }: { label: string; onPress(): void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
  HeaderBackButton: ({ onPress }: { onPress(): void }) => (
    <button type="button" onClick={onPress}>
      Header back
    </button>
  ),
  EdgeFade: ({ edge, height }: { edge: string; height: number }) => (
    <span data-edge={edge} data-height={height} />
  ),
}));
vi.mock('../src/ui/primitives/keyboard-frame', () => ({
  useListBottomSafeArea: () => 34,
  KeyboardChatFrame: ({
    children,
    composer,
    background,
    onMount,
  }: {
    children: ReactNode;
    composer: ReactNode;
    background?: ReactNode;
    onMount?: (node: unknown) => void;
  }) => (
    <div ref={onMount}>
      <div data-testid="chat-background">{background === undefined ? 'none' : 'view'}</div>
      <div data-testid="chat-content">{children}</div>
      <div data-testid="chat-controls">{composer}</div>
    </div>
  ),
}));
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
  Composer: () => <div data-testid="composer-input" />,
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
vi.mock('../src/ui/chat/message-bubble', () => ({
  PlaybackBubble: ({
    message,
    onOpenDelivery,
  }: {
    message?: { body: string };
    onOpenDelivery?: unknown;
  }) =>
    message === undefined ? (
      <span data-testid="draft">visible draft</span>
    ) : (
      <span data-testid="message" data-receipt={onOpenDelivery === undefined ? 'off' : 'on'}>
        {message.body}
      </span>
    ),
}));
vi.mock('../src/ui/chat/message-menu', () => ({ copyMessage: vi.fn(), shareText: vi.fn() }));
vi.mock('../src/ui/chat/mention-suggestions', () => ({ MentionSuggestions: () => null }));
vi.mock('../src/ui/chat/working-status', () => ({
  WorkingStatus: ({ bots }: { bots: RosterBot[] }) =>
    bots.length ? <span data-testid="pending">pending</span> : null,
}));
vi.mock('../src/ui/chat/time-separator', () => ({ TimeSeparator: () => null }));

import { Keyboard, Platform } from 'react-native';
import { ConversationScreen, type ChatPlace } from '../src/ui/chat/conversation-screen';
import { StackRoot } from '../src/ui/shell/stack-root';
import { t } from '../src/ui/strings';
import { edgeFade } from '../src/ui/design/tokens';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(() => {
  profileHistory = channelNavigationHarness();
  navigation.push.mockClear();
  navigation.loadOlder.mockClear();
  nativeList.scrollToIndex.mockReset();
  nativeList.cellLayouts.clear();
  nativeList.scrollToOffset.mockClear();
  state.hostId = 'computer_a';
  state.host.connection.status = 'connected';
  state.conversation.status = 'live';
  state.conversation.messages = [];
  state.conversation.drafts = [];
  state.conversation.hasOlder = false;
  state.conversation.loadingOlder = false;
  state.conversation.fromCache = false;
  state.host.roster.bots = [];
  state.host.roster.channels = [];
  state.host.roster.activityChannels = [];
  state.active = false;
  state.target = undefined;
  delete state.conversation.olderError;
  state.focused = true;
  state.display = { mode: 'streaming', loaded: true };
  state.receipts = false;
  state.glassHeader = true;
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

it.each(['ios', 'android'])('keeps the %s chat trailing header empty', async (os) => {
  const previousOS = Platform.OS;
  Object.assign(Platform, { OS: os });
  try {
    state.host.roster.bots = [
      {
        slug: 'ada',
        displayName: 'Ada',
        dmChannelId: 'dm-a',
        state: 'idle',
        roles: [],
        computerAccess: false,
        browserAccess: false,
        paused: false,
      },
    ];
    const view = await render({ kind: 'dm', slug: 'ada' });
    expect(view.querySelector('[data-testid="trailing-header"]')!.childElementCount).toBe(0);
    expect(view.querySelector('header')!.textContent).not.toContain(t.channelFiles.title);
    expect(view.querySelector('header')!.textContent).not.toContain(t.lockScreen.track);
  } finally {
    Object.assign(Platform, { OS: previousOS });
  }
});

it('shows a missing source message after the existing history owner reaches the beginning', async () => {
  const place: ChatPlace = { kind: 'channel', channelId: 'group-a' };
  const view = await render(place);
  await act(async () => root!.render(<ConversationScreen place={place} focus="gone" />));
  state.host.roster.channels = [{ id: 'group-a', name: 'Group', members: [], memberCount: 0 }];
  await act(async () => root!.render(<ConversationScreen place={place} focus="gone" />));
  expect(view.textContent).toContain(t.messageFocusUnavailable);
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

it('shows delivery receipts on bubbles only after the setting turns them on', async () => {
  state.active = true;
  state.conversation.messages = [
    {
      id: 'asked',
      at: '2026-10-25T01:00:00Z',
      author: 'human',
      body: 'asked',
      attachments: [],
      delivery: 'committed',
    },
  ];
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  const view = await render(place);
  const receipt = () => view.querySelector('[data-testid="message"]')?.getAttribute('data-receipt');
  expect(receipt()).toBe('off');
  state.receipts = true;
  await act(async () => root!.render(<ConversationScreen place={place} focus={undefined} />));
  expect(receipt()).toBe('on');
});

it('shows a message-shaped skeleton only while an empty history is opening', async () => {
  state.host.roster.channels = [
    { id: 'group-a', name: 'Review group', members: [], memberCount: 0 },
  ];
  state.conversation.status = 'opening';
  const place: ChatPlace = { kind: 'channel', channelId: 'group-a' };
  const view = await render(place);
  expect(view.querySelector('[data-testid="message-skeleton"]')).not.toBeNull();
  state.conversation.status = 'live';
  await act(async () => root!.render(<ConversationScreen place={place} focus={undefined} />));
  expect(view.querySelector('[data-testid="message-skeleton"]')).toBeNull();
});

it('retries a failed earlier page through the Conversation owner without replacing loaded history', async () => {
  const { createConversation } = await import('../src/host/conversation');
  const { createHostClient } = await import('../src/host/client');
  const { FakeHost } = await import('./fake-host');
  const host = new FakeHost();
  for (let index = 1; index <= 4; index += 1)
    host.channel('dm-ada').append({ id: `history-${index}`, body: `Earlier ${index}` }, false);
  const client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  const target = createConversation({
    host: client,
    channelId: 'dm-ada',
    pageSize: 2,
    olderPageSize: 2,
  });
  client.start();
  target.start();
  try {
    await vi.waitFor(() => expect(target.getSnapshot().status).toBe('live'));
    state.target = target;
    const view = await render({ kind: 'dm', slug: 'ada' });
    host.failing.add('channelJournalPage');
    await act(async () => target.loadOlder());
    expect(view.textContent).toContain(t.olderLoadFailed);
    expect(view.textContent).toContain('Earlier 4');
    host.failing.delete('channelJournalPage');
    const retry = view.querySelector('[data-testid="history-retry"]') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    await act(async () => {
      retry.click();
      await vi.waitFor(() => expect(target.getSnapshot().messages).toHaveLength(4));
    });
    expect(view.textContent).not.toContain(t.olderLoadFailed);
    expect(view.textContent).toContain('Earlier 1');
    expect(view.textContent).toContain('Earlier 4');
  } finally {
    target.stop();
    client.stop();
  }
});

it('keeps the bottom fade at the message viewport edge beneath the composer controls', async () => {
  const view = await render({ kind: 'dm', slug: 'ada' });
  const content = view.querySelector('[data-testid="chat-content"]')!;
  const controls = view.querySelector('[data-testid="chat-controls"]')!;
  const fade = content.querySelector('[data-edge="bottom"]');
  expect(fade).not.toBeNull();
  expect(fade?.getAttribute('data-height')).toBe(String(edgeFade.bottom));
  expect(controls.querySelector('[data-edge]')).toBeNull();
  expect(fade!.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
});

it('extends the native glass fade while leaving Back to the iOS 26 header', async () => {
  const os = Platform.OS;
  Object.assign(Platform, { OS: 'ios' });
  try {
    state.history = ['/', '/dm/ada'];
    state.host.roster.bots = [
      {
        slug: 'ada',
        displayName: 'Ada',
        state: 'idle',
        description: '',
        roles: [],
        computerAccess: false,
        browserAccess: false,
        paused: false,
      },
    ];
    const view = await render({ kind: 'dm', slug: 'ada' });
    const header = view.querySelector('header')!;
    expect(view.querySelector('[data-edge="top"]')).not.toBeNull();
    expect(header.getAttribute('data-blur')).toBe('none');
    expect(header.getAttribute('data-back-visible')).toBe('true');
    expect(header.textContent).not.toContain('Header back');
  } finally {
    Object.assign(Platform, { OS: os });
  }
});

it.each([
  ['Tob Mode leaves', true, ['/']],
  ['an ordinary chat stays', false, ['/', '/dm/ada']],
])('on a pull up from the latest message, %s', async (_, entered, history) => {
  const os = Platform.OS;
  Object.assign(Platform, { OS: 'ios' });
  try {
    state.history = entered ? ['/', '/dm-top/ada'] : ['/', '/dm/ada'];
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
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const place: ChatPlace = { kind: 'dm', slug: 'ada' };
    await act(async () =>
      root!.render(
        <StackRoot value={entered}>
          <ConversationScreen place={place} focus={undefined} />
        </StackRoot>,
      ),
    );
    const at = (y: number) => ({
      nativeEvent: {
        contentOffset: { y },
        contentSize: { height: 2000 },
        layoutMeasurement: { height: 800 },
        contentInset: { top: 0, bottom: 0 },
        velocity: { x: 0, y: 0 },
      },
    });
    await act(async () => {
      nativeList.events.onScrollBeginDrag?.(at(1200));
      nativeList.events.onScroll?.(at(1260));
      nativeList.events.onScrollEndDrag?.(at(1260));
    });
    expect(state.history).toEqual(history);
  } finally {
    Object.assign(Platform, { OS: os });
  }
});

it('draws its own top fade and an inset round Back before iOS 26', async () => {
  const os = Platform.OS;
  Object.assign(Platform, { OS: 'ios' });
  try {
    state.glassHeader = false;
    state.history = ['/', '/dm/ada'];
    state.host.roster.bots = [
      {
        slug: 'ada',
        displayName: 'Ada',
        state: 'idle',
        description: '',
        roles: [],
        computerAccess: false,
        browserAccess: false,
        paused: false,
      },
    ];
    const view = await render({ kind: 'dm', slug: 'ada' });
    const header = view.querySelector('header')!;
    expect(header.getAttribute('data-blur')).toBe('none');
    expect(header.getAttribute('data-back-visible')).toBe('false');
    expect(header.textContent).toContain('Header back');
    expect(view.querySelector('[data-edge="top"]')?.getAttribute('data-height')).toBe(
      String(80 + edgeFade.reach),
    );
  } finally {
    Object.assign(Platform, { OS: os });
  }
});

it('switches a live reply between buffered streaming and complete bubbles without hiding history', async () => {
  state.active = true;
  state.host.roster.bots = [
    {
      slug: 'ada',
      displayName: 'Ada',
      state: 'working',
      description: '',
      roles: [],
      computerAccess: false,
      browserAccess: false,
      paused: false,
    },
  ];
  state.conversation.messages = [
    {
      id: 'm1',
      at: '',
      author: 'bot',
      bot: 'ada',
      body: 'history',
      attachments: [],
      delivery: 'committed',
    },
  ];
  state.conversation.drafts = [{ draftId: 'd1', botSlug: 'ada', body: 'incoming' }];
  const place: ChatPlace = { kind: 'dm', slug: 'ada' };
  const view = await render(place);
  expect(view.querySelector('[data-testid="draft"]')).not.toBeNull();
  state.display = { mode: 'complete', loaded: true };
  await act(async () => root!.render(<ConversationScreen place={place} focus={undefined} />));
  expect(view.querySelector('[data-testid="draft"]')).toBeNull();
  expect(view.querySelector('[data-testid="pending"]')).toBeNull();
  expect(view.querySelector('[data-testid="chat-list"] [data-testid="pending"]')).toBeNull();
  expect(view.textContent).toContain('history');
  state.conversation.drafts = [];
  state.conversation.messages = [
    ...state.conversation.messages,
    {
      id: 'm2',
      at: '',
      author: 'bot',
      bot: 'ada',
      body: 'complete reply',
      attachments: [],
      delivery: 'committed',
    },
  ];
  await act(async () => root!.render(<ConversationScreen place={place} focus={undefined} />));
  expect(view.querySelectorAll('[data-testid="message"]')).toHaveLength(2);
  expect(view.textContent).toContain('complete reply');
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

function focusConversation(): ChatPlace {
  state.active = true;
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
  state.conversation.messages = ['first', 'second'].map((id) => ({
    id,
    at: '',
    author: 'bot',
    bot: 'ada',
    body: id,
    attachments: [],
    delivery: 'committed',
  }));
  return { kind: 'dm', slug: 'ada' };
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
      expect(view.querySelector('header button')).toBeNull();
      expect(state.history).toEqual(['/activity', route]);
    });

    it(`${name}: header back falls back to Chats without history`, async () => {
      state.history = [route];
      await press(await render(place), 'Header back');
      expect(state.history).toEqual(['/']);
    });

    it(`${name}: iOS puts back and the title capsule in separate leading bar items`, async () => {
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
        ).toEqual(['button', 'spacing', 'custom']);
        await press(alone, t.back);
        expect(state.history).toEqual(['/']);
        act(() => root?.unmount());
        state.history = ['/activity', route];
        const stacked = (await render(place)).querySelector('header')!;
        expect(stacked.dataset['backVisible']).toBe('true');
        expect(stacked.querySelector('[data-item="button"]')).toBeNull();
        expect(
          [...stacked.children]
            .filter((item) => item.hasAttribute('data-item'))
            .map((item) => (item as HTMLElement).dataset['item']),
        ).toEqual(['spacing', 'custom']);
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

describe('chat list chrome', () => {
  it('keeps the list first under the header and cancels the automatic bottom safe area', async () => {
    state.history = ['/dm/gone'];
    const view = await render({ kind: 'dm', slug: 'gone' });
    expect(view.querySelector('[data-testid="chat-background"]')!.textContent).toBe('none');
    const list = view.querySelector<HTMLElement>('[data-testid="chat-list"]')!;
    expect(list.dataset['insetBottom']).toBe('-34');
    expect(list.dataset['dismiss']).toBe('on-drag');
  });

  it('dismisses the keyboard interactively on iOS', async () => {
    const os = Platform.OS;
    Object.assign(Platform, { OS: 'ios' });
    try {
      state.history = ['/dm/gone'];
      const view = await render({ kind: 'dm', slug: 'gone' });
      const list = view.querySelector<HTMLElement>('[data-testid="chat-list"]')!;
      expect(list.dataset['dismiss']).toBe('interactive');
    } finally {
      Object.assign(Platform, { OS: os });
    }
  });
});

it('the real conversation title opens a source-scoped Bot Profile', async () => {
  const os = Platform.OS;
  Object.assign(Platform, { OS: 'ios' });
  try {
    profileHistory = channelNavigationHarness();
    profileHistory.push('dm/[slug]', { slug: 'ada', hostId: 'computer_a' });
    state.history = ['/', '/dm/ada'];
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
    const view = await render({ kind: 'dm', slug: 'ada' });
    const title = [...view.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Ada',
    );
    expect(title).toBeDefined();
    await act(async () => title!.click());
    expect(profileHistory.state.routes.at(-1)).toMatchObject({
      name: 'bot/[slug]',
      params: { slug: 'ada', hostId: 'computer_a' },
    });
    profileHistory.back();
    expect(profileHistory.state.routes.at(-1)!.name).toBe('dm/[slug]');
  } finally {
    Object.assign(Platform, { OS: os });
  }
});

it('a swipe left on the messages opens the same profile as the title', async () => {
  profileHistory = channelNavigationHarness();
  profileHistory.push('dm/[slug]', { slug: 'ada', hostId: 'computer_a' });
  state.history = ['/', '/dm/ada'];
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
  const view = await render({ kind: 'dm', slug: 'ada' });
  const swipe = view.querySelector('[data-testid="chat-profile-swipe"]');
  expect(swipe?.getAttribute('data-enabled')).toBe('true');
  await act(async () =>
    view.querySelector<HTMLButtonElement>('[data-testid="chat-profile-swipe-trigger"]')!.click(),
  );
  expect(profileHistory.state.routes.at(-1)).toMatchObject({
    name: 'bot/[slug]',
    params: { slug: 'ada', hostId: 'computer_a', entry: 'swipe' },
  });
});

it('opens scoped Bot-to-Bot details from its title without exposing group management', async () => {
  const previousOS = Platform.OS;
  Object.assign(Platform, { OS: 'ios' });
  try {
    state.host.roster.activityChannels = [
      { id: 'bots-a', type: 'dm', name: 'Bot conversation', members: ['ada', 'bob'] },
    ];
    const view = await render({ kind: 'channel', channelId: 'bots-a' });
    const chip = view.querySelector<HTMLButtonElement>('[data-testid="channel-details-chip"]');
    expect(chip).not.toBeNull();
    await act(async () => chip!.click());
    expect(navigation.push).toHaveBeenCalledWith({
      pathname: '/channel-details',
      params: { channelId: 'bots-a', hostId: 'computer_a' },
    });
    expect(view.querySelector('header')!.textContent).not.toContain(t.channelFiles.title);
  } finally {
    Object.assign(Platform, { OS: previousOS });
  }
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
  it('retains cached conversation controls until reconnect confirms absence', async () => {
    state.host.roster.channels = [
      { id: 'cached', name: 'Offline group', members: [], memberCount: 0 },
    ];
    Object.assign(state.host.connection, { status: 'unreachable' });
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

it('retries a retained target on real cell measurement progress without a content-size or viewability event', async () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  try {
    state.conversation.status = 'retained';
    state.conversation.fromCache = true;
    state.conversation.messages = Array.from({ length: 31 }, (_, i) => ({
      id: `cached-${i}`,
      at: '2026-10-25T01:00:00Z',
      author: 'human' as const,
      body: `cached ${i}`,
      attachments: [],
      delivery: 'committed' as const,
    }));
    nativeList.scrollToIndex.mockImplementationOnce(({ index }) =>
      nativeList.events.onScrollToIndexFailed?.({
        index,
        highestMeasuredFrameIndex: 10,
        averageItemLength: 80,
      }),
    );
    await render({ kind: 'dm', slug: 'ada' }, 'cached-30');
    expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
    const row = nativeList.rows.find((row) => row.message?.id === 'cached-20')!;
    const measure = nativeList.cellLayouts.get(`chat-cell-${row.key}`)!;
    expect(measure).toBeTypeOf('function');
    const event = { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 80 } } };
    await act(async () => measure(event));
    expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
    expect(nativeList.rows[nativeList.scrollToIndex.mock.calls[1]![0].index]?.message?.id).toBe(
      'cached-30',
    );
    await act(async () => {
      measure(event);
      await vi.advanceTimersByTimeAsync(17);
    });
    expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it.each(['drag', 'blur'] as const)('cancels a queued measurement retry on %s', async (cancel) => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  try {
    state.conversation.status = 'retained';
    state.conversation.messages = [
      {
        id: 'cached',
        at: '2026-10-25T01:00:00Z',
        author: 'human',
        body: 'cached',
        attachments: [],
        delivery: 'committed',
      },
    ];
    nativeList.scrollToIndex.mockImplementation(({ index }) =>
      nativeList.events.onScrollToIndexFailed?.({
        index,
        highestMeasuredFrameIndex: -1,
        averageItemLength: 80,
      }),
    );
    const place: ChatPlace = { kind: 'dm', slug: 'ada' };
    await render(place, 'cached');
    const row = nativeList.rows.find((row) => row.message?.id === 'cached')!;
    await act(async () =>
      nativeList.cellLayouts.get('focused-message')!({
        nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 80 } },
      }),
    );
    if (cancel === 'drag')
      await act(async () =>
        nativeList.events.onScrollBeginDrag?.({ nativeEvent: { contentOffset: { y: 0 } } }),
      );
    else {
      state.focused = false;
      await act(async () => root!.render(<ConversationScreen place={place} focus="cached" />));
    }
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(nativeList.scrollToIndex).toHaveBeenCalledOnce();
    state.focused = true;
    await act(async () =>
      root!.render(<ConversationScreen place={place} focus="cached" focusRequest="again" />),
    );
    expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(2);
    await act(async () =>
      nativeList.cellLayouts.get('focused-message')!({
        nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 80 } },
      }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(17));
    expect(nativeList.scrollToIndex).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});
