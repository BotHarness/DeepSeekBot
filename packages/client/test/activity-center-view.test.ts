// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('../src/client/channel-activity-chart.js', () => ({ ChannelActivityChart: () => null }));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: () => null,
  IconAgentPresetOutlineRegular: () => null,
  IconRefreshOutlineRegular: () => createElement('svg'),
  IconCheckOutlineRegular: () => createElement('svg'),
  IconInfoOutlineRegular: () => createElement('svg'),
  IconChevronDownOutlineRegular: () => createElement('svg'),
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  IconRightUpOutlineRegular: () => null,
  Input: () => null,
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
    createElement('button', props, children),
  Tooltip: ({ children }: { children: ReactNode }) => children,
  MarkdownText: () => null,
  Modal: () => null,
  Menu: () => null,
}));
vi.mock('../src/client/bot-sidebar.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
});
import type { NativeSessionCatalog } from '../src/client/sessions-entry.js';
import { ActivityCenterView } from '../src/client/activity-center-view.js';
import { createActions } from '../src/client/actions.js';
import { store } from '../src/client/store.js';
it('shows Overview and routes a Session to native navigation while Bot opens DM', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const openSession = vi.fn();
  const actions = createActions(
    async (endpoint) => {
      if (endpoint === 'activityOverview')
        return {
          ok: true,
          value: {
            actionCount: 4,
            bots: [
              {
                slug: 'ada',
                displayName: 'Ada',
                hasAction: false,
                paused: false,
                state: 'working',
                activity: {
                  toolKind: 'execute',
                  effect: 'executing',
                  toolName: 'bash',
                  startedAt: 1,
                  activeToolCount: 1,
                  sources: [{ role: 'orchestrator', count: 1 }],
                },
                sessions: [
                  {
                    sessionId: 'assignment-1',
                    role: 'assignment',
                    state: 'working',
                    purpose: 'Prepare release',
                  },
                ],
              },
              {
                slug: 'info',
                displayName: 'Report Bot',
                state: 'idle',
                paused: false,
                hasAction: false,
                sessions: [],
                attention: { approvalCount: 0, informationalCount: 1 },
              },
              {
                slug: 'idle',
                displayName: 'Idle Bot',
                state: 'idle',
                paused: false,
                hasAction: false,
                sessions: [],
              },
            ],
          },
        };
      if (endpoint === 'humanAttentionStatus')
        return { ok: true, value: { unreadCount: 12, hasAction: true } };
      throw new Error('Unexpected ' + endpoint);
    },
    store,
    {
      pickDirectory: async () => null,
      createWorkspace: async () => ({ workspaceId: 'w' }),
      openSession,
    },
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let native: ReturnType<NativeSessionCatalog['getSnapshot']> = { ids: [], byId: {} };
  let notify = () => {};
  const nativeSessions: NativeSessionCatalog = {
    subscribe(listener) {
      notify = listener;
      return () => {
        notify = () => {};
      };
    },
    getSnapshot: () => native,
    async refresh() {
      native = {
        ids: ['assignment-1'],
        byId: {
          'assignment-1': { displayTitle: 'Native release session', running: true, updatedAt: 1 },
        },
      };
      notify();
    },
  };
  try {
    await act(async () => {
      await actions.openActivityCenter();
      root.render(createElement(ActivityCenterView, { actions, nativeSessions }));
    });
    expect(container.textContent).toContain('4');
    expect(container.textContent).toContain('Native release session');
    await act(async () => {
      native = {
        ids: ['assignment-1'],
        byId: {
          'assignment-1': { displayTitle: 'Renamed release session', running: true, updatedAt: 2 },
        },
      };
      notify();
    });
    expect(container.textContent).toContain('Renamed release session');
    expect(container.textContent).not.toContain('Native release session');
    expect(container.querySelector('[data-bot-id=idle]')).toBeNull();
    expect(container.querySelector('[data-bot-id=info] .bh-avatar-information')).not.toBeNull();
    expect(container.querySelector('[data-bot-id=info] .bh-avatar-attention')).toBeNull();
    expect(container.querySelector('[data-bot-id=ada] .bh-overview-bot-state')?.textContent).toBe(
      '正在执行 · bash · 主会话',
    );
    expect(
      container.querySelector('[data-bot-id=ada] .bh-persona-avatar')?.getAttribute('data-effect'),
    ).toBe('executing');
    const idleToggle = container.querySelector('[aria-label="显示空闲 Bot"]')!;
    await act(async () => idleToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('[data-bot-id=idle]')).not.toBeNull();
    const session = container.querySelector('[data-session-id="assignment-1"] button')!;
    await act(async () => {
      session.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(openSession).toHaveBeenCalledWith('assignment-1');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.select(undefined);
  }
});

it('drops late Overview responses after switching to Inbox and reconciles completed Sessions', async () => {
  const { createStore } = await import('../src/client/store.js');
  const local = createStore();
  let settle: (value: {
    ok: true;
    value: { actionCount: number; bots: never[] };
  }) => void = () => {};
  let delayed = true;
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: 0, hasAction: false } };
    if (endpoint === 'humanAttention') return { ok: true, value: { items: [] } };
    if (endpoint === 'activityOverview')
      return delayed
        ? new Promise((done) => {
            settle = (value) => done(value);
          })
        : {
            ok: true,
            value: {
              actionCount: 0,
              bots: [
                { slug: 'ada', displayName: 'Ada', state: 'idle', paused: false, sessions: [] },
              ],
            },
          };
    throw new Error(endpoint);
  }, local);
  const opening = actions.openActivityCenter();
  await actions.openHumanInbox();
  settle({ ok: true, value: { actionCount: 2, bots: [] } });
  await opening;
  expect(local.getSnapshot().overview.value).toBeUndefined();
  delayed = false;
  await actions.openActivityCenter('overview');
  expect(local.getSnapshot().overview.value).toMatchObject({
    actionCount: 0,
    bots: [{ slug: 'ada', sessions: [] }],
  });
});

it('returns to the last Activity Center tab after DM navigation and a new client', async () => {
  const { createStore } = await import('../src/client/store.js');
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const call = async (endpoint: string) => ({
    ok: true as const,
    value:
      endpoint === 'humanAttentionStatus'
        ? { unreadCount: 0, hasAction: false }
        : endpoint === 'activityOverview'
          ? { actionCount: 0, bots: [] }
          : { items: [] },
  });
  const local = createStore();
  const actions = createActions(call, local, undefined, storage);
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox', view: 'overview' });
  await actions.openHumanInbox();
  local.select({ kind: 'channel', channelId: 'dm-ada' });
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox' });
  const reloaded = createStore();
  const next = createActions(call, reloaded, undefined, storage);
  await next.openActivityCenter();
  expect(reloaded.getSnapshot().selection).toEqual({ kind: 'inbox' });
  await next.openActivityCenter('overview');
  reloaded.select({ kind: 'bot', slug: 'ada' });
  await next.openActivityCenter();
  expect(reloaded.getSnapshot().selection).toEqual({ kind: 'inbox', view: 'overview' });
});

it('keeps the explicit tab in memory when storage still returns an older tab and rejects writes', async () => {
  const { createStore } = await import('../src/client/store.js');
  const storage = {
    getItem: () => 'inbox',
    setItem: () => {
      throw new Error('storage refused');
    },
  };
  const call = async (endpoint: string) => ({
    ok: true as const,
    value:
      endpoint === 'humanAttentionStatus'
        ? { unreadCount: 0, hasAction: false }
        : endpoint === 'activityOverview'
          ? { actionCount: 0, bots: [] }
          : { items: [] },
  });
  const local = createStore();
  const actions = createActions(call, local, undefined, storage);
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox' });
  await actions.openActivityCenter('overview');
  local.select({ kind: 'channel', channelId: 'dm-ada' });
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox', view: 'overview' });
  await actions.openHumanInbox();
  local.select({ kind: 'bot', slug: 'ada' });
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox' });
});

it('keeps idle Bots with actions visible, pages their own actions and decides without entering Inbox', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let decided = false;
  const queries: unknown[] = [];
  const channel = {
    id: 'team',
    type: 'group',
    name: 'Team',
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
    members: ['ada'],
    invitations: [],
    joinRequests: [],
  };
  const item = (n: number) => ({
    id: 'join:r' + n,
    category: 'action',
    kind: 'group-join-request',
    botSlug: 'ada',
    channelId: 'team',
    channelName: 'Team',
    summary: '',
    requestId: 'r' + n,
    createdAt: '2026-10-02T00:00:00Z',
  });
  const actions = createActions(async (endpoint, args) => {
    if (endpoint === 'activityOverview')
      return {
        ok: true,
        value: {
          actionCount: decided ? 0 : 51,
          bots: [
            {
              slug: 'ada',
              displayName: 'Ada',
              state: 'idle',
              paused: false,
              hasAction: !decided,
              sessions: [],
            },
            {
              slug: 'bea',
              displayName: 'Bea',
              state: 'idle',
              paused: false,
              hasAction: false,
              sessions: [],
            },
          ],
        },
      };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: 0, hasAction: !decided } };
    if (endpoint === 'humanAttention') {
      queries.push(args);
      return {
        ok: true,
        value: decided
          ? { items: [] }
          : args['cursor'] === 'next'
            ? { items: [item(50)] }
            : { items: Array.from({ length: 50 }, (_, i) => item(i)), nextCursor: 'next' },
      };
    }
    if (endpoint === 'channelGroupJoinDecide') {
      decided = true;
      return { ok: true, value: { channel } };
    }
    throw new Error(endpoint);
  }, store);
  store.setHumanInbox({
    category: 'handled',
    botSlug: 'bea',
    channelId: 'elsewhere',
    sort: 'newest',
  });
  store.setRoster([], []);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      await actions.openActivityCenter('overview');
      root.render(createElement(ActivityCenterView, { actions }));
    });
    expect(container.querySelector('[data-bot-id=ada]')).not.toBeNull();
    expect(container.querySelector('[data-bot-id=bea]')).toBeNull();
    expect(container.querySelectorAll('[data-attention-id]')).toHaveLength(50);
    expect(queries).toContainEqual({
      category: 'action',
      limit: 50,
      cursor: undefined,
      botSlug: 'ada',
      channelId: undefined,
      sort: 'oldest',
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.bh-human-inbox-more')!.click(),
    );
    expect(container.querySelectorAll('[data-attention-id]')).toHaveLength(51);
    const decline = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-attention-id="join:r50"] button'),
    ].find((button) => button.textContent === '拒绝')!;
    await act(async () => decline.click());
    expect(decided).toBe(true);
    expect(store.getSnapshot().selection).toEqual({ kind: 'inbox', view: 'overview' });
    expect(store.getSnapshot().overview.value?.actionCount).toBe(0);
    expect(container.querySelectorAll('[data-attention-id]')).toHaveLength(0);
    expect(container.textContent).toContain('所有 Bot 都空闲');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.select(undefined);
  }
});

it('preserves the pending action page when a decision refresh overlaps load more', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let decided = false;
  let decisions = 0;
  let scopedLoads = 0;
  let releaseDecision: (() => void) | undefined;
  const decisionReady = new Promise<void>((resolve) => {
    releaseDecision = resolve;
  });
  let releaseCursor: (() => void) | undefined;
  const cursorReady = new Promise<void>((resolve) => {
    releaseCursor = resolve;
  });
  let cursorCalls = 0;
  const channel = {
    id: 'team',
    type: 'group',
    name: 'Team',
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
    members: ['ada'],
    invitations: [],
    joinRequests: [],
  };
  const item = (n: number) => ({
    id: 'join:r' + n,
    category: 'action',
    kind: 'group-join-request',
    botSlug: 'ada',
    channelId: 'team',
    channelName: 'Team',
    summary: '',
    requestId: 'r' + n,
    createdAt: '2026-10-02T00:00:00Z',
  });
  const actions = createActions(async (endpoint, args) => {
    if (endpoint === 'activityOverview')
      return {
        ok: true,
        value: {
          actionCount: decided ? 99 : 100,
          bots: [
            {
              slug: 'ada',
              displayName: 'Ada',
              state: 'idle',
              paused: false,
              hasAction: true,
              sessions: [],
            },
          ],
        },
      };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: 0, hasAction: true } };
    if (endpoint === 'humanAttention') {
      if (args['botSlug'] === 'ada') scopedLoads++;
      if (args['cursor'] === 'next' && cursorCalls++ === 0) {
        await cursorReady;
        return { ok: true, value: { items: Array.from({ length: 50 }, (_, i) => item(i + 50)) } };
      }
      const start = args['cursor'] === 'next' ? 51 : decided ? 1 : 0;
      const count = args['cursor'] === 'next' && decided ? 49 : 50;
      return {
        ok: true,
        value: {
          items: Array.from({ length: count }, (_, i) => item(i + start)),
          ...(args['cursor'] === 'next' ? {} : { nextCursor: 'next' }),
        },
      };
    }
    if (endpoint === 'channelGroupJoinDecide') {
      if (++decisions === 2) await decisionReady;
      decided = true;
      return { ok: true, value: { channel } };
    }
    throw new Error(endpoint);
  }, store);
  store.setRoster([], []);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      await actions.openActivityCenter('overview');
      root.render(createElement(ActivityCenterView, { actions }));
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('.bh-human-inbox-more')!.click(),
    );
    expect(cursorCalls).toBe(1);
    const decline = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-attention-id="join:r0"] button'),
    ].find((button) => button.textContent === '拒绝')!;
    await act(async () => decline.click());
    expect(decided).toBe(true);
    await act(async () => {
      releaseCursor?.();
      await cursorReady;
    });
    expect(container.querySelectorAll('[data-attention-id]')).toHaveLength(99);
    expect(container.querySelector('[data-attention-id="join:r99"]')).not.toBeNull();
    expect(container.querySelector('[data-attention-id="join:r0"]')).toBeNull();
    const beforeLeaving = scopedLoads;
    const second = [
      ...container.querySelectorAll<HTMLButtonElement>('[data-attention-id="join:r1"] button'),
    ].find((button) => button.textContent === '拒绝')!;
    await act(async () => second.click());
    expect(decisions).toBe(2);
    await act(async () => {
      root.unmount();
      store.select(undefined);
    });
    await act(async () => {
      releaseDecision?.();
      await decisionReady;
    });
    expect(scopedLoads).toBe(beforeLeaving);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.select(undefined);
  }
});

it('offers busy-safe mark all read without resolving actions or navigating away from Overview', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let unread = 12;
  let release: (() => void) | undefined;
  let attempts = 0;
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'activityOverview') return { ok: true, value: { actionCount: 1, bots: [] } };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: unread, hasAction: true } };
    if (endpoint === 'humanAttention') return { ok: true, value: { items: [] } };
    if (endpoint === 'channelMarkAllRead') {
      attempts++;
      await new Promise<void>((done) => {
        release = done;
      });
      unread = 0;
      return { ok: true, value: { channels: 2 } };
    }
    throw new Error(endpoint);
  }, store);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      await actions.openActivityCenter('overview');
      root.render(createElement(ActivityCenterView, { actions }));
    });
    const button = container.querySelector<HTMLButtonElement>('[data-mark-all-read]')!;
    expect(button).not.toBeNull();
    expect(button.querySelector('svg')).not.toBeNull();
    await act(async () => {
      button.click();
      button.click();
    });
    expect(attempts).toBe(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    await act(async () => {
      release?.();
    });
    expect(store.getSnapshot().humanInbox.unreadCount).toBe(0);
    expect(store.getSnapshot().overview.value?.actionCount).toBe(1);
    expect(store.getSnapshot().selection).toEqual({ kind: 'inbox', view: 'overview' });
    expect(button.disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.select(undefined);
  }
});

it('shows a read failure, keeps the action pending, then retries successfully', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let unread = 2;
  let attempts = 0;
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'activityOverview') return { ok: true, value: { actionCount: 1, bots: [] } };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: unread, hasAction: true } };
    if (endpoint === 'humanAttention') return { ok: true, value: { items: [] } };
    if (endpoint === 'channelMarkAllRead') {
      if (++attempts === 1) throw new Error('Storage unavailable');
      unread = 0;
      return { ok: true, value: { channels: 1 } };
    }
    throw new Error(endpoint);
  }, store);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      await actions.openActivityCenter('overview');
      root.render(createElement(ActivityCenterView, { actions }));
    });
    const button = container.querySelector<HTMLButtonElement>('[data-mark-all-read]')!;
    await act(async () => button.click());
    expect(container.querySelector('[role=alert]')?.textContent).toContain('请重试');
    expect(button.disabled).toBe(false);
    expect(store.getSnapshot().humanInbox.hasAction).toBe(true);
    await act(async () => button.click());
    expect(attempts).toBe(2);
    expect(
      [...container.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(''),
    ).not.toContain('无法确认最新已读状态');
    expect(store.getSnapshot().humanInbox.hasAction).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.select(undefined);
  }
});

it('reenables read after it completes while Inbox is visible and a later message arrives', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let unread = 2;
  let release: (() => void) | undefined;
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'activityOverview') return { ok: true, value: { actionCount: 1, bots: [] } };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: unread, hasAction: true } };
    if (endpoint === 'humanAttention') return { ok: true, value: { items: [] } };
    if (endpoint === 'channelMarkAllRead') {
      await new Promise<void>((done) => {
        release = done;
      });
      unread = 0;
      return { ok: true, value: { channels: 1 } };
    }
    throw new Error(endpoint);
  }, store);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      await actions.openActivityCenter('overview');
      root.render(createElement(ActivityCenterView, { actions }));
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-mark-all-read]')!.click(),
    );
    await act(async () => actions.openHumanInbox());
    await act(async () => {
      release?.();
    });
    unread = 1;
    await act(async () => actions.openActivityCenter('overview'));
    expect(container.querySelector<HTMLButtonElement>('[data-mark-all-read]')?.disabled).toBe(
      false,
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.select(undefined);
  }
});

it('reports failed unread reconciliation after a successful read write', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let marked = false;
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'activityOverview') return { ok: true, value: { actionCount: 1, bots: [] } };
    if (endpoint === 'humanAttentionStatus') {
      if (marked) throw new Error('Status query unavailable');
      return { ok: true, value: { unreadCount: 2, hasAction: true } };
    }
    if (endpoint === 'channelMarkAllRead') {
      marked = true;
      return { ok: true, value: { channels: 1 } };
    }
    throw new Error(endpoint);
  }, store);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      await actions.openActivityCenter('overview');
      root.render(createElement(ActivityCenterView, { actions }));
    });
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-mark-all-read]')!.click(),
    );
    expect(
      [...container.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(''),
    ).toContain('无法确认最新已读状态');
    expect(container.querySelector<HTMLButtonElement>('[data-mark-all-read]')?.disabled).toBe(
      false,
    );
    expect(store.getSnapshot().humanInbox.hasAction).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.select(undefined);
  }
});

it('preserves the read write error when status reconciliation also fails', async () => {
  const failure = new Error('Read write refused');
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'channelMarkAllRead') throw failure;
    if (endpoint === 'humanAttentionStatus') throw new Error('Status unavailable');
    throw new Error(endpoint);
  }, store);
  await expect(actions.markAllRead()).rejects.toBe(failure);
});

it('keeps a newer unread query when read reconciliation returns an older snapshot', async () => {
  let release: (() => void) | undefined;
  let queried: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    queried = resolve;
  });
  let statusQueries = 0;
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'channelMarkAllRead') return { ok: true, value: { channels: 1 } };
    if (endpoint === 'humanAttentionStatus') {
      if (++statusQueries === 1) {
        queried?.();
        return new Promise((resolve) => {
          release = () => resolve({ ok: true, value: { unreadCount: 0, hasAction: true } });
        });
      }
      return { ok: true, value: { unreadCount: 1, hasAction: true } };
    }
    throw new Error(endpoint);
  }, store);
  const reading = actions.markAllRead();
  await started;
  await actions.refreshHumanInboxStatus();
  release?.();
  await reading;
  expect(store.getSnapshot().humanInbox.unreadCount).toBe(1);
});

it('runs as a Dock panel beside a Channel without changing the selection', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const calls: string[] = [];
  const item = {
    id: 'join:r1',
    category: 'action',
    kind: 'group-join-request',
    botSlug: 'ada',
    channelId: 'team',
    channelName: 'Team',
    summary: '',
    requestId: 'r1',
    createdAt: '2026-10-02T00:00:00Z',
  };
  const actions = createActions(async (endpoint) => {
    calls.push(endpoint);
    if (endpoint === 'activityOverview')
      return {
        ok: true,
        value: {
          actionCount: 1,
          bots: [
            {
              slug: 'ada',
              displayName: 'Ada',
              state: 'working',
              paused: false,
              hasAction: false,
              sessions: [],
            },
          ],
        },
      };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: 3, hasAction: true } };
    if (endpoint === 'humanAttention') return { ok: true, value: { items: [item] } };
    if (endpoint === 'channelUnreadCounts') return { ok: true, value: { channels: [] } };
    throw new Error(endpoint);
  }, store);
  store.select({ kind: 'channel', channelId: 'dm-ada' });
  await actions.refreshHumanInbox();
  expect(calls).not.toContain('humanAttention');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(createElement(ActivityCenterView, { actions, placement: 'panel' }));
    });
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('.bh-activity-center-panel')).not.toBeNull();
    expect(container.querySelector('[data-bot-id=ada]')).not.toBeNull();
    const inboxTab = [...container.querySelectorAll<HTMLButtonElement>('[role=tab]')][1]!;
    await act(async () => inboxTab.click());
    expect(inboxTab.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-attention-id="join:r1"]')).not.toBeNull();
    expect(store.getSnapshot().selection).toEqual({ kind: 'channel', channelId: 'dm-ada' });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
  const loads = calls.filter((endpoint) => endpoint === 'humanAttention').length;
  await actions.refreshHumanInbox();
  expect(calls.filter((endpoint) => endpoint === 'humanAttention')).toHaveLength(loads);
  store.select(undefined);
});
