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
  IconStopFillRegular: () => null,
  MarkdownText: ({ text }: { text: string }) => createElement('div', null, text),
}));

import type { BridgeActions } from '../src/client/actions.js';
import type { SessionLiveSnapshot, SessionTranscript } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  SessionDetail,
  SessionDetailPrefsContext,
  type SessionDetailPrefs,
} from '../src/client/session-detail.js';
import {
  clearSessionDetailCache,
  prefetchSessionDetail,
} from '../src/client/session-detail-cache.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: (() => void)[] = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  clearSessionDetailCache();
});

const transcript = (role: SessionTranscript['role'], running = false): SessionTranscript => ({
  role,
  running,
  omitted: 2,
  seq: 5,
  items: [
    {
      kind: 'input',
      text: 'Fix the Safari export button.',
      at: '2026-11-17T00:00:01.000Z',
      turn: 1,
      source: 'user',
    },
    {
      kind: 'reasoning',
      text: 'Check the click handler.',
      at: '2026-11-17T00:00:02.000Z',
    },
    {
      kind: 'reply',
      text: 'The download runs after an await.',
      at: '2026-11-17T00:00:03.000Z',
    },
    {
      kind: 'tool',
      id: 'c1',
      tool: 'read_file',
      toolKind: 'read',
      status: 'done',
      detail: 'src/export.tsx',
      at: '2026-11-17T00:00:04.000Z',
    },
    { kind: 'turn-end', state: 'done', at: '2026-11-17T00:00:05.000Z' },
  ],
});

function label(node: HTMLElement): string {
  const copy = node.cloneNode(true) as HTMLElement;
  for (const meta of copy.querySelectorAll('[data-transcript-time], [data-transcript-clock]'))
    meta.remove();
  return copy.textContent ?? '';
}

async function render(
  actions: Partial<BridgeActions>,
  prefs?: SessionDetailPrefs,
): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  await act(async () => {
    const detail = createElement(SessionDetail, {
      actions: actions as BridgeActions,
      botSlug: 'tobs',
      sessionId: 'asg-1',
      t: zhTranslate,
    });
    root.render(
      prefs === undefined
        ? detail
        : createElement(SessionDetailPrefsContext.Provider, { value: prefs }, detail),
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
  const kinds = () =>
    [...host.querySelectorAll('[data-transcript]')].map((node) =>
      node.getAttribute('data-transcript'),
    );
  expect(kinds()).toEqual(['input', 'turn-end', 'reply']);
  expect(host.textContent).not.toContain('第 1 轮');
  expect(host.querySelector('[data-transcript="turn-end"]')?.textContent).toBe('已完成，用时 4 秒');
  expect(host.textContent).toContain('更早的 2 条没有显示');
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-transcript="turn-end"]')!.click(),
  );
  expect(kinds()).toEqual(['input', 'turn-end', 'process', 'reply', 'process']);
  const groups = host.querySelectorAll<HTMLElement>('[data-transcript="process"]');
  expect(label(groups[0]!)).toBe('已思考');
  expect(label(groups[1]!)).toBe('读取了 1 个文件');
  expect(groups[1]!.querySelector('[data-transcript-time]')).not.toBeNull();
  await act(async () => groups[1]!.querySelector('button')!.click());
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
  expect(host.querySelector('[data-session-composer]')).not.toBeNull();
  expect(host.querySelector('[data-session-composer]')?.textContent).not.toContain('Inbox');
});

it('has no composer for the Orchestrator conversation', async () => {
  const host = await render({
    sessionTranscript: vi.fn(async () => transcript('orchestrator')),
    sendSessionRequest: vi.fn(async () => {}),
  });
  expect(host.querySelectorAll('[data-transcript]')).toHaveLength(3);
  expect(host.querySelector('[data-session-composer]')).toBeNull();
});

it('says when the Session cannot be read', async () => {
  const host = await render({
    sessionTranscript: vi.fn(async () => {
      throw new Error('offline');
    }),
  });
  expect(host.textContent).toContain('读取会话失败');
});

it('sends a direct request into the Assignment and reports a refusal', async () => {
  const { loadSessionTranscript, sendSessionRequest } = await import('../src/client/bridge.js');
  const calls: [string, Record<string, unknown>][] = [];
  const delivered = vi.fn(async (endpoint: string, payload: Record<string, unknown>) => {
    calls.push([endpoint, payload]);
    return {
      ok: true as const,
      value: { slug: 'tobs', result: '{"delivery":"steer"}' },
    };
  });
  await sendSessionRequest(delivered, 'tobs', 'asg-1', 'Also cover Firefox.', true);
  expect(calls).toEqual([
    [
      'botToolRun',
      {
        slug: 'tobs',
        tool: 'send_assignment_request',
        args: {
          session_id: 'asg-1',
          text: 'Also cover Firefox.',
          mode: 'next-step',
        },
      },
    ],
  ]);
  const refused = vi.fn(async () => ({
    ok: true as const,
    value: {
      result: { code: 'assignment-ended', message: 'Assignment is archived' },
    },
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
  expect(parsed.items[3]).toMatchObject({ kind: 'tool', toolKind: 'read' });
  const unknownKind = await loadSessionTranscript(
    vi.fn(async () => ({
      ok: true as const,
      value: {
        role: 'assignment',
        running: false,
        omitted: 0,
        items: [{ kind: 'tool', id: 'c2', tool: 'mcp_x', status: 'done', at: 'x' }],
      },
    })),
    'tobs',
    'asg-1',
  );
  expect(unknownKind.items[0]).toMatchObject({ toolKind: 'other' });
});

it('stops a running Assignment from an empty composer', async () => {
  const stopSession = vi.fn(async () => {});
  const host = await render({
    sessionTranscript: vi.fn(async () => transcript('assignment', true)),
    sendSessionRequest: vi.fn(async () => {}),
    stopSession,
  });
  const stop = host.querySelector<HTMLButtonElement>('[data-composer-stop]')!;
  expect(stop.getAttribute('aria-label')).toBe('停止');
  await act(async () => stop.click());
  expect(stopSession).toHaveBeenCalledWith('tobs', 'asg-1');
});

it('keeps send for an idle Assignment', async () => {
  const host = await render({
    sessionTranscript: vi.fn(async () => transcript('assignment')),
    sendSessionRequest: vi.fn(async () => {}),
    stopSession: vi.fn(async () => {}),
  });
  expect(host.querySelector('[data-session-composer]')).not.toBeNull();
  expect(host.querySelector('[data-composer-stop]')).toBeNull();
});

it('shows the running step live and keeps the turn open', async () => {
  const host = await render({
    sessionTranscript: vi.fn(async () => ({
      role: 'assignment' as const,
      running: true,
      omitted: 0,
      seq: 2,
      items: [
        {
          kind: 'input' as const,
          text: 'Run the tests.',
          at: '2026-11-17T00:00:01.000Z',
          turn: 1,
          source: 'user' as const,
        },
        {
          kind: 'tool' as const,
          id: 'c1',
          tool: 'bash',
          toolKind: 'other' as const,
          status: 'running' as const,
          detail: 'node --test',
          at: '2026-11-17T00:00:02.000Z',
        },
      ],
    })),
    sendSessionRequest: vi.fn(async () => {}),
    stopSession: vi.fn(async () => {}),
  });
  expect(host.querySelector('[data-transcript="turn-end"]')).toBeNull();
  expect(label(host.querySelector<HTMLElement>('[data-process-live]')!)).toBe(
    '正在运行命令node --test',
  );
  expect(host.querySelector('[data-process-live] [data-transcript-clock]')).not.toBeNull();
});

const editTurn = (): SessionTranscript => ({
  role: 'assignment',
  running: false,
  omitted: 0,
  seq: 9,
  items: [
    {
      kind: 'input',
      text: 'PR opened.',
      at: '2026-11-17T00:00:01.000Z',
      turn: 1,
      source: 'system',
      trigger: 'github',
    },
    {
      kind: 'tool',
      id: 'c1',
      tool: 'edit',
      toolKind: 'edit',
      status: 'done',
      path: 'src/a.ts',
      added: 3,
      removed: 1,
      at: '2026-11-17T00:00:02.000Z',
      endedAt: '2026-11-17T00:00:03.000Z',
    },
    { kind: 'reply', text: 'First note.', at: '2026-11-17T00:00:04.000Z' },
    { kind: 'reasoning', text: 'Check again.', at: '2026-11-17T00:00:05.000Z' },
    { kind: 'reply', text: 'Final answer.', at: '2026-11-17T00:00:06.000Z' },
    {
      kind: 'turn-end',
      state: 'done',
      at: '2026-11-17T00:00:11.000Z',
      usage: { tokens: 8591, output: 230, outputMs: 5000 },
    },
  ],
});

it('names the notice, sums changed files and shows the turn usage', async () => {
  const host = await render({ sessionTranscript: vi.fn(async () => editTurn()) });
  expect(host.querySelector('[data-transcript="system"]')?.textContent).toContain(
    '收到 GitHub 事件',
  );
  expect(host.querySelector('[data-transcript-usage]')?.textContent).toBe('8.6k tok · 46 tok/s');
  const changes = host.querySelector<HTMLElement>('[data-transcript="changes"]')!;
  expect(changes.textContent).toBe('改动了 1 个文件+3−1');
  await act(async () => changes.querySelector('button')!.click());
  expect(host.querySelector('[data-changed-file="src/a.ts"]')).not.toBeNull();
  expect(
    [...host.querySelectorAll('[data-transcript="reply"]')].map((node) => node.textContent),
  ).toEqual(['First note.', 'Final answer.']);
});

it('follows the settings for folded replies, fold timing and detail level', async () => {
  const final = await render(
    { sessionTranscript: vi.fn(async () => editTurn()) },
    { level: 'standard', collapse: 'completion', replies: 'final' },
  );
  expect(
    [...final.querySelectorAll('[data-transcript="reply"]')].map((node) => node.textContent),
  ).toEqual(['Final answer.']);
  const later = await render(
    { sessionTranscript: vi.fn(async () => editTurn()) },
    { level: 'standard', collapse: 'nextInput', replies: 'all' },
  );
  expect(later.querySelectorAll('[data-transcript="process"]')).toHaveLength(2);
  const verbose = await render(
    { sessionTranscript: vi.fn(async () => editTurn()) },
    { level: 'verbose', collapse: 'completion', replies: 'all' },
  );
  expect(verbose.querySelector('[data-transcript-steps]')).not.toBeNull();
  expect(verbose.querySelector('[data-transcript="reasoning"]')?.textContent).toContain(
    'Check again.',
  );
});

it('opens a tool step into its command and output', async () => {
  const sessionToolDetail = vi.fn(async () => ({
    card: 'terminal' as const,
    command: 'pnpm test',
    output: '3 passed',
    exitCode: 1,
  }));
  const host = await render(
    {
      sessionTranscript: vi.fn(async () => ({
        ...editTurn(),
        items: [
          {
            kind: 'tool' as const,
            id: 'c9',
            tool: 'bash',
            toolKind: 'execute' as const,
            status: 'done' as const,
            command: 'pnpm test',
            at: '2026-11-17T00:00:02.000Z',
          },
        ],
      })),
      sessionToolDetail,
    },
    { level: 'detailed', collapse: 'nextInput', replies: 'all' },
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-transcript="process"] button')!.click(),
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>('[data-transcript="tool"] button')!.click(),
  );
  expect(sessionToolDetail).toHaveBeenCalledWith('tobs', 'asg-1', 'c9');
  const card = host.querySelector('[data-tool-detail="terminal"]');
  expect(card?.textContent).toContain('$ pnpm test');
  expect(card?.textContent).toContain('3 passed');
  expect(card?.textContent).toContain('退出码 1');
});

it('streams the live reasoning and reply over the durable history', async () => {
  let resolveSecond: (value: SessionLiveSnapshot) => void = () => {};
  const sessionLive = vi
    .fn()
    .mockResolvedValueOnce({
      revision: 1,
      seq: 2,
      items: [
        {
          kind: 'reasoning',
          text: 'Line one\nLine two',
          at: '2026-11-17T00:00:03.000Z',
          live: true,
        },
      ],
    })
    .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)))
    .mockImplementation(() => new Promise(() => {}));
  const host = await render({
    sessionTranscript: vi.fn(async () => ({
      role: 'assignment' as const,
      running: true,
      omitted: 0,
      seq: 2,
      items: [
        {
          kind: 'input' as const,
          text: 'Go.',
          at: '2026-11-17T00:00:01.000Z',
          turn: 1,
          source: 'user' as const,
        },
      ],
    })),
    sessionLive,
  });
  await act(async () => {});
  expect(host.querySelector('[data-transcript="preview"]')?.textContent).toBe('Line one\nLine two');
  await act(async () =>
    resolveSecond({
      revision: 2,
      seq: 2,
      items: [
        { kind: 'reasoning', text: 'Line one', at: '2026-11-17T00:00:03.000Z', live: true },
        { kind: 'reply', text: 'Streaming answer', at: '2026-11-17T00:00:04.000Z', live: true },
      ],
    }),
  );
  expect(host.querySelector('[data-transcript="reply"]')?.textContent).toBe('Streaming answer');
  expect(sessionLive).toHaveBeenNthCalledWith(2, 'tobs', 'asg-1', 1, expect.anything());
});

it('offers turn navigation once there are several turns', async () => {
  const items: SessionTranscript['items'] = [1, 2, 3].flatMap((turn) => [
    {
      kind: 'input' as const,
      text: `Ask ${turn}`,
      at: `2026-11-17T00:00:0${turn}.000Z`,
      turn,
      source: 'user' as const,
    },
    { kind: 'reply' as const, text: `Answer ${turn}`, at: `2026-11-17T00:00:0${turn}.500Z` },
  ]);
  const host = await render({
    sessionTranscript: vi.fn(async () => ({ ...editTurn(), items })),
  });
  expect(host.querySelectorAll('[data-nav-turn]')).toHaveLength(3);
});

it('reopens a Session from its last transcript while it refreshes', async () => {
  await render({ sessionTranscript: vi.fn(async () => transcript('assignment')) });
  for (const unmount of mounted.splice(0)) unmount();
  const host = await render({ sessionTranscript: vi.fn(() => new Promise<never>(() => {})) });
  expect(host.textContent).not.toContain('正在读取会话');
  expect(host.querySelectorAll('[data-transcript="reply"]')).toHaveLength(1);
});

it('prefetches a Session once before it opens', async () => {
  const read = vi.fn(async () => transcript('assignment'));
  prefetchSessionDetail({ sessionTranscript: read }, 'tobs', 'asg-1');
  prefetchSessionDetail({ sessionTranscript: read }, 'tobs', 'asg-1');
  await act(async () => {});
  expect(read).toHaveBeenCalledTimes(1);
  const host = await render({ sessionTranscript: vi.fn(() => new Promise<never>(() => {})) });
  expect(host.textContent).not.toContain('正在读取会话');
});

it('offers a jump to the latest step after scrolling up', async () => {
  const host = await render({
    sessionTranscript: vi.fn(async () => transcript('assignment')),
    sendSessionRequest: vi.fn(async () => {}),
  });
  const timeline = host.querySelector<HTMLElement>('[data-session-transcript]')!;
  const jump = (): HTMLButtonElement | null =>
    host.querySelector<HTMLButtonElement>('[aria-label="跳到最新"]');
  Object.defineProperty(timeline, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(timeline, 'clientHeight', { configurable: true, value: 300 });
  const scrollTo = vi.fn();
  timeline.scrollTo = scrollTo;
  expect(jump()).toBeNull();
  timeline.scrollTop = 100;
  await act(async () => timeline.dispatchEvent(new Event('scroll')));
  expect(host.querySelector('[data-session-composer]')?.contains(jump())).toBe(true);
  act(() => jump()!.click());
  expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
  timeline.scrollTop = 700;
  await act(async () => timeline.dispatchEvent(new Event('scroll')));
  expect(jump()).toBeNull();
});
