import { useSyncExternalStore, type ReactNode } from 'react';
import { vi, type Mock } from 'vitest';
import type { ChannelListItem } from '@botharness/host-protocol/wire';
import type { InboxSnapshot } from '@botharness/host-client/inbox';
import type { RosterBot, RosterChannel } from '@botharness/host-client/client';
import type { Conversation, ConversationSnapshot } from '@botharness/host-client/conversation';

export const visibility: { recent: Mock; read: Mock } = { recent: vi.fn(), read: vi.fn() };

export const state = {
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
  inbox: { status: 'idle' } as InboxSnapshot,
  glassHeader: true,
};

export const navigation: { push: Mock; loadOlder: Mock<() => Promise<void>> } = {
  push: vi.fn(),
  loadOlder: vi.fn(async () => {}),
};

type NativeRow = { key: string; kind?: string; message?: { id: string } };

const scrollToIndex: Mock = vi.fn();
const scrollToOffset: Mock = vi.fn();

export const nativeList = {
  scrollToIndex,
  scrollToOffset,
  rows: [] as NativeRow[],
  events: {} as {
    onScrollToIndexFailed?(info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }): void;
    onContentSizeChange?(width: number, height: number): void;
    onViewableItemsChanged?(info?: {
      viewableItems: Array<{ item: NativeRow; isViewable: boolean }>;
    }): void;
    maintainVisibleContentPosition?: { minIndexForVisible: number };
    onScrollBeginDrag?(event: unknown): void;
    onScroll?(event: unknown): void;
    onScrollEndDrag?(event: unknown): void;
  },
};

export async function mockReanimated() {
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
}

export async function mockHostSession() {
  return {
    useHostSession: () => ({
      client: undefined,
      inbox: undefined,
      saved: { hostId: state.hostId },
    }),
    useHostSnapshot: () => state.host,
    useInbox: () => state.inbox,
    useConversation: () =>
      state.target ?? (state.active ? { loadOlder: navigation.loadOlder } : undefined),
    useChannelConversation: () => undefined,
    useConversationTimelineSnapshot: (() => {
      const subscribe = (listener: () => void) => state.target?.subscribe(listener) ?? (() => {});
      const read = () => state.target?.getTimelineSnapshot() ?? state.conversation;
      return () => useSyncExternalStore(subscribe, read);
    })(),
    useStreamPlayback: () => undefined,
  };
}

export function mockNativeHeader() {
  return {
    headerContentScale: () => 1,
    headerControlHeight: (theme: { touch: number }) => theme.touch,
    get glassHeader() {
      return state.glassHeader;
    },
    get headerIslands() {
      return !state.glassHeader;
    },
    barLabelProps: {},
    barLabelStyle: {},
    useHeaderOverlap: () => 80,
    floatingHeader: false,
    useHeaderPadding: () => 0,
  };
}

export function mockChatHeaderActions() {
  return {
    ChatHeaderActions: (
      props: import('../src/ui/chat/chat-header-actions').ChatHeaderActionsProps,
    ) => {
      const actions = 'back' in props ? [props.back] : 'actions' in props ? props.actions : [];
      return (
        <>
          {actions.map((action) => (
            <button key={action.label} data-testid={action.testID} onClick={action.onPress}>
              {action.label}
            </button>
          ))}
        </>
      );
    },
  };
}

export function mockSwipeOpen() {
  return {
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
  };
}

export function mockConversationTopBar() {
  return {
    ConversationTopBar: ({
      title,
      onBack,
      onProfile,
      onCall,
    }: import('../src/ui/chat/conversation-top-bar').ConversationTopBarProps) => (
      <div data-testid="android-conversation-top-bar">
        <span>{title}</span>
        <button onClick={onBack}>Header back</button>
        {onProfile === undefined ? null : (
          <button data-testid="chat-profile-button" onClick={onProfile}>
            Profile
          </button>
        )}
        {onCall === undefined ? null : (
          <button data-testid="chat-call-button" onClick={onCall}>
            Call
          </button>
        )}
      </div>
    ),
  };
}

export function mockHeaderChrome() {
  return {
    HeaderActionGroup: ({
      actions,
    }: {
      actions: readonly { label: string; testID: string; onPress(): void }[];
    }) => (
      <span>
        {actions.map((action) => (
          <button
            key={action.testID}
            type="button"
            data-testid={action.testID}
            aria-label={action.label}
            onClick={action.onPress}
          />
        ))}
      </span>
    ),
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
  };
}

export function mockKeyboardFrame() {
  return {
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
  };
}

export async function mockMessageBubble() {
  const { SessionLinkChips } = await import('../src/ui/chat/session-link-chips');
  return {
    PlaybackBubble: ({
      message,
      onOpenDelivery,
      onOpenSession,
      sessionLinkNeeds,
    }: React.ComponentProps<typeof import('../src/ui/chat/message-bubble').PlaybackBubble>) =>
      message === undefined ? (
        <span data-testid="draft">visible draft</span>
      ) : (
        <div data-testid="message" data-receipt={onOpenDelivery === undefined ? 'off' : 'on'}>
          {message.body}
          {onOpenSession !== undefined && message.sessionLinks !== undefined ? (
            <SessionLinkChips
              kind="created"
              links={message.sessionLinks}
              needs={sessionLinkNeeds}
              onOpen={(link) => onOpenSession(link, message.bot)}
            />
          ) : null}
        </div>
      ),
  };
}

export function resetConversation() {
  navigation.push.mockClear();
  navigation.loadOlder.mockClear();
  nativeList.scrollToIndex.mockReset();
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
  state.inbox = { status: 'idle' };
  state.glassHeader = true;
}
