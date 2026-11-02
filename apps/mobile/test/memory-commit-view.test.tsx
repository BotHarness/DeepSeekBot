// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  ChevronRightIcon: () => null,
}));

import { splitUnifiedDiff, type MemoryCommit } from '../src/host/memory-changes';
import { MemoryCommitView } from '../src/ui/chat/memory-changes';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const diff = splitUnifiedDiff(
  [
    'diff --git a/notes/MEMORY.md b/notes/MEMORY.md',
    '--- a/notes/MEMORY.md',
    '+++ b/notes/MEMORY.md',
    '@@ -4,2 +4,2 @@',
    '-Seminar on Thursday',
    '+Seminar on Friday',
    ' Keep summaries short',
  ].join('\n'),
).get('notes/MEMORY.md')!;

const commit: MemoryCommit = {
  sha: 'a'.repeat(40),
  subject: 'Move the seminar',
  files: [
    { path: 'notes/MEMORY.md', kind: 'modified', ...diff },
    { path: 'avatar.png', kind: 'added', rows: [], added: 0, removed: 0, binary: true },
  ],
};

describe('Memory commit view', () => {
  it('shows each file as a collapsible header over numbered, tinted diff rows', async () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<MemoryCommitView load={async () => commit} />));
    await act(async () => undefined);

    expect(host.textContent).toContain('Move the seminar');
    expect(host.textContent).toContain(t.memoryChangeFiles(2));
    const header = host.querySelector<HTMLButtonElement>(
      '[data-testid="memory-commit-file-notes/MEMORY.md"]',
    )!;
    expect(header.getAttribute('aria-label')).toBe(
      `notes/MEMORY.md, ${t.memoryFileChange.modified}, ${t.memoryDiffCounts(1, 1)}`,
    );
    expect(host.textContent).toContain('@@ -4,2 +4,2 @@');
    expect(host.querySelectorAll('[data-testid="memory-diff-remove"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-testid="memory-diff-add"]')).toHaveLength(1);
    expect(host.textContent).toContain(t.memoryChangeBinary);

    await act(async () => header.click());
    expect(host.querySelectorAll('[data-testid^="memory-diff-"]')).toHaveLength(0);
    expect(host.textContent).toContain(t.memoryChangeBinary);
  });
});
