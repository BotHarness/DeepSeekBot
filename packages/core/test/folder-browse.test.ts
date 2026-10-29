import { spawn as spawnProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createFolderBrowser,
  createFolderWorker,
  FOLDER_BROWSE_LIMIT,
  FolderBrowseError,
  type FolderRead,
  spawnFolderWorker,
} from '../src/workspaces/folder-browse.js';
import {
  createFolderReader,
  type FolderReadDirent,
  type FolderReadFs,
} from '../src/workspaces/folder-browse-worker.js';
import { createDriveRoots, parseDrives, type DriveRoots } from '../src/workspaces/drive-roots.js';
import { createBridgeMethods } from '../src/bridge/methods.js';

const temps: string[] = [];
const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'folder-browse-'));
  temps.push(dir);
  return dir;
}

function inProcess(fs?: FolderReadFs): FolderRead {
  const read = createFolderReader(fs);
  return (request) => read({ ...request, id: 0 });
}

function fakeFs(levels: Record<string, FolderReadDirent[]>, opened: string[] = []): FolderReadFs {
  return {
    async readdir(path) {
      opened.push(path);
      const entries = levels[path];
      if (entries === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return entries;
    },
    isDirectory: async () => false,
  };
}

function dirent(name: string, kind: 'dir' | 'file' = 'dir'): FolderReadDirent {
  return { name, isDirectory: () => kind === 'dir', isSymbolicLink: () => false };
}

async function refusal(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    if (error instanceof FolderBrowseError) return error.code;
    throw error;
  }
  return undefined;
}

function drivesOf(...paths: string[]): DriveRoots {
  return { get: async () => paths.map((path) => ({ path, network: false })) };
}

describe('folder browsing on the Host', () => {
  it('starts at home and lists folder names only, hidden ones last', async () => {
    const root = home();
    mkdirSync(join(root, 'site'));
    mkdirSync(join(root, 'Notes'));
    mkdirSync(join(root, '.config'));
    writeFileSync(join(root, 'secret.txt'), 'never listed');
    symlinkSync(join(root, 'site'), join(root, 'site-link'));
    symlinkSync(join(root, 'secret.txt'), join(root, 'file-link'));

    const listing = await createFolderBrowser({
      home: root,
      platform: 'linux',
      read: inProcess(),
    }).list();

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
    expect(listing.nextOffset).toBeUndefined();
    expect(listing.nativePicker).toBeUndefined();
  });

  it('expands ~ and drops a trailing separator', async () => {
    const root = home();
    mkdirSync(join(root, 'code', 'app'), { recursive: true });
    const browser = createFolderBrowser({ home: root, platform: 'linux', read: inProcess() });

    expect((await browser.list('~/code/')).path).toBe(join(root, 'code'));
    expect((await browser.list(`${root}/code/../code`)).entries.map((entry) => entry.name)).toEqual(
      ['app'],
    );
  });

  it('refuses relative, missing, file and unreadable paths with codes', async () => {
    const root = home();
    writeFileSync(join(root, 'file.txt'), '');
    const browser = createFolderBrowser({ home: root, platform: 'linux', read: inProcess() });

    expect(await refusal(() => browser.list('code'))).toBe('folder-browse/invalid-path');
    expect(await refusal(() => browser.list(`${root}/missing`))).toBe('folder-browse/not-found');
    expect(await refusal(() => browser.list(`${root}/file.txt`))).toBe(
      'folder-browse/not-directory',
    );
    const failing = (code: string): FolderRead =>
      inProcess({
        readdir: async () => {
          throw Object.assign(new Error(code), { code });
        },
        isDirectory: async () => false,
      });
    const denied = createFolderBrowser({ home: root, platform: 'linux', read: failing('EACCES') });
    expect(await refusal(() => denied.list('/root'))).toBe('folder-browse/denied');
    const broken = createFolderBrowser({ home: root, platform: 'linux', read: failing('EIO') });
    expect(await refusal(() => broken.list('/mnt'))).toBe('folder-browse/unreadable');
  });

  it('walks Windows paths and offers the drives the OS reports', async () => {
    const opened: string[] = [];
    const browser = createFolderBrowser({
      platform: 'win32',
      home: 'C:\\Users\\ada',
      drives: drivesOf('C:\\', 'D:\\', 'Z:\\'),
      read: inProcess(
        fakeFs(
          {
            'D:\\code': [dirent('project'), dirent('notes.md', 'file')],
            'D:\\': [dirent('code')],
          },
          opened,
        ),
      ),
    });

    const listing = await browser.list('D:\\code\\');

    expect(opened).toEqual(['D:\\code']);
    expect(listing.entries).toEqual([
      { name: 'project', path: 'D:\\code\\project', hidden: false },
    ]);
    expect(listing.crumbs).toEqual([
      { name: 'D:\\', path: 'D:\\', hidden: false },
      { name: 'code', path: 'D:\\code', hidden: false },
    ]);
    expect(listing.roots.map((entry) => entry.path)).toEqual([
      'C:\\Users\\ada',
      'C:\\',
      'D:\\',
      'Z:\\',
    ]);
    expect((await browser.list('D:\\')).path).toBe('D:\\');
    expect(await refusal(() => browser.list('/code'))).toBe('folder-browse/invalid-path');
  });

  it('falls back to the home and current drive when the OS cannot be asked', async () => {
    const browser = createFolderBrowser({
      platform: 'win32',
      home: 'C:\\Users\\ada',
      drives: { get: async () => [] },
      read: inProcess(fakeFs({ 'e:\\': [] })),
    });

    expect((await browser.list('e:\\')).roots.map((entry) => entry.path)).toEqual([
      'C:\\Users\\ada',
      'C:\\',
      'E:\\',
    ]);
  });

  it('pages a very large folder from one read', async () => {
    const opened: string[] = [];
    const names = Array.from({ length: FOLDER_BROWSE_LIMIT + 5 }, (_, at) =>
      dirent(`d${String(at).padStart(4, '0')}`),
    );
    const browser = createFolderBrowser({
      platform: 'linux',
      home: '/home/ada',
      read: inProcess(fakeFs({ '/home/ada': names }, opened)),
    });

    const first = await browser.list();
    expect(first.entries).toHaveLength(FOLDER_BROWSE_LIMIT);
    expect(first.truncated).toBe(true);
    expect(first.nextOffset).toBe(FOLDER_BROWSE_LIMIT);

    const rest = await browser.list(undefined, first.nextOffset);
    expect(rest.entries.map((entry) => entry.name)).toEqual([
      'd0500',
      'd0501',
      'd0502',
      'd0503',
      'd0504',
    ]);
    expect(rest.truncated).toBe(false);
    expect(rest.nextOffset).toBeUndefined();
    expect(opened).toEqual(['/home/ada']);
  });

  it('says when the Host shows the system folder dialog', async () => {
    const root = home();
    const browser = createFolderBrowser({
      home: root,
      platform: 'linux',
      read: inProcess(),
      nativePicker: () => true,
    });

    expect((await browser.list()).nativePicker).toBe(true);
  });

  it('answers through the bridge with coded refusals', async () => {
    const root = home();
    mkdirSync(join(root, 'site'));
    const methods = createBridgeMethods({
      folders: createFolderBrowser({ home: root, platform: 'linux', read: inProcess() }),
    } as unknown as Parameters<typeof createBridgeMethods>[0]);

    const listed = await methods.folderBrowse({});
    expect(listed.ok && listed.value.entries.map((entry) => entry.name)).toEqual(['site']);
    const paged = await methods.folderBrowse({ offset: 1 });
    expect(paged.ok && paged.value.entries).toEqual([]);
    expect(await methods.folderBrowse({ path: 'relative' })).toEqual({
      ok: false,
      error: {
        code: 'folder-browse/invalid-path',
        message: 'Use a full folder path on the computer.',
      },
    });
    expect(await methods.folderBrowse({ path: 3 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await methods.folderBrowse({ offset: -1 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});

describe('the folder reader process', () => {
  it('reads folders in a separate process', async () => {
    const root = home();
    mkdirSync(join(root, 'alpha'));
    mkdirSync(join(root, 'beta'));
    const worker = createFolderWorker();
    closers.push(() => worker.close());

    const reply = await worker.read({ path: root, platform: 'linux', offset: 0, limit: 10 });

    expect(reply).toEqual({
      ok: true,
      entries: [
        { name: 'alpha', hidden: false },
        { name: 'beta', hidden: false },
      ],
      total: 2,
    });
  });

  it('kills a stuck reader at the deadline, keeps the Host responsive and starts a fresh one', async () => {
    const root = home();
    mkdirSync(join(root, 'alive'));
    let spawned = 0;
    const killed: boolean[] = [];
    const worker = createFolderWorker({
      deadlineMs: 300,
      spawn: () => {
        spawned += 1;
        if (spawned === 1) {
          const stuck = spawnProcess(process.execPath, ['-e', 'process.on("message", () => {})'], {
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          });
          stuck.on('exit', () => killed.push(true));
          return stuck;
        }
        return spawnFolderWorker();
      },
    });
    closers.push(() => worker.close());

    let ticks = 0;
    const ticker = setInterval(() => (ticks += 1), 20);
    const started = Date.now();
    const code = await worker.read({ path: root, platform: 'linux', offset: 0, limit: 10 }).then(
      () => undefined,
      (error: unknown) => (error instanceof FolderBrowseError ? error.code : String(error)),
    );
    clearInterval(ticker);

    expect(code).toBe('folder-browse/timeout');
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(ticks).toBeGreaterThan(5);
    await expect.poll(() => killed.length, { timeout: 2_000 }).toBe(1);

    const reply = await worker.read({ path: root, platform: 'linux', offset: 0, limit: 10 });
    expect(reply).toMatchObject({ ok: true, entries: [{ name: 'alive', hidden: false }] });
    expect(spawned).toBe(2);
  });

  it('fails pending reads when the Host closes the reader', async () => {
    const worker = createFolderWorker({
      spawn: () =>
        spawnProcess(process.execPath, ['-e', 'process.on("message", () => {})'], {
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        }),
    });
    const pending = refusal(() =>
      worker.read({ path: '/', platform: 'linux', offset: 0, limit: 1 }),
    );
    worker.close();

    expect(await pending).toBe('folder-browse/unavailable');
  });

  it('fails pending reads when the reader exits', async () => {
    const worker = createFolderWorker({
      spawn: () =>
        spawnProcess(process.execPath, ['-e', 'process.on("message", () => process.exit(3))'], {
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        }),
    });
    closers.push(() => worker.close());

    expect(
      await refusal(() => worker.read({ path: '/', platform: 'linux', offset: 0, limit: 1 })),
    ).toBe('folder-browse/unavailable');
  });
});

describe('Windows drive letters', () => {
  it('parses the OS drive table and skips unmapped letters', () => {
    expect(
      parseDrives('C:\\\tFixed\r\nD:\\\tRemovable\r\nZ:\\\tNetwork\r\nQ:\\\tNoRootDirectory\r\n'),
    ).toEqual([
      { path: 'C:\\', network: false },
      { path: 'D:\\', network: false },
      { path: 'Z:\\', network: true },
    ]);
  });

  it('waits briefly for the first answer, then serves the cache and refreshes in the background', async () => {
    let now = 0;
    let calls = 0;
    let answer: (output: string) => void = () => undefined;
    const drives = createDriveRoots(
      () =>
        new Promise((resolve) => {
          calls += 1;
          answer = resolve;
        }),
      () => now,
      1_000,
    );

    expect(await drives.get(10)).toBeUndefined();
    answer('C:\\\tFixed\n');
    await Promise.resolve();
    expect(await drives.get(10)).toEqual([{ path: 'C:\\', network: false }]);
    expect(calls).toBe(1);

    now = 5_000;
    expect(await drives.get(10)).toEqual([{ path: 'C:\\', network: false }]);
    expect(calls).toBe(2);
    answer('C:\\\tFixed\nZ:\\\tNetwork\n');
    await Promise.resolve();
    expect((await drives.get(10))?.map((drive) => drive.path)).toEqual(['C:\\', 'Z:\\']);
  });

  it('answers an empty list when the OS cannot be asked', async () => {
    const drives = createDriveRoots(async () => {
      throw new Error('powershell missing');
    });

    expect(await drives.get(100)).toEqual([]);
  });
});
