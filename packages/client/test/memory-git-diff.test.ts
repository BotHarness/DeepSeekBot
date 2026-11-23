// @vitest-environment jsdom
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { channelSidebarPrefs } from '../src/client/channel-sidebar-prefs.js';
import { store } from '../src/client/store.js';
import type { MemoryGitGraph } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { MemoryFileView, MemoryWorkingView } from '../src/client/memory-current-view.js';
import { MemoryCommitView } from '../src/client/memory-commit-view.js';
import { inertSubmissionActions } from './inert-submissions.js';
import { SHA, container, root, registerMemoryGitHooks } from './memory-git-interaction-helpers.js';

registerMemoryGitHooks();

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const stub = () => null;
  return {
    ...(await import('./primitive-mocks.js')).shellPrimitives(),

    IconAgentPresetOutline16: stub,

    IconChevronDownOutline14: stub,

    IconCloseFill14: stub,
    IconCopyOutline16: stub,

    IconCloseOutline16: stub,
    IconEllipsisOutline16: stub,

    IconFolderOpenOutline16: stub,
    IconNewChatOutline16: stub,
    IconPanelLeftOutline16: stub,

    IconPlusOutline16: stub,

    IconSearchOutline16: stub,
    IconSendOutline16: stub,

    IconTrashOutline16: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,

    MarkdownText: stub,

    StateDot: stub,

    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

describe('Memory Git graph sidebar', () => {
  it('replaces chat and composer with a diff, then restores the draft and original scroll after switching commits', async () => {
    const previous = store.getSnapshot();
    const otherSha = 'b'.repeat(40);
    const graph: MemoryGitGraph = {
      head: SHA,
      currentBranch: 'main',
      branches: ['main'],
      dirty: false,
      commits: [
        {
          sha: SHA,
          parents: [otherSha],
          subject: 'Current memory',
          authoredAt: '2026-09-25T00:00:00Z',
          branches: ['main'],
          status: 'accepted',
        },
        {
          sha: otherSha,
          parents: [],
          subject: 'Older memory',
          authoredAt: '2026-09-24T00:00:00Z',
          branches: [],
          status: 'accepted',
        },
      ],
      hasMore: false,
    };
    const channel = {
      id: 'dm-qa',
      type: 'dm' as const,
      name: 'QA',
      members: ['qa'],
      botSlug: 'qa',
      createdAt: '2026-09-25T00:00:00Z',
      updatedAt: '2026-09-25T00:00:00Z',
    };
    const actions = new Proxy(
      {
        ...inertSubmissionActions,
        listWorkspaceGrants: vi.fn(async () => []),
        memoryFileTarget: vi.fn(async (_slug: string, path: string) => ({
          path: '/host/memory/' + path,
          relativePath: path,
          kind: 'file' as const,
        })),
        memoryFileApplications: vi.fn(async () => ({ available: false, applications: [] })),
        fileOpenPreferences: {
          ready: async () => {},
          get: () => undefined,
          set: () => {},
          clear: () => {},
          subscribe: () => () => {},
        },
        memorySnapshot: vi
          .fn()
          .mockResolvedValue({ head: SHA, files: ['note.md'], provisional: false }),
        memoryFile: vi
          .fn()
          .mockResolvedValue({ path: 'note.md', head: SHA, body: 'Current memory\n' }),
        memoryGitGraph: vi.fn().mockResolvedValue(graph),
        memoryRecoveryHistory: vi.fn().mockResolvedValue([]),
        memoryWorkingChanges: vi
          .fn()
          .mockResolvedValue([{ path: 'note.md', kind: 'unstaged', status: 'M' }]),
        memoryWorkingDiff: vi.fn().mockResolvedValue({
          path: 'note.md',
          kind: 'current',
          status: 'M',
          diff: '@@ -1 +1 @@\n-Before\n+Current memory',
          binary: false,
        }),
        memoryGitCommitDiff: vi.fn(async (_channelId: string, sha: string) => ({
          sha,
          files: [{ path: 'memory.md', status: 'M' }],
          diff: '@@ -0,0 +1 @@\n+Memory at ' + sha.slice(0, 1),
        })),
      },
      {
        get(target, key: string) {
          return Reflect.get(target, key) ?? vi.fn(async () => undefined);
        },
      },
    ) as unknown as BridgeActions;
    const registry = createChannelSidebarRegistry();
    for (const entry of createChannelSidebarBuiltins(zhTranslate)) registry.register(entry);
    channelSidebarPrefs.setEntryExpanded('personabot:qa', 'memory-evolution', true);
    channelSidebarPrefs.setEntryExpanded('personabot:qa', 'memory-files', true);
    await act(async () => {
      store.setComposerIdentity({
        hostId: 'qa-host',
        profileId: 'qa-profile',
        humanId: 'qa-human',
      });
      store.setRoster(
        [
          {
            slug: 'qa',
            displayName: 'QA',
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: '2026-09-25T00:00:00Z',
          },
        ],
        [channel],
      );
      store.select({ kind: 'bot', slug: 'qa' });
      store.setConversation({
        status: 'ready',
        channel,
        messages: [
          {
            id: 'm-1',
            at: '2026-09-25T00:00:00Z',
            author: { kind: 'human' },
            body: 'Earlier chat message',
          },
        ],
        error: undefined,
        sending: false,
      });
      store.setSessions({ status: 'ready', items: [], error: undefined });
      root.render(createElement(BotMain, { actions, channelSidebar: registry }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="tab"][aria-label="记忆演化"]')!.click();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const evolution = Array.from(container.querySelectorAll('[data-sidebar-entry]')).find(
      (section) => section.querySelector('[data-memory-view-tabs]') !== null,
    );
    expect(evolution?.querySelector('[data-panel-label]')?.textContent).toBe('记忆');
    expect(evolution?.querySelector('.bh-memory-graph-heading')).toBeNull();
    expect(evolution?.querySelector('.bh-memory-graph-meta')).toBeNull();
    expect(evolution?.querySelector('.bh-memory-graph-list')).not.toBeNull();
    expect(
      [...(evolution?.querySelectorAll('[role="tab"]') ?? [])].map((tab) => tab.textContent),
    ).toEqual(['演化', '版本', '分支']);
    expect(evolution?.querySelector('.bh-memory-terminology')).toBeNull();
    expect(container.querySelector('.bh-sidebar-settings')).toBeNull();
    const terminology = () =>
      evolution!.querySelector<HTMLButtonElement>('[aria-label="记忆演化视图选项"]')!;
    expect(terminology().getAttribute('aria-haspopup')).toBe('menu');
    await act(async () => {
      terminology().click();
    });
    expect(document.body.querySelector('[role="menu"]')?.textContent).toContain('Git');
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
        .find((item) => item.textContent === 'Git')
        ?.click();
    });
    expect(channelSidebarPrefs.getSnapshot().memoryTerminology).toBe('git');
    expect(evolution?.querySelector('.bh-memory-change-badge')?.textContent).toBe('M');
    await act(async () => {
      if (document.body.querySelector('[role="menu"]') === null) terminology().click();
    });
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
        .find((item) => item.textContent === '记忆')
        ?.click();
    });
    expect(channelSidebarPrefs.getSnapshot().memoryTerminology).toBe('memory');

    const chat = container.querySelector<HTMLElement>('.bh-chat-body');
    const composer = container.querySelector<HTMLTextAreaElement>('textarea');
    expect(chat).not.toBeNull();
    expect(composer).not.toBeNull();
    chat!.scrollTop = 73;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(composer, 'Unsent QA draft');
      composer?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(composer?.value).toBe('Unsent QA draft');

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('.bh-memory-graph-row')[0]?.click();
    });
    expect(container.querySelector('.bh-memory-commit-view')?.textContent).toContain('Memory at a');
    expect(container.querySelector<HTMLElement>('.bh-topbar')?.dataset['memoryDiff']).toBe('true');
    expect(container.querySelector<HTMLElement>('.bh-topbar')?.dataset['channelDetail']).toBe(
      'true',
    );
    expect(chat?.style.display).toBe('none');
    expect(container.querySelector<HTMLElement>('.bh-memory-chat-composer')?.style.display).toBe(
      'none',
    );

    chat!.scrollTop = 0;
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('.bh-memory-graph-row')[1]?.click();
    });
    expect(container.querySelector('.bh-memory-commit-view')?.textContent).toContain('Memory at b');
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.getAttribute('aria-label') === '返回对话')
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(chat?.style.display).not.toBe('none');
    expect(
      container.querySelector<HTMLElement>('.bh-topbar')?.dataset['memoryDiff'],
    ).toBeUndefined();
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Unsent QA draft');
    expect(chat?.scrollTop).toBe(73);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.bh-memory-change-rows .bh-memory-row')?.click();
    });
    expect(actions.memoryWorkingDiff).toHaveBeenCalledWith(channel.id, 'note.md', 'current');
    expect(container.querySelector('.bh-memory-commit-view')?.textContent).toContain(
      '+Current memory',
    );
    expect(chat?.style.display).toBe('none');
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.getAttribute('aria-label') === '返回对话')
        ?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="tab"][aria-label="记忆文件"]')!.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="tree"] [role="treeitem"]')?.click();
    });
    expect(container.querySelector('.bh-memory-commit-view')?.textContent).toContain(
      'Current memory',
    );
    expect(container.querySelector<HTMLElement>('.bh-topbar')?.dataset['channelDetail']).toBe(
      'true',
    );
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.getAttribute('aria-label') === '返回对话')
        ?.click();
    });
    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Unsent QA draft');

    await act(async () => {
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setSessions(previous.sessions);
      channelSidebarPrefs.setEntryExpanded('personabot:qa', 'memory-evolution', false);
      channelSidebarPrefs.setEntryExpanded('personabot:qa', 'memory-files', false);
      channelSidebarPrefs.setMemoryTerminology('memory');
    });
  });
});

for (const view of ['working', 'commit'] as const) {
  it(`defaults ${view} diffs to wrapping and toggles all files without reloading`, async () => {
    const diff = 'diff --git a/note.txt b/note.txt\n@@ -1 +1 @@\n-old\n+' + 'long text '.repeat(80);
    const detail = {
      sha: SHA,
      subject: 'Long lines',
      files: [
        { path: 'note.txt', status: 'M' },
        { path: 'other.txt', status: 'A' },
      ],
      diff: diff + '\ndiff --git a/other.txt b/other.txt\n@@ -0,0 +1 @@\n+second',
    };
    const actions = {
      memoryWorkingDiff: vi
        .fn()
        .mockResolvedValue({ path: 'note.txt', status: 'M', diff, binary: false }),
      memoryGitCommitDiff: vi.fn().mockResolvedValue(detail),
    } as unknown as BridgeActions;
    await act(async () =>
      root.render(
        view === 'commit'
          ? createElement(MemoryCommitView, {
              actions,
              channelId: 'dm-wrap',
              sha: SHA,
              onClose: vi.fn(),
              t: zhTranslate,
            })
          : createElement(MemoryWorkingView, {
              actions,
              channelId: 'dm-wrap',
              change: { path: 'note.txt', kind: 'unstaged', status: 'M' },
              onClose: vi.fn(),
              t: zhTranslate,
            }),
      ),
    );
    const tables = () => [...container.querySelectorAll('.bh-memory-diff-table')];
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="自动换行"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    expect(tables()).toHaveLength(view === 'commit' ? 2 : 1);
    expect(tables().every((table) => table.getAttribute('data-wrap') === 'true')).toBe(true);
    const before = container.querySelector('.bh-memory-diff-content')?.textContent;
    await act(async () => toggle?.click());
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(tables().every((table) => table.getAttribute('data-wrap') === 'false')).toBe(true);
    expect(container.querySelector('.bh-memory-diff-content')?.textContent).toBe(before);
    await act(async () => toggle?.click());
    expect(tables().every((table) => table.getAttribute('data-wrap') === 'true')).toBe(true);
    expect(
      view === 'commit' ? actions.memoryGitCommitDiff : actions.memoryWorkingDiff,
    ).toHaveBeenCalledTimes(1);
  });
}

for (const view of ['file', 'working', 'commit'] as const) {
  it(`reads rendered Markdown with a source toggle in ${view} while diffs default to lines`, async () => {
    const before = {
      source: SHA,
      revision: 'b'.repeat(64),
      status: 'ready',
      body: '# Before\n\n**Old text**',
    };
    const after = {
      source: 'worktree',
      revision: 'c'.repeat(64),
      status: 'ready',
      body: '# After\n\n**New text**',
    };
    const diff = 'diff --git a/note.md b/note.md\n@@ -1 +1 @@\n-# Before\n+# After';
    const actions = {
      memoryFile: vi
        .fn()
        .mockResolvedValue({ path: 'note.md', head: SHA, body: after.body, markdown: after }),
      memoryWorkingDiff: vi.fn().mockResolvedValue({
        path: 'note.md',
        kind: 'current',
        status: 'M',
        diff,
        binary: false,
        markdown: { before, after },
      }),
      memoryGitCommitDiff: vi.fn().mockResolvedValue({
        sha: SHA,
        subject: 'Illustrated note',
        files: [{ path: 'note.md', status: 'M', markdown: { before, after } }],
        diff,
      }),
    } as unknown as BridgeActions;
    const common = {
      actions,
      channelId: 'dm-markdown',
      botSlug: 'atlas',
      onClose: vi.fn(),
      t: zhTranslate,
    };
    await act(async () =>
      root.render(
        view === 'file'
          ? createElement(MemoryFileView, { ...common, path: 'note.md' })
          : view === 'working'
            ? createElement(MemoryWorkingView, {
                ...common,
                change: { path: 'note.md', kind: 'current', status: 'M' },
              })
            : createElement(MemoryCommitView, { ...common, sha: SHA }),
      ),
    );
    const clickText = async (text: string) =>
      act(async () =>
        [...container.querySelectorAll<HTMLButtonElement>('button')]
          .find((b) => b.textContent === text)!
          .click(),
      );
    expect(container.querySelectorAll('.bh-memory-markdown h1')).toHaveLength(
      view === 'file' ? 1 : 0,
    );
    if (view === 'file') {
      await clickText('查看源码');
      expect(container.querySelector('pre')?.textContent).toBe(after.body);
      expect(container.querySelector('.bh-memory-markdown')).toBeNull();
      await clickText('渲染预览');
      expect(container.querySelector('strong')?.textContent).toContain('note.md');
    } else {
      expect(container.querySelector('.bh-memory-diff-table')).not.toBeNull();
      await clickText('渲染预览');
      expect(
        [...container.querySelectorAll('.bh-memory-markdown h1')].map((e) => e.textContent),
      ).toEqual(['Before', 'After']);
      await clickText('逐行对比');
      expect(container.querySelector('.bh-memory-diff-table')).not.toBeNull();
      expect(container.querySelector('.bh-memory-markdown')).toBeNull();
    }
    expect(
      view === 'file'
        ? actions.memoryFile
        : view === 'working'
          ? actions.memoryWorkingDiff
          : actions.memoryGitCommitDiff,
    ).toHaveBeenCalledTimes(1);
  });
}
