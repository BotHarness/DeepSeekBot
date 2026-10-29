import { execFile } from 'node:child_process';

export interface DriveRoot {
  path: string;
  network: boolean;
}

export type DriveQuery = (signal: AbortSignal) => Promise<string>;

export interface DriveRoots {
  get(waitMs: number): Promise<DriveRoot[] | undefined>;
}

const SCRIPT =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
  '[IO.DriveInfo]::GetDrives()|ForEach-Object{$_.Name+"`t"+$_.DriveType}';
const QUERY_TIMEOUT_MS = 10_000;
export const DRIVE_ROOTS_TTL_MS = 30_000;

export const powershellDrives: DriveQuery = (signal) =>
  new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { windowsHide: true, timeout: QUERY_TIMEOUT_MS, signal, encoding: 'utf8' },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });

export function parseDrives(output: string): DriveRoot[] {
  const roots: DriveRoot[] = [];
  for (const line of output.split(/\r?\n/)) {
    const [name, type] = line.trim().split('\t');
    const letter = /^([a-z]):\\?$/i.exec(name ?? '')?.[1];
    if (letter === undefined || type === 'NoRootDirectory') continue;
    roots.push({ path: `${letter.toUpperCase()}:\\`, network: type === 'Network' });
  }
  return roots.toSorted((left, right) => left.path.localeCompare(right.path));
}

export function createDriveRoots(
  query: DriveQuery = powershellDrives,
  now: () => number = Date.now,
  ttlMs = DRIVE_ROOTS_TTL_MS,
): DriveRoots {
  let cached: { at: number; roots: DriveRoot[] } | undefined;
  let pending: Promise<void> | undefined;
  const current = (): DriveRoot[] | undefined => cached?.roots;

  const refresh = (): Promise<void> => {
    pending ??= query(AbortSignal.timeout(QUERY_TIMEOUT_MS))
      .then(
        (output) => {
          cached = { at: now(), roots: parseDrives(output) };
        },
        () => {
          cached = { at: now(), roots: cached?.roots ?? [] };
        },
      )
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };

  return {
    async get(waitMs) {
      if (cached !== undefined) {
        if (now() - cached.at > ttlMs) void refresh();
        return cached.roots;
      }
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        refresh(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, waitMs);
          timer.unref?.();
        }),
      ]);
      clearTimeout(timer);
      return current();
    },
  };
}
