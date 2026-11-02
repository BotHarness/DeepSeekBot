import { describe, expect, it, vi } from 'vitest';

import { loadMemoryCommit, splitUnifiedDiff, wordMarks } from '../src/host/memory-changes';
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
  it('splits a commit diff into per-file rows with hunks, line numbers and changed words', () => {
    const sections = splitUnifiedDiff(DIFF);
    const memory = sections.get('MEMORY.md')!;
    expect(memory).toMatchObject({ added: 1, removed: 1, binary: false });
    expect(memory.rows).toEqual([
      { kind: 'hunk', header: '@@ -1,3 +1,3 @@' },
      {
        kind: 'line',
        change: 'context',
        oldLine: 1,
        newLine: 1,
        text: '# MEMORY.md',
        marks: [],
      },
      {
        kind: 'line',
        change: 'remove',
        oldLine: 2,
        newLine: null,
        text: '- Vain prefers summaries under 100 words.',
        marks: [[31, 34]],
      },
      {
        kind: 'line',
        change: 'add',
        oldLine: null,
        newLine: 2,
        text: '- Vain prefers summaries under 80 words.',
        marks: [[31, 33]],
      },
      {
        kind: 'line',
        change: 'context',
        oldLine: 3,
        newLine: 3,
        text: '- Seminar on Thursdays.',
        marks: [],
      },
    ]);
    expect(sections.get('notes/new.md')?.rows.at(-1)).toMatchObject({
      change: 'add',
      newLine: 1,
      text: '++ heading kept as text',
    });
    expect(sections.get('avatar.png')).toMatchObject({ binary: true, rows: [] });
    expect(sections.get('old.md')).toMatchObject({ removed: 1, added: 0 });
  });

  it('marks only the words that changed, and nothing when the lines share no words', () => {
    expect(wordMarks('Seminar on Thursday', 'Seminar on Friday')).toEqual([[[11, 19]], [[11, 17]]]);
    expect(wordMarks('alpha', 'beta')).toEqual([[], []]);
    expect(
      wordMarks(
        '- Seminar on Wednesdays.',
        '- [Learning](learning/background.md): seminar every Thursday.',
      ),
    ).toEqual([[], []]);
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
