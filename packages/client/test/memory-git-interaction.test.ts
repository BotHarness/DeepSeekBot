// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { type ChannelSidebarEntryProps } from '../src/client/channel-sidebar.js';
import { setMemoryView } from '../src/client/memory-view-prefs.js';
import type { MemoryGitGraph } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { openTooltip } from './primitive-mocks.js';
import { MemoryEntry } from '../src/client/memory-entry.js';
import { MemoryFilesEntry } from '../src/client/memory-files-entry.js';
import { MemoryRecovery } from '../src/client/memory-recovery.js';
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
      Array.from(document.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent),
    ).toContain('给这个版本起名');
    const item = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(
      (button) => button.textContent === '从这里新建并切换分支',
    );
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
    expect(
      (
        await openTooltip(
          container.querySelector<HTMLElement>('.bh-memory-restore-confirm .bh-im-help')!,
        )
      ).textContent,
    ).toContain('包含这次提交的改动，不包含之后的提交');
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
    const restoreDetails = await openTooltip(
      container.querySelector<HTMLElement>('.bh-memory-restore-done .bh-im-help')!,
    );
    expect(restoreDetails.textContent).toContain('恢复前的改动已自动存成 ddddddd 这个提交');
    expect(restoreDetails.textContent).toContain('恢复前的版本已命名为「整理前」');
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
    expect(
      (
        await openTooltip(
          container.querySelector<HTMLElement>('.bh-memory-restore-confirm .bh-im-help')!,
        )
      ).textContent,
    ).toContain('包含这次提交的改动');
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
});
