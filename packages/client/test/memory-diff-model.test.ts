import { describe, expect, it } from 'vitest';
import { parseMemoryDiff } from '@botharness/host-client/shared/memory-diff-model';

describe('Memory Git diff rows', () => {
  it('numbers context, removals, and additions across independent hunks', () => {
    const model = parseMemoryDiff(
      [
        'diff --git a/profile.md b/profile.md',
        'index abc123..def456 100644',
        '--- a/profile.md',
        '+++ b/profile.md',
        '@@ -4,3 +4,4 @@ section',
        ' before',
        '-old',
        '+new',
        '+extra',
        ' after',
        '@@ -20,2 +21,1 @@ later',
        ' kept',
        '-gone',
      ].join('\n'),
    );

    expect(model.binary).toBe(false);
    expect(model.lines).toEqual([
      { kind: 'hunk', text: '@@ -4,3 +4,4 @@ section' },
      { kind: 'context', oldLine: 4, newLine: 4, text: 'before' },
      { kind: 'remove', oldLine: 5, text: 'old' },
      { kind: 'add', newLine: 5, text: 'new' },
      { kind: 'add', newLine: 6, text: 'extra' },
      { kind: 'context', oldLine: 6, newLine: 7, text: 'after' },
      { kind: 'hunk', text: '@@ -20,2 +21,1 @@ later' },
      { kind: 'context', oldLine: 20, newLine: 21, text: 'kept' },
      { kind: 'remove', oldLine: 21, text: 'gone' },
    ]);
  });

  it('numbers a new file and keeps the missing-final-newline note out of the code', () => {
    const model = parseMemoryDiff(
      [
        'diff --git a/new.md b/new.md',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/new.md',
        '@@ -0,0 +1,2 @@',
        '+first',
        '+',
        '\\ No newline at end of file',
      ].join('\n'),
    );

    expect(model.lines).toEqual([
      { kind: 'hunk', text: '@@ -0,0 +1,2 @@' },
      { kind: 'add', newLine: 1, text: 'first' },
      { kind: 'add', newLine: 2, text: '' },
      { kind: 'note', text: 'No newline at end of file' },
    ]);
  });

  it('identifies a binary patch without presenting its metadata as text changes', () => {
    expect(
      parseMemoryDiff(
        'diff --git a/avatar.png b/avatar.png\nBinary files a/avatar.png and b/avatar.png differ\n',
      ),
    ).toEqual({ lines: [], binary: true });
  });
});
