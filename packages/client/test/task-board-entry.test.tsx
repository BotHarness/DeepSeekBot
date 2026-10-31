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
import { store, type ChannelSummary, type OwnedSessionSummary } from '../src/client/store.js';
import { TaskBoardHeaderAction, TaskBoardPanel } from '../src/client/task-board-entry.js';
import { createTaskBoardPrefs, type TaskBoardPrefs } from '../src/client/task-board-prefs.js';

const t = (key: string): string => key;
const AT = '2026-10-31T10:00:00.000Z';
const NOW_MS = Date.parse(AT);

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

function recorder(log: string[]): Pick<DockPanelHost, 'open' | 'close' | 'isOpen'> {
  return {
    open: (id) => {
      log.push(`open:${id}`);
    },
    close: (id) => {
      log.push(`close:${id}`);
    },
    isOpen: () => false,
  };
}

const GROUP_CHANNEL: ChannelSummary = {
  id: 'chan-group',
  type: 'group',
  name: 'Team',
  members: ['ada'],
  createdAt: AT,
  updatedAt: AT,
};

const WORKING: OwnedSessionSummary = {
  sessionId: 'session-working',
  role: 'assignment',
  createdAt: AT,
  assignmentActivity: 'working',
  assignmentTitle: 'Implement the panel',
  assignmentDescription: 'do the thing',
};

const IDLE: OwnedSessionSummary = {
  sessionId: 'session-idle',
  role: 'assignment',
  createdAt: AT,
  assignmentActivity: 'idle',
  assignmentTitle: 'Polish the panel',
};

const ARCHIVED: OwnedSessionSummary = {
  sessionId: 'session-archived',
  role: 'assignment',
  createdAt: AT,
  assignmentActivity: 'idle',
  assignmentArchived: true,
  assignmentTitle: 'Old work',
};

const ORCHESTRATOR: OwnedSessionSummary = {
  sessionId: 'session-orchestrator',
  role: 'orchestrator',
  createdAt: AT,
};

const WAITING: OwnedSessionSummary = {
  sessionId: 'session-waiting',
  role: 'assignment',
  createdAt: AT,
  assignmentActivity: 'idle',
  assignmentExecutionWait: 'waiting-human',
  assignmentTitle: 'Needs approval',
};

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

function panelActions(
  overrides: Partial<
    Pick<BridgeActions, 'channelAssignments' | 'assignmentWork' | 'readSessions' | 'openSession'>
  > = {},
): BridgeActions {
  return {
    channelAssignments: vi.fn(async () => []),
    readSessions: vi.fn(async () => []),
    openSession: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as BridgeActions;
}

async function paintPanel(
  node: HTMLElement,
  actions: BridgeActions,
  channelId: string,
  botSlug: string | undefined,
): Promise<ReturnType<typeof createRoot>> {
  const root = createRoot(node);
  await act(async () => {
    root.render(
      createElement(TaskBoardPanel, {
        channelId,
        botSlug,
        scope: 'channel',
        actions,
        t,
        prefs: createTaskBoardPrefs(memoryStorage()),
      }),
    );
  });
  await act(async () => undefined);
  return root;
}

it('keeps per channel open state and forces the dock to match on every channel switch', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { prefs, log: prefsLog } = tracedPrefs();
  const dockLog: string[] = [];
  const dock = recorder(dockLog);
  const host = document.createElement('div');
  const root = createRoot(host);
  const paint = async (channelId: string): Promise<void> => {
    await act(async () => {
      root.render(createElement(TaskBoardHeaderAction, { channelId, dockPanels: dock, t, prefs }));
    });
  };
  await paint('a');
  expect(dockLog).toEqual(['close:task-board']);
  await act(async () => host.querySelector('button')?.click());
  expect(prefsLog).toEqual(['setOpen:a:true']);
  expect(dockLog).toEqual(['close:task-board', 'open:task-board']);
  expect(prefs.isOpen('a')).toBe(true);
  await paint('b');
  expect(dockLog).toEqual(['close:task-board', 'open:task-board', 'close:task-board']);
  expect(prefs.isOpen('b')).toBe(false);
  await paint('b');
  expect(dockLog.filter((entry) => entry === 'open:task-board')).toHaveLength(1);
  await paint('a');
  expect(dockLog).toEqual([
    'close:task-board',
    'open:task-board',
    'close:task-board',
    'open:task-board',
  ]);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('closes on the second click and never reopens itself on a later render', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { prefs } = tracedPrefs();
  const dockLog: string[] = [];
  const host = document.createElement('div');
  const root = createRoot(host);
  const paint = async (dock: Pick<DockPanelHost, 'open' | 'close' | 'isOpen'>): Promise<void> => {
    await act(async () => {
      root.render(
        createElement(TaskBoardHeaderAction, {
          channelId: 'a',
          dockPanels: dock,
          t,
          prefs,
        }),
      );
    });
  };
  await paint(recorder(dockLog));
  expect(dockLog).toEqual(['close:task-board']);
  await act(async () => host.querySelector('button')?.click());
  expect(dockLog).toEqual(['close:task-board', 'open:task-board']);
  expect(host.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
  await act(async () => host.querySelector('button')?.click());
  expect(dockLog).toEqual(['close:task-board', 'open:task-board', 'close:task-board']);
  expect(host.querySelector('button')?.getAttribute('aria-pressed')).toBe('false');
  expect(prefs.isOpen('a')).toBe(false);
  await paint(recorder(dockLog));
  await paint(recorder(dockLog));
  expect(dockLog).toEqual(['close:task-board', 'open:task-board', 'close:task-board']);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('reads a direct message through its own sessions and keeps the main session card', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const readSessions = vi.fn(async () => [ORCHESTRATOR, WORKING, ARCHIVED, WAITING]);
  const channelAssignments = vi.fn(async () => []);
  const openSession = vi.fn(async () => undefined);
  const assignmentWork = vi.fn(async (_slug: string, _sessionId: string) => WORK);
  const nativeSnapshot = {
    ids: ['session-orchestrator'],
    byId: {
      'session-orchestrator': { displayTitle: '托布', updatedAt: NOW_MS, running: true },
    },
  };
  const nativeSessions = {
    subscribe: () => () => undefined,
    getSnapshot: () => nativeSnapshot,
  };
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(TaskBoardPanel, {
        channelId: 'dm-1',
        botSlug: 'ada',
        scope: 'channel',
        actions: panelActions({ readSessions, channelAssignments, openSession, assignmentWork }),
        t,
        nativeSessions,
        prefs: createTaskBoardPrefs(memoryStorage()),
      }),
    );
  });
  await act(async () => undefined);
  expect(readSessions).toHaveBeenCalledWith('ada');
  expect(channelAssignments).not.toHaveBeenCalled();
  expect(host.querySelector('[data-task-board-card="session-working"]')).not.toBeNull();
  const main = host.querySelector('[data-task-board-card="session-orchestrator"]');
  expect(main).not.toBeNull();
  expect(main?.textContent).toContain('托布');
  expect(main?.querySelector('[data-task-board-orchestrator]')).not.toBeNull();
  expect(main?.querySelector('[role="progressbar"]')).not.toBeNull();
  expect(host.querySelector('[data-task-board-card="session-archived"]')).not.toBeNull();
  expect(host.textContent).not.toContain('taskBoard.error');
  const workButton = main?.querySelector<HTMLElement>('[data-task-board-work]');
  expect(workButton).not.toBeNull();
  await act(async () => workButton?.click());
  await act(async () => undefined);
  expect(
    assignmentWork.mock.calls.filter((call) => call[1] === 'session-orchestrator').length,
  ).toBeGreaterThanOrEqual(2);
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('falls back to the createdAt of an unreachable main session', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = await paintPanel(
    host,
    panelActions({ readSessions: vi.fn(async () => [ORCHESTRATOR]) }),
    'dm-1',
    'ada',
  );
  const main = host.querySelector('[data-task-board-card="session-orchestrator"]');
  expect(main).not.toBeNull();
  expect(main?.textContent).toContain('activity.source.orchestrator');
  expect(main?.querySelector('[data-task-board-orchestrator]')).not.toBeNull();
  expect(main?.textContent).toContain('taskBoard.unavailable');
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('reads a group through the channel assignments bridge', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  store.setRoster([], [GROUP_CHANNEL]);
  const readSessions = vi.fn(async () => []);
  const channelAssignments = vi.fn(async () => [
    {
      sessionId: 'group-1',
      botSlug: 'ada',
      title: 'Group work',
      description: 'group thing',
      activity: 'working' as const,
      createdAt: AT,
      updatedAt: AT,
    },
  ]);
  const host = document.createElement('div');
  const root = await paintPanel(
    host,
    panelActions({ readSessions, channelAssignments }),
    'chan-group',
    undefined,
  );
  expect(channelAssignments).toHaveBeenCalledWith('chan-group');
  expect(readSessions).not.toHaveBeenCalled();
  expect(host.querySelector('[data-task-board-group="ada"]')).not.toBeNull();
  expect(host.querySelector('[data-task-board-card="group-1"]')).toBeNull();
  await act(async () =>
    host.querySelector<HTMLElement>('[data-task-board-group-toggle="ada"]')?.click(),
  );
  await act(async () => undefined);
  expect(host.querySelector('[data-task-board-card="group-1"]')?.textContent).toContain(
    'Group work',
  );
  await act(async () => root.unmount());
  store.setRoster([], []);
  vi.unstubAllGlobals();
});

it('shows the empty state and offers a retry when the read fails', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const read = vi.fn(async () => {
    throw new Error('bridge refused');
  });
  const empty = document.createElement('div');
  const emptyRoot = await paintPanel(
    empty,
    panelActions({ readSessions: vi.fn(async () => []) }),
    'dm-empty',
    'ada',
  );
  expect(empty.textContent).toContain('taskBoard.empty');
  await act(async () => emptyRoot.unmount());
  const host = document.createElement('div');
  const root = await paintPanel(host, panelActions({ readSessions: read }), 'dm-1', 'ada');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('taskBoard.error');
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

it('reads the source once per round and only fetches steps for work rows', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const readSessions = vi.fn(async () => [WORKING, IDLE, ARCHIVED]);
  const work = vi.fn(async () => WORK);
  const host = document.createElement('div');
  const root = await paintPanel(
    host,
    panelActions({ readSessions, assignmentWork: work }),
    'dm-1',
    'ada',
  );
  expect(readSessions).toHaveBeenCalledTimes(1);
  expect(work).toHaveBeenCalledTimes(1);
  expect(work.mock.calls[0]).toEqual(['ada', 'session-working']);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(readSessions).toHaveBeenCalledTimes(2);
  expect(work).toHaveBeenCalledTimes(2);
  expect(work.mock.calls).toEqual([
    ['ada', 'session-working'],
    ['ada', 'session-working'],
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
  const root = await paintPanel(host, panelActions({ readSessions: read }), 'dm-1', 'ada');
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

it('keeps steps collapsed until the card head is clicked', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const nativeSnapshot = {
    ids: ['session-working'],
    byId: {
      'session-working': { displayTitle: 'Work', updatedAt: NOW_MS, running: true },
    },
  };
  const readWork = vi.fn(async (_slug: string, _sessionId: string) => WORK);
  const actions = panelActions({
    readSessions: vi.fn(async () => [WORKING]),
    assignmentWork: readWork,
  });
  await act(async () => {
    root.render(
      createElement(TaskBoardPanel, {
        channelId: 'dm-1',
        botSlug: 'ada',
        scope: 'channel',
        actions,
        t,
        nativeSessions: { subscribe: () => () => undefined, getSnapshot: () => nativeSnapshot },
        prefs: createTaskBoardPrefs(memoryStorage()),
      }),
    );
  });
  await act(async () => undefined);
  const toggle = host.querySelector<HTMLElement>('[data-task-board-card-toggle="session-working"]');
  expect(toggle).not.toBeNull();
  expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('[data-task-board-steps="session-working"]')).toBeNull();
  await act(async () => toggle?.click());
  await act(async () => undefined);

  expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('[data-task-board-steps="session-working"]')).not.toBeNull();
  await act(async () => toggle?.click());
  await act(async () => undefined);

  expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('[data-task-board-steps="session-working"]')).toBeNull();
  const work = host.querySelector<HTMLElement>('[data-task-board-work]');
  await act(async () => work?.click());
  await act(async () => undefined);
  expect(
    readWork.mock.calls.filter((call) => call[1] === 'session-working').length,
  ).toBeGreaterThanOrEqual(2);
  expect(host.querySelector('[data-task-board-steps="session-working"]')).toBeNull();
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('does not fetch steps for a settled card until it is expanded', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const readWork = vi.fn(async (_slug: string, _sessionId: string) => WORK);
  const host = document.createElement('div');
  const root = await paintPanel(
    host,
    panelActions({ readSessions: vi.fn(async () => [ARCHIVED]), assignmentWork: readWork }),
    'dm-1',
    'ada',
  );
  expect(readWork).not.toHaveBeenCalled();
  const toggle = host.querySelector<HTMLElement>(
    '[data-task-board-card-toggle="session-archived"]',
  );
  expect(toggle).not.toBeNull();
  expect(host.querySelector('[data-task-board-steps="session-archived"]')).toBeNull();
  await act(async () => toggle?.click());
  await act(async () => undefined);
  expect(readWork.mock.calls.filter((call) => call[1] === 'session-archived')).toHaveLength(1);
  expect(host.querySelector('[data-task-board-steps="session-archived"]')).not.toBeNull();
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('does not fetch again once a settled card is collapsed', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const readWork = vi.fn(async (_slug: string, _sessionId: string) => WORK);
  const host = document.createElement('div');
  const root = await paintPanel(
    host,
    panelActions({ readSessions: vi.fn(async () => [ARCHIVED]), assignmentWork: readWork }),
    'dm-1',
    'ada',
  );
  const toggle = host.querySelector<HTMLElement>(
    '[data-task-board-card-toggle="session-archived"]',
  );
  await act(async () => toggle?.click());
  await act(async () => undefined);
  expect(readWork.mock.calls.filter((call) => call[1] === 'session-archived')).toHaveLength(1);
  await act(async () => toggle?.click());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(host.querySelector('[data-task-board-steps="session-archived"]')).toBeNull();
  expect(readWork.mock.calls.filter((call) => call[1] === 'session-archived')).toHaveLength(1);
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
