// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Modal: ({ title, footer, children }: PropsWithChildren<{ title: string; footer: ReactNode }>) =>
    createElement('div', { role: 'dialog' }, title, children, footer),
  relativeTime: () => ({ unit: 'now', n: 0 }),
  Button: ({
    children,
    type,
    form,
    onClick,
  }: PropsWithChildren<{ type?: 'button' | 'submit'; form?: string; onClick?: () => void }>) =>
    createElement('button', { type, form, onClick }, children),
  Checkbox: ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
  }) =>
    createElement(
      'label',
      null,
      createElement('input', {
        type: 'checkbox',
        checked,
        onChange: (event: { target: { checked: boolean } }) => onChange(event.target.checked),
      }),
      label,
    ),
  Input: () => null,
  StateDot: () => null,
  Tag: ({ children }: PropsWithChildren) => createElement('span', { className: 'tag' }, children),
  IconChevronDownOutlineRegular: () => null,
  IconStopFillRegular: () => null,
  Menu: ({ anchor }: { anchor: unknown }) => anchor,
  Tooltip: ({ children }: PropsWithChildren) => children,
}));

import type { BridgeActions } from '../src/client/actions.js';
import type { ChannelSidebarEntryProps } from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
import { SessionsEntry, type NativeSessionCatalog } from '../src/client/sessions-entry.js';
import {
  sessionViewPreferenceSnapshot,
  updateSessionViewPreference,
} from '../src/client/session-view-prefs.js';
import { setSessionTarget } from '../src/client/session-target.js';
import { store } from '../src/client/store.js';

afterEach(() => localStorage.clear());

function catalog(
  byId: Record<string, { displayTitle: string; updatedAt: number; running: boolean }>,
): NativeSessionCatalog {
  const snapshot = { ids: Object.keys(byId), byId };
  return { subscribe: () => () => {}, getSnapshot: () => snapshot };
}

it('pins the Orchestrator on top and groups Assignments by needs input, working, idle and resolved', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().sessions;
  updateSessionViewPreference('sessions-qa', (current) => ({ ...current, scope: 'all' }));
  store.setSessions({
    status: 'ready',
    items: [
      {
        sessionId: 'orc',
        role: 'orchestrator',
        createdAt: '2026-10-01T00:00:00Z',
        triageOpenCount: 3,
      },
      { sessionId: 'a-old', role: 'assignment', createdAt: '2026-10-01T00:00:00Z' },
      { sessionId: 'a-new', role: 'assignment', createdAt: '2026-10-01T00:00:00Z' },
      { sessionId: 'a-run', role: 'assignment', createdAt: '2026-10-01T00:00:00Z' },
      {
        sessionId: 'a-fail',
        role: 'assignment',
        createdAt: '2026-10-01T00:00:00Z',
        assignmentActivity: 'error',
      },
      {
        sessionId: 'a-ask',
        role: 'assignment',
        createdAt: '2026-10-01T00:00:00Z',
        assignmentReportState: 'waiting-human',
      },
      {
        sessionId: 'a-done',
        role: 'assignment',
        createdAt: '2026-10-01T00:00:00Z',
        assignmentArchived: true,
        assignmentTitle: 'Ship the release notes',
      },
    ],
  });
  const native = catalog({
    orc: { displayTitle: 'Main', updatedAt: 1, running: false },
    'a-old': { displayTitle: 'Old idle', updatedAt: 10, running: false },
    'a-new': { displayTitle: 'New idle', updatedAt: 30, running: false },
    'a-run': { displayTitle: 'Running', updatedAt: 20, running: true },
    'a-fail': { displayTitle: 'Failed', updatedAt: 40, running: false },
    'a-ask': { displayTitle: 'Question', updatedAt: 50, running: false },
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const setSessionArchived = vi.fn(async () => undefined);
  const props = {
    scope: 'personabot',
    channelId: 'dm-ada',
    botSlug: 'sessions-qa',
    actions: {
      refreshSessions: vi.fn(async () => undefined),
      setSessionArchived,
    } as unknown as BridgeActions,
    t: zhTranslate,
    nativeSessions: native,
    assignmentLimit: 8,
  } as ChannelSidebarEntryProps & { nativeSessions: NativeSessionCatalog; assignmentLimit: number };
  try {
    await act(async () => root.render(createElement(SessionsEntry, props)));
    await act(async () =>
      root.render(
        createElement(SessionsEntry, {
          ...props,
          nativeSessions: catalog({ ...native.getSnapshot().byId }),
        }),
      ),
    );
    const titles = (scope: ParentNode) =>
      [...scope.querySelectorAll('.bh-card-title')].map((node) => node.textContent);
    const lists = container.querySelectorAll('[data-session-groups] > .bh-card-list');
    expect(lists).toHaveLength(1);
    expect(titles(lists[0]!)).toEqual(['Main']);
    expect(lists[0]!.querySelector('[data-session-orchestrator]')?.getAttribute('aria-label')).toBe(
      'Orchestrator',
    );
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-section]')].map(
        (node) => node.dataset['section'],
      ),
    ).toEqual(['needs-input', 'working', 'idle', 'resolved']);
    const needs = container.querySelector('[data-section="needs-input"]')!;
    const working = container.querySelector('[data-section="working"]')!;
    const idle = container.querySelector('[data-section="idle"]')!;
    const resolved = container.querySelector('[data-section="resolved"]')!;
    expect(titles(needs)).toEqual(['Question', 'Failed']);
    expect(titles(working)).toEqual(['Running']);
    expect(titles(idle)).toEqual(['New idle', 'Old idle']);
    expect(resolved.querySelector('.bh-card-list')).toBeNull();
    expect(working.querySelector('[data-group-count]')?.textContent).toBe('1 / 8');
    expect(container.textContent).not.toContain('Assignment');
    expect(lists[0]!.querySelector('.bh-card-badge')).toBeNull();
    await act(async () =>
      root.render(
        createElement(SessionsEntry, {
          ...props,
          nativeSessions: catalog({
            ...native.getSnapshot().byId,
            orc: { displayTitle: 'Main', updatedAt: 1, running: true },
          }),
        }),
      ),
    );
    expect(
      container.querySelector('[data-session-groups] > .bh-card-list .bh-card-badge')?.textContent,
    ).toBe('整理收件箱 · 3');
    expect(working.querySelector('[data-flip-key="a-run"] .bh-card-badge')).toBeNull();
    expect(working.querySelector('[data-session-archive]')).toBeNull();
    expect(needs.querySelector('[data-flip-key="a-fail"] .bh-card-badge')?.textContent).toBe(
      '出错',
    );
    expect(needs.querySelector('[data-flip-key="a-ask"] .bh-card-badge')?.textContent).toBe(
      '等你回复',
    );
    await act(async () =>
      idle
        .querySelector<HTMLButtonElement>('[data-flip-key="a-new"] [data-session-archive]')!
        .click(),
    );
    expect(setSessionArchived).toHaveBeenCalledWith('sessions-qa', 'a-new', true);
    await act(async () =>
      resolved.querySelector<HTMLButtonElement>('[data-group-heading]')!.click(),
    );
    expect(titles(container.querySelector('[data-section="resolved"]')!)).toEqual([
      'Ship the release notes',
    ]);
    expect(container.querySelector('[data-flip-key="a-done"] .bh-card-badge')).toBeNull();
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-flip-key="a-done"] [data-session-archive]')!
        .click(),
    );
    expect(setSessionArchived).toHaveBeenCalledWith('sessions-qa', 'a-done', false);
    await act(async () => idle.querySelector<HTMLButtonElement>('[data-group-heading]')!.click());
    expect(sessionViewPreferenceSnapshot('sessions-qa').collapsedSections).toEqual(['idle']);
    expect(container.querySelector('[data-section="idle"] .bh-card-list')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setSessions(previous);
  }
});

it('stops a running Orchestrator or Assignment from its row and shows Stopping… until the stop settles', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().sessions;
  updateSessionViewPreference('stop-qa', (current) => ({ ...current, scope: 'all' }));
  store.setSessions({
    status: 'ready',
    items: [
      { sessionId: 'orc', role: 'orchestrator', createdAt: '2026-10-01T00:00:00Z' },
      {
        sessionId: 'a-run',
        role: 'assignment',
        createdAt: '2026-10-01T00:00:00Z',
        assignmentTitle: 'Crawl every page',
      },
      {
        sessionId: 'a-other',
        role: 'assignment',
        createdAt: '2026-10-01T00:00:00Z',
        assignmentTitle: 'Write the summary',
      },
      {
        sessionId: 'a-idle',
        role: 'assignment',
        createdAt: '2026-10-01T00:00:00Z',
        assignmentTitle: 'Quick lookup',
      },
      {
        sessionId: 'a-halting',
        role: 'assignment',
        createdAt: '2026-10-01T00:00:00Z',
        assignmentActivity: 'stopping',
        assignmentTitle: 'Halting',
      },
    ],
  });
  const native = catalog({
    orc: { displayTitle: 'Main', updatedAt: 1, running: true },
    'a-run': { displayTitle: 'Crawl every page', updatedAt: 20, running: true },
    'a-other': { displayTitle: 'Write the summary', updatedAt: 30, running: true },
    'a-idle': { displayTitle: 'Quick lookup', updatedAt: 10, running: false },
    'a-halting': { displayTitle: 'Halting', updatedAt: 5, running: true },
  });
  let settle!: () => void;
  const stopSession = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
  );
  const stopBot = vi.fn(async () => 'stopped' as const);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(SessionsEntry, {
          scope: 'personabot',
          channelId: 'dm-ada',
          botSlug: 'stop-qa',
          actions: {
            refreshSessions: vi.fn(async () => undefined),
            stopSession,
            stopBot,
          } as unknown as BridgeActions,
          t: zhTranslate,
          nativeSessions: native,
        } as ChannelSidebarEntryProps & { nativeSessions: NativeSessionCatalog }),
      ),
    );
    const row = (id: string) => container.querySelector(`[data-flip-key="${id}"]`)!;
    const orchestrator = row('orc').querySelector<HTMLButtonElement>('[data-session-stop]')!;
    expect(orchestrator.disabled).toBe(false);
    expect(orchestrator.getAttribute('aria-label')).toBe('停止「Main」');
    expect(row('a-idle').querySelector('[data-session-stop]')).toBeNull();
    const halting = row('a-halting').querySelector<HTMLButtonElement>('[data-session-stop]')!;
    expect(halting.disabled).toBe(true);
    expect(row('a-halting').querySelector('.bh-card-badge')?.textContent).toBe('正在停止…');

    const button = row('a-run').querySelector<HTMLButtonElement>('[data-session-stop]')!;
    expect(button.getAttribute('aria-label')).toBe('停止「Crawl every page」');
    await act(async () => button.click());
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(stopSession).toHaveBeenCalledWith('stop-qa', 'a-run', 'dm-ada');
    expect(row('a-run').querySelector('.bh-card-badge')?.textContent).toBe('正在停止…');
    expect(row('a-run').querySelector<HTMLButtonElement>('[data-session-stop]')!.disabled).toBe(
      true,
    );
    expect(row('a-other').querySelector('.bh-card-badge')).toBeNull();

    await act(async () => settle());
    expect(row('a-run').querySelector('.bh-card-badge')).toBeNull();

    const dialogButton = (text: string) =>
      [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
        (button) => button.textContent?.trim() === text,
      )!;
    await act(async () => orchestrator.click());
    expect(document.body.textContent).toContain('停止「Main」？');
    expect(document.body.textContent).toContain('同时停止它正在运行的 2 个 Assignment');
    await act(async () => dialogButton('停止').click());
    expect(stopSession).toHaveBeenLastCalledWith('stop-qa', 'orc', 'dm-ada');
    expect(stopBot).not.toHaveBeenCalled();
    await act(async () => settle());

    await act(async () => orchestrator.click());
    const checkbox = document.body.querySelector<HTMLInputElement>(
      '[role="dialog"] input[type="checkbox"]',
    )!;
    expect(checkbox.checked).toBe(false);
    await act(async () => checkbox.click());
    await act(async () => dialogButton('停止').click());
    expect(stopBot).toHaveBeenCalledWith('dm-ada', 'stop-qa');
    expect(stopSession).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setSessions(previous);
  }
});

it('switches a Group from channel assignments to an explicit Bot without changing the conversation or accepting a stale response', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot();
  const channel = {
    id: 'group-scope-qa',
    type: 'group' as const,
    name: 'Scope QA',
    members: ['scope-ada', 'scope-bob'],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  const bots = ['scope-ada', 'scope-bob'].map((slug) => ({
    ...previous.bots[0],
    slug,
    displayName: slug,
  }));
  store.setRoster(bots as typeof previous.bots, [...previous.channels, channel]);
  store.setConversation({ channel });
  let finishAda: ((value: unknown[]) => void) | undefined;
  const actions = {
    channelAssignments: vi.fn(async () => []),
    readSessions: vi.fn((slug: string) =>
      slug === 'scope-ada'
        ? new Promise((resolve) => {
            finishAda = resolve;
          })
        : Promise.resolve([
            { sessionId: 'bob-session', role: 'orchestrator', createdAt: '2026-01-01' },
          ]),
    ),
    openSession: vi.fn(),
  } as unknown as BridgeActions;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const props = {
    channelId: channel.id,
    scope: 'channel' as const,
    botSlug: undefined,
    t: zhTranslate,
    actions,
    nativeSessions: catalog({
      'bob-session': { displayTitle: 'Bob only', updatedAt: 1, running: false },
      'ada-session': { displayTitle: 'Late Ada', updatedAt: 1, running: false },
    }),
  };
  try {
    await act(async () => root.render(createElement(SessionsEntry, props)));
    expect(actions.channelAssignments).toHaveBeenCalledWith(channel.id);
    await act(async () => setSessionTarget(channel.id, 'scope-ada'));
    await act(async () => setSessionTarget(channel.id, 'scope-bob'));
    expect(host.textContent).toContain('Bob only');
    await act(async () =>
      finishAda!([{ sessionId: 'ada-session', role: 'orchestrator', createdAt: '2026-01-01' }]),
    );
    expect(host.textContent).not.toContain('Late Ada');
    expect(store.getSnapshot().conversation.channel?.id).toBe(channel.id);
    await act(async () => host.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
    expect(actions.openSession).toHaveBeenCalledWith('bob-session');
    await act(async () =>
      store.setConversation({ channel: { ...channel, members: ['scope-ada'] } }),
    );
    expect(host.textContent).not.toContain('Bob only');
    expect(JSON.parse(localStorage.getItem('botharness/session-targets.v1')!)[channel.id]).toBe('');
    await act(async () => store.setConversation({ channel }));
    expect(host.textContent).not.toContain('Bob only');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    store.setRoster(previous.bots, previous.channels);
    store.setConversation(previous.conversation);
  }
});

it('lists the Subagents an Orchestrator started under its row, with their model', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().sessions;
  store.setSessions({
    status: 'ready',
    items: [
      {
        sessionId: 'orc',
        role: 'orchestrator',
        createdAt: '2026-10-01T00:00:00Z',
        subagentCount: 1,
        modelRoute: { provider: 'deepseek', model: 'deepseek-v4-pro', reasoningEffort: 'high' },
      },
      {
        sessionId: 'a-1',
        role: 'assignment',
        createdAt: '2026-10-01T00:00:00Z',
        modelRoute: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
      },
    ],
  });
  const sessionSubagents = vi.fn(async () => ({
    omitted: 0,
    subagents: [
      {
        sessionId: 'orc-sub',
        index: 1,
        title: 'Summarize the thread',
        route: { provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: 'medium' },
        state: 'running' as const,
        toolCount: 1,
      },
    ],
  }));
  const openSession = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(SessionsEntry, {
          scope: 'personabot',
          channelId: 'dm-ada',
          botSlug: 'subagent-qa',
          actions: {
            refreshSessions: vi.fn(async () => undefined),
            sessionSubagents,
            openSession,
          } as unknown as BridgeActions,
          t: zhTranslate,
          nativeSessions: catalog({
            orc: { displayTitle: 'Main', updatedAt: 1, running: true },
            'a-1': { displayTitle: 'Build', updatedAt: 2, running: false },
            'orc-sub': { displayTitle: 'Summarize the thread', updatedAt: 3, running: true },
          }),
        } as ChannelSidebarEntryProps & { nativeSessions: NativeSessionCatalog }),
      ),
    );
    const toggles = container.querySelectorAll<HTMLButtonElement>(
      '[data-session-subagents-toggle]',
    );
    expect(toggles).toHaveLength(1);
    const work = [...container.querySelectorAll('[data-assignment-work-open]')];
    expect(work.map((button) => button.getAttribute('aria-label'))).toEqual([
      zhTranslate('assignmentWork.open', { title: 'Build' }),
    ]);
    expect(container.textContent).toContain('deepseek/deepseek-v4-pro · high');
    expect(container.textContent).toContain('opencode-go/deepseek-v4.1-flash');
    expect(sessionSubagents).not.toHaveBeenCalled();
    await act(async () => toggles[0]!.click());
    expect(sessionSubagents).toHaveBeenCalledWith('subagent-qa', 'orc');
    const list = container.querySelector('[data-session-subagents="orc"]')!;
    expect(list.textContent).toContain('Summarize the thread');
    expect(list.textContent).toContain('deepseek/deepseek-v4 · medium');
    await act(async () => list.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
    expect(openSession).toHaveBeenCalledWith('orc-sub');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setSessions(previous);
  }
});
