import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseMemoryGitUrl } from './clone.js';
import { probeGit, type GitAvailability } from './git-probe.js';

const execFileAsync = promisify(execFile);
export const MEMORY_PUSH_TIMEOUT_MS = 120_000;

/** Push failure codes. No code ever carries the credential or remote URL. */
export type MemoryPushFailureCode =
  | 'invalid-git-url'
  | 'git-not-found'
  | 'git-push-auth-failed'
  | 'git-push-timeout'
  | 'git-push-failed';

export type MemoryPushResult =
  | { ok: true; pushedSha: string }
  | { ok: false; code: MemoryPushFailureCode };

export interface MemoryPushCredential {
  /**
   * Opaque HTTPS Authorization header value. Never logged.
   * Scheme is the caller's choice: GitHub's git HTTPS endpoints require
   * `Basic base64(x-access-token:<pat>)` — a `Bearer` PAT authenticates the
   * REST API but is rejected by `git push` with "invalid credentials".
   */
  readonly authorizationHeader: string;
}

export interface MemoryPushInput {
  /** Working tree of the Memory Repository to push from. */
  repoPath: string;
  /** Destination remote URL. HTTPS or SSH, no embedded credentials. */
  remoteUrl: string;
  /** Refspec to push. Defaults to the current HEAD. */
  refspec?: string;
  /** HTTPS credential. Omitted for SSH remotes (Host SSH agent applies). */
  credential?: MemoryPushCredential;
  timeoutMs?: number;
  probe?: () => GitAvailability;
}

const AUTH_FAILURES = [
  /authentication failed/iu,
  /could not authenticate/iu,
  /could not read (username|password)/iu,
  /invalid credentials/iu,
  /permission denied \(publickey\)/iu,
  /\b401\b/,
  /\b403\b/,
] as const;

function isHttpsUrl(url: string): boolean {
  return url.startsWith('https://');
}

function pushFailure(stderr: string, killed: boolean, code?: unknown): MemoryPushFailureCode {
  if (killed || code === 'ETIMEDOUT') return 'git-push-timeout';
  if (AUTH_FAILURES.some((pattern) => pattern.test(stderr))) return 'git-push-auth-failed';
  return 'git-push-failed';
}

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    GIT_SSH_COMMAND: process.env['GIT_SSH_COMMAND'] ?? 'ssh -oBatchMode=yes',
  };
}

/**
 * Push the repo at `repoPath` to `remoteUrl` without touching its remotes.
 * The credential travels only in a per-process `http.extraHeader` config flag:
 * never in the URL, never in argv beyond this process, never in error output.
 */
export async function pushGitRemote(input: {
  repoPath: string;
  remoteUrl: string;
  refspec?: string | undefined;
  credential?: MemoryPushCredential | undefined;
  timeoutMs?: number | undefined;
}): Promise<MemoryPushResult> {
  const timeoutMs = input.timeoutMs ?? MEMORY_PUSH_TIMEOUT_MS;
  const header =
    input.credential === undefined || !isHttpsUrl(input.remoteUrl)
      ? []
      : ['-c', `http.extraHeader=Authorization: ${input.credential.authorizationHeader}`];
  try {
    await execFileAsync(
      'git',
      [...header, 'push', '--quiet', '--', input.remoteUrl, input.refspec ?? 'HEAD'],
      {
        cwd: input.repoPath,
        timeout: timeoutMs,
        maxBuffer: 512 * 1_024,
        windowsHide: true,
        env: gitEnv(),
      },
    );
  } catch (error) {
    const failure = error as { killed?: boolean; code?: unknown; stderr?: unknown };
    const stderr = typeof failure.stderr === 'string' ? failure.stderr : '';
    return { ok: false, code: pushFailure(stderr, failure.killed === true, failure.code) };
  }
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: input.repoPath,
      timeout: 10_000,
      maxBuffer: 64 * 1_024,
      windowsHide: true,
      env: gitEnv(),
    });
    return { ok: true, pushedSha: stdout.trim() };
  } catch {
    return { ok: false, code: 'git-push-failed' };
  }
}

/** Validated entry point: same URL rules as import (`clone.ts`), same probe. */
export async function pushMemoryRepository(input: MemoryPushInput): Promise<MemoryPushResult> {
  const remoteUrl = parseMemoryGitUrl(input.remoteUrl);
  if (remoteUrl === undefined) return { ok: false, code: 'invalid-git-url' };
  if (!(input.probe ?? probeGit)().available) return { ok: false, code: 'git-not-found' };
  return pushGitRemote({
    repoPath: input.repoPath,
    remoteUrl,
    refspec: input.refspec,
    credential: input.credential,
    timeoutMs: input.timeoutMs,
  });
}
