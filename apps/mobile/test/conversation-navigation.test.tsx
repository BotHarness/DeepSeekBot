// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RosterBot } from '../src/host/client';
import type { ConversationSnapshot } from '../src/host/conversation';

const state = vi.hoisted(() => ({
  history: [] as string[],
  hostId: 'computer_a',
  host: { connection: { status: 'connected' }, roster: { bots: [] as RosterBot[], channels: [] } },
  conversation: {
    status: 'live',
    messages: [],
    drafts: [],
    hasOlder: false,
    loadingOlder: false,
    fromCache: false,
  } as ConversationSnapshot,
  active: false,
  display: { mode: 'streaming', loaded: true },
}));

vi.mock('../src/ui/shell/recent-chats', () => ({
  chatHref: () => '',
  useRecentChat: () => () => {},
}));
vi.mock('../src/host/native-source-drafts', () => ({ useSourceDraft: () => ['', () => {}] }));
vi.mock('expo-router', () => ({
  useIsFocused: () => true,
  usePreventRemove: () => {},
  Stack: {
    Screen: ({
      options,
    }: {
      options: {
        headerLeft?: () => ReactNode;
        headerBackVisible?: boolean;
        unstable_headerLeftItems?: () => Array<{
          type: string;
          element?: ReactNode;
          label?: string;
          onPress?: () => void;
        }>;
      };
    }) => (
      <header data-back-visible={String(options.headerBackVisible)}>
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
      </header>
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
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ client: undefined, inbox: undefined, saved: { hostId: state.hostId } }),
  useHostSnapshot: () => state.host,
  useConversation: () => (state.active ? {} : undefined),
  useChannelConversation: () => undefined,
  useConversationTimelineSnapshot: () => state.conversation,
  useStreamPlayback: () => undefined,
}));
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
  barLabelStyle: {},
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
vi.mock('../src/ui/open-full-client', () => ({ OpenFullClientButton: () => null }));

import { Platform } from 'react-native';
import { ConversationScreen, type ChatPlace } from '../src/ui/chat/conversation-screen';
import { t } from '../src/ui/strings';
import { edgeFade } from '../src/ui/design/tokens';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(() => {
  state.hostId = 'computer_a';
  state.host.connection.status = 'connected';
  state.conversation.status = 'live';
  state.conversation.messages = [];
  state.conversation.drafts = [];
  state.host.roster.bots = [];
  state.active = false;
  state.display = { mode: 'streaming', loaded: true };
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
  expect(view.querySelector('[data-testid="pending"]')).not.toBeNull();
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

async function render(place: ChatPlace) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<ConversationScreen place={place} focus={undefined} />));
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
      notice: t.noChannel,
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
        expect([...header.children].map((item) => (item as HTMLElement).dataset['item'])).toEqual([
          'button',
          'spacing',
          'custom',
        ]);
        await press(alone, t.back);
        expect(state.history).toEqual(['/']);
        act(() => root?.unmount());
        state.history = ['/activity', route];
        const stacked = (await render(place)).querySelector('header')!;
        expect(stacked.dataset['backVisible']).toBe('true');
        expect(stacked.querySelector('button')).toBeNull();
        expect([...stacked.children].map((item) => (item as HTMLElement).dataset['item'])).toEqual([
          'spacing',
          'custom',
        ]);
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
