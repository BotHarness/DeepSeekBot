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

it('pins the Orchestrator on top and splits Assignments into Working and Idle, newest first', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().sessions;
  updateSessionViewPreference('sessions-qa', (current) => ({ ...current, scope: 'all' }));
  store.setSessions({
    status: 'ready',
    items: [
      { sessionId: 'orc', role: 'orchestrator', createdAt: '2026-10-01T00:00:00Z' },
      { sessionId: 'a-old', role: 'assignment', createdAt: '2026-10-01T00:00:00Z' },
      { sessionId: 'a-new', role: 'assignment', createdAt: '2026-10-01T00:00:00Z' },
      { sessionId: 'a-run', role: 'assignment', createdAt: '2026-10-01T00:00:00Z' },
      {
        sessionId: 'a-fail',
        role: 'assignment',
        createdAt: '2026-10-01T00:00:00Z',
        assignmentActivity: 'error',
      },
    ],
  });
  const native = catalog({
    orc: { displayTitle: 'Main', updatedAt: 1, running: false },
    'a-old': { displayTitle: 'Old idle', updatedAt: 10, running: false },
    'a-new': { displayTitle: 'New idle', updatedAt: 30, running: false },
    'a-run': { displayTitle: 'Running', updatedAt: 20, running: true },
    'a-fail': { displayTitle: 'Failed', updatedAt: 40, running: false },
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const props = {
    scope: 'personabot',
    channelId: 'dm-ada',
    botSlug: 'sessions-qa',
    actions: { refreshSessions: vi.fn(async () => undefined) } as unknown as BridgeActions,
    t: zhTranslate,
    nativeSessions: native,
  } as ChannelSidebarEntryProps & { nativeSessions: NativeSessionCatalog };
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
    const lists = container.querySelectorAll('.bh-sessions-groups > .bh-card-list');
    expect(lists).toHaveLength(1);
    expect(titles(lists[0]!)).toEqual(['Main']);
    expect(lists[0]!.querySelector('.bh-session-orchestrator')?.getAttribute('aria-label')).toBe(
      'Orchestrator',
    );
    const working = container.querySelector('[data-section="working"]')!;
    const idle = container.querySelector('[data-section="idle"]')!;
    expect(titles(working)).toEqual(['Failed', 'Running']);
    expect(titles(idle)).toEqual(['New idle', 'Old idle']);
    expect(container.textContent).not.toContain('Assignment');
    expect(working.querySelector('[data-flip-key="a-run"] .bh-card-badge')).toBeNull();
    expect(working.querySelector('[data-flip-key="a-fail"] .bh-card-badge')?.textContent).toBe(
      '需要关注',
    );
    await act(async () =>
      idle.querySelector<HTMLButtonElement>('.bh-session-workspace-heading')!.click(),
    );
    expect(sessionViewPreferenceSnapshot('sessions-qa').collapsedSections).toEqual(['idle']);
    expect(container.querySelector('[data-section="idle"] .bh-card-list')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setSessions(previous);
  }
});
