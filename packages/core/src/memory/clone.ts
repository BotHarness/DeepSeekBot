import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { promisify } from 'node:util';

import { probeGit, type GitAvailability } from './git-probe.js';

const execFileAsync = promisify(execFile);
const MAX_GIT_URL_LENGTH = 2_048;
export const MEMORY_CLONE_TIMEOUT_MS = 120_000;

export type MemoryCloneFailureCode =
  | 'invalid-git-url'
  | 'git-not-found'
  | 'git-clone-failed'
  | 'git-clone-timeout';

export type SshFailureReason =
  | 'auth'
  | 'host-key'
  | 'unreachable'
  | 'ssh-missing'
  | 'timeout'
  | 'other';

export interface HttpsFallback {
  from: string;
  to: string;
  reason: SshFailureReason;
  detail?: string;
}

export type MemoryCloneResult =
  | { ok: true; httpsFallback?: HttpsFallback }
  | { ok: false; code: MemoryCloneFailureCode };

export function parseMemoryGitUrl(raw: string): string | undefined {
  if (/[\u0000-\u001f\u007f]/u.test(raw)) return undefined;
  const value = raw.trim();
  if (
    value.length === 0 ||
    value.length > MAX_GIT_URL_LENGTH ||
    /[\u0000-\u0020\u007f]/u.test(value)
  ) {
    return undefined;
  }

  if (value.startsWith('https://') || value.startsWith('ssh://')) {
    try {
      const url = new URL(value);
      if (!url.hostname || !url.pathname || url.pathname === '/' || url.search || url.hash) {
        return undefined;
      }
      if (url.password || (url.protocol === 'https:' && url.username)) return undefined;
      return value;
    } catch {
      return undefined;
    }
  }

  return /^[A-Za-z_][A-Za-z0-9_.-]*@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+$/u.test(value)
    ? value
    : undefined;
}

const REPOSITORY_PATH = /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)+$/u;

function httpsFor(host: string, rawPath: string): string | undefined {
  const path = rawPath.replace(/\/+$/u, '').replace(/\.git$/u, '');
  return REPOSITORY_PATH.test(path) ? `https://${host}${path}.git` : undefined;
}

export function httpsUrlForSsh(url: string): string | undefined {
  const scp = /^git@([A-Za-z0-9.-]+):([^/].*)$/u.exec(url);
  if (scp !== null) return httpsFor(scp[1] ?? '', `/${scp[2] ?? ''}`);
  if (!url.startsWith('ssh://')) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.port !== '' || (parsed.username !== '' && parsed.username !== 'git'))
      return undefined;
    return httpsFor(parsed.hostname, parsed.pathname);
  } catch {
    return undefined;
  }
}

function cloneFailure(error: unknown): MemoryCloneFailureCode {
  const failure = error as NodeJS.ErrnoException & { killed?: boolean };
  if (failure.code === 'ENOENT') return 'git-not-found';
  return failure.killed || failure.code === 'ETIMEDOUT' ? 'git-clone-timeout' : 'git-clone-failed';
}

const SSH_FAILURES: [RegExp, SshFailureReason][] = [
  [/ssh: (?:command )?not found|cannot run ssh|'ssh' is not recognized/iu, 'ssh-missing'],
  [/permission denied|publickey|authentication failed/iu, 'auth'],
  [/host key verification failed|remote host identification has changed/iu, 'host-key'],
  [
    /could not resolve hostname|connection refused|connection timed out|network is unreachable|no route to host|connection closed|connection reset|port 22/iu,
    'unreachable',
  ],
];

function sshFailure(error: unknown): Pick<HttpsFallback, 'reason' | 'detail'> {
  const failure = error as { killed?: boolean; code?: unknown; stderr?: unknown };
  if (failure.killed || failure.code === 'ETIMEDOUT') return { reason: 'timeout' };
  const lines = (typeof failure.stderr === 'string' ? failure.stderr : '')
    .split(/\r?\n/u)
    .map((line) => line.replace(/^(fatal|error):\s*/iu, '').trim())
    .filter((line) => line.length > 0);
  const match = lines.find((line) => SSH_FAILURES.some(([pattern]) => pattern.test(line)));
  const detail = (match ?? lines[0])?.slice(0, 200);
  const reason = match === undefined ? 'other' : SSH_FAILURES.find(([p]) => p.test(match))![1];
  return detail === undefined ? { reason } : { reason, detail };
}

function gitClone(url: string, destination: string, timeoutMs: number) {
  return execFileAsync('git', ['clone', '--quiet', '--', url, destination], {
    timeout: timeoutMs,
    maxBuffer: 512 * 1_024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
      GIT_SSH_COMMAND: process.env['GIT_SSH_COMMAND'] ?? 'ssh -oBatchMode=yes',
    },
  });
}

export async function cloneMemoryRepository(input: {
  url: string;
  destination: string;
  timeoutMs?: number;
  probe?: () => GitAvailability;
}): Promise<MemoryCloneResult> {
  const url = parseMemoryGitUrl(input.url);
  if (url === undefined) return { ok: false, code: 'invalid-git-url' };

  if (!(input.probe ?? probeGit)().available) return { ok: false, code: 'git-not-found' };

  const timeoutMs = input.timeoutMs ?? MEMORY_CLONE_TIMEOUT_MS;
  try {
    await gitClone(url, input.destination, timeoutMs);
    return { ok: true };
  } catch (error) {
    const code = cloneFailure(error);
    const https = code === 'git-not-found' ? undefined : httpsUrlForSsh(url);
    if (https === undefined) return { ok: false, code };
    rmSync(input.destination, { recursive: true, force: true });
    try {
      await gitClone(https, input.destination, timeoutMs);
      return { ok: true, httpsFallback: { from: url, to: https, ...sshFailure(error) } };
    } catch {
      rmSync(input.destination, { recursive: true, force: true });
      return { ok: false, code };
    }
  }
}

export type MemoryRepositoryPreview =
  | { ok: true; gitUrl: string; commit: string; httpsFallback?: HttpsFallback }
  | { ok: false; code: MemoryCloneFailureCode };
export async function previewMemoryRepository(input: {
  url: string;
  timeoutMs?: number;
}): Promise<MemoryRepositoryPreview> {
  const url = parseMemoryGitUrl(input.url);
  if (url === undefined) return { ok: false, code: 'invalid-git-url' };
  const inspect = async (target: string) => {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-remote', '--exit-code', '--', target, 'HEAD'],
      {
        timeout: input.timeoutMs ?? MEMORY_CLONE_TIMEOUT_MS,
        maxBuffer: 512 * 1024,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'Never',
          GIT_SSH_COMMAND: process.env['GIT_SSH_COMMAND'] ?? 'ssh -oBatchMode=yes',
        },
      },
    );
    const commit = /^((?:[a-f0-9]{40}|[a-f0-9]{64}))\s+HEAD(?:\r?\n|$)/u.exec(stdout)?.[1];
    if (!commit) throw new Error('No repository HEAD');
    return commit;
  };
  try {
    return { ok: true, gitUrl: url, commit: await inspect(url) };
  } catch (error) {
    const code = cloneFailure(error);
    const fallback = code === 'git-not-found' ? undefined : httpsUrlForSsh(url);
    if (!fallback) return { ok: false, code };
    try {
      return {
        ok: true,
        gitUrl: url,
        commit: await inspect(fallback),
        httpsFallback: { from: url, to: fallback, ...sshFailure(error) },
      };
    } catch {
      return { ok: false, code };
    }
  }
}
export async function memoryRepositoryMatchesCommit(
  directory: string,
  commit: string,
): Promise<boolean> {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(commit)) return false;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: directory,
      timeout: 10000,
      maxBuffer: 4096,
      windowsHide: true,
    });
    return stdout.trim() === commit;
  } catch {
    return false;
  }
}
