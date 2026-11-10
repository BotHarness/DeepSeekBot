import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import { createMemoryGit } from '../src/memory/git.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTempRoot } from './helpers.js';

vi.mock('../src/memory/git-probe.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/memory/git-probe.js')>()),
  gitSupportsSinceAsFilter: () => false,
}));

it('filters Memory activity by date itself when Git predates --since-as-filter', async () => {
  const memoryDir = join(createTempRoot(), 'memory');
  expect(ensureMemoryRepository({ memoryDir }).ok).toBe(true);
  const commit = (name: string, at: string): void => {
    writeFileSync(join(memoryDir, name), name);
    execFileSync('git', ['add', name], { cwd: memoryDir });
    execFileSync('git', ['commit', '--no-gpg-sign', '-m', name], {
      cwd: memoryDir,
      env: { ...process.env, GIT_COMMITTER_DATE: at, GIT_AUTHOR_DATE: at },
    });
  };
  commit('old.md', '2026-09-25T12:00:00+09:00');
  commit('first.md', '2026-09-26T12:00:00+09:00');
  commit('second.md', '2026-10-01T12:00:00+09:00');
  commit('backdated.md', '2020-01-01T12:00:00+09:00');
  const git = createMemoryGit(memoryDir);
  const since = '2026-09-26T00:00:00+09:00';
  const seed = execFileSync('git', ['log', '--reverse', '--format=%cI'], {
    cwd: memoryDir,
    encoding: 'utf8',
  }).split('\n')[0];
  const expected = [
    '2026-09-26T03:00:00.000Z',
    '2026-10-01T03:00:00.000Z',
    new Date(seed ?? '').toISOString(),
  ].sort();
  const iso = (items: Array<{ at: string }>): string[] =>
    items.map(({ at }) => new Date(at).toISOString()).sort();

  expect(iso(await git.activitySince(since))).toEqual(expected);
  expect(iso((await git.activitySnapshot(since)).commits)).toEqual(expected);
});
