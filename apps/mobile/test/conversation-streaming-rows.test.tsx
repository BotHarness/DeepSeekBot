// @vitest-environment jsdom
import { interfacePreferences } from '../src/ui/interface-preferences';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  FlatListProps,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { channelNavigationHarness } from './channel-navigation-harness';
let navigationHistory = channelNavigationHarness();
import { RequestActivityControl } from '../src/ui/chat/request-activity-control';
import { useHostSession } from '../src/host/host-session';
import type { RosterBot } from '../src/host/client';
import type { ConversationTimelineSnapshot } from '../src/host/conversation';
import type { ActivityTarget } from '../src/host/live-activity-session';
import type { DialogAction } from '../src/ui/primitives/dialog-state';

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));
vi.mock('react-native-view-shot', () => ({ captureRef: vi.fn(), releaseCapture: vi.fn() }));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));
vi.mock('../src/ui/chat/delivery-sheet', () => ({ DeliverySheet: () => null }));

const state = vi.hoisted(() => ({
  history: [] as string[],
  hostId: 'computer_a',
  host: {
    connection: { status: 'connected' },
    roster: { bots: [] as RosterBot[], channels: [] },
  },
  display: { mode: 'streaming', loaded: true },
  os: 'web',
  clientEnabled: false,
  profile: undefined as
    | { hostId: string; channelId?: string; activityMessageId?: string }
    | undefined,
}));
const requestActivity = vi.hoisted(() => ({
  start: vi.fn<(target: ActivityTarget) => Promise<void>>(),
  actions: [] as readonly DialogAction[],
  client: {
    call: vi.fn(async () => {
      throw new Error('request unavailable');
    }),
  },
}));
vi.mock('../src/host/native-live-activity', () => ({
  useRequestActivity: () => ({ ready: true, busy: false, tracking: false }),
  requestActivitySession: { start: requestActivity.start, stop: async () => {} },
}));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  showAppDialog: (_title: string, _body: string, actions: readonly DialogAction[]) => {
    requestActivity.actions = actions;
  },
}));

const counts = vi.hoisted(() => ({ renderItem: 0, rows: new Map<string, number>() }));
const native = vi.hoisted(() => ({
  list: undefined as FlatListProps<unknown> | undefined,
  scrollToOffset: vi.fn(),
}));

const stream = vi.hoisted(() => {
  const timelineListeners = new Set<() => void>();
  const bubbleListeners = new Map<string, Set<() => void>>();
  const bubbles = new Map<string, string>();
  const history = (
    id: string,
    body: string,
    author: 'bot' | 'human',
  ): ConversationTimelineSnapshot['messages'][number] => ({
    id,
    at: '2026-10-19T08:00:00Z',
    author,
    ...(author === 'bot' ? { bot: 'ada' } : {}),
    body,
    attachments: [],
    delivery: 'committed',
  });
  let timeline: ConversationTimelineSnapshot = {
    status: 'live',
    messages: [history('m1', 'question', 'human'), history('m2', 'earlier answer', 'bot')],
    drafts: [{ draftId: 'd1', botSlug: 'ada' }],
    hasOlder: false,
    loadingOlder: false,
    fromCache: false,
  };
  return {
    history,
    publish(next: Partial<ConversationTimelineSnapshot>) {
      timeline = { ...timeline, ...next };
      for (const listener of timelineListeners) listener();
    },
    reset() {
      bubbles.clear();
      timeline = {
        ...timeline,
        messages: [history('m1', 'question', 'human'), history('m2', 'earlier answer', 'bot')],
        drafts: [{ draftId: 'd1', botSlug: 'ada' }],
      };
    },
    conversation: {
      loadOlder: () => Promise.resolve(),
      send: vi.fn(),
      getSnapshot: () => timeline,
      subscribe(listener: () => void) {
        timelineListeners.add(listener);
        return () => timelineListeners.delete(listener);
      },
    },
    playback: {
      getTimelineSnapshot: () => timeline,
      subscribe(listener: () => void) {
        timelineListeners.add(listener);
        return () => timelineListeners.delete(listener);
      },
      rowKey: (id: string) => id,
      getBubble: (key: string) => bubbles.get(key),
      subscribeBubble(key: string, listener: () => void) {
        const entries = bubbleListeners.get(key) ?? new Set<() => void>();
        bubbleListeners.set(key, entries);
        entries.add(listener);
        return () => entries.delete(listener);
      },
      setFollowing: () => {},
    },
    append(key: string, text: string) {
      bubbles.set(key, (bubbles.get(key) ?? '') + text);
      for (const listener of bubbleListeners.get(key) ?? []) listener();
    },
    timelineListeners,
  };
});

vi.mock('../src/ui/shell/recent-chats', () => ({
  chatHref: () => '',
  useRecentChat: () => () => {},
}));
vi.mock('../src/host/native-source-drafts', async () => {
  const { useState } = await import('react');
  return {
    useSourceDraft: () => [
      ...useState(''),
      { loaded: true, failed: false, retry: async () => true },
    ],
  };
});
vi.mock('expo-router', () => ({
  useNavigationContainerRef: () => navigationHistory.navigation,
  useIsFocused: () => true,
  Stack: {
    Screen: ({
      options,
    }: {
      options: {
        headerLeft?: () => ReactNode;
        unstable_headerLeftItems?: () => Array<{ element?: ReactNode }>;
        unstable_headerRightItems?: () => Array<{
          label: string;
          disabled: boolean;
          onPress(): void;
        }>;
      };
    }) => (
      <header>
        {options
          .unstable_headerLeftItems?.()
          .map((item, index) => <span key={index}>{item.element}</span>) ??
          options.headerLeft?.() ??
          null}
        {options.unstable_headerRightItems?.().map((item) => (
          <button key={item.label} disabled={item.disabled} onClick={item.onPress}>
            {item.label}
          </button>
        ))}
      </header>
    ),
  },
  useRouter: () => ({
    push: (href: { params: typeof state.profile }) => {
      state.profile = href.params;
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
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Platform: {
      ...shim.Platform,
      get OS() {
        return state.os;
      },
    },
    KeyboardAvoidingView: shim.View,
  };
});
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  const { useLayoutEffect, useMemo } = await import('react');
  const FlatList = (
    props: Parameters<typeof shim.default.FlatList>[0] &
      FlatListProps<unknown> & {
        ref: (node: unknown) => void;
      },
  ) => {
    native.list = props;
    useLayoutEffect(() => {
      props.ref({ scrollToOffset: native.scrollToOffset });
      return () => props.ref(null);
    }, [props.ref]);
    return shim.default.FlatList({
      ...props,
      renderItem: (info) => {
        counts.renderItem += 1;
        return props.renderItem(info);
      },
    });
  };
  return {
    ...shim,
    useAnimatedRef: () =>
      useMemo(() => {
        const ref = Object.assign(
          (node: unknown) => {
            ref.current = node;
          },
          { current: null as unknown },
        );
        return ref;
      }, []),
    default: { ...shim.default, FlatList },
  };
});
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('../src/host/host-session', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useHostSession: () => ({
      client: state.clientEnabled ? requestActivity.client : undefined,
      inbox: undefined,
      saved: { hostId: state.hostId },
    }),
    useHostSnapshot: () => state.host,
    useConversation: () => stream.conversation,
    useChannelConversation: () => undefined,
    useConversationTimelineSnapshot: () =>
      useSyncExternalStore(stream.playback.subscribe, stream.playback.getTimelineSnapshot),
    useStreamPlayback: () => stream.playback,
  };
});
vi.mock('../src/host/share-attachment', () => ({ shareAttachment: vi.fn() }));
vi.mock('../src/host/native-dm-activity', () => ({ useHiddenDmActivity: () => [] }));
vi.mock('../src/host/native-message-display', () => ({
  useMessageDisplay: () => state.display,
}));
vi.mock('../src/host/native-delivery-receipts', () => ({
  useDeliveryReceiptPreferences: () => ({ enabled: false, loaded: true, storageError: false }),
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
  glassHeader: true,
  headerIslands: false,
  useHeaderOverlap: () => 80,
  floatingHeader: false,
  useHeaderPadding: () => 0,
}));
vi.mock('../src/ui/chat/header-chrome', () => ({
  titleChipFill: () => ({}),
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
  useListBottomSafeArea: () => 0,
  KeyboardChatFrame: ({
    children,
    composer,
    background,
  }: {
    children: ReactNode;
    composer: ReactNode;
    background?: ReactNode;
  }) => (
    <div>
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
vi.mock('../src/ui/chat/channel-title', () => ({ ChannelTitle: () => null }));
vi.mock('../src/ui/chat/chat-title', () => ({
  ChatTitle: ({ onPress }: { onPress(): void }) => <button onClick={onPress}>Open profile</button>,
}));
vi.mock('../src/ui/chat/composer', () => ({
  Composer: ({ onChange, onSend }: { onChange(value: string): void; onSend(): void }) => (
    <>
      <button type="button" onClick={() => onChange('What is six times seven?')}>
        Write question
      </button>
      <button type="button" onClick={onSend}>
        Send question
      </button>
    </>
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
vi.mock('../src/ui/chat/message-bubble', async () => {
  const { memo, useCallback, useSyncExternalStore } = await import('react');
  return {
    PlaybackBubble: memo(function PlaybackBubble({
      queueKey,
      message,
    }: {
      queueKey: string;
      message?: { body: string };
    }) {
      counts.rows.set(queueKey, (counts.rows.get(queueKey) ?? 0) + 1);
      const subscribe = useCallback(
        (listener: () => void) => stream.playback.subscribeBubble(queueKey, listener),
        [queueKey],
      );
      const text = useSyncExternalStore(subscribe, () => stream.playback.getBubble(queueKey));
      return <span data-testid={queueKey}>{text ?? message?.body}</span>;
    }),
  };
});
vi.mock('../src/ui/chat/message-menu', () => ({ copyMessage: vi.fn(), shareText: vi.fn() }));
vi.mock('../src/ui/chat/mention-suggestions', () => ({ MentionSuggestions: () => null }));
vi.mock('../src/ui/chat/working-status', () => ({
  WorkingStatus: ({ bots }: { bots: RosterBot[] }) =>
    bots.length ? <span data-testid="pending">pending</span> : null,
}));
vi.mock('../src/ui/chat/time-separator', () => ({ TimeSeparator: () => null }));

import { ConversationScreen } from '../src/ui/chat/conversation-screen';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
beforeEach(() => {
  interfacePreferences.setLanguage('en');
  state.os = 'web';
  state.clientEnabled = false;
  state.hostId = 'computer_a';
  state.profile = undefined;
  requestActivity.start.mockReset().mockResolvedValue(undefined);
  requestActivity.actions = [];
  navigationHistory = channelNavigationHarness();
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  native.list = undefined;
  native.scrollToOffset.mockClear();
  stream.conversation.send.mockClear();
  stream.reset();
  state.host.roster.bots = [];
  counts.rows.clear();
  counts.renderItem = 0;
});

it.each(['ordinary send', 'question fallback'])(
  'tracks the exact first-DM receipt after %s commits its newly created Channel',
  async (path) => {
    state.os = 'ios';
    state.clientEnabled = true;
    stream.conversation.send.mockReturnValue('first-local-request');
    const historical = stream.history('historical-human', 'earlier', 'human');
    const question = {
      ...stream.history('question', 'Question', 'bot'),
      card: { kind: 'user-question' as const, channelId: 'question-channel' },
    };
    stream.publish({
      messages: path === 'question fallback' ? [historical, question] : [historical],
      drafts: [],
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    function ProfileAction() {
      const { client } = useHostSession();
      const profile = state.profile;
      if (!profile || profile.hostId !== state.hostId || !client) return null;
      return (
        <RequestActivityControl
          client={client}
          bot={{
            slug: 'ada',
            displayName: 'Ada',
            roles: [],
            state: 'idle',
            computerAccess: false,
            browserAccess: false,
            paused: false,
          }}
          hostId={profile.hostId}
          messageId={profile.activityMessageId}
          channelId={profile.channelId}
          refused={false}
        />
      );
    }
    const render = () =>
      root.render(
        <>
          <ConversationScreen place={{ kind: 'dm', slug: 'ada' }} focus={undefined} />
          <ProfileAction />
        </>,
      );
    const button = (label: string) =>
      [...container.querySelectorAll('button')].find((node) => node.textContent === label)!;
    try {
      await act(async () => render());
      expect(button('Track latest request')).toBeUndefined();
      await act(async () => button('Write question').click());
      await act(async () => button('Send question').click());
      expect(stream.conversation.send).toHaveBeenCalledOnce();
      await act(async () => button('Open profile').click());
      expect(state.profile?.activityMessageId).toBe('first-local-request');
      await act(async () => render());
      expect(button('Track latest request').disabled).toBe(true);
      const accepted = stream.history('first-local-request', 'What is six times seven?', 'human');
      accepted.source = {
        channelId: 'new-dm',
        revision: 1,
        message: {
          id: accepted.id,
          at: accepted.at,
          body: accepted.body,
          author: { kind: 'human' },
        },
      };
      await act(async () => stream.publish({ messages: [historical, accepted] }));
      expect(button('Track latest request').disabled).toBe(false);
      await act(async () => {
        button('Track latest request').click();
        await requestActivity.actions
          .find((action) => action.text === 'Track latest request')
          ?.onPress?.();
      });
      expect(requestActivity.start).toHaveBeenCalledWith({
        hostId: 'computer_a',
        botSlug: 'ada',
        messageId: 'first-local-request',
        channelId: 'new-dm',
      });
      state.hostId = 'another-computer';
      await act(async () => render());
      await act(async () => stream.publish({ messages: [historical, accepted] }));
      expect(button('Track latest request')?.disabled ?? true).toBe(true);
      expect(requestActivity.start).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);
afterEach(() => vi.unstubAllGlobals());

const flushFrames = () =>
  act(() => {
    for (let round = 0; round < 64 && frames.size; round += 1) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(round * 16);
    }
  });

it('re-renders only the streaming row when a draft token arrives', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<ConversationScreen place={{ kind: 'dm', slug: 'ada' }} focus={undefined} />),
  );
  const draft = container.querySelector('[data-testid="draft:d1"]');
  expect(draft).not.toBeNull();
  const listRenders = counts.renderItem;
  const neighbour = counts.rows.get('m2');
  const streaming = counts.rows.get('draft:d1')!;
  expect(listRenders).toBeGreaterThan(0);
  expect(neighbour).toBeGreaterThan(0);
  for (const token of ['Hel', 'lo', ' there'])
    await act(async () => stream.append('draft:d1', token));
  expect(draft?.textContent).toBe('Hello there');
  expect(counts.rows.get('draft:d1')).toBe(streaming + 3);
  expect(counts.rows.get('m2')).toBe(neighbour);
  expect(counts.renderItem).toBe(listRenders);
  expect(stream.timelineListeners.size).toBeGreaterThan(0);
  expect(
    [...container.querySelectorAll('[data-testid]')]
      .map((node) => node.getAttribute('data-testid'))
      .filter((id) => id === 'm1' || id === 'm2' || id === 'draft:d1'),
  ).toEqual(['m1', 'm2', 'draft:d1']);
  await act(async () => root.unmount());
  container.remove();
});

it('keeps a first DM visible through send, working, streaming and commit, then respects history browsing', () => {
  const bot: RosterBot = {
    slug: 'ada',
    displayName: 'Ada',
    state: 'idle',
    description: '',
    roles: [],
    computerAccess: false,
    browserAccess: false,
    paused: false,
  };
  state.host.roster.bots = [bot];
  stream.publish({ messages: [], drafts: [] });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = () =>
    act(() =>
      root.render(<ConversationScreen place={{ kind: 'dm', slug: 'ada' }} focus={undefined} />),
    );
  const visible = () => expect(native.list?.style).toMatchObject({ opacity: 1 });
  const rows = () =>
    [
      ...container.querySelectorAll(
        '[data-testid="chat-list"] [data-testid]:not([data-testid^="select-message-"])',
      ),
    ].map((node) => node.getAttribute('data-testid'));
  const scrollEvent = (offset: number, content: number): NativeSyntheticEvent<NativeScrollEvent> =>
    ({
      nativeEvent: {
        contentOffset: { x: 0, y: offset },
        contentSize: { width: 390, height: content },
        layoutMeasurement: { width: 390, height: 800 },
        velocity: { x: 0, y: 0 },
        contentInset: { top: 80, bottom: 0, left: 0, right: 0 },
        zoomScale: 1,
      },
    }) as NativeSyntheticEvent<NativeScrollEvent>;
  try {
    render();
    act(() => {
      native.list?.onLayout?.({ nativeEvent: { layout: { height: 800 } } } as LayoutChangeEvent);
      native.list?.onContentSizeChange?.(390, 720);
    });
    flushFrames();
    visible();
    expect(native.scrollToOffset).toHaveBeenLastCalledWith({ offset: -80, animated: false });
    expect(native.list?.maintainVisibleContentPosition).toBeUndefined();

    const press = (label: string) =>
      act(() => {
        const button = [...container.querySelectorAll('button')].find(
          (node) => node.textContent === label,
        );
        expect(button).toBeDefined();
        button!.click();
      });
    press('Write question');
    press('Send question');
    expect(stream.conversation.send).toHaveBeenCalledOnce();
    expect(stream.conversation.send.mock.calls[0]?.[0]).toBe('What is six times seven?');
    const human = stream.history('first-human', 'What is six times seven?', 'human');
    act(() => stream.publish({ messages: [human] }));
    visible();
    expect(rows()).toEqual(['first-human']);

    state.host.roster.bots = [{ ...bot, state: 'thinking' }];
    render();
    expect(container.querySelector('[data-testid="pending"]')).toBeNull();
    expect(container.querySelector('[data-testid="chat-list"] [data-testid="pending"]')).toBeNull();
    visible();
    act(() => stream.publish({ drafts: [{ draftId: 'first', botSlug: 'ada' }] }));
    act(() => stream.append('draft:first', '42'));
    expect(rows()).toEqual(['first-human', 'draft:first']);
    expect(container.querySelector('[data-testid="draft:first"]')?.textContent).toBe('42');
    visible();
    expect(native.list?.maintainVisibleContentPosition).toBeUndefined();

    const reply = stream.history('first-reply', '42', 'bot');
    act(() => stream.publish({ messages: [human, reply], drafts: [] }));
    visible();
    expect(rows()).toEqual(['first-human', 'first-reply']);
    expect(container.querySelector('[data-testid="pending"]')).toBeNull();
    state.host.roster.bots = [bot];
    render();
    expect(container.querySelector('[data-testid="pending"]')).toBeNull();
    visible();

    act(() => native.list?.onContentSizeChange?.(390, 1100));
    flushFrames();
    expect(native.scrollToOffset).toHaveBeenLastCalledWith({ offset: 300, animated: false });
    native.scrollToOffset.mockClear();
    act(() => {
      native.list?.onScrollBeginDrag?.(scrollEvent(300, 1100));
      native.list?.onScroll?.(scrollEvent(100, 1100));
      native.list?.onScrollEndDrag?.(scrollEvent(100, 1100));
    });
    expect(native.list?.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
    act(() =>
      stream.publish({ messages: [human, reply, stream.history('later', 'Later reply', 'bot')] }),
    );
    act(() => native.list?.onContentSizeChange?.(390, 1400));
    flushFrames();
    expect(native.scrollToOffset).not.toHaveBeenCalled();
    visible();

    act(() => {
      native.list?.onScrollBeginDrag?.(scrollEvent(100, 1400));
      native.list?.onScrollEndDrag?.(scrollEvent(600, 1400));
    });
    expect(native.list?.maintainVisibleContentPosition).toBeUndefined();
    act(() => native.list?.onContentSizeChange?.(390, 1500));
    flushFrames();
    expect(native.scrollToOffset).toHaveBeenLastCalledWith({ offset: 700, animated: false });
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('keeps a known-empty DM visible when the first message arrives from another client without a size change', () => {
  stream.publish({ messages: [], drafts: [] });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() =>
      root.render(<ConversationScreen place={{ kind: 'dm', slug: 'ada' }} focus={undefined} />),
    );
    act(() => {
      native.list?.onLayout?.({ nativeEvent: { layout: { height: 800 } } } as LayoutChangeEvent);
      native.list?.onContentSizeChange?.(390, 720);
    });
    flushFrames();
    act(() => stream.publish({ messages: [stream.history('remote-human', 'Hello', 'human')] }));
    expect(native.list?.style).toMatchObject({ opacity: 1 });
    expect(container.querySelector('[data-testid="remote-human"]')?.textContent).toBe('Hello');
    expect(native.list?.maintainVisibleContentPosition).toBeUndefined();
    expect(stream.conversation.send).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});
