import { syncGitSteps, type GitSteps } from './git-steps.js';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { MemoryAcceptError } from './accepted-types.js';
import type { MemoryCommitSummary } from './accepted-types.js';

export const MAX_FILE_BYTES = 1024 * 1024;

export const MAX_DIFF_BYTES = 4 * 1024 * 1024;

export function run(root: string, args: string[], maxBuffer = MAX_DIFF_BYTES): Buffer {
  return syncGitSteps(runSteps(root, args, maxBuffer));
}

export function* runSteps(
  root: string,
  args: string[],
  maxBuffer = MAX_DIFF_BYTES,
): GitSteps<Buffer> {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  try {
    return yield {
      args: [
        `--git-dir=${join(root, '.git')}`,
        `--work-tree=${root}`,
        '-c',
        `core.worktree=${root}`,
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'core.attributesFile=/dev/null',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      options: {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer,
        windowsHide: true,
      },
    };
  } catch {
    throw new MemoryAcceptError(
      'memory-invalid',
      `Memory Git operation failed: ${args[0] ?? 'unknown'}`,
    );
  }
}

export function output(root: string, args: string[]): string {
  return syncGitSteps(outputSteps(root, args));
}

export function* outputSteps(root: string, args: string[]): GitSteps<string> {
  return (yield* runSteps(root, args)).toString('utf8').trim();
}

export function branchOf(root: string): string {
  return syncGitSteps(branchOfSteps(root));
}

export function* branchOfSteps(root: string): GitSteps<string> {
  try {
    return yield* outputSteps(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  } catch {
    throw new MemoryAcceptError('memory-invalid', 'Memory Repository must be on a local branch');
  }
}

export function verifiedRepository(root: string, botSlug: string): string {
  return syncGitSteps(verifiedRepositorySteps(root, botSlug));
}

function* verifiedRepositorySteps(root: string, botSlug: string): GitSteps<string> {
  if (
    !existsSync(join(root, '.git')) ||
    !lstatSync(join(root, '.git')).isDirectory() ||
    lstatSync(join(root, '.git')).isSymbolicLink()
  ) {
    throw new MemoryAcceptError('memory-unavailable', `Memory Repository unavailable: ${botSlug}`);
  }
  yield* branchOfSteps(root);
  return root;
}

export function repository(registry: PersonaBotRegistry, botSlug: string): string {
  return syncGitSteps(repositorySteps(registry, botSlug));
}

export function* repositorySteps(registry: PersonaBotRegistry, botSlug: string): GitSteps<string> {
  const root = registry.memoryDirFor(botSlug);
  if (root === undefined) {
    throw new MemoryAcceptError('memory-unavailable', `Memory Repository unavailable: ${botSlug}`);
  }
  return yield* verifiedRepositorySteps(root, botSlug);
}

export const MAX_RECORDED_COMMITS = 20;

const MAX_RECORDED_PATHS = 20;

export function* commitSummarySteps(root: string, sha: string): GitSteps<MemoryCommitSummary> {
  const [fullSha = sha, subject = '', authorName = '', authoredAt = ''] = (yield* outputSteps(
    root,
    ['show', '--no-patch', '--format=%H%x1f%s%x1f%an%x1f%aI', sha],
  )).split('\x1f');
  const files = (yield* outputSteps(root, ['show', '--numstat', '--no-renames', '--format=', sha]))
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [added = '-', deleted = '-', ...path] = line.split('\t');
      return {
        path: path.join('\t'),
        added: added === '-' ? null : Number(added),
        deleted: deleted === '-' ? null : Number(deleted),
      };
    });
  return {
    sha: fullSha,
    subject: subject.slice(0, 200),
    authorName: authorName.slice(0, 100),
    authoredAt,
    files: files.slice(0, MAX_RECORDED_PATHS),
    moreFiles: Math.max(0, files.length - MAX_RECORDED_PATHS),
  };
}

export function head(root: string): string {
  return syncGitSteps(headSteps(root));
}

export function* headSteps(root: string): GitSteps<string> {
  const sha = yield* outputSteps(root, ['rev-parse', '--verify', 'HEAD']);
  if (!/^[0-9a-f]{40}$/u.test(sha)) {
    throw new MemoryAcceptError('memory-invalid', 'Memory Repository HEAD is invalid');
  }
  return sha;
}

export function dirty(root: string): boolean {
  return run(root, ['status', '--porcelain', '-z', '--untracked-files=all']).length > 0;
}

export function validateCommit(root: string, sha: string): string {
  return syncGitSteps(validateCommitSteps(root, sha));
}

export function* validateCommitSteps(root: string, sha: string): GitSteps<string> {
  const tree = yield* outputSteps(root, ['rev-parse', '--verify', `${sha}^{tree}`]);
  return JSON.stringify({ gitTree: tree });
}

export function listCurrentFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(join(root, relativeDir), { withFileTypes: true })) {
      if (relativeDir === '' && entry.name === '.git') continue;
      const path = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(path);
    }
  };
  walk('');
  return files.sort();
}

export function parentOf(root: string, sha: string): string | null {
  const parents = output(root, ['rev-list', '--parents', '-n', '1', sha]).split(' ');
  if (parents.length > 2)
    throw new MemoryAcceptError('memory-invalid', 'Merge commits are not accepted as Memory');
  return parents[1] ?? null;
}
