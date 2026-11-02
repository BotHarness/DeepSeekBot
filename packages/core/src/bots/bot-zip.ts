import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  BOT_DESCRIPTOR_PATH,
  parseBotDescriptor,
  type BotDescriptor,
} from '../marketplace/descriptor.js';
import { BOT_BANNER_FILE } from './bot-banner.js';
import { AVATAR_RECIPE_FILE } from './shared-presentation.js';
import {
  readZip,
  writeZip,
  ZipArchiveError,
  type ZipEntry,
  type ZipEntryInput,
} from './zip-archive.js';

export const BOT_ZIP_MAX_BYTES = 100 * 1024 * 1024;
export const BOT_ZIP_MAX_ENTRIES = 20_000;
export const BOT_ZIP_HISTORY_PATH = '.botharness/git-history.bundle';

const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function excludedPath(path: string): boolean {
  const parts = path.split('/');
  return (
    path === BOT_ZIP_HISTORY_PATH ||
    parts[0] === '__MACOSX' ||
    parts.some((part) => part === '.git') ||
    IGNORED_NAMES.has(parts.at(-1) ?? '')
  );
}

export function listBotFiles(memoryDir: string): string[] {
  const output = execFileSync(
    'git',
    ['-c', 'core.quotePath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: memoryDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
  );
  const files = new Set<string>();
  for (const path of output.split('\0')) {
    if (path.length === 0 || excludedPath(path)) continue;
    try {
      if (lstatSync(join(memoryDir, path)).isFile()) files.add(path);
    } catch {}
  }
  return [...files].sort();
}

export interface BotFileListing {
  files: Array<{ path: string; size: number }>;
  always: string[];
}

export function alwaysIncludedFiles(memoryDir: string, files: readonly string[]): string[] {
  if (!files.includes(BOT_DESCRIPTOR_PATH)) return [];
  const always = [BOT_DESCRIPTOR_PATH];
  try {
    const avatar = parseBotDescriptor(
      readFileSync(join(memoryDir, BOT_DESCRIPTOR_PATH), 'utf8'),
    )?.avatar;
    if (avatar !== undefined && 'image' in avatar && files.includes(avatar.image)) {
      always.push(avatar.image);
      if (files.includes(AVATAR_RECIPE_FILE)) always.push(AVATAR_RECIPE_FILE);
    }
  } catch {}
  if (files.includes(BOT_BANNER_FILE)) always.push(BOT_BANNER_FILE);
  return always;
}

export function listBotZipFiles(memoryDir: string): BotFileListing {
  const paths = listBotFiles(memoryDir);
  const files: BotFileListing['files'] = [];
  for (const path of paths) {
    try {
      files.push({ path, size: lstatSync(join(memoryDir, path)).size });
    } catch {}
  }
  return { files, always: alwaysIncludedFiles(memoryDir, paths) };
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function withTempFile<T>(use: (file: string) => T): T {
  const folder = mkdtempSync(join(tmpdir(), 'botharness-bundle-'));
  try {
    return use(join(folder, 'history.bundle'));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export function bundleBotHistory(memoryDir: string): Buffer {
  return withTempFile((file) => {
    try {
      git(memoryDir, ['bundle', 'create', '--quiet', file, 'HEAD', '--branches', '--tags']);
      return readFileSync(file);
    } catch {
      throw new ZipArchiveError('invalid-zip', 'The Git history could not be packed');
    }
  });
}

export interface BotZipExportOptions {
  include?: ReadonlySet<string>;
  history?: boolean;
}

export function exportBotZip(memoryDir: string, options: BotZipExportOptions = {}): Buffer {
  const { include } = options;
  const entries: ZipEntryInput[] = [];
  let total = 0;
  const listed = listBotFiles(memoryDir);
  const always = new Set(alwaysIncludedFiles(memoryDir, listed));
  const files =
    include === undefined ? listed : listed.filter((path) => include.has(path) || always.has(path));
  if (files.length > BOT_ZIP_MAX_ENTRIES) {
    throw new ZipArchiveError('too-large', 'This Bot has too many files to export');
  }
  for (const path of files) {
    const target = join(memoryDir, path);
    const stat = lstatSync(target);
    total += stat.size;
    if (total > BOT_ZIP_MAX_BYTES) {
      throw new ZipArchiveError('too-large', 'This Bot is too large to export');
    }
    entries.push({ path, data: readFileSync(target), modifiedAt: stat.mtime });
  }
  if (options.history === true && include === undefined) {
    const bundle = bundleBotHistory(memoryDir);
    total += bundle.length;
    if (total > BOT_ZIP_MAX_BYTES) {
      throw new ZipArchiveError('too-large', 'This Bot is too large to export');
    }
    entries.push({ path: BOT_ZIP_HISTORY_PATH, data: bundle });
  }
  return writeZip(entries);
}

export interface BotZipContents {
  files: ZipEntry[];
  descriptor?: BotDescriptor;
  history?: Buffer;
}

function stripSharedRoot(files: ZipEntry[]): ZipEntry[] {
  if (files.some((file) => !file.path.includes('/'))) return files;
  const root = files[0]!.path.split('/')[0]!;
  if (!files.every((file) => file.path.startsWith(`${root}/`))) return files;
  return files.map((file) => ({ path: file.path.slice(root.length + 1), data: file.data }));
}

export function readBotZip(archive: Buffer): BotZipContents {
  if (archive.length > BOT_ZIP_MAX_BYTES) {
    throw new ZipArchiveError('too-large', 'The zip file is too large');
  }
  const kept = readZip(archive, {
    maxEntries: BOT_ZIP_MAX_ENTRIES,
    maxTotalBytes: BOT_ZIP_MAX_BYTES,
  }).filter((entry) => entry.path === BOT_ZIP_HISTORY_PATH || !excludedPath(entry.path));
  if (kept.length === 0) throw new ZipArchiveError('empty', 'The zip file has no files');
  const unpacked = stripSharedRoot(kept);
  const history = unpacked.find((entry) => entry.path === BOT_ZIP_HISTORY_PATH)?.data;
  const files = unpacked.filter((entry) => !excludedPath(entry.path));
  if (files.length === 0) throw new ZipArchiveError('empty', 'The zip file has no files');
  const descriptorFile = files.find((file) => file.path === BOT_DESCRIPTOR_PATH);
  const descriptor =
    descriptorFile === undefined
      ? undefined
      : parseBotDescriptor(descriptorFile.data.toString('utf8'));
  return {
    files,
    ...(descriptor === undefined ? {} : { descriptor }),
    ...(history === undefined ? {} : { history }),
  };
}

export function writeBotFiles(root: string, files: readonly ZipEntry[]): void {
  for (const file of files) {
    const target = join(root, file.path);
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.data, { flag: 'wx' });
    } catch {
      throw new ZipArchiveError('invalid-zip', `Cannot unpack ${file.path}`);
    }
  }
}

const HISTORY_REF = /^(?:refs\/heads\/|refs\/tags\/)[^\0]+$/u;

function preferredBranch(heads: ReadonlyArray<{ sha: string; ref: string }>): string | undefined {
  const head = heads.find((entry) => entry.ref === 'HEAD')?.sha;
  const branches = heads.filter((entry) => entry.ref.startsWith('refs/heads/'));
  const matching = branches.filter((entry) => entry.sha === head).map((entry) => entry.ref);
  for (const name of ['refs/heads/main', 'refs/heads/master']) {
    if (matching.includes(name)) return name;
  }
  return matching.sort()[0] ?? branches.map((entry) => entry.ref).sort()[0];
}

export function restoreBotHistory(root: string, bundle: Buffer): void {
  withTempFile((file) => {
    try {
      writeFileSync(file, bundle);
      git(root, ['init', '--quiet', '-b', 'main']);
      git(root, ['bundle', 'verify', '--quiet', file]);
      const heads = git(root, ['bundle', 'list-heads', file])
        .split('\n')
        .map((line) => {
          const [sha = '', ref = ''] = line.trim().split(/\s+/u, 2);
          return { sha, ref };
        })
        .filter((entry) => /^[0-9a-f]{40,64}$/u.test(entry.sha));
      const refs = heads.filter((entry) => HISTORY_REF.test(entry.ref));
      const branch = preferredBranch(heads);
      if (branch === undefined) throw new Error('no branch');
      git(root, [
        '-c',
        'transfer.fsckObjects=true',
        'fetch',
        '--quiet',
        '--no-tags',
        '--no-write-fetch-head',
        '--update-head-ok',
        file,
        ...refs.map((entry) => `${entry.ref}:${entry.ref}`),
      ]);
      git(root, ['symbolic-ref', 'HEAD', branch]);
      git(root, ['reset', '--quiet']);
    } catch {
      rmSync(join(root, '.git'), { recursive: true, force: true });
      throw new ZipArchiveError('invalid-zip', 'The Git history in this zip could not be restored');
    }
  });
}
