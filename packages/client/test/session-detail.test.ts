// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tooltip: ({ children }: PropsWithChildren) => children,
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  FileTypeIcon: () => null,
  fileSizeText: (size: number) => `${size} B`,
  IconCloseOutlineRegular: () => null,
  IconMicrophoneOutlineRegular: () => null,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  IconSkillOutlineRegular: () => null,
  MarkdownText: ({ text }: { text: string }) => createElement('div', null, text),
}));

import type { BridgeActions } from '../src/client/actions.js';
import type { SessionTranscript } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { SessionDetail } from '../src/client/session-detail.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

const transcript = (role: SessionTranscript['role'], running = false): SessionTranscript => ({
  role,
  running,
  omitted: 2,
  items: [
    {
      kind: 'input',
      text: 'Fix the Safari export button.',
      at: '2026-11-17T00:00:01.000Z',
      turn: 1,
      source: 'user',
    },
    { kind: 'reasoning', text: 'Check the click handler.', at: '2026-11-17T00:00:02.000Z' },
    { kind: 'reply', text: 'The download runs after an await.', at: '2026-11-17T00:00:03.000Z' },
    {
      kind: 'tool',
      id: 'c1',
      tool: 'read_file',
      status: 'done',
      detail: 'src/export.tsx',
      at: '2026-11-17T00:00:04.000Z',
    },
    { kind: 'turn-end', state: 'done', at: '2026-11-17T00:00:05.000Z' },
  ],
});

async function render(actions: Partial<BridgeActions>): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  await act(async () => {
    root.render(
      createElement(SessionDetail, {
        actions: actions as BridgeActions,
        botSlug: 'tobs',
        botName: 'Tobs',
        sessionId: 'asg-1',
        t: zhTranslate,
      }),
    );
  });
  await act(async () => {});
  return host;
}

it('shows the full conversation with summary chips that expand in place', async () => {
  const host = await render({
    sessionTranscript: vi.fn(async () => transcript('assignment')),
    sessionProgress: vi.fn(async () => ({
      'asg-1': {
        goal: {
          objective: 'Export works on Safari 17',
          phase: 'active' as const,
          roundsStarted: 3,
          maxGoalRounds: 256,
        },
        todos: [
          { content: 'Reproduce', status: 'completed' as const },
          { content: 'Fix', status: 'in_progress' as const },
        ],
      },
    })),
    sendSessionRequest: vi.fn(async () => {}),
  });
  const kinds = [...host.querySelectorAll('[data-transcript]')].map((node) =>
    node.getAttribute('data-transcript'),
  );
  expect(kinds).toEqual(['input', 'reasoning', 'reply', 'tool', 'turn-end']);
  expect(host.textContent).toContain('第 1 轮指示');
  expect(host.textContent).toContain('更早的 2 条没有显示');
  expect(host.querySelector('[data-tool-status="done"]')?.textContent).toContain('src/export.tsx');
  expect(host.querySelector('[data-session-panel]')).toBeNull();
  const todos = host.querySelector<HTMLButtonElement>('[data-session-chip="todos"]')!;
  expect(todos.textContent).toContain('1/2');
  await act(async () => todos.click());
  expect(host.querySelector('[data-session-panel="todos"]')?.textContent).toContain('Fix');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-session-chip="goal"]')!.click(),
  );
  expect(host.querySelector('[data-session-panel="goal"]')?.textContent).toContain(
    'Export works on Safari 17',
  );
  expect(host.querySelector('[data-session-composer]')?.textContent).toContain(
    'Tobs 会在 Inbox 收到通知',
  );
});

it('has no composer for the Orchestrator conversation', async () => {
  const host = await render({
    sessionTranscript: vi.fn(async () => transcript('orchestrator')),
    sendSessionRequest: vi.fn(async () => {}),
  });
  expect(host.querySelectorAll('[data-transcript]')).toHaveLength(5);
  expect(host.querySelector('[data-session-composer]')).toBeNull();
});

it('says when the conversation cannot be read', async () => {
  const host = await render({
    sessionTranscript: vi.fn(async () => {
      throw new Error('offline');
    }),
  });
  expect(host.textContent).toContain('读取对话失败');
});

it('sends a direct request into the Assignment and reports a refusal', async () => {
  const { loadSessionTranscript, sendSessionRequest } = await import('../src/client/bridge.js');
  const calls: [string, Record<string, unknown>][] = [];
  const delivered = vi.fn(async (endpoint: string, payload: Record<string, unknown>) => {
    calls.push([endpoint, payload]);
    return { ok: true as const, value: { slug: 'tobs', result: '{"delivery":"steer"}' } };
  });
  await sendSessionRequest(delivered, 'tobs', 'asg-1', 'Also cover Firefox.', true);
  expect(calls).toEqual([
    [
      'botToolRun',
      {
        slug: 'tobs',
        tool: 'send_assignment_request',
        args: { session_id: 'asg-1', text: 'Also cover Firefox.', mode: 'next-step' },
      },
    ],
  ]);
  const refused = vi.fn(async () => ({
    ok: true as const,
    value: { result: { code: 'assignment-ended', message: 'Assignment is archived' } },
  }));
  await expect(sendSessionRequest(refused, 'tobs', 'asg-1', 'Hi', false)).rejects.toThrow(
    'Assignment is archived',
  );
  const read = vi.fn(async () => ({
    ok: true as const,
    value: {
      role: 'assignment',
      running: true,
      omitted: 0,
      items: [
        { kind: 'tool', id: 'c1', tool: 'bash', status: 'odd', at: 'x' },
        ...transcript('assignment').items,
      ],
    },
  }));
  const parsed = await loadSessionTranscript(read, 'tobs', 'asg-1');
  expect(parsed.running).toBe(true);
  expect(parsed.items).toHaveLength(5);
});
