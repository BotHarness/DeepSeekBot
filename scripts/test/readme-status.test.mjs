import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import {
  activityWindow,
  collectStatus,
  githubClient,
  publishStatus,
  REPOSITORY,
  statusFiles,
} from '../readme-status.mjs';

const now = new Date('2026-10-20T04:44:50Z');
const sha = 'a'.repeat(40);
const snapshot = {
  repository: REPOSITORY,
  updatedAt: now.toISOString().replace('.000Z', 'Z'),
  defaultBranch: 'main',
  defaultBranchSha: sha,
  stars: 170,
  forks: 12,
  issues: 206,
  pullRequests: 31,
  release: 'v1.4.1',
  activity: { ...activityWindow(now), closedPullRequests: 1124, commits: 2277 },
};
function fixture() {
  const queries = [];
  const api = vi.fn(async (path) => {
    if (path === `repos/${REPOSITORY}`)
      return {
        full_name: REPOSITORY,
        default_branch: 'main',
        stargazers_count: 170,
        forks_count: 12,
      };
    if (path.endsWith('/releases/latest')) return { tag_name: 'v1.4.1' };
    const query = new URLSearchParams(path.split('?')[1]).get('q');
    queries.push(query);
    return {
      incomplete_results: false,
      total_count: query.includes('is:issue') ? 206 : query.includes('is:closed') ? 1124 : 31,
    };
  });
  const git = vi.fn((args) =>
    args.includes('--is-shallow-repository') ? 'false' : args.includes('--verify') ? sha : '2277',
  );
  return { api, git, queries, now };
}

describe('README status collection', () => {
  it('separates issues and PRs, includes merged PRs and uses one precise 30-day window', async () => {
    const f = fixture();
    expect(await collectStatus(f)).toEqual(snapshot);
    expect(f.queries).toEqual([
      `repo:${REPOSITORY} is:issue is:open`,
      `repo:${REPOSITORY} is:pr is:open`,
      `repo:${REPOSITORY} is:pr is:closed closed:2026-09-20T04:44:50Z..2026-10-20T04:44:50Z`,
    ]);
    expect(f.git).toHaveBeenCalledWith([
      'rev-list',
      '--count',
      '--since-as-filter=2026-09-20T04:44:50Z',
      '--until=2026-10-20T04:44:50Z',
      sha,
      '--',
    ]);
  });
  it('counts merged history and continues past an old-dated commit, excluding future and unmerged commits', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'readme-history-'));
    const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    try {
      git(['init', '-b', 'main']);
      git(['config', 'user.name', 'README test']);
      git(['config', 'user.email', 'readme@example.invalid']);
      const commit = (date, message) =>
        execFileSync('git', ['commit', '--allow-empty', '-m', message], {
          cwd,
          env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
          stdio: 'ignore',
        });
      commit('2026-09-01T00:00:00Z', 'old root');
      git(['checkout', '-b', 'feature']);
      commit('2026-10-01T00:00:00Z', 'inside window');
      commit('2026-09-02T00:00:00Z', 'old date above recent parent');
      git(['checkout', 'main']);
      execFileSync('git', ['merge', '--no-ff', 'feature', '-m', 'merge feature'], {
        cwd,
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: '2026-10-02T00:00:00Z',
          GIT_COMMITTER_DATE: '2026-10-02T00:00:00Z',
        },
        stdio: 'ignore',
      });
      commit('2026-10-21T00:00:00Z', 'future');
      git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
      git(['checkout', '-b', 'unmerged']);
      commit('2026-10-03T00:00:00Z', 'not on default branch');
      const data = await collectStatus({ ...fixture(), git });
      expect(data.activity.commits).toBe(2);
    } finally {
      if (!cwd.startsWith(join(tmpdir(), 'readme-history-')))
        throw new Error('Unexpected temporary path');
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  it('rejects shallow history, incomplete search and missing totals', async () => {
    await expect(collectStatus({ ...fixture(), git: () => 'true' })).rejects.toThrow(
      'Full default-branch',
    );
    for (const response of [
      { incomplete_results: true, total_count: 0 },
      { incomplete_results: false },
    ]) {
      const f = fixture();
      const api = (path) => (path.startsWith('search/') ? response : f.api(path));
      await expect(collectStatus({ ...f, api })).rejects.toThrow();
    }
  });
  it('propagates rate limits without printing credentials or server body', async () => {
    const api = githubClient('private-test-token', async () => ({ ok: false, status: 403 }));
    await expect(api('search/issues?q=example')).rejects.toThrow(
      'GitHub GET search/issues: HTTP 403',
    );
  });
  it('emits bilingual light/dark cards and identical text/JSON numbers', () => {
    const files = statusFiles(snapshot);
    expect(Object.keys(files)).toHaveLength(7);
    for (const name of [
      'stats-zh-day.svg',
      'stats-zh-night.svg',
      'stats-en-day.svg',
      'stats-en-night.svg',
    ]) {
      expect(files[name]).toContain('1124 closed PRs, 2277 commits');
      expect(files[name]).toContain(snapshot.updatedAt);
      expect(files[name]).not.toMatch(/<script|<foreignObject|<image/);
    }
    expect(files['README.md']).toContain('| Closed PRs in 30 days / 30 天内关闭 PR | 1124 |');
    expect(JSON.parse(files['stats.json'])).toEqual(snapshot);
  });
});

describe('README status publication', () => {
  const files = statusFiles(snapshot);
  it('refuses main, other repositories and unexpected file sets before making any API call', async () => {
    const api = vi.fn();
    await expect(publishStatus(api, files, REPOSITORY, 'main')).rejects.toThrow('dedicated');
    await expect(publishStatus(api, files, 'other/repo')).rejects.toThrow('dedicated');
    await expect(publishStatus(api, { ...files, 'README.en.md': 'oops' })).rejects.toThrow(
      'file set',
    );
    expect(api).not.toHaveBeenCalled();
  });
  it('creates an orphan branch only after a complete tree and commit exist', async () => {
    const api = vi.fn(async (path) => {
      if (path.includes('/ref/heads/')) throw Object.assign(new Error('missing'), { status: 404 });
      return { sha: path.endsWith('/trees') ? 'tree' : 'commit' };
    });
    await publishStatus(api, files);
    expect(api.mock.calls.at(-2)).toEqual([
      `repos/${REPOSITORY}/git/commits`,
      'POST',
      expect.objectContaining({ parents: [], tree: 'tree' }),
    ]);
    expect(api.mock.calls.at(-1)).toEqual([
      `repos/${REPOSITORY}/git/refs`,
      'POST',
      { ref: 'refs/heads/readme-status', sha: 'commit' },
    ]);
  });
  it('refuses to take over an existing code branch', async () => {
    const api = vi.fn(async (path) =>
      path.includes('/ref/')
        ? { object: { sha } }
        : { tree: [{ path: 'package.json', type: 'blob' }] },
    );
    await expect(publishStatus(api, files)).rejects.toThrow('Unexpected status branch');
    expect(api.mock.calls.every((call) => call.length === 1)).toBe(true);
  });
  it('preserves branch history and refuses to force through a concurrent update', async () => {
    const api = vi.fn(async (path, method) => {
      if (path.includes('/ref/')) return { object: { sha } };
      if (path.endsWith(`/trees/${sha}`))
        return {
          sha: 'old-tree',
          tree: Object.keys(files).map((path) => ({ path, type: 'blob', sha: 'blob' })),
        };
      if (path.endsWith('/blobs/blob'))
        return { content: Buffer.from(files['README.md']).toString('base64') };
      if (method === 'PATCH') throw Object.assign(new Error('not fast forward'), { status: 422 });
      return { sha: method === 'POST' && path.endsWith('/trees') ? 'new-tree' : 'new-commit' };
    });
    await expect(publishStatus(api, files)).rejects.toThrow('not fast forward');
    expect(api.mock.calls.at(-2)[2].parents).toEqual([sha]);
    expect(api.mock.calls.at(-1)).toEqual([
      `repos/${REPOSITORY}/git/refs/heads/readme-status`,
      'PATCH',
      { sha: 'new-commit', force: false },
    ]);
  });
  it('only grants write permission to the main-branch publishing job', () => {
    const workflow = parse(
      readFileSync(new URL('../../.github/workflows/readme-status.yml', import.meta.url), 'utf8'),
    );
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.on.pull_request_target).toBeUndefined();
    expect(workflow.jobs.publish.needs).toBe('collect');
    expect(workflow.jobs.publish.if).toContain("github.event_name != 'pull_request'");
    expect(workflow.jobs.publish.if).toContain("github.ref == 'refs/heads/main'");
    expect(workflow.jobs.publish.permissions).toEqual({ contents: 'write' });
    expect(workflow.jobs.collect.permissions).toBeUndefined();
  });
});
