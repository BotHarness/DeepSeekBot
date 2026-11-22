// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MethodRefused, type HostClient } from '@botharness/host-client/client';
import type { SessionTranscriptItem } from '@botharness/host-client/session-detail';
import type { Composer } from '../src/ui/chat/composer';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({
  Stack: { Screen: ({ options }: { options: { title: string } }) => <h1>{options.title}</h1> },
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
}));
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
vi.mock('../src/ui/chat/sheet-frame', () => ({ SheetFrame: () => null }));
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
  { kind: 'input', source: 'user', at, turn: 1, text: 'Initial request' },
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
];

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => act(() => root?.unmount()));

async function open({
  role = 'orchestrator',
  running = false,
  refused = false,
}: {
  role?: 'orchestrator' | 'assignment';
  running?: boolean;
  refused?: boolean;
} = {}) {
  const view = document.createElement('div');
  root = createRoot(view);
  const call = vi.fn(async (method: string, args?: Record<string, unknown>) => {
    if (method === 'sessionTranscript') {
      if (refused) throw new MethodRefused('forbidden', 'Restricted Session');
      return { role, running, seq: 4, items, currentTarget: to };
    }
    if (method === 'sessionLive') {
      if (args?.['after'] !== undefined) return new Promise(() => {});
      return { seq: 4, revision: 1, items: [{ kind: 'reply', at, text: 'Live reply' }, items[1]] };
    }
    if (method === 'sessionModel') return { override: null, default: null };
    return {};
  });
  await act(async () =>
    root!.render(
      <SessionDetailBody
        client={{ call } as unknown as HostClient}
        slug="ada"
        id="chosen"
        title="Release review"
        online
      />,
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
  const { view } = await open();
  expect(view.querySelector('h1')?.textContent).toBe('Release review');
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
