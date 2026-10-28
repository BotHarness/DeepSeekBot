// @vitest-environment jsdom
import { channelNavigationHarness } from './channel-navigation-harness';
const channelHistory = channelNavigationHarness();
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { RosterBot } from '../src/host/client';
import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';
import type { ActivityTarget } from '../src/host/live-activity-session';

const push = vi.hoisted(() => vi.fn());
const activity = vi.hoisted(() => ({
  start: vi.fn(async (_target: ActivityTarget) => {}),
  confirm: undefined as (() => Promise<void> | void) | undefined,
}));
vi.mock('../src/host/native-live-activity', () => ({
  useRequestActivity: () => ({ ready: true, busy: false, tracking: false }),
  requestActivitySession: { start: activity.start, stop: async () => {} },
}));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  showAppDialog: (
    _title: string,
    _body: string,
    buttons: { onPress?(): void | Promise<void> }[],
  ) => {
    activity.confirm = buttons.at(-1)?.onPress;
  },
}));
const state = vi.hoisted(() => ({
  history: [] as string[],
  display: { mode: 'streaming', loaded: true },
  glassHeader: true,
}));

vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));
vi.mock('react-native-view-shot', () => ({ captureRef: vi.fn(), releaseCapture: vi.fn() }));

vi.mock('../src/ui/shell/recent-chats', () => ({
  chatHref: () => '',
  forgetRecentChats: async () => {},
  useRecentChat: () => () => {},
}));
vi.mock('expo-router', () => ({
  useIsFocused: () => true,
  useNavigationContainerRef: () => channelHistory.navigation,
  useFocusEffect: () => {},
  usePreventRemove: () => {},
  Stack: {
    Screen: ({
      options,
    }: {
      options: {
        headerTitle?: () => ReactNode;
        headerRight?: () => ReactNode;
        headerLeft?: () => ReactNode;
        headerBackVisible?: boolean;
        headerBlurEffect?: string;
        unstable_headerRightItems?: () => Array<{
          label: string;
          onPress(): void;
          disabled?: boolean;
        }>;
        unstable_headerLeftItems?: () => Array<{
          type: string;
          element?: ReactNode;
          label?: string;
          onPress?: () => void;
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
        {typeof options.headerTitle === 'function' ? options.headerTitle() : null}
        {options.unstable_headerRightItems?.().map((item) => (
          <button key={item.label} type="button" disabled={item.disabled} onClick={item.onPress}>
            {item.label}
          </button>
        )) ?? options.headerRight?.()}
      </header>
    ),
  },
  useLocalSearchParams: () => ({ slug: 'same', id: 'group', hostId: 'b' }),
  useRouter: () => ({
    push,
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
    Platform: {
      OS: 'ios',
      select: (options: Record<string, unknown>) => options['ios'] ?? options['default'],
    },
    KeyboardAvoidingView: shim.View,
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Keyboard: { dismiss() {} },
    PanResponder: { create: () => ({ panHandlers: {} }) },
  };
});
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
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
vi.mock('../src/ui/chat/header-chrome', () => ({
  HeaderCircleButton: ({ label, onPress }: { label: string; onPress(): void }) => (
    <button onClick={onPress}>{label}</button>
  ),
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
  useListBottomSafeArea: () => 34,
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
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null, BotPortrait: () => null }));
vi.mock('../src/ui/chat/approval-card', () => ({ ApprovalCard: () => null }));
vi.mock('../src/ui/chat/grant-request-card', () => ({ GrantRequestCard: () => null }));
vi.mock('../src/ui/chat/private-input-card', () => ({ PrivateInputCard: () => null }));
vi.mock('../src/ui/chat/activity-row', () => ({ ActivityRow: () => null }));
vi.mock('../src/ui/chat/question-card', () => ({ QuestionCard: () => null }));
vi.mock('../src/ui/chat/channel-title', () => ({ ChannelTitle: () => null }));
vi.mock('../src/ui/chat/chat-title', () => ({
  ChatTitle: ({ onPress }: { onPress(): void }) => <button onClick={onPress}>Open profile</button>,
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
  PlaybackBubble: ({ message }: { message?: { body: string } }) =>
    message === undefined ? (
      <span data-testid="draft">visible draft</span>
    ) : (
      <span data-testid="message">{message.body}</span>
    ),
}));
vi.mock('../src/ui/chat/message-menu', () => ({ copyMessage: vi.fn(), shareText: vi.fn() }));
vi.mock('../src/ui/chat/mention-suggestions', () => ({ MentionSuggestions: () => null }));
vi.mock('../src/ui/chat/working-status', () => ({
  WorkingStatus: ({ bots }: { bots: RosterBot[] }) =>
    bots.length ? <span data-testid="pending">pending</span> : null,
}));
vi.mock('../src/ui/chat/time-separator', () => ({ TimeSeparator: () => null }));

vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, Rect: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('opens B with A selected, sends through its real composer, and retains an offline draft without replay', async () => {
  const a = new FakeHost('a');
  const b = new FakeHost('b');
  remotes.set('a.tailnet.ts.net', a);
  remotes.set('b.tailnet.ts.net', b);
  for (const [id, remote] of [
    ['a', a],
    ['b', b],
  ] as const) {
    remote.methods.set('list', () => ({
      bots: [
        {
          slug: 'same',
          displayName: `Bot ${id}`,
          roles: [],
          state: 'idle',
          paused: false,
          dmChannelId: 'dm-same',
        },
      ],
    }));
    remote.channel('dm-same');
  }
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      current: 'a',
      hosts: ['a', 'b'].map((hostId) => ({
        hostId,
        hostName: hostId,
        routes: [`https://${hostId}.tailnet.ts.net`],
        deviceId: 'device-1',
        credential: a.credential,
      })),
    }),
  );
  const { hostSession } = await import('../src/host/host-session');
  const { RequestActivityControl } = await import('../src/ui/chat/request-activity-control');
  const { ConversationScreen } = await import('../src/ui/chat/conversation-screen');
  const { t } = await import('../src/ui/strings');
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  try {
    await act(async () => {
      await vi.waitFor(() =>
        expect(hostSession.getHost('b')?.snapshot.roster?.bots.length).toBe(1),
      );
    });
    await act(async () =>
      root.render(
        <>
          {' '}
          <ConversationScreen
            expectedHostId="b"
            place={{ kind: 'dm', slug: 'same' }}
            focus={undefined}
          />{' '}
        </>,
      ),
    );
    const field = () => view.querySelector<HTMLTextAreaElement>('[data-testid="composer-input"]')!;
    const type = async (value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
          field(),
          value,
        );
        field().dispatchEvent(new Event('input', { bubbles: true }));
      });
    await act(async () => {
      await vi.waitFor(() => expect(field()).not.toBeNull());
    });
    await act(async () =>
      [...view.querySelectorAll<HTMLButtonElement>('button')]
        .find((node) => node.textContent === 'Open profile')!
        .click(),
    );
    expect(push).toHaveBeenLastCalledWith({
      pathname: '/bot/[slug]',
      params: { slug: 'same', hostId: 'b' },
    });
    await type('Only B via composer');
    await act(async () =>
      view.querySelector<HTMLButtonElement>('[data-testid="composer-send"]')!.click(),
    );
    await act(async () => {
      await vi.waitFor(() =>
        expect(b.channel('dm-same').messages.map((m) => m.body)).toEqual(['Only B via composer']),
      );
    });
    expect(a.channel('dm-same').messages).toEqual([]);
    expect(hostSession.getState().saved?.hostId).toBe('a');
    await act(async () =>
      [...view.querySelectorAll<HTMLButtonElement>('button')]
        .find((node) => node.textContent === 'Open profile')!
        .click(),
    );
    const profile = push.mock.lastCall![0].params;
    const source = hostSession.getHost('b')!;
    await act(async () =>
      root.render(
        <>
          <ConversationScreen
            expectedHostId="b"
            place={{ kind: 'dm', slug: 'same' }}
            focus={undefined}
          />
          <RequestActivityControl
            client={source.client}
            bot={source.snapshot.roster!.bots[0]!}
            hostId={profile.hostId}
            messageId={profile.activityMessageId}
            channelId={profile.channelId}
            refused={false}
          />
        </>,
      ),
    );
    await act(async () => {
      const track = [...view.querySelectorAll<HTMLButtonElement>('button')].find(
        (node) => node.textContent === t.lockScreen.track,
      );
      expect(track?.disabled).toBe(false);
      track?.click();
      await activity.confirm?.();
    });
    expect(activity.start).toHaveBeenCalledWith({
      hostId: 'b',
      botSlug: 'same',
      channelId: 'dm-same',
      messageId: b.channel('dm-same').messages[0]!.id,
    });
    await type('Unsent B draft');
    await act(async () => b.kill());
    expect(field().value).toBe('Unsent B draft');
    expect(view.textContent).toContain('Only B via composer');
    const send = view.querySelector<HTMLButtonElement>('[data-testid="composer-send"]');
    expect(send === null || send.disabled).toBe(true);
    await act(async () => {
      b.restart();
      hostSession.getHost('b')?.client.retryNow();
      await vi.waitFor(() =>
        expect(hostSession.getHost('b')?.snapshot.connection.status).toBe('connected'),
      );
    });
    expect(field().value).toBe('Unsent B draft');
    expect(b.channel('dm-same').messages).toHaveLength(1);
    expect(view.textContent).not.toContain(t.sourceChanged);
  } finally {
    await act(async () => {
      root.unmount();
      for (const host of hostSession.getState().hosts) await hostSession.unpair(host.hostId);
    });
    view.remove();
  }
});
