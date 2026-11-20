import { describe, expect, it } from 'vitest';
import { findShellScripts } from '../check-no-shell-scripts.mjs';

describe('shell script policy', () => {
  it('flags ps1, cmd and bat files case-insensitively', () => {
    expect(findShellScripts(['scripts/android-qa.ps1', 'tools/run.CMD', 'x/setup.Bat'])).toEqual([
      'scripts/android-qa.ps1',
      'tools/run.CMD',
      'x/setup.Bat',
    ]);
  });

  it('keeps node helpers and lookalike names', () => {
    expect(
      findShellScripts([
        'scripts/android-qa.mjs',
        'docs/runbook.md',
        'archive.ps1.txt',
        'Makefile',
      ]),
    ).toEqual([]);
  });

  it('ignores directory segments that carry the extension', () => {
    expect(findShellScripts(['output.ps1/notes.md', 'C:\\work\\run.cmd\\readme.md'])).toEqual([]);
  });
});
