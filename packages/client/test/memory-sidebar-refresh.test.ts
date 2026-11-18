// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import type { BridgeActions } from '../src/client/actions.js';
import type { MemoryGitGraph, MemorySnapshot, MemoryWorkingChange } from '../src/client/bridge.js';
import { MemoryFilesEntry } from '../src/client/memory-files-entry.js';
import { MemoryEntry } from '../src/client/memory-entry.js';
import { zhTranslate } from '../src/client/locale.js';
const SHA = 'a'.repeat(40);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const snapshot = (...files: string[]): MemorySnapshot => ({
  head: SHA,
  files,
  provisional: false,
  standing: [],
});
const graph = (subject = 'Retained history'): MemoryGitGraph => ({
  head: SHA,
  currentBranch: 'main',
  branches: ['main'],
  dirty: false,
  commits: [
    {
      sha: SHA,
      parents: [],
      subject,
      authoredAt: '2026-09-25T00:00:00Z',
      branches: ['main'],
      status: 'accepted',
    },
  ],
  hasMore: false,
});
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function props(actions: Partial<BridgeActions>, channelId = 'dm-a', conversationRevision = 0) {
  return {
    scope: 'personabot' as const,
    channelId,
    botSlug: channelId,
    actions: actions as BridgeActions,
    t: zhTranslate,
    conversationRevision,
  };
}
async function renderFiles(actions: Partial<BridgeActions>, channelId = 'dm-a', revision = 0) {
  await act(async () =>
    root.render(createElement(MemoryFilesEntry, props(actions, channelId, revision))),
  );
}
function retry() {
  const button = container.querySelector<HTMLButtonElement>('.bh-memory-retry');
  expect(button).not.toBeNull();
  return button!;
}
describe('Memory sidebar retained scoped reads', () => {
  it('uses a skeleton before first success and preserves a successful empty result through refresh', async () => {
    const first = deferred<MemorySnapshot>();
    const second = deferred<MemorySnapshot>();
    const actions = {
      memorySnapshot: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    };
    await renderFiles(actions);
    expect(container.querySelector('.bh-skeleton')).not.toBeNull();
    await act(async () => first.resolve(snapshot()));
    expect(container.textContent).toContain('还没有记忆文件');
    await renderFiles(actions, 'dm-a', 1);
    expect(container.querySelector('.bh-skeleton')).toBeNull();
    expect(container.textContent).toContain('还没有记忆文件');
    await act(async () => second.resolve(snapshot('fresh.md')));
    expect(container.textContent).toContain('fresh.md');
    expect(container.textContent).not.toContain('还没有记忆文件');
  });
  it('retains file paths while an unmounted entry reopens and replaces them after the next result', async () => {
    const next = deferred<MemorySnapshot>();
    const actions = {
      memorySnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot('old.md'))
        .mockReturnValueOnce(next.promise),
    };
    await renderFiles(actions);
    await act(async () => root.render(null));
    await renderFiles(actions);
    expect(container.textContent).toContain('old.md');
    expect(container.querySelector('.bh-skeleton')).toBeNull();
    await act(async () => next.resolve(snapshot('new.md')));
    expect(container.textContent).toContain('new.md');
    expect(container.textContent).not.toContain('old.md');
  });
  it('shows an initial error with Retry and keeps it while retry is pending until recovery', async () => {
    const recover = deferred<MemorySnapshot>();
    const actions = {
      memorySnapshot: vi
        .fn()
        .mockRejectedValueOnce(Error('Read refused'))
        .mockReturnValueOnce(recover.promise),
    };
    await renderFiles(actions);
    expect(container.textContent).toContain('加载失败: Read refused');
    expect(container.querySelector('.bh-skeleton')).toBeNull();
    await act(async () => retry().click());
    expect(retry().disabled).toBe(true);
    expect(container.textContent).toContain('Read refused');
    expect(actions.memorySnapshot).toHaveBeenLastCalledWith('dm-a');
    await act(async () => recover.resolve(snapshot()));
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(container.textContent).toContain('还没有记忆文件');
  });
  it('retains cached files and background failure feedback through reopen and retry recovery', async () => {
    const recover = deferred<MemorySnapshot>();
    const actions = {
      memorySnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot('readable.md'))
        .mockRejectedValueOnce(Error('Offline'))
        .mockReturnValueOnce(recover.promise),
    };
    await renderFiles(actions);
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(container.textContent).toContain('readable.md');
    expect(container.textContent).toContain('更新失败');
    expect(container.querySelector('[role=alert]')?.getAttribute('title')).toBe('Offline');
    await act(async () => root.render(null));
    await renderFiles(actions);
    expect(container.textContent).toContain('readable.md');
    expect(container.textContent).toContain('更新失败');
    expect(retry().disabled).toBe(true);
    await act(async () => recover.resolve(snapshot('recovered.md')));
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(container.textContent).toContain('recovered.md');
  });
  it('isolates channel changes and refuses a late response from the previously selected scope', async () => {
    const a = deferred<MemorySnapshot>();
    const b = deferred<MemorySnapshot>();
    const actions = {
      memorySnapshot: vi.fn((id: string) => (id === 'dm-a' ? a.promise : b.promise)),
    };
    await renderFiles(actions);
    await renderFiles(actions, 'dm-b');
    await act(async () => a.resolve(snapshot('private-a.md')));
    expect(container.textContent).not.toContain('private-a.md');
    expect(container.querySelector('.bh-skeleton')).not.toBeNull();
    await act(async () => b.resolve(snapshot('only-b.md')));
    expect(container.textContent).toContain('only-b.md');
    expect(actions.memorySnapshot).toHaveBeenLastCalledWith('dm-b');
  });
  it('isolates replacement action owners even when the Channel id is unchanged', async () => {
    const next = deferred<MemorySnapshot>();
    await renderFiles({ memorySnapshot: vi.fn().mockResolvedValue(snapshot('previous-owner.md')) });
    await renderFiles({ memorySnapshot: vi.fn().mockReturnValue(next.promise) });
    expect(container.textContent).not.toContain('previous-owner.md');
    expect(container.querySelector('.bh-skeleton')).not.toBeNull();
    await act(async () => next.resolve(snapshot('current-owner.md')));
    expect(container.textContent).toContain('current-owner.md');
  });
  it('returns to the correct prior cache without accepting another scope’s delayed update', async () => {
    const b = deferred<MemorySnapshot>();
    const aNext = deferred<MemorySnapshot>();
    const actions = {
      memorySnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot('cached-a.md'))
        .mockReturnValueOnce(b.promise)
        .mockReturnValueOnce(aNext.promise),
    };
    await renderFiles(actions);
    await renderFiles(actions, 'dm-b');
    expect(container.textContent).not.toContain('cached-a.md');
    await renderFiles(actions, 'dm-a');
    expect(container.textContent).toContain('cached-a.md');
    await act(async () => b.resolve(snapshot('late-b.md')));
    expect(container.textContent).not.toContain('late-b.md');
    await act(async () => aNext.resolve(snapshot('fresh-a.md')));
    expect(container.textContent).toContain('fresh-a.md');
  });
  it('keeps polling and foreground triggers without duplicate reads or loading replacement', async () => {
    vi.useFakeTimers();
    const next = deferred<MemorySnapshot>();
    const actions = {
      memorySnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot('visible.md'))
        .mockReturnValue(next.promise),
    };
    await renderFiles(actions);
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(actions.memorySnapshot).toHaveBeenCalledTimes(2);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(actions.memorySnapshot).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('visible.md');
    expect(container.querySelector('.bh-skeleton')).toBeNull();
    await act(async () => next.resolve(snapshot('polled.md')));
    expect(container.textContent).toContain('polled.md');
  });
  it('retains evolution and working changes after reopening and retries failed updates together', async () => {
    const graphFailure = deferred<MemoryGitGraph>();
    const workFailure = deferred<MemoryWorkingChange[]>();
    const graphRecovery = deferred<MemoryGitGraph>();
    const workRecovery = deferred<MemoryWorkingChange[]>();
    const actions = {
      memoryRecoveryHistory: vi.fn().mockResolvedValue([]),
      memoryGitGraph: vi
        .fn()
        .mockResolvedValueOnce(graph())
        .mockReturnValueOnce(graphFailure.promise)
        .mockReturnValueOnce(graphRecovery.promise),
      memoryWorkingChanges: vi
        .fn()
        .mockResolvedValueOnce([{ path: 'working.md', kind: 'untracked', status: '?' }])
        .mockReturnValueOnce(workFailure.promise)
        .mockReturnValueOnce(workRecovery.promise),
    } as unknown as BridgeActions;
    const render = async () =>
      act(async () =>
        root.render(createElement(MemoryEntry, { ...props(actions), showFiles: false })),
      );
    await render();
    await act(async () => root.render(null));
    await render();
    expect(container.textContent).toContain('Retained history');
    expect(container.textContent).toContain('working.md');
    expect(container.querySelector('.bh-skeleton')).toBeNull();
    await act(async () => {
      graphFailure.reject(Error('Graph offline'));
      workFailure.reject(Error('Working offline'));
    });
    expect(container.querySelectorAll('[role=alert]')).toHaveLength(2);
    await act(async () => retry().click());
    expect(container.textContent).toContain('Retained history');
    expect(container.textContent).toContain('working.md');
    expect(retry().disabled).toBe(true);
    await act(async () => {
      graphRecovery.resolve(graph('Fresh history'));
      workRecovery.resolve([]);
    });
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(container.textContent).toContain('Fresh history');
    expect(container.textContent).not.toContain('working.md');
    expect(container.querySelector('.bh-skeleton')).toBeNull();
  });
  it('treats the first working-change failure as an error rather than successful empty content', async () => {
    const recover = deferred<MemoryWorkingChange[]>();
    const actions = {
      memoryRecoveryHistory: vi.fn().mockResolvedValue([]),
      memoryGitGraph: vi.fn().mockResolvedValue(graph()),
      memoryWorkingChanges: vi
        .fn()
        .mockRejectedValueOnce(Error('Working read refused'))
        .mockReturnValueOnce(recover.promise),
    } as unknown as BridgeActions;
    await act(async () =>
      root.render(createElement(MemoryEntry, { ...props(actions), showFiles: false })),
    );
    expect(container.textContent).toContain('加载失败: Working read refused');
    expect(container.querySelector('.bh-memory-working-list')).toBeNull();
    expect(container.querySelector('.bh-skeleton')).toBeNull();
    await act(async () => retry().click());
    await act(async () => recover.resolve([]));
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(container.querySelector('.bh-memory-working-list')).not.toBeNull();
  });
});
