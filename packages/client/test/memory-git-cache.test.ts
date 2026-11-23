// @vitest-environment jsdom
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import type { MemoryGitGraph } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { MemoryEntry } from '../src/client/memory-entry.js';
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
  it('shows cached Memory and graph immediately on a return visit', async () => {
    const graph: MemoryGitGraph = {
      head: SHA,
      currentBranch: 'main',
      branches: ['main'],
      dirty: false,
      commits: [
        {
          sha: SHA,
          parents: [],
          subject: 'Cached memory',
          authoredAt: '2026-09-25T00:00:00Z',
          branches: ['main'],
          status: 'accepted',
        },
      ],
      hasMore: false,
    };
    const actions = {
      memorySnapshot: vi
        .fn()
        .mockResolvedValueOnce({ head: SHA, files: [], provisional: false })
        .mockImplementation(() => new Promise<never>(() => undefined)),
      memoryGitGraph: vi.fn().mockResolvedValue(graph),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-qa',
      botSlug: 'qa',
      actions,
      t: zhTranslate,
    };
    await act(async () => root.render(createElement(MemoryEntry, props)));
    expect(container.textContent).toContain('Cached memory');
    act(() => root.render(null));
    act(() => root.render(createElement(MemoryEntry, props)));
    expect(container.textContent).toContain('Cached memory');
    expect(container.querySelector('.bh-skeleton')).toBeNull();
  });

  it('keeps cached Memory evolution and working files visible on a return visit', async () => {
    const graph: MemoryGitGraph = {
      head: SHA,
      currentBranch: 'main',
      branches: ['main'],
      dirty: true,
      commits: [
        {
          sha: SHA,
          parents: [],
          subject: 'Current memory',
          authoredAt: '2026-09-25T00:00:00Z',
          branches: ['main'],
          status: 'accepted',
        },
      ],
      hasMore: false,
    };
    const pending = new Promise<never>(() => undefined);
    const actions = {
      memoryGitGraph: vi.fn().mockResolvedValueOnce(graph).mockReturnValue(pending),
      memoryRecoveryHistory: vi.fn().mockResolvedValue([]),
      memoryWorkingChanges: vi
        .fn()
        .mockResolvedValueOnce([{ path: 'note.md', kind: 'unstaged', status: 'M' }])
        .mockReturnValue(pending),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-evolution-cache',
      botSlug: 'qa',
      actions,
      showFiles: false,
      t: zhTranslate,
    };
    await act(async () => root.render(createElement(MemoryEntry, props)));
    expect(container.textContent).toContain('Current memory');
    expect(container.textContent).toContain('note.md');
    act(() => root.render(null));
    act(() => root.render(createElement(MemoryEntry, props)));
    expect(container.textContent).toContain('Current memory');
    expect(container.textContent).toContain('note.md');
    expect(container.querySelector('.bh-skeleton')).toBeNull();
  });

  it('preserves a Memory draft typed while a cached file refreshes', async () => {
    let resolveFile!: (value: { path: string; body: string; head: string }) => void;
    const pendingFile = new Promise<{ path: string; body: string; head: string }>((resolve) => {
      resolveFile = resolve;
    });
    const actions = {
      memorySnapshot: vi.fn().mockResolvedValue({
        head: SHA,
        files: ['notes.md'],
        provisional: false,
      }),
      memoryGitGraph: vi.fn().mockResolvedValue({
        head: SHA,
        currentBranch: 'main',
        branches: ['main'],
        dirty: false,
        commits: [],
        hasMore: false,
      }),
      memoryFile: vi
        .fn()
        .mockResolvedValueOnce({ path: 'notes.md', body: 'Original', head: SHA })
        .mockReturnValueOnce(pendingFile),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-draft',
      botSlug: 'qa',
      actions,
      t: zhTranslate,
    };
    await act(async () => root.render(createElement(MemoryEntry, props)));
    act(() => root.render(null));
    act(() => root.render(createElement(MemoryEntry, props)));
    const editor = container.querySelector<HTMLTextAreaElement>('#bh-memory-editor-body');
    expect(editor?.value).toBe('Original');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(editor, 'Unsent edit');
      editor?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => resolveFile({ path: 'notes.md', body: 'Refreshed', head: SHA }));
    expect(editor?.value).toBe('Unsent edit');
  });

  it('shows refresh errors alongside cached Memory and graph data', async () => {
    const actions = {
      memorySnapshot: vi
        .fn()
        .mockResolvedValueOnce({ head: SHA, files: [], provisional: false })
        .mockRejectedValueOnce(new Error('Snapshot refresh failed')),
      memoryGitGraph: vi
        .fn()
        .mockResolvedValueOnce({
          head: SHA,
          currentBranch: 'main',
          branches: ['main'],
          dirty: false,
          commits: [],
          hasMore: false,
        })
        .mockRejectedValueOnce(new Error('Graph refresh failed')),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-errors',
      botSlug: 'qa',
      actions,
      t: zhTranslate,
    };
    await act(async () => root.render(createElement(MemoryEntry, props)));
    act(() => root.render(null));
    await act(async () => root.render(createElement(MemoryEntry, props)));
    const reasons = [...container.querySelectorAll('[role=alert]')].map((node) =>
      node.getAttribute('title'),
    );
    expect(reasons).toContain('Snapshot refresh failed');
    expect(reasons).toContain('Graph refresh failed');
    expect(container.textContent).toContain('更新失败');
    expect(container.querySelector('.bh-memory-retry')).not.toBeNull();
    expect(container.querySelector('.bh-memory-graph-list')).not.toBeNull();
  });

  it('ignores a pre-repair Memory response after clearing the cache', async () => {
    const provisional = { head: SHA, files: [], provisional: true };
    let resolveStale!: (value: typeof provisional) => void;
    const stale = new Promise<typeof provisional>((resolve) => {
      resolveStale = resolve;
    });
    const pending = new Promise<never>(() => undefined);
    const actions = {
      memorySnapshot: vi
        .fn()
        .mockResolvedValueOnce(provisional)
        .mockReturnValueOnce(stale)
        .mockReturnValue(pending),
      memoryGitGraph: vi.fn().mockResolvedValue({
        head: SHA,
        currentBranch: 'main',
        branches: ['main'],
        dirty: false,
        commits: [],
        hasMore: false,
      }),
      memoryRepair: vi.fn().mockResolvedValue({ backupPath: 'backup' }),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-repair',
      botSlug: 'qa',
      actions,
      t: zhTranslate,
    };
    await act(async () => root.render(createElement(MemoryEntry, props)));
    act(() => root.render(null));
    act(() => root.render(createElement(MemoryEntry, props)));
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.trim() === '修复记忆')
        ?.click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.trim() === '备份并恢复')
        ?.click();
    });
    expect(actions.memoryRepair).toHaveBeenCalledOnce();
    await act(async () => resolveStale(provisional));
    act(() => root.render(null));
    act(() => root.render(createElement(MemoryEntry, props)));
    expect(container.querySelector('.bh-skeleton')).not.toBeNull();
    expect(container.textContent).not.toContain('修复记忆');
  });

  it('keeps the saved file head when an older file read finishes', async () => {
    const savedHead = 'b'.repeat(40);
    let resolveStale!: (value: { path: string; body: string; head: string }) => void;
    const stale = new Promise<{ path: string; body: string; head: string }>((resolve) => {
      resolveStale = resolve;
    });
    const pending = new Promise<never>(() => undefined);
    const actions = {
      memorySnapshot: vi.fn().mockResolvedValue({
        head: SHA,
        files: ['notes.md'],
        provisional: false,
      }),
      memoryGitGraph: vi.fn().mockResolvedValue({
        head: SHA,
        currentBranch: 'main',
        branches: ['main'],
        dirty: false,
        commits: [],
        hasMore: false,
      }),
      memoryFile: vi
        .fn()
        .mockResolvedValueOnce({ path: 'notes.md', body: 'Original', head: SHA })
        .mockReturnValueOnce(stale)
        .mockReturnValue(pending),
      memorySave: vi
        .fn()
        .mockResolvedValueOnce({ sha: savedHead })
        .mockResolvedValue({ sha: 'c'.repeat(40) }),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-save',
      botSlug: 'qa',
      actions,
      t: zhTranslate,
    };
    await act(async () => root.render(createElement(MemoryEntry, props)));
    act(() => root.render(null));
    act(() => root.render(createElement(MemoryEntry, props)));
    const edit = async (value: string): Promise<void> => {
      const editor = container.querySelector<HTMLTextAreaElement>('#bh-memory-editor-body');
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(editor, value);
        editor?.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const save = async (): Promise<void> => {
      await act(async () => {
        Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
          .find((button) => button.textContent?.trim() === '保存')
          ?.click();
      });
    };
    await edit('First edit');
    await save();
    await act(async () => resolveStale({ path: 'notes.md', body: 'Original', head: SHA }));
    await edit('Second edit');
    await save();
    expect(actions.memorySave).toHaveBeenCalledTimes(2);
    expect(actions.memorySave).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedHead: savedHead }),
    );
  });

  it('shows a graph query failure instead of a permanent loading indicator', async () => {
    const actions = {
      memorySnapshot: vi.fn().mockResolvedValue({ head: SHA, files: [], provisional: false }),
      memoryGitGraph: vi.fn().mockRejectedValue(new Error('Unknown Memory Git commit')),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    await act(async () => {
      root.render(
        createElement(MemoryEntry, {
          scope: 'personabot',
          channelId: 'dm-qa',
          botSlug: 'qa',
          actions,
          t: zhTranslate,
        }),
      );
    });
    expect(container.querySelector('.bh-memory-history [role="alert"]')?.textContent).toContain(
      'Unknown Memory Git commit',
    );
    expect(container.querySelector('.bh-memory-history .bh-skeleton')).toBeNull();
  });
});
