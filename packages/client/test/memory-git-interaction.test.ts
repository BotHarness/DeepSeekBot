// @vitest-environment jsdom
import {
  act,
  createElement,
  Fragment,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Toast: stub,
    IconCodeOutlineRegular: () => null,
    HoverCard: ({ anchor }: { anchor: unknown }) => anchor,
    Button: ({
      children,
      variant: _variant,
      size: _size,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: string;
      size?: string;
    }) => createElement('button', props, children),
    IconAgentPresetOutline16: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconInfoOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconBranchOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconChevronDownOutline14: stub,
    IconChevronDownOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutline16: stub,
    IconCopyOutlineRegular: stub,
    IconCloseOutline16: stub,
    IconEllipsisOutline16: stub,
    IconEllipsisOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    IconUserOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    IconFolderOpenOutline16: stub,
    IconNewChatOutline16: stub,
    IconPanelLeftOutline16: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutline16: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutline16: stub,
    IconSendOutline16: stub,
    IconSendOutlineRegular: stub,
    IconTrashOutline16: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
    Menu: ({
      anchor,
      open,
      items = [],
      onSelect,
      children,
    }: {
      anchor: ReactNode;
      open: boolean;
      items?: { id: string; label: string }[];
      onSelect?: (id: string) => void;
      children?: ReactNode;
    }) =>
      createElement(
        'span',
        null,
        anchor,
        open
          ? createElement(
              'div',
              { role: 'menu' },
              ...items.map((item) =>
                createElement(
                  'button',
                  { key: item.id, role: 'menuitem', onClick: () => onSelect?.(item.id) },
                  item.label,
                ),
              ),
              children,
            )
          : null,
      ),
    MenuSurface: ({ children }: { children: ReactNode }) =>
      createElement('div', { role: 'menu' }, children),
    MenuItemButton: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) =>
      createElement('button', { role: 'menuitem', onClick: onSelect }, children),
    MarkdownText: stub,
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: ({ children, label }: { children: ReactNode; label?: ReactNode }) =>
      createElement(
        Fragment,
        null,
        children,
        createElement('span', { hidden: true, 'data-tooltip': '' }, label),
      ),
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import {
  createChannelSidebarRegistry,
  type ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
import { channelSidebarPrefs } from '../src/client/channel-sidebar-prefs.js';
import { setMemoryView } from '../src/client/memory-view-prefs.js';
import { store } from '../src/client/store.js';
import type { MemoryGitGraph } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { MemoryEntry } from '../src/client/memory-entry.js';
import { MemoryFilesEntry } from '../src/client/memory-files-entry.js';
import { MemoryRecovery } from '../src/client/memory-recovery.js';
import { MemoryCommitView } from '../src/client/memory-commit-view.js';
import { inertSubmissionActions } from './inert-submissions.js';

const SHA = 'a'.repeat(40);
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it('requires an explicit confirmation before restoring an older Memory checkpoint', async () => {
  const current = {
    id: '11111111-1111-4111-8111-111111111111',
    branch: 'main',
    head: SHA,
    indexTree: SHA,
    workingTree: SHA,
    origin: 'host-observation' as const,
    originId: 'botharness-host',
    causeKind: 'memory-scan' as const,
    causeId: 'qa',
    capturedAt: '2026-09-30T01:00:00Z',
  };
  const older = {
    ...current,
    id: '22222222-2222-4222-8222-222222222222',
    head: 'b'.repeat(40),
    capturedAt: '2026-09-29T01:00:00Z',
  };
  const actions = {
    memoryRecoveryHistory: vi.fn().mockResolvedValue([current, older]),
    memoryRestore: vi.fn().mockResolvedValue({ checkpoint: older, archivePath: '/backup/memory' }),
    ...inertSubmissionActions,
  } as unknown as BridgeActions;
  const onRestored = vi.fn();
  await act(async () =>
    root.render(
      createElement(MemoryRecovery, {
        actions,
        channelId: 'dm-qa',
        refreshRevision: undefined,
        onRestored,
        t: zhTranslate,
      }),
    ),
  );
  const rows = container.querySelectorAll<HTMLButtonElement>('.bh-memory-recovery-row');
  expect(rows[0]?.textContent).toContain('最新');
  expect(rows[1]?.textContent).toContain('记忆有变化时');
  expect(rows[1]?.textContent).not.toContain('main');
  await act(async () => rows[1]?.click());
  const choose = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '恢复到这时',
  );
  await act(async () => choose?.click());
  expect(actions.memoryRestore).not.toHaveBeenCalled();
  expect(container.textContent).toContain('现在的整个记忆文件夹会先完整复制一份');
  const confirm = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === '恢复',
  );
  await act(async () => confirm?.click());
  expect(actions.memoryRestore).toHaveBeenCalledWith({
    channelId: 'dm-qa',
    checkpointId: older.id,
    expectedCurrentId: current.id,
  });
  expect(onRestored).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('/backup/memory');
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

  it('titles the commit view with its short sha and subject and offers no branch button', async () => {
    const actions = {
      memoryGitCommitDiff: vi.fn().mockResolvedValue({
        sha: SHA,
        subject: 'Remember the launch date',
        files: [{ path: 'history.md', status: 'A' }],
        diff: '',
      }),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    await act(async () => {
      root.render(
        createElement(MemoryCommitView, {
          actions,
          channelId: 'dm-qa',
          sha: SHA,
          onClose: vi.fn(),
          t: zhTranslate,
        }),
      );
    });
    const title = container.querySelector<HTMLElement>('.bh-memory-commit-title');
    expect(title?.textContent).toBe('aaaaaaaRemember the launch date');
    expect(title?.title).toBe(`${SHA}\nRemember the launch date`);
    expect(container.textContent).not.toContain('从这里新建并切换分支');
    expect(container.querySelector('.bh-memory-continue-form')).toBeNull();
  });

  it('branches out from a graph commit through its context menu', async () => {
    const graph: MemoryGitGraph = {
      head: SHA,
      currentBranch: 'main',
      branches: ['main'],
      dirty: false,
      commits: [
        {
          sha: SHA,
          parents: [],
          subject: 'Older memory',
          authoredAt: '2026-09-25T00:00:00Z',
          branches: ['main'],
          status: 'accepted',
        },
      ],
      hasMore: false,
    };
    const actions = {
      memorySnapshot: vi.fn().mockResolvedValue({ head: SHA, files: [], provisional: false }),
      memoryGitGraph: vi.fn().mockResolvedValue(graph),
      send: vi.fn().mockResolvedValue(true),
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
    const row = container.querySelector<HTMLButtonElement>('.bh-memory-graph-row');
    await act(async () => {
      row?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        }),
      );
    });
    expect(
      Array.from(container.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent),
    ).toContain('给这个版本起名');
    const item = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ).find((button) => button.textContent === '从这里新建并切换分支');
    expect(item).not.toBeUndefined();
    await act(async () => item?.click());
    const input = container.querySelector<HTMLInputElement>('#bh-memory-new-branch');
    expect(input?.value).toBe('memory-aaaaaaa');
    expect(
      container
        .querySelector('.bh-memory-continue-form')
        ?.previousElementSibling?.classList.contains('bh-memory-graph-row'),
    ).toBe(true);
    await act(async () => {
      container
        .querySelector<HTMLFormElement>('.bh-memory-continue-form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(actions.send).toHaveBeenCalledWith(expect.stringContaining(SHA));
    expect(actions.send).toHaveBeenCalledWith(expect.stringContaining('memory-aaaaaaa'));
    expect(container.querySelector('.bh-memory-continue-form')).toBeNull();
  });

  it('restores an older graph commit after a confirmation that names what is included, and names versions', async () => {
    const older = 'b'.repeat(40);
    const loaded = 'c'.repeat(40);
    const graph: MemoryGitGraph = {
      head: SHA,
      currentBranch: 'main',
      branches: ['main'],
      dirty: true,
      commits: [
        {
          sha: SHA,
          parents: [older],
          subject: 'Newer memory',
          authoredAt: '2026-09-26T00:00:00Z',
          branches: ['main'],
          status: 'accepted',
        },
        {
          sha: older,
          parents: [],
          subject: 'Older memory',
          authoredAt: '2026-09-25T00:00:00Z',
          branches: [],
          versions: [{ tag: 'first-draft', name: '第一版草稿' }],
          status: 'accepted',
        },
      ],
      hasMore: false,
    };
    const onMemoryCommitSelect = vi.fn();
    let files = ['MEMORY.md', 'draft.md'];
    const actions = {
      memorySnapshot: vi.fn(async () => ({ head: SHA, files, provisional: false })),
      memoryGitGraph: vi.fn().mockResolvedValue(graph),
      memoryFile: vi.fn(async (_channelId: string, path: string) => ({
        path,
        body: '',
        head: SHA,
      })),
      memoryRestoreCommit: vi.fn(async () => {
        files = ['MEMORY.md'];
        return {
          head: loaded,
          backup: 'd'.repeat(40),
          version: { tag: '整理前', name: '整理前' },
          saved: { id: 'saved' },
        };
      }),
      memoryNameVersion: vi.fn().mockResolvedValue({ tag: '周一', name: '周一' }),
      memoryRemoveVersionName: vi.fn().mockResolvedValue(undefined),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    await act(async () => {
      root.render(
        createElement(
          'div',
          null,
          createElement(MemoryFilesEntry, {
            scope: 'personabot',
            channelId: 'dm-qa',
            botSlug: 'qa',
            actions,
            showLimits: false,
            t: zhTranslate,
          }),
          createElement(MemoryEntry, {
            scope: 'personabot',
            channelId: 'dm-qa',
            botSlug: 'qa',
            actions,
            selectedMemoryCommitSha: older,
            onMemoryCommitSelect,
            t: zhTranslate,
          }),
        ),
      );
    });
    expect(container.querySelector('.bh-memory-entry')?.textContent).toContain('draft.md');
    const type = async (input: HTMLInputElement | null, value: string): Promise<void> => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, value);
        input?.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const button = (text: string): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (item) => item.textContent === text || item.getAttribute('aria-label') === text,
      );
    expect(container.querySelector('.bh-memory-version')?.textContent).toBe('第一版草稿');
    await act(async () => button('移除名称「第一版草稿」')?.click());
    expect(actions.memoryRemoveVersionName).toHaveBeenCalledWith({
      channelId: 'dm-qa',
      tag: 'first-draft',
    });
    await act(async () => button('给这个版本起名')?.click());
    await type(
      container.querySelector<HTMLInputElement>('.bh-memory-restore-note input'),
      ' 周一 ',
    );
    await act(async () => button('保存名称')?.click());
    expect(actions.memoryNameVersion).toHaveBeenCalledWith({
      channelId: 'dm-qa',
      sha: older,
      name: '周一',
    });
    const offer = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === '恢复到这次提交',
    );
    expect(container.querySelectorAll('.bh-memory-restore-offer')).toHaveLength(1);
    await act(async () => offer?.click());
    expect(actions.memoryRestoreCommit).not.toHaveBeenCalled();
    expect(container.querySelector('.bh-memory-restore-confirm')?.textContent).toContain(
      '包含这次提交的改动，不包含之后的提交',
    );
    await type(
      container.querySelector<HTMLInputElement>('.bh-memory-restore-note input'),
      ' 整理前 ',
    );
    const submit = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent === '保存改动并恢复',
    );
    await act(async () => submit?.click());
    expect(actions.memoryRestoreCommit).toHaveBeenCalledWith({
      channelId: 'dm-qa',
      sha: older,
      expectedHead: SHA,
      restoreId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      name: '整理前',
    });
    expect(onMemoryCommitSelect).toHaveBeenCalledWith(loaded);
    expect(container.querySelector('.bh-memory-restore-confirm')).toBeNull();
    expect(container.textContent).toContain('已恢复到 bbbbbbb');
    expect(container.textContent).toContain('恢复前的改动已自动存成 ddddddd 这个提交');
    expect(container.textContent).toContain('恢复前的版本已命名为「整理前」');
    expect(container.querySelector('.bh-memory-entry')?.textContent).not.toContain('draft.md');
  });

  it('switches the evolution view to a list of named versions', async () => {
    const older = 'b'.repeat(40);
    const graph: MemoryGitGraph = {
      head: SHA,
      currentBranch: 'main',
      branches: ['main'],
      dirty: false,
      commits: [
        {
          sha: SHA,
          parents: [],
          subject: 'Newer memory',
          authoredAt: '2026-09-26T00:00:00Z',
          branches: ['main'],
          status: 'accepted',
        },
      ],
      hasMore: false,
    };
    const onMemoryCommitSelect = vi.fn();
    const actions = {
      memorySnapshot: vi.fn(async () => ({ head: SHA, files: [], provisional: false })),
      memoryGitGraph: vi.fn().mockResolvedValue(graph),
      memoryVersions: vi.fn().mockResolvedValue([
        {
          tag: 'monday',
          name: '周一',
          sha: older,
          subject: 'Older memory',
          namedAt: '2026-09-25T00:00:00Z',
        },
      ]),
      memoryRestoreCommit: vi.fn().mockResolvedValue({
        head: 'c'.repeat(40),
        backup: null,
        version: null,
        saved: { id: 'saved' },
      }),
      memoryRemoveVersionName: vi.fn().mockResolvedValue(undefined),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const header = createChannelSidebarBuiltins(zhTranslate).find(
      (entry) => entry.id === 'memory-evolution',
    )?.headerTabs;
    const entryProps = {
      scope: 'personabot',
      channelId: 'dm-qa',
      botSlug: 'qa',
      actions,
      onMemoryCommitSelect,
      t: zhTranslate,
    } as unknown as ChannelSidebarEntryProps;
    await act(async () => {
      root.render(
        createElement(
          Fragment,
          null,
          createElement(header!, entryProps),
          createElement(MemoryEntry, entryProps),
        ),
      );
    });
    const button = (text: string): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
        (item) => item.textContent === text,
      );
    expect(container.querySelector('.bh-memory-graph-list')).not.toBeNull();
    const toggle = (label: string): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
        (item) => item.textContent === label,
      );
    expect(toggle('演化')?.getAttribute('aria-selected')).toBe('true');
    await act(async () => toggle('版本')?.click());
    expect(toggle('版本')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('.bh-memory-graph-list')).toBeNull();
    const row = container.querySelector<HTMLButtonElement>('.bh-memory-version-row');
    expect(row?.textContent).toContain('周一');
    expect(row?.textContent).toContain('Older memory');
    await act(async () => row?.click());
    expect(onMemoryCommitSelect).toHaveBeenCalledWith(older);
    await act(async () => button('恢复到这个版本')?.click());
    expect(container.querySelector('.bh-memory-restore-confirm')?.textContent).toContain(
      '包含这次提交的改动',
    );
    await act(async () => button('恢复')?.click());
    expect(actions.memoryRestoreCommit).toHaveBeenCalledWith({
      channelId: 'dm-qa',
      sha: older,
      expectedHead: SHA,
      restoreId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    await act(async () => button('移除名称')?.click());
    expect(actions.memoryRemoveVersionName).toHaveBeenCalledWith({
      channelId: 'dm-qa',
      tag: 'monday',
    });
    await act(async () => toggle('演化')?.click());
    expect(container.querySelector('.bh-memory-graph-list')).not.toBeNull();
  });

  it('groups commit changes into independently collapsible files with graph badges', async () => {
    const actions = {
      memoryGitCommitDiff: vi.fn().mockResolvedValue({
        sha: SHA,
        files: [
          { path: 'profile.md', status: 'M' },
          { path: 'notes/new.md', status: 'A' },
        ],
        diff: [
          'diff --git a/profile.md b/profile.md',
          '@@ -1 +1 @@',
          '-old',
          '+new',
          'diff --git a/notes/new.md b/notes/new.md',
          '@@ -0,0 +1 @@',
          '+added',
        ].join('\n'),
      }),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    await act(async () => {
      root.render(
        createElement(MemoryCommitView, {
          actions,
          channelId: 'dm-qa',
          sha: SHA,
          onClose: vi.fn(),
          t: zhTranslate,
        }),
      );
    });
    const files = container.querySelectorAll<HTMLDetailsElement>('.bh-memory-diff-file');
    expect(files).toHaveLength(2);
    expect(files[0]?.querySelector('summary')?.textContent).toContain('profile.md');
    expect(files[0]?.querySelector('.bh-memory-diff-file-name')?.textContent).toBe('profile.md');
    expect(files[0]?.querySelector('.bh-memory-diff-stat')?.textContent).toBe('+1-1');
    expect(files[1]?.querySelector('.bh-memory-diff-stat')?.textContent).toBe('+1-0');
    expect(files[0]?.querySelector('.bh-memory-change-badge')?.getAttribute('data-status')).toBe(
      'M',
    );
    expect(files[1]?.querySelector('.bh-memory-change-badge')?.getAttribute('data-status')).toBe(
      'A',
    );
    expect(files[0]?.textContent).toContain('-old');
    expect(files[0]?.textContent).not.toContain('+added');
    expect(files[1]?.textContent).toContain('+added');
    expect(files[0]?.textContent).not.toContain('diff --git');
    expect(
      files[0]?.querySelector('.bh-memory-diff-remove')?.querySelectorAll('td')[0]?.textContent,
    ).toBe('1');
    expect(
      files[0]?.querySelector('.bh-memory-diff-remove')?.querySelectorAll('td')[1]?.textContent,
    ).toBe('');
    expect(
      files[0]?.querySelector('.bh-memory-diff-add')?.querySelectorAll('td')[1]?.textContent,
    ).toBe('1');
    expect(
      files[0]
        ?.querySelector('.bh-memory-diff-remove')
        ?.querySelectorAll('td')[0]
        ?.getAttribute('aria-label'),
    ).toBe('旧行 1');
    expect(
      files[0]
        ?.querySelector('.bh-memory-diff-add')
        ?.querySelectorAll('td')[1]
        ?.getAttribute('aria-label'),
    ).toBe('新行 1');
    expect(files[0]?.open).toBe(true);
    await act(async () =>
      files[0]?.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(files[0]?.open).toBe(false);
    expect(files[0]?.querySelector('summary')?.textContent).toContain('+1-1');
    expect(files[1]?.open).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="返回对话"]')).not.toBeNull();
  });

  it('shows a checked-out side branch and opens a commit even when accepted snapshot rejects it', async () => {
    const graph: MemoryGitGraph = {
      head: SHA,
      currentBranch: 'experiment',
      branches: ['experiment'],
      dirty: false,
      commits: [
        {
          sha: SHA,
          parents: [],
          subject: 'Explore old memory',
          authoredAt: '2026-09-25T00:00:00Z',
          branches: ['experiment'],
          status: 'pending',
        },
      ],
      hasMore: false,
    };
    const actions = {
      memorySnapshot: vi.fn().mockRejectedValue(new Error('Memory Repository must be on main')),
      memoryGitGraph: vi.fn().mockResolvedValue(graph),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const onSelect = vi.fn();

    await act(async () => {
      root.render(
        createElement(MemoryEntry, {
          scope: 'personabot',
          channelId: 'dm-qa',
          botSlug: 'qa',
          actions,
          onMemoryCommitSelect: onSelect,
          t: zhTranslate,
        }),
      );
    });

    expect(actions.memoryGitGraph).toHaveBeenCalledWith('dm-qa', 0);
    expect(container.textContent).toContain('experiment');
    expect(container.textContent).toContain('Explore old memory');
    expect(container.textContent).toContain('Git 提交');
    expect(container.textContent).toContain('Memory Repository must be on main');
    const row = container.querySelector<HTMLButtonElement>('.bh-memory-graph-row');
    expect(row).not.toBeNull();
    await act(async () => row?.click());
    expect(onSelect).toHaveBeenCalledWith(SHA);
  });
  it('restores the graph after the snapshot has seeded acceptance', async () => {
    let resolveSnapshot!: (value: { head: string; files: []; provisional: boolean }) => void;
    let seeded = false;
    const snapshot = new Promise<{ head: string; files: []; provisional: boolean }>((resolve) => {
      resolveSnapshot = resolve;
    });
    const actions = {
      memorySnapshot: vi.fn().mockReturnValue(snapshot),
      memoryGitGraph: vi.fn(async () => {
        expect(seeded).toBe(true);
        return {
          head: SHA,
          currentBranch: 'main',
          branches: ['main'],
          dirty: false,
          commits: [
            {
              sha: SHA,
              parents: [],
              subject: 'Seed commit',
              authoredAt: '2026-09-25T00:00:00Z',
              branches: ['main'],
              status: 'accepted',
            },
          ],
          hasMore: false,
        } satisfies MemoryGitGraph;
      }),
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
    expect(actions.memoryGitGraph).not.toHaveBeenCalled();

    await act(async () => {
      seeded = true;
      resolveSnapshot({ head: SHA, files: [], provisional: false });
    });
    expect(actions.memoryGitGraph).toHaveBeenCalledWith('dm-qa', 0);
    expect(container.textContent).toContain('Seed commit');
    expect(container.textContent).toContain('已记录');
  });

  it('sends an explicit branch request and refreshes the graph after Channel activity', async () => {
    const graph = (currentBranch: string): MemoryGitGraph => ({
      head: SHA,
      currentBranch,
      branches: ['history-qa', 'main', 'feature/one', 'feature/two', 'release-1.0'],
      dirty: false,
      commits: [
        {
          sha: SHA,
          parents: [],
          subject: 'Accepted memory',
          authoredAt: '2026-09-25T00:00:00Z',
          branches: [currentBranch],
          status: 'accepted',
        },
      ],
      hasMore: false,
    });
    const actions = {
      memorySnapshot: vi.fn().mockResolvedValue({ head: SHA, files: [], provisional: false }),
      memoryGitGraph: vi
        .fn()
        .mockResolvedValueOnce(graph('main'))
        .mockResolvedValue(graph('history-qa')),
      send: vi.fn().mockResolvedValue(true),
      ...inertSubmissionActions,
    } as unknown as BridgeActions;
    const props = {
      scope: 'personabot' as const,
      channelId: 'dm-qa',
      botSlug: 'qa',
      actions,
      t: zhTranslate,
    };
    await act(async () =>
      root.render(createElement(MemoryEntry, { ...props, conversationRevision: 0 })),
    );
    await act(async () => setMemoryView('branches'));
    const rows = [...container.querySelectorAll<HTMLButtonElement>('.bh-memory-version-row')];
    expect(rows.map((row) => row.querySelector('.bh-memory-version-name')?.textContent)).toEqual([
      'history-qa',
      'main',
      'feature/one',
      'feature/two',
      'release-1.0',
    ]);
    expect(rows[1]?.textContent).toContain('当前');
    await act(async () => rows[1]?.click());
    expect(container.textContent).not.toContain('切换到这个分支');
    await act(async () => rows[0]?.click());
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === '切换到这个分支',
    );
    await act(async () => button?.click());
    expect(actions.send).toHaveBeenCalledWith(
      expect.stringContaining('history-qa'),
      undefined,
      undefined,
      'history-qa',
    );
    expect(container.textContent).toContain('已发送切换请求');
    await act(async () =>
      root.render(createElement(MemoryEntry, { ...props, conversationRevision: 1 })),
    );
    expect(actions.memoryGitGraph).toHaveBeenCalledTimes(2);
    expect(
      [...container.querySelectorAll('.bh-memory-version-row')]
        .find((row) => row.textContent?.includes('当前'))
        ?.querySelector('.bh-memory-version-name')?.textContent,
    ).toBe('history-qa');
    await act(async () => setMemoryView('graph'));
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
    expect(evolution?.querySelector('[role="menu"]')?.textContent).toContain('Git');
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
        .find((item) => item.textContent === 'Git')
        ?.click();
    });
    expect(channelSidebarPrefs.getSnapshot().memoryTerminology).toBe('git');
    expect(evolution?.querySelector('.bh-memory-change-badge')?.textContent).toBe('M');
    await act(async () => {
      if (evolution?.querySelector('[role="menu"]') === null) terminology().click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
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
