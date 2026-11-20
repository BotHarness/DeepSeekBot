import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { removeTree, removeTreeQuietly } from '../src/fs/remove-tree.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function readOnlyGitTree(): { root: string; pack: string } {
  const root = mkdtempSync(join(tmpdir(), 'remove-tree-'));
  roots.push(root);
  const packs = join(root, 'repo', '.git', 'objects', 'pack');
  mkdirSync(packs, { recursive: true });
  const pack = join(packs, 'pack-1.pack');
  writeFileSync(pack, 'data');
  chmodSync(pack, 0o444);
  return { root, pack };
}

function eperm(): NodeJS.ErrnoException {
  return Object.assign(new Error('EPERM, Permission denied'), { code: 'EPERM' });
}

it('clears read-only Git files and retries when the first removal is refused (#3294)', () => {
  const { root, pack } = readOnlyGitTree();
  const calls: string[] = [];
  removeTree(root, (path, options) => {
    calls.push(path);
    if (statSync(pack).mode & 0o200) rmSync(path, options);
    else throw eperm();
  });
  expect(calls).toEqual([root, root]);
  expect(existsSync(root)).toBe(false);
});

it('rethrows errors that are not permission problems', () => {
  const { root } = readOnlyGitTree();
  const busy = Object.assign(new Error('busy'), { code: 'EBUSY' });
  expect(() =>
    removeTree(root, () => {
      throw busy;
    }),
  ).toThrow(busy);
});

it('reports a folder it could not remove instead of throwing', () => {
  const { root } = readOnlyGitTree();
  expect(
    removeTreeQuietly(root, () => {
      throw eperm();
    }),
  ).toBe(false);
  expect(removeTreeQuietly(root)).toBe(true);
  expect(existsSync(root)).toBe(false);
});
