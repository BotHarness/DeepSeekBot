// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BotSessionFolders,
  mountBotFolderProjection,
  mountNativeBotFolderHost,
  type BotSessionFoldersProps,
} from '../src/client/bot-session-folders.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BotModeIcon } from '../src/bot-mode-settings.js';
import { createStore, type BotSummary } from '../src/client/store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => createElement('svg', { 'aria-hidden': true }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function stub<T>(value: Partial<T>): T {
  return value as T;
}
afterEach(() => document.body.replaceChildren());

function nativeTree() {
  const tree = document.createElement('div');
  tree.setAttribute('role', 'tree');
  for (const id of ['orchestrator', 'assignment', 'ordinary']) {
    const row = document.createElement('div');
    row.dataset['rowKey'] = `session:${id}`;
    row.textContent = id;
    tree.append(row);
  }
  document.body.append(tree);
  return tree;
}

describe('native Bot Session folders', () => {
  it('groups the same Bot across cwd, opens the exact Session, and persists collapse', async () => {
    const tree = nativeTree();
    const originalRow = tree.querySelector('[data-row-key="session:assignment"]');
    const rootNode = document.createElement('div');
    document.body.append(rootNode);
    const root = createRoot(rootNode);
    const openSession = vi.fn();
    const roster = createStore();
    const ada: BotSummary = {
      slug: 'ada',
      displayName: 'Ada',
      avatar: '/avatars/ada.png',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-10-17T00:00:00.000Z',
    };
    roster.setRoster([ada], []);
    let icon: BotModeIcon = 'mascot';
    const values = new Map<string, string>();
    const list = {
      ids: ['orchestrator', 'assignment', 'ordinary', 'review'],
      byId: {
        orchestrator: {
          displayTitle: 'Coordinate',
          cwd: '/memory/ada',
          retainedBy: {},
          running: false,
        },
        assignment: { displayTitle: 'Build', cwd: '/project', retainedBy: {}, running: true },
        ordinary: { displayTitle: 'Ordinary', cwd: '/project', retainedBy: {} },
        review: { displayTitle: 'Review', cwd: '/another-project', retainedBy: {} },
      },
    };
    const groups = [
      { botSlug: 'ada', displayName: 'Ada', sessionIds: ['orchestrator', 'assignment', 'missing'] },
      { botSlug: 'lin', displayName: 'Lin', sessionIds: ['review'] },
    ];
    const source = <T,>(value: T) => ({ getSnapshot: () => value, subscribe: () => () => {} });
    let folderHost: HTMLElement | null = null;
    const projection = mountBotFolderProjection({
      sessions: source(list),
      groups: source(groups),
      workspaces: source({ items: [], archivedSessionIds: [] }),
      prefs: source({ showBotSessions: true, showApprovalReviewSessions: false }),
      setHost: (host) => {
        folderHost = host;
      },
    });
    const props = stub<BotSessionFoldersProps>({
      roster,
      useBotFolderGroups: (select) => select(groups),
      useBotFolderPrefs: (select) => select({ showBotSessions: true, botIcon: icon }),
      useBotFolderHost: (select) => select(folderHost),
      setMounted: (node) => projection.setMounted(node),
      useSessions: (select) => select(list as never),
      useWorkspaces: (select) => select({ items: [], archivedSessionIds: [] } as never),
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
      },
      openSession,
      t: zhTranslate,
    });
    try {
      await act(async () => root.render(createElement(BotSessionFolders, props)));
      const rootHeader = () =>
        tree.querySelector<HTMLButtonElement>('[data-bot-folder-root] > div > [data-panel-head]')!;
      expect(rootHeader().textContent).toBe('DeepSeekBot2');
      expect(rootHeader().querySelector('.bh-bot-icon img')).not.toBeNull();
      expect(rootHeader().querySelector('[data-panel-chevron]')).toBeNull();
      icon = 'bot';
      await act(async () => root.render(createElement(BotSessionFolders, props)));
      expect(rootHeader().querySelector('.bh-bot-icon img')).toBeNull();
      expect(rootHeader().querySelector('.bh-bot-icon svg')).not.toBeNull();
      const botHeader = () =>
        tree.querySelector<HTMLButtonElement>('[data-bot-folder="ada"] [data-panel-head]')!;
      expect(botHeader().querySelector('[data-panel-chevron]')).toBeNull();
      expect(botHeader().querySelector('.bh-persona-avatar img')?.getAttribute('src')).toBe(
        '/avatars/ada.png',
      );
      expect(
        tree.querySelector('[data-bot-folder="lin"] .bh-persona-avatar[data-media="seeded"]'),
      ).not.toBeNull();
      await act(async () => roster.upsertBot({ ...ada, avatar: '/avatars/ada-updated.png' }));
      expect(botHeader().querySelector('.bh-persona-avatar img')?.getAttribute('src')).toBe(
        '/avatars/ada-updated.png',
      );
      expect(tree.querySelectorAll('[data-bot-folder]')).toHaveLength(2);
      expect(tree.querySelectorAll('[data-bot-folder-session]')).toHaveLength(3);
      expect(tree.querySelector('[data-bot-folder="lin"]')?.textContent).toContain('Review');
      expect(tree.querySelector('[data-row-key="session:assignment"]')).toBe(originalRow);
      expect(list.byId.assignment.cwd).toBe('/project');
      await act(async () =>
        tree.querySelector<HTMLButtonElement>('[data-bot-folder-session="assignment"]')!.click(),
      );
      expect(openSession).toHaveBeenCalledExactlyOnceWith('assignment');
      await act(async () =>
        tree.querySelector<HTMLButtonElement>('[data-bot-folder="ada"] [data-panel-head]')!.click(),
      );
      expect(tree.querySelectorAll('[data-bot-folder-session]')).toHaveLength(1);
      await act(async () => rootHeader().click());
      expect(tree.querySelectorAll('[data-bot-folder]')).toHaveLength(0);
      expect(tree.hasAttribute('data-botharness-folder-tree')).toBe(true);
      await act(async () => root.render(null));
      await act(async () => root.render(createElement(BotSessionFolders, props)));
      expect(rootHeader().getAttribute('aria-expanded')).toBe('false');
      await act(async () => rootHeader().click());
      expect(tree.querySelector('[data-bot-folder="ada"]')?.getAttribute('aria-expanded')).toBe(
        'false',
      );
      expect(tree.querySelectorAll('[data-bot-folder-session]')).toHaveLength(1);
    } finally {
      await act(async () => root.unmount());
      projection.dispose();
    }
    expect(tree.querySelector('[data-row-key="session:assignment"]')).toBe(originalRow);
    expect(document.querySelector('[data-plugin-css="bot-session-folders"]')).toBeNull();
    expect(tree.hasAttribute('data-botharness-folder-tree')).toBe(false);
  });

  it('fails open on unsupported markup and releases the host when native trees change', async () => {
    const changed = vi.fn();
    const dispose = mountNativeBotFolderHost(document, changed);
    expect(document.querySelector('[data-botharness-bot-folders]')).toBeNull();
    const first = nativeTree();
    await vi.waitFor(() =>
      expect(first.querySelector('[data-botharness-bot-folders]')).not.toBeNull(),
    );
    first.remove();
    const second = nativeTree();
    await vi.waitFor(() =>
      expect(second.querySelector('[data-botharness-bot-folders]')).not.toBeNull(),
    );
    expect(first.querySelector('[data-botharness-bot-folders]')).toBeNull();
    dispose();
    expect(second.querySelector('[data-botharness-bot-folders]')).toBeNull();
    nativeTree();
    await Promise.resolve();
    expect(document.querySelector('[data-botharness-bot-folders]')).toBeNull();
  });
});
