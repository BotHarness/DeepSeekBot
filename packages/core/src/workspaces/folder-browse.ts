import { existsSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { homedir } from 'node:os';
import nodePath from 'node:path';

export const FOLDER_BROWSE_LIMIT = 500;
const PATH_LIMIT = 1024;

export interface BrowsedFolder {
  name: string;
  path: string;
  hidden: boolean;
}

export interface FolderListing {
  path: string;
  home: string;
  crumbs: BrowsedFolder[];
  entries: BrowsedFolder[];
  truncated: boolean;
  roots: BrowsedFolder[];
}

export type FolderBrowseRefusal =
  | 'folder-browse/invalid-path'
  | 'folder-browse/not-found'
  | 'folder-browse/not-directory'
  | 'folder-browse/denied';

export class FolderBrowseError extends Error {
  constructor(
    readonly code: FolderBrowseRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'FolderBrowseError';
  }
}

export interface FolderBrowserDeps {
  platform?: NodeJS.Platform;
  home?: string;
  readdir?: (path: string) => Dirent[];
  isDirectory?: (path: string) => boolean;
  exists?: (path: string) => boolean;
}

export interface FolderBrowser {
  list(path?: string): FolderListing;
}

function errnoCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export function createFolderBrowser(deps: FolderBrowserDeps = {}): FolderBrowser {
  const platform = deps.platform ?? process.platform;
  const path = platform === 'win32' ? nodePath.win32 : nodePath.posix;
  const home = deps.home ?? homedir();
  const readdir = deps.readdir ?? ((dir: string) => readdirSync(dir, { withFileTypes: true }));
  const isDirectory =
    deps.isDirectory ??
    ((target: string) => {
      try {
        return statSync(target).isDirectory();
      } catch {
        return false;
      }
    });
  const exists = deps.exists ?? existsSync;

  const folder = (target: string, name?: string): BrowsedFolder => {
    const label = name ?? (path.basename(target) || target);
    return { name: label, path: target, hidden: label.startsWith('.') && label !== target };
  };

  const resolve = (input: string | undefined): string => {
    if (input === undefined || input.trim() === '' || input.trim() === '~') return home;
    const raw = input.trim();
    if (raw.length > PATH_LIMIT || raw.includes('\0'))
      throw new FolderBrowseError('folder-browse/invalid-path', 'The folder path is not valid.');
    const expanded = /^~[\\/]/.test(raw) ? path.join(home, raw.slice(2)) : raw;
    if (!path.isAbsolute(expanded) || (platform === 'win32' && !/^[a-z]:/i.test(expanded)))
      throw new FolderBrowseError(
        'folder-browse/invalid-path',
        'Use a full folder path on the computer.',
      );
    const resolved = path.resolve(expanded);
    const root = path.parse(resolved).root;
    return resolved.length > root.length ? resolved.replace(/[\\/]+$/, '') : root;
  };

  const crumbsOf = (target: string): BrowsedFolder[] => {
    const crumbs: BrowsedFolder[] = [];
    for (let at = target; ; at = path.dirname(at)) {
      crumbs.unshift(folder(at));
      if (path.dirname(at) === at) return crumbs;
    }
  };

  const roots = (): BrowsedFolder[] => {
    const places = [folder(home)];
    if (platform !== 'win32') return [...places, folder('/')];
    for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`;
      if (exists(drive)) places.push(folder(drive));
    }
    return places;
  };

  return {
    list(input) {
      const target = resolve(input);
      let dirents: Dirent[];
      try {
        dirents = readdir(target);
      } catch (error) {
        const code = errnoCode(error);
        if (code === 'ENOENT')
          throw new FolderBrowseError('folder-browse/not-found', 'That folder does not exist.');
        if (code === 'ENOTDIR')
          throw new FolderBrowseError('folder-browse/not-directory', 'That path is not a folder.');
        if (code === 'EACCES' || code === 'EPERM')
          throw new FolderBrowseError(
            'folder-browse/denied',
            'The computer does not allow reading that folder.',
          );
        throw error;
      }
      const folders = dirents
        .filter(
          (entry) =>
            entry.isDirectory() ||
            (entry.isSymbolicLink() && isDirectory(path.join(target, entry.name))),
        )
        .map((entry) => folder(path.join(target, entry.name), entry.name))
        .toSorted(
          (left, right) =>
            Number(left.hidden) - Number(right.hidden) ||
            left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
        );
      return {
        path: target,
        home,
        crumbs: crumbsOf(target),
        entries: folders.slice(0, FOLDER_BROWSE_LIMIT),
        truncated: folders.length > FOLDER_BROWSE_LIMIT,
        roots: roots(),
      };
    },
  };
}
