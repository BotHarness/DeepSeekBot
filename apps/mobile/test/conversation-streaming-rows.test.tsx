// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { RosterBot } from '../src/host/client';
import type { ConversationTimelineSnapshot } from '../src/host/conversation';

const state = vi.hoisted(() => ({
  history: [] as string[],
  hostId: 'computer_a',
  host: {
    connection: { status: 'connected' },
    roster: { bots: [] as RosterBot[], channels: [] },
  },
  display: { mode: 'streaming', loaded: true },
}));

const counts = vi.hoisted(() => ({ renderItem: 0, rows: new Map<string, number>() }));

const stream = vi.hoisted(() => {
  const timelineListeners = new Set<() => void>();
  const bubbleListeners = new Map<string, Set<() => void>>();
  const bubbles = new Map<string, string>();
  const history = (id: string, body: string, author: 'bot' | 'human') => ({
    id,
    at: '2026-10-19T08:00:00Z',
    author,
    bot: author === 'bot' ? 'ada' : undefined,
    body,
    attachments: [],
    delivery: 'committed',
  });
  const timeline = {
    status: 'live',
    messages: [history('m1', 'question', 'human'), history('m2', 'earlier answer', 'bot')],
    drafts: [{ draftId: 'd1', botSlug: 'ada' }],
    hasOlder: false,
    loadingOlder: false,
    fromCache: false,
  };
  return {
    conversation: { loadOlder: () => Promise.resolve() },
    playback: {
      getTimelineSnapshot: () => timeline as unknown as ConversationTimelineSnapshot,
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

vi.mock('../src/host/native-source-drafts', () => ({ useSourceDraft: () => ['', () => {}] }));
vi.mock('expo-router', () => ({
  useIsFocused: () => true,
  Stack: {
    Screen: ({ options }: { options: { headerLeft?: () => ReactNode } }) => (
      <header>{options.headerLeft?.() ?? null}</header>
    ),
  },
  useRouter: () => ({
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
  return { ...shim, KeyboardAvoidingView: shim.View };
});
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  const FlatList = (props: Parameters<typeof shim.default.FlatList>[0]) =>
    shim.default.FlatList({
      ...props,
      renderItem: (info) => {
        counts.renderItem += 1;
        return props.renderItem(info);
      },
    });
  return { ...shim, default: { ...shim.default, FlatList } };
});
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('../src/host/host-session', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useHostSession: () => ({
      client: undefined,
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
  useHeaderOverlap: () => 80,
}));
vi.mock('../src/ui/chat/header-chrome', () => ({
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
vi.mock('../src/ui/chat/chat-title', () => ({ ChatTitle: () => null }));
vi.mock('../src/ui/chat/composer', () => ({ Composer: () => null }));
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
vi.mock('../src/ui/open-full-client', () => ({ OpenFullClientButton: () => null }));

import { ConversationScreen } from '../src/ui/chat/conversation-screen';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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
