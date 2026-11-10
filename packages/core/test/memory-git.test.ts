import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMemoryStore } from '../src/index.js';
import { createMemoryGit } from '../src/memory/git.js';
import { FIXED_NOW, createTempRoot } from './helpers.js';

function createRoot(): string {
  return createTempRoot('botharness-git-');
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function commitCount(root: string): number {
  return Number(git(root, ['rev-list', '--count', 'HEAD']));
}

describe('memory git repository', () => {
  it('initializes one main branch, local identity and committed LF attributes', async () => {
    const root = createRoot();
    createMemoryStore({ memoryDir: root, now: FIXED_NOW });

    expect(git(root, ['branch', '--show-current'])).toBe('main');
    expect(git(root, ['branch', '--format=%(refname:short)'])).toBe('main');
    expect(git(root, ['config', 'user.email'])).toBe('bot@botharness.local');
    expect(readFileSync(join(root, '.gitattributes'), 'utf8')).toBe('* text=auto eol=lf\n');
    expect(git(root, ['ls-files', '.gitattributes'])).toBe('.gitattributes');
    expect(git(root, ['status', '--porcelain'])).toBe('');
  });

  it('makes exactly one commit per write with summary and sources', async () => {
    const root = createRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const before = commitCount(root);

    await store.write({
      path: 'customers/acme.md',
      body: 'Renewal due.',
      summary: 'Acme renewal',
      sources: ['feishu:group-42', '2026-09-17'],
    });

    expect(commitCount(root)).toBe(before + 1);
    const message = git(root, ['log', '-1', '--format=%B']);
    expect(message.split('\n')[0]).toBe('Acme renewal');
    expect(message).toContain('sources: feishu:group-42, 2026-09-17');
    expect(git(root, ['log', '-1', '--format=%s'])).toBe('Acme renewal');
    expect(git(root, ['status', '--porcelain'])).toBe('');
  });

  it('marks human-authored writes and flattens multi-line summaries', async () => {
    const root = createRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });

    await store.write({
      path: 'journal/day.md',
      body: 'Noted.',
      summary: '  Day\n  one  ',
      source: 'human',
    });

    const message = git(root, ['log', '-1', '--format=%B']);
    expect(message.split('\n')[0]).toBe('Day one');
    expect(message).toContain('source=human');
  });

  it('does not commit or dirty the tree on rejected writes', async () => {
    const root = createRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    const before = commitCount(root);

    await expect(
      store.write({ path: '../escape.md', body: 'x', summary: 'hack' }),
    ).rejects.toThrow();
    await expect(store.write({ path: 'a.md', body: 'x', summary: '  ' })).rejects.toThrow();

    expect(commitCount(root)).toBe(before);
    expect(git(root, ['status', '--porcelain'])).toBe('');
  });

  it('reports history from git and reopening creates no extra commit', async () => {
    const root = createRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    await store.write({ path: 'a.md', body: 'x', summary: 'First' });

    const [head] = store.history(5);
    expect(head?.sha).toBe(git(root, ['rev-parse', 'HEAD']));
    expect(head?.message.split('\n')[0]).toBe('First');
    expect(head?.date).toBe(git(root, ['log', '-1', '--format=%cI']));

    const count = commitCount(root);
    const reopened = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    expect(commitCount(root)).toBe(count);
    expect(reopened.read('a.md')?.summary).toBe('First');
    expect(reopened.history(1)[0]?.sha).toBe(head?.sha);
    expect(reopened.history(1)[0]?.date).toBe(head?.date);
  });

  it('reports author dates since an instant for Profile memory activity', async () => {
    const root = createRoot();
    const store = createMemoryStore({ memoryDir: root, now: FIXED_NOW });
    await store.write({ path: 'a.md', body: 'x', summary: 'First' });
    await store.write({ path: 'b.md', body: 'y', summary: 'Second' });
    const gitClient = createMemoryGit(root);

    const sinceEpoch = await gitClient.activitySince('2000-01-01T00:00:00.000Z');
    expect(sinceEpoch).toHaveLength(commitCount(root));
    for (const entry of sinceEpoch) {
      expect(Number.isNaN(new Date(entry.at).getTime())).toBe(false);
    }
    expect(await gitClient.activitySince('2099-01-01T00:00:00.000Z')).toEqual([]);
  });
});
