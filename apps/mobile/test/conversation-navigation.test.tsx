// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { channelNavigationHarness } from './channel-navigation-harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosterBot, RosterChannel } from '@botharness/host-client/client';
import { Platform } from 'react-native';
import { ConversationScreen, type ChatPlace } from '../src/ui/chat/conversation-screen';
import { StackRoot } from '../src/ui/shell/stack-root';
import { t } from '../src/ui/strings';
import { edgeFade } from '../src/ui/design/tokens';

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

it.each(['ios', 'android'])('shows the %s native Profile entry', async (os) => {
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
    if (os === 'android') {
      expect(view.querySelector('[data-testid="trailing-header"]')!.childElementCount).toBe(0);
    }
    const button = view.querySelector<HTMLButtonElement>('[data-testid="chat-profile-button"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    if (os === 'ios') {
      expect(profileHistory.state.routes.at(-1)).toMatchObject({
        name: 'bot/[slug]',
        params: { slug: 'ada', hostId: 'computer_a' },
      });
    }
    expect(view.querySelector('header')!.textContent).not.toContain(t.channelFiles.title);
    expect(view.querySelector('header')!.textContent).not.toContain(t.lockScreen.track);
  } finally {
    Object.assign(Platform, { OS: previousOS });
  }
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
  const { createConversation } = await import('@botharness/host-client/conversation');
  const { createHostClient } = await import('@botharness/host-client/client');
  const { FakeHost } = await import('../../../packages/host-client/test/fake-host.js');
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

it('keeps the native glass fade with the shared-height iOS Back control', async () => {
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
    expect(header.getAttribute('data-back-visible')).toBe('false');
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

describe('chat list chrome', () => {
  it('keeps the list first under the header and cancels the automatic bottom safe area', async () => {
    state.history = ['/dm/gone'];
    const view = await render({ kind: 'dm', slug: 'gone' });
    expect(view.querySelector('[data-testid="chat-background"]')!.textContent).toBe('none');
    const list = view.querySelector<HTMLElement>('[data-testid="chat-list"]')!;
    expect(list.dataset['insetBottom']).toBe('-34');
    expect(list.dataset['dismiss']).toBe('on-drag');
    expect(list.dataset['persistTaps']).toBe('never');
  });

  it('dismisses the keyboard interactively and on a tap anywhere in the list on iOS', async () => {
    const os = Platform.OS;
    Object.assign(Platform, { OS: 'ios' });
    try {
      state.history = ['/dm/gone'];
      const view = await render({ kind: 'dm', slug: 'gone' });
      const list = view.querySelector<HTMLElement>('[data-testid="chat-list"]')!;
      expect(list.dataset['dismiss']).toBe('interactive');
      expect(list.dataset['persistTaps']).toBe('never');
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
      (button) => button.getAttribute('aria-label') === `Ada, ${t.state.idle}`,
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

it('opens the related Session from a Bot message and leaves the DM composer without Model Choice', async () => {
  const place = focusConversation();
  profileHistory.push('dm/[slug]', { slug: 'ada', hostId: 'computer_a' });
  const [first, ...rest] = state.conversation.messages;
  state.conversation.messages = [
    {
      ...first!,
      sessionLinks: [{ sessionId: 'release-task', kind: 'created', title: 'Release review' }],
    },
    ...rest,
  ];
  state.inbox = {
    status: 'ready',
    sections: {
      action: [
        {
          id: 'assignment:release-task',
          category: 'action',
          kind: 'assignment-waiting-human',
          createdAt: '2026-01-01T00:00:00Z',
          botSlug: 'ada',
          summary: 'Which version?',
          assignmentSessionId: 'release-task',
        },
      ],
      unread: [],
      replies: [],
      handled: [],
    },
  };
  const view = await render(place);
  const chip = view.querySelector<HTMLButtonElement>(
    '[data-testid="message-session-release-task"]',
  );
  expect(chip?.getAttribute('aria-label')).toBe('Open session: Release review · Waiting on you');
  expect(
    view.querySelector('[data-testid="composer-input"]')?.getAttribute('data-session-controls'),
  ).toBeNull();
  await act(async () => chip!.click());
  expect(profileHistory.state.routes.at(-1)).toMatchObject({
    name: 'session/[id]',
    params: { id: 'release-task', slug: 'ada', hostId: 'computer_a', title: 'Release review' },
  });
  profileHistory.back();
  expect(profileHistory.state.routes.at(-1)?.name).toBe('dm/[slug]');
});
