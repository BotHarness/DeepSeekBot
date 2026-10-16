// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  history: [] as string[],
  host: { connection: { status: 'connected' }, roster: { bots: [], channels: [] } },
  conversation: { status: 'live', messages: [], drafts: [], hasOlder: false },
}));

vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
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
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ client: undefined, inbox: undefined }),
  useHostSnapshot: () => state.host,
  useConversation: () => undefined,
  useChannelConversation: () => undefined,
  useConversationSnapshot: () => state.conversation,
}));
vi.mock('../src/host/share-attachment', () => ({ shareAttachment: vi.fn() }));
vi.mock('../src/host/native-dm-activity', () => ({ useHiddenDmActivity: () => [] }));
vi.mock('../src/host/pick-files', () => ({ MAX_PICKED: 10, pickFiles: vi.fn() }));
vi.mock('../src/host/speech', () => ({
  useDictation: () => ({ state: { status: 'idle' }, mountRef: () => undefined }),
}));
vi.mock('../src/ui/chat/header-chrome', () => ({
  ChatHeader: ({ left }: { left: ReactNode }) => <header>{left}</header>,
  HeaderBackButton: ({ onPress }: { onPress(): void }) => (
    <button type="button" onClick={onPress}>
      Header back
    </button>
  ),
  EdgeFade: () => null,
  useChatHeaderHeight: () => 80,
}));
vi.mock('../src/ui/chat/speaker-row', async () => {
  const { createContext } = await import('react');
  return {
    SpeakerStageContext: createContext(undefined),
    createSpeakerRegistry: () => ({ setGroups() {} }),
  };
});
vi.mock('../src/ui/chat/approval-card', () => ({ ApprovalCard: () => null }));
vi.mock('../src/ui/chat/activity-row', () => ({ ActivityRow: () => null }));
vi.mock('../src/ui/chat/question-card', () => ({ QuestionCard: () => null }));
vi.mock('../src/ui/chat/channel-title', () => ({ ChannelTitle: () => null }));
vi.mock('../src/ui/chat/chat-title', () => ({ ChatTitle: () => null }));
vi.mock('../src/ui/chat/composer', () => ({ Composer: () => null }));
vi.mock('../src/ui/chat/image-viewer', () => ({ ImageViewer: () => null }));
vi.mock('../src/ui/chat/jump-to-latest', () => ({ JumpToLatest: () => null }));
vi.mock('../src/ui/chat/message-actions', () => ({ MessageActions: () => null }));
vi.mock('../src/ui/chat/message-bubble', () => ({
  MessageBubble: () => null,
  DraftBubble: () => null,
}));
vi.mock('../src/ui/chat/message-menu', () => ({ copyMessage: vi.fn(), shareText: vi.fn() }));
vi.mock('../src/ui/chat/mention-suggestions', () => ({ MentionSuggestions: () => null }));
vi.mock('../src/ui/chat/working-status', () => ({ WorkingStatus: () => null }));
vi.mock('../src/ui/chat/time-separator', () => ({ TimeSeparator: () => null }));
vi.mock('../src/ui/open-full-client', () => ({ OpenFullClientButton: () => null }));

import { ConversationScreen, type ChatPlace } from '../src/ui/chat/conversation-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(() => {
  state.host.connection.status = 'connected';
  state.conversation.status = 'live';
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

    it(`${name}: header back still returns to Activity`, async () => {
      state.history = ['/activity', route];
      await press(await render(place), 'Header back');
      expect(state.history).toEqual(['/activity']);
    });

    it(`${name}: header back falls back to Chats without history`, async () => {
      state.history = [route];
      await press(await render(place), 'Header back');
      expect(state.history).toEqual(['/']);
    });
  }

  it('keeps pairing recovery when the Host refuses the phone', async () => {
    state.host.connection.status = 'refused';
    const view = await render({ kind: 'dm', slug: 'gone' });
    expect(view.textContent).toContain(t.pairAgain);
    expect(view.textContent).not.toContain(t.backToChats);
  });
});
