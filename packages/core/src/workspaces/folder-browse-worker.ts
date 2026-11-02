import { readdir, stat } from 'node:fs/promises';
import nodePath from 'node:path';

export interface FolderReadRequest {
  id: number;
  path: string;
  platform: NodeJS.Platform;
  offset: number;
  limit: number;
}

export interface FolderReadEntry {
  name: string;
  hidden: boolean;
}

export type FolderReadResult =
  | { ok: true; entries: FolderReadEntry[]; total: number }
  | { ok: false; code: string; message: string };

export type FolderReadReply = FolderReadResult & { id: number };

export interface FolderReadFs {
  readdir(path: string): Promise<FolderReadDirent[]>;
  isDirectory(path: string): Promise<boolean>;
}

export interface FolderReadDirent {
  name: string;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

const CACHE_MS = 30_000;
const CACHE_LEVELS = 8;
const LINK_CONCURRENCY = 8;

const nodeFs: FolderReadFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  async isDirectory(path) {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  },
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

function compare(left: FolderReadEntry, right: FolderReadEntry): number {
  return Number(left.hidden) - Number(right.hidden) || collator.compare(left.name, right.name);
}

export async function readFolderLevel(
  target: string,
  platform: NodeJS.Platform,
  fs: FolderReadFs = nodeFs,
): Promise<FolderReadEntry[]> {
  const path = platform === 'win32' ? nodePath.win32 : nodePath.posix;
  const names: string[] = [];
  const links: string[] = [];
  for (const entry of await fs.readdir(target)) {
    if (entry.isDirectory()) names.push(entry.name);
    else if (entry.isSymbolicLink()) links.push(entry.name);
  }
  for (let at = 0; at < links.length; at += LINK_CONCURRENCY) {
    const batch = links.slice(at, at + LINK_CONCURRENCY);
    const kinds = await Promise.all(batch.map((name) => fs.isDirectory(path.join(target, name))));
    batch.forEach((name, index) => {
      if (kinds[index]) names.push(name);
    });
  }
  return names.map((name) => ({ name, hidden: name.startsWith('.') })).toSorted(compare);
}

function errnoCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export function readFailure(error: unknown): { code: string; message: string } {
  const code = errnoCode(error);
  if (code === 'ENOENT')
    return { code: 'folder-browse/not-found', message: 'That folder does not exist.' };
  if (code === 'ENOTDIR')
    return { code: 'folder-browse/not-directory', message: 'That path is not a folder.' };
  if (code === 'EACCES' || code === 'EPERM')
    return {
      code: 'folder-browse/denied',
      message: 'The computer does not allow reading that folder.',
    };
  return {
    code: 'folder-browse/unreadable',
    message: `The computer could not read that folder${code === undefined ? '' : ` (${code})`}.`,
  };
}

export function createFolderReader(fs: FolderReadFs = nodeFs, now: () => number = Date.now) {
  const levels = new Map<string, { at: number; entries: FolderReadEntry[] }>();
  return async (request: FolderReadRequest): Promise<FolderReadReply> => {
    try {
      const key = `${request.platform}:${request.path}`;
      let level = levels.get(key);
      if (level === undefined || request.offset === 0 || now() - level.at > CACHE_MS) {
        level = { at: now(), entries: await readFolderLevel(request.path, request.platform, fs) };
        levels.delete(key);
        levels.set(key, level);
        for (const stale of levels.keys()) {
          if (levels.size <= CACHE_LEVELS) break;
          levels.delete(stale);
        }
      }
      return {
        id: request.id,
        ok: true,
        entries: level.entries.slice(request.offset, request.offset + request.limit),
        total: level.entries.length,
      };
    } catch (error) {
      return { id: request.id, ok: false, ...readFailure(error) };
    }
  };
}

if (process.env['BOTHARNESS_FOLDER_BROWSE_WORKER'] === '1' && process.send !== undefined) {
  const read = createFolderReader();
  process.on('message', (request: FolderReadRequest) => {
    void read(request).then((reply) => process.send?.(reply));
  });
  process.on('disconnect', () => process.exit(0));
}
