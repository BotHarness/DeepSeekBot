import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, type Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createFolderBrowser,
  FOLDER_BROWSE_LIMIT,
  FolderBrowseError,
} from '../src/workspaces/folder-browse.js';
import { createBridgeMethods } from '../src/bridge/methods.js';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'folder-browse-'));
  temps.push(dir);
  return dir;
}

function dirent(name: string, kind: 'dir' | 'file' = 'dir'): Dirent {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isSymbolicLink: () => false,
  } as Dirent;
}

function refusal(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof FolderBrowseError) return error.code;
    throw error;
  }
  return undefined;
}

describe('folder browsing on the Host', () => {
  it('starts at home and lists folder names only, hidden ones last', () => {
    const root = home();
    mkdirSync(join(root, 'site'));
    mkdirSync(join(root, 'Notes'));
    mkdirSync(join(root, '.config'));
    writeFileSync(join(root, 'secret.txt'), 'never listed');
    symlinkSync(join(root, 'site'), join(root, 'site-link'));
    symlinkSync(join(root, 'secret.txt'), join(root, 'file-link'));

    const listing = createFolderBrowser({ home: root, platform: 'linux' }).list();

    expect(listing.path).toBe(root);
    expect(listing.home).toBe(root);
    expect(listing.entries.map((entry) => [entry.name, entry.hidden])).toEqual([
      ['Notes', false],
      ['site', false],
      ['site-link', false],
      ['.config', true],
    ]);
    expect(listing.entries[0]?.path).toBe(join(root, 'Notes'));
    expect(listing.crumbs.at(0)).toEqual({ name: '/', path: '/', hidden: false });
    expect(listing.crumbs.at(-1)?.path).toBe(root);
    expect(listing.roots.map((entry) => entry.path)).toEqual([root, '/']);
    expect(listing.truncated).toBe(false);
  });

  it('expands ~ and drops a trailing separator', () => {
    const root = home();
    mkdirSync(join(root, 'code', 'app'), { recursive: true });
    const browser = createFolderBrowser({ home: root, platform: 'linux' });

    expect(browser.list('~/code/').path).toBe(join(root, 'code'));
    expect(browser.list(`${root}/code/../code`).entries.map((entry) => entry.name)).toEqual([
      'app',
    ]);
  });

  it('refuses relative, missing, file and unreadable paths with codes', () => {
    const root = home();
    writeFileSync(join(root, 'file.txt'), '');
    const browser = createFolderBrowser({ home: root, platform: 'linux' });

    expect(refusal(() => browser.list('code'))).toBe('folder-browse/invalid-path');
    expect(refusal(() => browser.list(`${root}/missing`))).toBe('folder-browse/not-found');
    expect(refusal(() => browser.list(`${root}/file.txt`))).toBe('folder-browse/not-directory');
    const denied = createFolderBrowser({
      home: root,
      platform: 'linux',
      readdir: () => {
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      },
    });
    expect(refusal(() => denied.list('/root'))).toBe('folder-browse/denied');
  });

  it('walks Windows paths and offers each existing drive', () => {
    const seen: string[] = [];
    const browser = createFolderBrowser({
      platform: 'win32',
      home: 'C:\\Users\\ada',
      exists: (drive) => drive === 'C:\\' || drive === 'D:\\',
      readdir: (dir) => {
        seen.push(dir);
        return [dirent('project'), dirent('notes.md', 'file')];
      },
    });

    const listing = browser.list('D:\\code\\');

    expect(seen).toEqual(['D:\\code']);
    expect(listing.entries).toEqual([
      { name: 'project', path: 'D:\\code\\project', hidden: false },
    ]);
    expect(listing.crumbs).toEqual([
      { name: 'D:\\', path: 'D:\\', hidden: false },
      { name: 'code', path: 'D:\\code', hidden: false },
    ]);
    expect(listing.roots.map((entry) => entry.path)).toEqual(['C:\\Users\\ada', 'C:\\', 'D:\\']);
    expect(browser.list('D:\\').path).toBe('D:\\');
    expect(refusal(() => browser.list('/code'))).toBe('folder-browse/invalid-path');
  });

  it('caps a very large folder', () => {
    const names = Array.from({ length: FOLDER_BROWSE_LIMIT + 5 }, (_, at) =>
      dirent(`d${String(at).padStart(4, '0')}`),
    );
    const listing = createFolderBrowser({
      platform: 'linux',
      home: '/home/ada',
      readdir: () => names,
    }).list();

    expect(listing.entries).toHaveLength(FOLDER_BROWSE_LIMIT);
    expect(listing.truncated).toBe(true);
  });

  it('answers through the bridge with coded refusals', () => {
    const root = home();
    mkdirSync(join(root, 'site'));
    const methods = createBridgeMethods({
      folders: createFolderBrowser({ home: root, platform: 'linux' }),
    } as unknown as Parameters<typeof createBridgeMethods>[0]);

    const listed = methods.folderBrowse({});
    expect(listed.ok && listed.value.entries.map((entry) => entry.name)).toEqual(['site']);
    expect(methods.folderBrowse({ path: 'relative' })).toEqual({
      ok: false,
      error: {
        code: 'folder-browse/invalid-path',
        message: 'Use a full folder path on the computer.',
      },
    });
    expect(methods.folderBrowse({ path: 3 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});
