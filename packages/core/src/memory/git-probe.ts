import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { posix, win32 } from 'node:path';

export const MINIMUM_GIT_VERSION = '2.28';

export type GitUnavailableReason = 'missing' | 'unrunnable' | 'too-old';

export type GitAvailability =
  | { available: true; version: string }
  | { available: false; reason: GitUnavailableReason; version?: string };

export interface GitProbeHost {
  platform: NodeJS.Platform;
  path: string | undefined;
  exists(path: string): boolean;
  realpath(path: string): string;
  run(command: string, args: readonly string[]): string;
}

const MINIMUM = MINIMUM_GIT_VERSION.split('.').map(Number) as [number, number];

const defaultHost: GitProbeHost = {
  platform: process.platform,
  get path() {
    return process.env['PATH'];
  },
  exists: existsSync,
  realpath: (path) => realpathSync(path),
  run: (command, args) =>
    execFileSync(command, [...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5_000,
      windowsHide: true,
    }),
};

export function parseGitVersion(output: string): string | undefined {
  return /git version (\d+\.\d+(?:\.\d+)?)/u.exec(output)?.[1];
}

function atLeast(version: string, [wantMajor, wantMinor]: readonly [number, number]): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > wantMajor || (major === wantMajor && minor >= wantMinor);
}

let sinceAsFilter: boolean | undefined;

export function resetGitCapabilities(): void {
  sinceAsFilter = undefined;
}

export function gitSupportsSinceAsFilter(probe: () => GitAvailability = probeGit): boolean {
  if (sinceAsFilter !== undefined) return sinceAsFilter;
  const git = probe();
  sinceAsFilter = git.available && atLeast(git.version, [2, 37]);
  return sinceAsFilter;
}

function firstOnPath(host: GitProbeHost): string | undefined {
  const path = host.platform === 'win32' ? win32 : posix;
  for (const dir of (host.path ?? '').split(path.delimiter)) {
    if (dir.length === 0) continue;
    const candidate = path.join(dir, 'git');
    if (host.exists(candidate)) return candidate;
  }
  return undefined;
}

function isMacCommandLineToolsStub(host: GitProbeHost): boolean {
  if (host.platform !== 'darwin') return false;
  const git = firstOnPath(host);
  if (git === undefined) return false;
  let resolved = git;
  try {
    resolved = host.realpath(git);
  } catch {}
  if (resolved !== '/usr/bin/git') return false;
  try {
    host.run('xcode-select', ['-p']);
    return false;
  } catch {
    return true;
  }
}

export function probeGit(host: GitProbeHost = defaultHost): GitAvailability {
  if (isMacCommandLineToolsStub(host)) return { available: false, reason: 'unrunnable' };
  let output: string;
  try {
    output = host.run('git', ['--version']);
  } catch (error) {
    return {
      available: false,
      reason: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unrunnable',
    };
  }
  const version = parseGitVersion(output);
  if (version === undefined) return { available: false, reason: 'unrunnable' };
  if (!atLeast(version, MINIMUM)) return { available: false, reason: 'too-old', version };
  return { available: true, version };
}
