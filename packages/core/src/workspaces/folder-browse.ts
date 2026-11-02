import { fork, type ChildProcess } from 'node:child_process';
import { homedir } from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDriveRoots, type DriveRoots } from './drive-roots.js';
import type {
  FolderReadReply,
  FolderReadRequest,
  FolderReadResult,
} from './folder-browse-worker.js';

export const FOLDER_BROWSE_LIMIT = 500;
export const FOLDER_BROWSE_DEADLINE_MS = 5_000;
const PATH_LIMIT = 1024;
const ROOTS_WAIT_MS = 1_500;
const WORKER_IDLE_MS = 120_000;

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
  nextOffset?: number;
  roots: BrowsedFolder[];
  nativePicker?: boolean;
}

export type FolderBrowseRefusal =
  | 'folder-browse/invalid-path'
  | 'folder-browse/not-found'
  | 'folder-browse/not-directory'
  | 'folder-browse/denied'
  | 'folder-browse/unreadable'
  | 'folder-browse/timeout'
  | 'folder-browse/unavailable';

const REFUSALS = new Set<string>([
  'folder-browse/invalid-path',
  'folder-browse/not-found',
  'folder-browse/not-directory',
  'folder-browse/denied',
  'folder-browse/unreadable',
  'folder-browse/timeout',
  'folder-browse/unavailable',
] satisfies FolderBrowseRefusal[]);

export class FolderBrowseError extends Error {
  constructor(
    readonly code: FolderBrowseRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'FolderBrowseError';
  }
}

export type FolderRead = (request: Omit<FolderReadRequest, 'id'>) => Promise<FolderReadResult>;

export interface FolderBrowserDeps {
  platform?: NodeJS.Platform;
  home?: string;
  read?: FolderRead;
  drives?: DriveRoots;
  nativePicker?: () => boolean;
}

export interface FolderBrowser {
  list(path?: string, offset?: number): Promise<FolderListing>;
  close(): void;
}

export interface FolderWorkerOptions {
  spawn?: () => ChildProcess;
  deadlineMs?: number;
  idleMs?: number;
}

export interface FolderWorker {
  read: FolderRead;
  close(): void;
}

export function spawnFolderWorker(): ChildProcess {
  const source = import.meta.url.endsWith('.ts');
  const entry = new URL(
    source ? './folder-browse-worker.ts' : './folder-browse-worker.mjs',
    import.meta.url,
  );
  return fork(fileURLToPath(entry), [], {
    env: { ...process.env, BOTHARNESS_FOLDER_BROWSE_WORKER: '1' },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    execArgv: source ? ['--experimental-strip-types', '--no-warnings'] : [],
  });
}

export function createFolderWorker(options: FolderWorkerOptions = {}): FolderWorker {
  const spawn = options.spawn ?? spawnFolderWorker;
  const deadlineMs = options.deadlineMs ?? FOLDER_BROWSE_DEADLINE_MS;
  const idleMs = options.idleMs ?? WORKER_IDLE_MS;
  interface Waiter {
    resolve: (reply: FolderReadResult) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }
  interface Live {
    process: ChildProcess;
    waiters: Map<number, Waiter>;
    idle?: NodeJS.Timeout;
    retired?: boolean;
  }
  let live: Live | undefined;
  let nextId = 1;

  const retire = (target: Live, error?: FolderBrowseError): void => {
    if (target.retired === true) return;
    target.retired = true;
    if (live === target) live = undefined;
    clearTimeout(target.idle);
    for (const waiter of target.waiters.values()) {
      clearTimeout(waiter.timer);
      if (error !== undefined) waiter.reject(error);
    }
    target.waiters.clear();
    target.process.kill();
  };

  const start = (): Live => {
    const process = spawn();
    const target: Live = { process, waiters: new Map() };
    process.on('message', (reply: FolderReadReply) => {
      const waiter = target.waiters.get(reply.id);
      if (waiter === undefined) return;
      target.waiters.delete(reply.id);
      clearTimeout(waiter.timer);
      const { id: _id, ...result } = reply;
      waiter.resolve(result);
      if (target.waiters.size === 0) {
        target.idle = setTimeout(() => retire(target), idleMs);
        target.idle.unref?.();
      }
    });
    const lost = (): void =>
      retire(
        target,
        new FolderBrowseError('folder-browse/unavailable', 'The folder reader stopped. Try again.'),
      );
    process.on('exit', lost);
    process.on('error', lost);
    process.unref();
    process.channel?.unref();
    return target;
  };

  return {
    read(request) {
      return new Promise((resolve, reject) => {
        live ??= start();
        const target = live;
        clearTimeout(target.idle);
        const id = nextId++;
        const timer = setTimeout(
          () =>
            retire(
              target,
              new FolderBrowseError(
                'folder-browse/timeout',
                'That folder did not answer in time. A network drive may be disconnected.',
              ),
            ),
          deadlineMs,
        );
        target.waiters.set(id, { resolve, reject, timer });
        target.process.send({ ...request, id } satisfies FolderReadRequest);
      });
    },
    close() {
      if (live !== undefined)
        retire(
          live,
          new FolderBrowseError(
            'folder-browse/unavailable',
            'The folder reader stopped. Try again.',
          ),
        );
    },
  };
}

export function createFolderBrowser(deps: FolderBrowserDeps = {}): FolderBrowser {
  const platform = deps.platform ?? process.platform;
  const path = platform === 'win32' ? nodePath.win32 : nodePath.posix;
  const home = deps.home ?? homedir();
  const worker = deps.read === undefined ? createFolderWorker() : undefined;
  const read = deps.read ?? worker!.read;
  const drives = deps.drives ?? (platform === 'win32' ? createDriveRoots() : undefined);

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

  const roots = async (target: string): Promise<BrowsedFolder[]> => {
    const places = [folder(home)];
    if (drives === undefined) return [...places, folder('/')];
    const known = (await drives.get(ROOTS_WAIT_MS))?.map((drive) => drive.path) ?? [];
    const letters =
      known.length > 0
        ? known
        : [
            ...new Set(
              [path.parse(home).root, path.parse(target).root].map((root) => root.toUpperCase()),
            ),
          ];
    return [...places, ...letters.map((drive) => folder(drive))];
  };

  return {
    async list(input, offset = 0) {
      const target = resolve(input);
      const [reply, places] = await Promise.all([
        read({ path: target, platform, offset, limit: FOLDER_BROWSE_LIMIT }),
        roots(target),
      ]);
      if (!reply.ok)
        throw new FolderBrowseError(
          REFUSALS.has(reply.code)
            ? (reply.code as FolderBrowseRefusal)
            : 'folder-browse/unreadable',
          reply.message,
        );
      const next = offset + reply.entries.length;
      return {
        path: target,
        home,
        crumbs: crumbsOf(target),
        entries: reply.entries.map((entry) => ({
          name: entry.name,
          path: path.join(target, entry.name),
          hidden: entry.hidden,
        })),
        truncated: next < reply.total,
        ...(next < reply.total ? { nextOffset: next } : {}),
        roots: places,
        ...(deps.nativePicker?.() === true ? { nativePicker: true } : {}),
      };
    },
    close() {
      worker?.close();
    },
  };
}
