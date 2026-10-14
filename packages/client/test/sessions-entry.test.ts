// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Modal: () => null,
  relativeTime: () => ({ unit: 'now', n: 0 }),
  Button: () => null,
  Input: () => null,
  StateDot: () => null,
  Tag: ({ children }: PropsWithChildren) => createElement('span', { className: 'tag' }, children),
  IconChevronDownOutlineRegular: () => null,
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
        assignmentPurpose: 'Ship the release notes',
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
