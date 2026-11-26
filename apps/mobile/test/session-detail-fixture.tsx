import { act, useLayoutEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, vi } from 'vitest';
import { createHostClient, MethodRefused } from '@botharness/host-client/client';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import type { SessionTranscriptItem } from '@botharness/host-client/session-detail';
import type { HostSessionPendingInput } from '@botharness/host-protocol/host-sessions';
import type { Composer } from '../src/ui/chat/composer';
import type { ChatHeaderActionsProps } from '../src/ui/chat/chat-header-actions';

const platform = vi.hoisted(() => ({ OS: 'ios' }));
const navigation = vi.hoisted(() => ({
  back: vi.fn(),
  dismissTo: vi.fn(),
  canGoBack: () => true,
}));
const place = vi.hoisted(() => ({
  hostId: undefined as string | undefined,
  member: new Set<string>(),
  segments: ['(tabs)', '(home)', 'session', '[id]'],
  index: 1,
  replace: vi.fn(),
  push: vi.fn(),
  dismissTo: vi.fn(),
}));

vi.mock('../src/ui/primitives/preference-row', () => ({ PreferenceRow: () => null }));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('../src/host/native-model-catalog', () => ({
  nativeModelCatalogStore: { read: () => undefined, write: () => {} },
}));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get OS() {
      return platform.OS;
    },
    Version: '27.2',
  },
  Text: ({ children, numberOfLines }: { children: ReactNode; numberOfLines?: number }) => (
    <span data-number-of-lines={numberOfLines}>{children}</span>
  ),
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('@expo/ui/jetpack-compose', () => ({}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({}));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({
      options,
    }: {
      options: {
        title: string;
        headerTitle?(): ReactNode;
        headerShown?: boolean;
        headerTransparent?: boolean;
        scrollEdgeEffects?: { top?: string; bottom?: string };
      };
    }) => (
      <header
        data-shown={options.headerShown}
        data-transparent={options.headerTransparent}
        data-top-edge={options.scrollEdgeEffects?.top}
        data-bottom-edge={options.scrollEdgeEffects?.bottom}
      >
        {options.headerTitle?.() ?? <h1>{options.title}</h1>}
      </header>
    ),
  },
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
  useRouter: () => navigation,
  useSegments: () => place.segments,
  useLocalSearchParams: () => ({ hostId: place.hostId }),
  useNavigation: () => ({ getState: () => ({ index: place.index }) }),
  router: { replace: place.replace, push: place.push, dismissTo: place.dismissTo },
}));
vi.mock('../src/features/sessions/last-session', () => ({
  rememberLastSession: vi.fn(),
  forgetLastSession: vi.fn(),
}));
const dialog = vi.hoisted(() => ({ confirm: vi.fn(async () => true) }));
vi.mock('../src/ui/primitives/app-dialog', async (load) => ({
  ...(await load<typeof import('../src/ui/primitives/app-dialog')>()),
  confirmAppDialog: dialog.confirm,
}));
vi.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Defs: () => null,
  LinearGradient: () => null,
  Rect: () => null,
  Stop: () => null,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: () => false,
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: (hostId = 'host') => ({
    saved: {
      hostId,
      hostName: 'Computer',
      routes: [],
      deviceId: 'd',
      credential: 'c',
      ...(place.member.has(hostId)
        ? {
            member: {
              humanId: 'm',
              displayName: 'Member',
              username: 'member',
              fingerprint: 'a'.repeat(64),
              mustChangePassword: false,
            },
          }
        : {}),
    },
  }),
}));
vi.mock('../src/host/native-host-look', () => ({
  useHostLook: () => ({ icon: { kind: 'symbol', id: 'laptop' } }),
}));
vi.mock('../src/ui/chat/session-title-menu', () => ({
  SessionTitleMenu: ({
    title,
    pending = false,
    place,
    hint,
    menu,
  }: {
    title: string;
    pending?: boolean;
    place?: { hostName: string; folder?: string; path?: string };
    hint: string;
    menu?: {
      items: readonly { label: string; testID: string; disabled?: boolean; run(): void }[];
    };
  }) => {
    const [expanded, setExpanded] = useState(false);
    if (menu === undefined)
      return (
        <span role="header" data-testid="session-header-title" data-pending={pending}>
          {title}
        </span>
      );
    return (
      <>
        <button
          data-testid="session-header-title"
          data-pending={pending}
          data-host={place?.hostName}
          data-folder={place?.folder}
          data-path={place?.path}
          aria-label={title}
          aria-description={hint}
          onClick={() => setExpanded(!expanded)}
        >
          {title}
        </button>
        {expanded ? (
          <div>
            <span data-testid="session-menu-title">{title}</span>
            <div role="menu">
              {menu.items.map((item) => (
                <button
                  key={item.testID}
                  data-testid={item.testID}
                  disabled={item.disabled}
                  onClick={() => {
                    setExpanded(false);
                    item.run();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </>
    );
  },
}));
vi.mock('../src/host/native-send-jump', () => ({
  sendJumpPreferences: { getSnapshot: () => ({ enabled: false }) },
}));
vi.mock('../src/ui/chat/assignment-screen', () => ({ AssignmentDetail: () => null }));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/ui/chat/model-brand-icon', () => ({ ModelBrandIcon: () => null }));
vi.mock('../src/ui/primitives/loading-indicator', () => ({ LoadingIndicator: () => null }));
vi.mock('../src/ui/primitives/drawer-header', () => ({
  DrawerHeader: () => null,
  HeaderButton: () => null,
}));
vi.mock('../src/ui/chat/sheet-frame', () => ({
  SheetFrame: ({ visible, label }: { visible: boolean; label: string }) =>
    visible ? <section aria-label={label} /> : null,
}));
vi.mock('../src/ui/chat/chat-header-actions', async () => {
  const { useState } = await import('react');
  return {
    ChatHeaderActions: (props: ChatHeaderActionsProps) => {
      const [expanded, setExpanded] = useState(false);
      if (props.kind === 'back')
        return <button onClick={props.back.onPress}>{props.back.label}</button>;
      return props.kind === 'menu' ? (
        <>
          <button onClick={() => setExpanded(!expanded)}>{props.menu.label}</button>
          {expanded ? (
            <div role="menu">
              {props.menu.items.map((item) => (
                <button
                  key={item.testID}
                  data-testid={item.testID}
                  disabled={item.disabled}
                  onClick={() => {
                    setExpanded(false);
                    item.run();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null;
    },
  };
});
vi.mock('../src/ui/primitives/settings-row', () => ({}));
vi.mock('../src/ui/primitives/button', () => ({
  Button: ({ label, onPress }: { label: string; onPress(): void }) => (
    <button onClick={onPress}>{label}</button>
  ),
}));
vi.mock('../src/ui/chat/message-bubble', () => ({
  MessageBubble: ({ message }: { message: { author: string; body: string } }) => (
    <p data-author={message.author}>{message.body}</p>
  ),
}));
vi.mock('../src/ui/chat/composer', () => ({
  Composer: ({
    value,
    onChange,
    onSend,
    sessionControls,
    above,
  }: React.ComponentProps<typeof Composer>) => (
    <div>
      {above}
      <span>{value}</span>
      <button onClick={() => onChange('Follow up')}>Draft</button>
      {sessionControls?.model}
      <button onClick={onSend}>Send</button>
      {sessionControls?.onStop === undefined ? null : (
        <button onClick={sessionControls.onStop}>Stop</button>
      )}
    </div>
  ),
}));
export { dialog, navigation, place, platform };
export const { chatTimelineListLayout } = await import('../src/ui/chat/chat-timeline-chrome');
export const { SessionDetailBody } = await import('../src/ui/chat/session-detail-screen');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const at = '2026-11-22T00:00:00Z';
const from = { kind: 'dsh', provider: 'opencode-go', model: 'deepseek-v4.1-flash' } as const;
const to = { ...from, model: 'deepseek-v4.1-pro' };
export const items: SessionTranscriptItem[] = [
  {
    kind: 'input',
    source: 'user',
    at,
    turn: 1,
    text: 'Initial request',
    envelope: { kind: 'human-dm' },
  },
  {
    kind: 'input',
    source: 'system',
    at,
    turn: 1,
    text: '[Open Inbox] 1 item you have seen.\n- Source Event',
    envelope: { kind: 'inbox' },
  },
  {
    kind: 'tool',
    id: 'read-1',
    tool: 'read',
    toolKind: 'read',
    detail: 'release.md',
    status: 'done',
    at,
  },
  { kind: 'reply', text: 'Saved reply', at },
  { kind: 'model-switch', from, to, at },
  {
    kind: 'turn-end',
    state: 'failed',
    at,
    message:
      'The provider refused the request.\nCheck the model settings.\nThen retry the message.',
  },
];

let root: ReturnType<typeof createRoot> | undefined;

export async function unmount() {
  await act(async () => root?.unmount());
  root = undefined;
}

export async function open({
  role = 'orchestrator',
  running = false,
  live = false,
  refused = false,
  failAssignment = false,
  sendGate,
  beforeAssignmentRead,
  beforeArchive,
  Body = SessionDetailBody,
  fresh = false,
  transcript = () => ({ displayTitle: 'Review the release' }),
  pendingInput,
  livePendingInput,
  liveGate,
  archiveGate,
}: {
  liveGate?: Promise<void>;
  archiveGate?: Promise<void>;
  pendingInput?: HostSessionPendingInput[];
  livePendingInput?: HostSessionPendingInput[];
  role?: 'orchestrator' | 'assignment' | 'native';
  running?: boolean;
  live?: boolean;
  refused?: boolean;
  failAssignment?: boolean;
  sendGate?: Promise<void>;
  beforeAssignmentRead?: (readNumber: number) => Promise<void>;
  beforeArchive?: () => Promise<void>;
  Body?: typeof SessionDetailBody;
  fresh?: boolean;
  transcript?: () => { displayTitle?: string; titleFallback?: true; cwd?: string };
} = {}) {
  const view = document.createElement('div');
  root = createRoot(view);
  const fake = new FakeHost();
  const client = createHostClient({
    routes: ['https://qa.test'],
    credential: fake.credential,
    carrier: fake.carrier,
  });
  let assignmentReads = 0;
  let archived = false;
  let sessionRunning = running;
  let pending = pendingInput;
  const call = vi.spyOn(client, 'call').mockImplementation(async (method, args) => {
    if (method === 'sessionTranscript') {
      if (refused) throw new MethodRefused('forbidden', 'Restricted Session');
      return {
        role,
        running: sessionRunning,
        seq: 4,
        items,
        currentTarget: to,
        ...transcript(),
        ...(pending === undefined ? {} : { pendingInput: pending }),
      };
    }
    if (method === 'sessionLive') {
      if (args?.['after'] !== undefined) return new Promise(() => {});
      await liveGate;
      return {
        seq: 4,
        revision: 1,
        items: live ? [{ kind: 'reply', at, text: 'Live reply' }, items[2]] : [],
        ...(livePendingInput === undefined ? {} : { pendingInput: livePendingInput }),
      };
    }
    if (method === 'sessionModel') return { override: null, default: null };
    if (method === 'sessionMessageSend') {
      await sendGate;
      return {};
    }
    if (method === 'sessionAnswerApproval' || method === 'sessionAnswerQuestion') {
      pending = pending?.filter((item) => item.requestId !== args?.['requestId']);
      return { sessionId: 'chosen', accepted: true };
    }
    if (method === 'sessionNativeStop') {
      sessionRunning = false;
      return { sessionId: 'chosen', accepted: true };
    }
    if (method === 'sessionNativeArchive') {
      await archiveGate;
      return { sessionId: 'chosen', accepted: true };
    }
    if (method === 'sessionStop') {
      sessionRunning = false;
      return { stopped: [], alreadyIdle: [] };
    }
    if (method === 'sessionArchiveSet') {
      await beforeArchive?.();
      archived = args?.['archived'] === true;
      return { archived };
    }
    if (method === 'assignmentTimeline') {
      if (++assignmentReads === 1 && failAssignment) throw new Error('Assignment read unavailable');
      await beforeAssignmentRead?.(assignmentReads);
      return {
        assignment: {
          botSlug: 'ada',
          sessionId: 'chosen',
          title: 'Canonical Assignment',
          description: 'Verify the release.',
          createdAt: at,
          activity: 'idle',
          updatedAt: at,
          sourceEventId: 'test-source',
          ...(archived ? { archivedAt: at } : {}),
        },
        lanes: [],
        omittedSubagents: 0,
      };
    }
    return {};
  });
  await act(async () =>
    root!.render(
      <Body
        client={client}
        hostId={place.hostId ?? 'host'}
        slug={role === 'native' ? null : 'ada'}
        id="chosen"
        title="Release review"
        fresh={fresh}
        online
      />,
    ),
  );
  return { view, call };
}

export async function press(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll('button')].find(
    (element) =>
      element.textContent === label || element.getAttribute('aria-description') === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

export const approval: HostSessionPendingInput = {
  kind: 'approval',
  requestId: 'req-1',
  toolName: 'read',
  callId: 'read-1',
};
export const question: HostSessionPendingInput = {
  kind: 'question',
  requestId: 'q-1',
  questions: [
    { id: 'pick', question: 'Which file?', options: [{ label: 'a.md' }, { label: 'b.md' }] },
  ],
};

export function buttons(view: HTMLElement) {
  return [...view.querySelectorAll('button')].map((button) => button.textContent);
}
