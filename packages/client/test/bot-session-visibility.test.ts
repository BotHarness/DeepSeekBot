import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  botSessionVisibilityCss,
  createBotSessionVisibility,
  type SessionListSnapshot,
  type WorkspaceListSnapshot,
} from '../src/client/bot-session-visibility.js';

function observable<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: T) {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

function list(rows: Record<string, { mainView?: number; origin?: string }>): SessionListSnapshot {
  return {
    ids: Object.keys(rows),
    byId: Object.fromEntries(
      Object.entries(rows).map(([id, row]) => [
        id,
        {
          ...(row.origin === undefined ? {} : { origin: row.origin }),
          retainedBy: row.mainView === undefined ? {} : { mainView: row.mainView },
        },
      ]),
    ),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Bot Session visibility', () => {
  it('hides Bot Sessions and groups that hold only them until the Human shows them', async () => {
    const sessions = observable(list({ user: {}, orch: {}, task: {} }));
    const workspaces = observable<WorkspaceListSnapshot | undefined>({
      items: [{ workspaceId: 'project', sessionIds: ['user', 'task'] }],
    });
    const prefs = observable({ showBotSessions: false });
    const visibility = createBotSessionVisibility({
      sessions,
      workspaces,
      prefs,
      loadBotSessionIds: async () => ['orch', 'task'],
    });
    await vi.waitFor(() => expect(visibility.hidden().sessionIds).toHaveLength(2));

    expect(visibility.hidden()).toEqual({ sessionIds: ['orch', 'task'], groupKeys: [''] });
    prefs.set({ showBotSessions: true });
    expect(visibility.hidden()).toEqual({ sessionIds: [], groupKeys: [] });
    visibility.dispose();
  });

  it('keeps the Session open in the main view visible', async () => {
    const sessions = observable(list({ orch: { mainView: 1 } }));
    const visibility = createBotSessionVisibility({
      sessions,
      workspaces: observable<WorkspaceListSnapshot | undefined>(undefined),
      prefs: observable({ showBotSessions: false }),
      loadBotSessionIds: async () => ['orch'],
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(visibility.hidden()).toEqual({ sessionIds: [], groupKeys: [] });
    visibility.dispose();
  });

  it('reloads the Bot Session ids when an unknown Session appears', async () => {
    vi.useFakeTimers();
    const sessions = observable(list({ orch: {} }));
    const loads: string[][] = [['orch'], ['orch', 'next']];
    const loadBotSessionIds = vi.fn(async () => loads.shift() ?? []);
    const visibility = createBotSessionVisibility({
      sessions,
      workspaces: observable<WorkspaceListSnapshot | undefined>(undefined),
      prefs: observable({ showBotSessions: false }),
      loadBotSessionIds,
    });
    await vi.runAllTimersAsync();
    sessions.set(list({ orch: {}, next: {} }));
    await vi.runAllTimersAsync();

    expect(loadBotSessionIds).toHaveBeenCalledTimes(2);
    expect(visibility.hidden().sessionIds).toEqual(['orch', 'next']);
    visibility.dispose();
  });

  it('renders row-key selectors for hidden rows and groups', () => {
    expect(botSessionVisibilityCss({ sessionIds: [], groupKeys: [] })).toBe('');
    expect(botSessionVisibilityCss({ sessionIds: ['a'], groupKeys: [''] })).toBe(
      '[data-row-key="session:a"],\n[data-row-key="workspace:"],\n[data-row-key="overflow:"] {\n  display: none !important;\n}\n',
    );
  });
});
