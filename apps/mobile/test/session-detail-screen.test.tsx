// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createHostClient, MethodRefused } from '@botharness/host-client/client';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import type { SessionTranscriptItem } from '@botharness/host-client/session-detail';
import type { Composer } from '../src/ui/chat/composer';
import type { ChatHeaderActionsProps } from '../src/ui/chat/chat-header-actions';

const navigation = vi.hoisted(() => ({ back: vi.fn(), canGoBack: () => true }));

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Text: ({ children, numberOfLines }: { children: ReactNode; numberOfLines?: number }) => (
    <span data-number-of-lines={numberOfLines}>{children}</span>
  ),
}));
vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({
      options,
    }: {
      options: { title: string; headerTitle?(): ReactNode; header?(): ReactNode };
    }) => options.header?.() ?? options.headerTitle?.() ?? <h1>{options.title}</h1>,
  },
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
  useRouter: () => navigation,
}));
vi.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
vi.mock('react-native-svg', () => ({ default: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../src/host/host-session', () => ({}));
vi.mock('../src/ui/chat/assignment-screen', () => ({ AssignmentDetail: () => null }));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/ui/chat/model-brand-icon', () => ({ ModelBrandIcon: () => null }));
vi.mock('../src/ui/primitives/loading-indicator', () => ({ LoadingIndicator: () => null }));
vi.mock('../src/ui/primitives/drawer-header', () => ({ DrawerHeader: () => null }));
vi.mock('../src/ui/chat/sheet-frame', () => ({
  SheetFrame: ({ visible, label }: { visible: boolean; label: string }) =>
    visible ? <section aria-label={label} /> : null,
}));
vi.mock('../src/ui/chat/chat-header-actions', async () => {
  const { useState } = await import('react');
  return {
    ChatHeaderActions: (props: ChatHeaderActionsProps) => {
      const [expanded, setExpanded] = useState(false);
      if ('back' in props) return <button onClick={props.back.onPress}>{props.back.label}</button>;
      return 'menu' in props ? (
        <>
          <button onClick={() => setExpanded(!expanded)}>{props.menu.label}</button>
          {expanded ? (
            <div role="menu">
              {props.menu.items.map((item) => (
                <button
                  key={item.label}
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
      {sessionControls?.render(390)}
      <button onClick={onSend}>Send</button>
      {sessionControls?.onStop === undefined ? null : (
        <button onClick={sessionControls.onStop}>Stop</button>
      )}
    </div>
  ),
}));
const { SessionDetailBody } = await import('../src/ui/chat/session-detail-screen');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const at = '2026-11-22T00:00:00Z';
const from = { kind: 'dsh', provider: 'opencode-go', model: 'deepseek-v4.1-flash' } as const;
const to = { ...from, model: 'deepseek-v4.1-pro' };
const items: SessionTranscriptItem[] = [
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
afterEach(() => act(() => root?.unmount()));

async function open({
  role = 'orchestrator',
  running = false,
  live = false,
  refused = false,
  failAssignment = false,
}: {
  role?: 'orchestrator' | 'assignment';
  running?: boolean;
  live?: boolean;
  refused?: boolean;
  failAssignment?: boolean;
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
  const call = vi.spyOn(client, 'call').mockImplementation(async (method, args) => {
    if (method === 'sessionTranscript') {
      if (refused) throw new MethodRefused('forbidden', 'Restricted Session');
      return {
        role,
        running: sessionRunning,
        seq: 4,
        items,
        currentTarget: to,
        displayTitle: 'Review the release',
      };
    }
    if (method === 'sessionLive') {
      if (args?.['after'] !== undefined) return new Promise(() => {});
      return {
        seq: 4,
        revision: 1,
        items: live ? [{ kind: 'reply', at, text: 'Live reply' }, items[2]] : [],
      };
    }
    if (method === 'sessionModel') return { override: null, default: null };
    if (method === 'sessionStop') {
      sessionRunning = false;
      return { stopped: [], alreadyIdle: [] };
    }
    if (method === 'sessionArchiveSet') {
      archived = args?.['archived'] === true;
      return { archived };
    }
    if (method === 'assignmentTimeline') {
      if (++assignmentReads === 1 && failAssignment) throw new Error('Assignment read unavailable');
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
      <SessionDetailBody client={client} slug="ada" id="chosen" title="Release review" online />,
    ),
  );
  return { view, call };
}

async function press(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll('button')].find(
    (element) => element.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

it('renders user input, saved and live replies, compact activity and the model switch', async () => {
  const { view } = await open({ live: true });
  expect(view.querySelector('[data-testid="session-header-title"]')?.textContent).toBe(
    'Review the release',
  );
  expect(view.textContent).toContain('Direct message');
  expect(view.textContent).toContain('Inbox');
  expect(view.textContent).not.toContain('Source Event');
  const inbox = view.querySelector<HTMLButtonElement>(
    '[data-testid="session-transcript-inbox-disclosure"]',
  );
  expect(inbox?.getAttribute('aria-label')).toBe('Inbox');
  await act(async () => inbox!.click());
  expect(view.textContent).toContain('Source Event');
  const failure = [...view.querySelectorAll('span')].find((row) =>
    row.textContent?.includes('Then retry the message.'),
  );
  expect(failure).toBeDefined();
  expect(failure?.hasAttribute('data-number-of-lines')).toBe(false);
  expect(view.querySelectorAll('[data-author="human"]')).toHaveLength(1);
  expect(view.querySelector('[data-author="human"]')?.textContent).toBe('Initial request');
  expect([...view.querySelectorAll('[data-author="bot"]')].map((row) => row.textContent)).toEqual([
    'Saved reply',
    'Live reply',
  ]);
  expect(view.querySelectorAll('[data-testid="session-transcript-tool"]')).toHaveLength(1);
  expect(view.querySelector('[data-testid="turn-model-switch"]')?.textContent).toContain(
    'deepseek-v4.1-pro',
  );
  expect(view.querySelector('[data-testid="composer-session-model"]')).not.toBeNull();
});

it('sends a draft to the selected Orchestrator', async () => {
  const { view, call } = await open();
  await press(view, 'Draft');
  await press(view, 'Send');
  expect(call).toHaveBeenCalledWith('sessionMessageSend', {
    botSlug: 'ada',
    sessionId: 'chosen',
    text: 'Follow up',
  });
  expect(view.textContent).not.toContain('Follow up');
});

it('shows the Session title, Back, and Model Choice in the header', async () => {
  const { view } = await open();
  expect(view.textContent).toContain('Review the release');
  await press(view, 'Back');
  expect(navigation.back).toHaveBeenCalledOnce();
  await press(view, 'Session options');
  const menu = view.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.textContent).toBe('Model choice');
  await press(menu, 'Model choice');
  const picker = view.querySelector('section[aria-label]');
  expect(picker).not.toBeNull();
  await act(async () => root?.unmount());
  root = undefined;
  const composer = await open();
  await act(async () =>
    composer.view.querySelector<HTMLElement>('[data-testid="composer-session-model"]')?.click(),
  );
  expect(composer.view.querySelector('section[aria-label]')?.getAttribute('aria-label')).toBe(
    picker?.getAttribute('aria-label'),
  );
});

it('uses the selected Assignment for Stop, Archive, and Unarchive', async () => {
  const { view, call } = await open({ role: 'assignment', running: true });
  await press(view, 'Session options');
  const menu = view.querySelector<HTMLElement>('[role="menu"]')!;
  expect(menu.textContent).toBe('StopModel choice');
  await press(menu, 'Stop');
  expect(call).toHaveBeenCalledWith('sessionStop', { botSlug: 'ada', sessionId: 'chosen' });
  await press(view, 'Session options');
  await press(view.querySelector<HTMLElement>('[role="menu"]')!, 'Archive');
  expect(call).toHaveBeenCalledWith('sessionArchiveSet', {
    slug: 'ada',
    sessionId: 'chosen',
    archived: true,
  });
  await press(view, 'Session options');
  await press(view.querySelector<HTMLElement>('[role="menu"]')!, 'Unarchive');
  expect(call).toHaveBeenCalledWith('sessionArchiveSet', {
    slug: 'ada',
    sessionId: 'chosen',
    archived: false,
  });
});

it('steers and stops a running Assignment by its selected Session ID', async () => {
  const { view, call } = await open({ role: 'assignment', running: true });
  await press(view, 'Draft');
  await press(view, 'Send');
  expect(call).toHaveBeenCalledWith('botToolRun', {
    slug: 'ada',
    tool: 'unarchive_assignment',
    args: { session_id: 'chosen', message: 'Follow up', mode: 'next-step' },
  });
  await press(view, 'Stop');
  expect(call).toHaveBeenCalledWith('sessionStop', { botSlug: 'ada', sessionId: 'chosen' });
});

it('withholds the transcript, composer and model controls on a Host refusal', async () => {
  const { view, call } = await open({ refused: true });
  expect(view.textContent).toContain('This session is unavailable.');
  expect(view.querySelector('[data-testid="session-transcript"]')).toBeNull();
  expect(view.querySelector('[data-testid="composer-session-model"]')).toBeNull();
  expect(call.mock.calls.some(([method]) => method === 'sessionModel')).toBe(false);
});

it('retries only the failed Assignment detail read and keeps the transcript mounted', async () => {
  const { view, call } = await open({ role: 'assignment', failAssignment: true });
  const transcript = view.querySelector('[data-testid="session-transcript"]');
  expect(transcript?.textContent).toContain('Saved reply');
  expect(view.textContent).toContain('Couldn’t load assignment details.');
  const beforeRetry = call.mock.calls.length;

  await press(view, 'Try again');
  expect(call.mock.calls.slice(beforeRetry)).toEqual([
    [
      'assignmentTimeline',
      { slug: 'ada', sessionId: 'chosen' },
      { signal: expect.any(AbortSignal), timeoutMs: 20_000 },
    ],
  ]);
  expect(view.querySelector('[data-testid="session-transcript"]')).toBe(transcript);
  expect(view.textContent).not.toContain('Couldn’t load assignment details.');
  expect(view.querySelector('[data-testid="session-assignment-details"]')).not.toBeNull();
  expect(view.querySelector('[data-testid="session-header-title"]')?.textContent).toBe(
    'Canonical Assignment',
  );
});
