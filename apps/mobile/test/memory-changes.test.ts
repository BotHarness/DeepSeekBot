import { describe, expect, it, vi } from 'vitest';

import { loadMemoryCommit, splitUnifiedDiff } from '../src/host/memory-changes';
import type { HostClient } from '../src/host/client';

const DIFF = [
  'diff --git a/MEMORY.md b/MEMORY.md',
  'index 1111111..2222222 100644',
  '--- a/MEMORY.md',
  '+++ b/MEMORY.md',
  '@@ -1,3 +1,3 @@',
  ' # MEMORY.md',
  '-- Vain prefers summaries under 100 words.',
  '+- Vain prefers summaries under 80 words.',
  ' - Seminar on Thursdays.',
  'diff --git a/notes/new.md b/notes/new.md',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/notes/new.md',
  '@@ -0,0 +1 @@',
  '+++ heading kept as text',
  'diff --git a/avatar.png b/avatar.png',
  'Binary files a/avatar.png and b/avatar.png differ',
  'diff --git a/old.md b/old.md',
  'deleted file mode 100644',
  '--- a/old.md',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-gone',
  '',
].join('\n');

describe('Memory changes', () => {
  it('splits a commit diff into per-file line changes', () => {
    const sections = splitUnifiedDiff(DIFF);
    expect(sections.get('MEMORY.md')).toEqual({
      lines: [
        { kind: 'context', text: '# MEMORY.md' },
        { kind: 'remove', text: '- Vain prefers summaries under 100 words.' },
        { kind: 'add', text: '- Vain prefers summaries under 80 words.' },
        { kind: 'context', text: '- Seminar on Thursdays.' },
      ],
      added: 1,
      removed: 1,
      binary: false,
    });
    expect(sections.get('notes/new.md')?.lines).toEqual([
      { kind: 'add', text: '++ heading kept as text' },
    ]);
    expect(sections.get('avatar.png')).toMatchObject({ binary: true, lines: [] });
    expect(sections.get('old.md')).toMatchObject({ removed: 1, added: 0 });
  });

  it('reads a commit from the Bot DM with each file kind', async () => {
    const call = vi.fn(async () => ({
      sha: 'a'.repeat(40),
      subject: 'Update Memory',
      files: [
        { path: 'MEMORY.md', status: 'M' },
        { path: 'notes/new.md', status: 'A' },
        { path: 'old.md', status: 'D' },
      ],
      diff: DIFF,
    }));
    const commit = await loadMemoryCommit(
      { call } as unknown as HostClient,
      { slug: 'ada', dmChannelId: 'dm-ada' },
      'a'.repeat(40),
    );
    expect(call).toHaveBeenCalledWith('memoryGitCommitDiff', {
      channelId: 'dm-ada',
      sha: 'a'.repeat(40),
    });
    expect(commit.files.map((file) => [file.path, file.kind, file.added, file.removed])).toEqual([
      ['MEMORY.md', 'modified', 1, 1],
      ['notes/new.md', 'added', 1, 0],
      ['old.md', 'deleted', 0, 1],
    ]);
  });
});
