// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  const passthrough = ({ children }: { children?: unknown }) => h('span', null, children as never);
  const cache = new Map<string, unknown>([
    ['relativeTime', () => ({ unit: 'now', n: 0 })],
    ['useAnchoredPosition', () => ({ top: 0, left: 0 })],
  ]);
  return new Proxy(
    {},
    {
      has: () => true,
      get: (_target, key) => {
        if (typeof key !== 'string' || key === 'then' || key === '__esModule') return undefined;
        if (!cache.has(key)) cache.set(key, key.startsWith('use') ? () => undefined : passthrough);
        return cache.get(key);
      },
    },
  );
});

import type { BridgeActions } from '../src/client/actions.js';
import type { DockPanelHost } from '../src/client/dock-panels.js';
import type { ConfigStorage } from '../src/client/roster-config.js';
import { TaskBoardHeaderAction, TaskBoardPanel } from '../src/client/task-board-entry.js';
import { createTaskBoardPrefs, type TaskBoardPrefs } from '../src/client/task-board-prefs.js';

const t = (key: string): string => key;

function memoryStorage(): ConfigStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function tracedPrefs(): { prefs: TaskBoardPrefs; log: string[] } {
  const base = createTaskBoardPrefs(memoryStorage());
  const log: string[] = [];
  return {
    log,
    prefs: {
      ...base,
      setOpen: (channelId, open) => {
        log.push(`setOpen:${channelId}:${String(open)}`);
        base.setOpen(channelId, open);
      },
    },
  };
}

function recorder(): { dock: Pick<DockPanelHost, 'open' | 'close' | 'isOpen'>; log: string[] } {
  const log: string[] = [];
  return {
    log,
    dock: {
      open: (id) => {
        log.push(`open:${id}`);
      },
      close: (id) => {
        log.push(`close:${id}`);
      },
      isOpen: () => false,
    },
  };
}

const ASSIGNMENT = {
  sessionId: 'session-1',
  botSlug: 'ada',
  title: 'Implement the panel',
  description: 'do the thing',
  activity: 'working' as const,
  createdAt: '2026-10-31T10:00:00.000Z',
  updatedAt: '2026-10-31T11:00:00.000Z',
};

function panelActions(
  overrides: Partial<Pick<BridgeActions, 'channelAssignments' | 'assignmentWork'>> = {},
): BridgeActions {
  return {
    channelAssignments: vi.fn(async () => []),
    openSession: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as BridgeActions;
}

it('keeps per channel open state and forces the dock to match on every channel switch', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { prefs, log: prefsLog } = tracedPrefs();
  const { dock, log: dockLog } = recorder();
  const host = document.createElement('div');
  const root = createRoot(host);
  const paint = async (channelId: string): Promise<void> => {
    await act(async () => {
      root.render(createElement(TaskBoardHeaderAction, { channelId, dockPanels: dock, t, prefs }));
    });
  };
  await paint('a');
  expect(dockLog).toEqual(['close:task-board']);
  const button = host.querySelector('button');
  await act(async () => button?.click());
  expect(prefsLog).toEqual(['setOpen:a:true']);
  expect(dockLog).toEqual(['close:task-board', 'open:task-board']);
  expect(prefs.isOpen('a')).toBe(true);
  await paint('b');
  expect(dockLog).toEqual(['close:task-board', 'open:task-board', 'close:task-board']);
  expect(prefs.isOpen('b')).toBe(false);
  expect(dockLog.filter((entry) => entry === 'open:task-board')).toHaveLength(1);
  await paint('a');
  expect(dockLog).toEqual([
    'close:task-board',
    'open:task-board',
    'close:task-board',
    'open:task-board',
  ]);
  expect(prefs.isOpen('a')).toBe(true);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('shows the cards a channel already has and the empty state when it has none', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const filled = document.createElement('div');
  const filledRoot = createRoot(filled);
  const actions = panelActions({ channelAssignments: vi.fn(async () => [ASSIGNMENT]) });
  await act(async () => {
    filledRoot.render(
      createElement(TaskBoardPanel, {
        channelId: 'chan-1',
        scope: 'channel',
        botSlug: undefined,
        actions,
        t,
      }),
    );
  });
  await act(async () => undefined);
  expect(filled.querySelector('[data-task-board-card="session-1"]')?.textContent).toContain(
    'Implement the panel',
  );
  await act(async () => filledRoot.unmount());
  const empty = document.createElement('div');
  const emptyRoot = createRoot(empty);
  await act(async () => {
    emptyRoot.render(
      createElement(TaskBoardPanel, {
        channelId: 'chan-1',
        scope: 'channel',
        botSlug: undefined,
        actions: panelActions(),
        t,
      }),
    );
  });
  await act(async () => undefined);
  expect(empty.textContent).toContain('taskBoard.empty');
  await act(async () => emptyRoot.unmount());
  vi.unstubAllGlobals();
});

it('keeps the last cards and offers a retry when the read fails', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const read = vi.fn(async () => {
    throw new Error('bridge refused');
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(TaskBoardPanel, {
        channelId: 'chan-1',
        scope: 'channel',
        botSlug: undefined,
        actions: panelActions({ channelAssignments: read }),
        t,
      }),
    );
  });
  await act(async () => undefined);
  const alert = host.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain('taskBoard.error');
  expect(read).toHaveBeenCalledTimes(1);
  const retry = [...host.querySelectorAll('button')].find((item) =>
    item.textContent?.includes('taskBoard.retry'),
  );
  await act(async () => retry?.click());
  await act(async () => undefined);
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

const WORK = {
  title: 'Implement the panel',
  description: 'do the thing',
  activity: 'working' as const,
  rounds: [],
  lanes: [
    {
      role: 'main' as const,
      index: 0,
      sessionId: 'session-working',
      state: 'running' as const,
      entries: [
        {
          status: 'running' as const,
          kind: 'execute',
          tool: 'shell',
          at: '2026-10-31T11:00:00.000Z',
        },
      ],
      omitted: 0,
    },
  ],
  omittedSubagents: 0,
  omittedRounds: 0,
};

async function paintPanel(
  node: HTMLElement,
  actions: BridgeActions,
): Promise<{ root: ReturnType<typeof createRoot> }> {
  const root = createRoot(node);
  await act(async () => {
    root.render(
      createElement(TaskBoardPanel, {
        channelId: 'chan-1',
        scope: 'channel',
        botSlug: undefined,
        actions,
        t,
      }),
    );
  });
  await act(async () => undefined);
  return { root };
}

it('reads the channel once per round and only fetches steps for work rows', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const assignments = vi.fn(async () => [
    ASSIGNMENT,
    { ...ASSIGNMENT, sessionId: 'session-idle', activity: 'idle' as const },
    { ...ASSIGNMENT, sessionId: 'session-stopped', activity: 'stopped' as const },
  ]);
  const work = vi.fn(async () => WORK);
  const host = document.createElement('div');
  const { root } = await paintPanel(
    host,
    panelActions({ channelAssignments: assignments, assignmentWork: work }),
  );
  expect(assignments).toHaveBeenCalledTimes(1);
  expect(work).toHaveBeenCalledTimes(1);
  expect(work.mock.calls[0]).toEqual(['ada', 'session-1']);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(assignments).toHaveBeenCalledTimes(2);
  expect(work).toHaveBeenCalledTimes(2);
  expect(work.mock.calls).toEqual([
    ['ada', 'session-1'],
    ['ada', 'session-1'],
  ]);
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('stops polling after two failed rounds in a row', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const read = vi.fn(async () => {
    throw new Error('bridge refused');
  });
  const host = document.createElement('div');
  const { root } = await paintPanel(host, panelActions({ channelAssignments: read }));
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
