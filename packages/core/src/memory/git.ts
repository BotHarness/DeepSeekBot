import { execFileSync } from 'node:child_process';
import { execFileText } from '../process/exec-off-thread.js';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { gitSupportsSinceAsFilter } from './git-probe.js';

export interface MemoryCommit {
  sha: string;
  message: string;
  date: string;
}

export interface MemoryGit {
  status(): string[];

  diff(): string;
  head(): string;
  commit(message: string): string;
  commitPaths(paths: readonly string[], message: string): string;
  log(limit?: number): MemoryCommit[];

  activitySince(sinceIso: string): Promise<Array<{ at: string }>>;
  activitySnapshot(sinceIso: string): Promise<{ commits: Array<{ at: string }>; dirty: boolean }>;
}

const INIT_COMMIT_MESSAGE = 'Initialize memory repository';
const GITATTRIBUTES = '* text=auto eol=lf\n';
const FIELD_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';

function run(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function activityArgs(sinceIso: string): string[] {
  return [
    'log',
    '--exclude=refs/botharness/recovery/*',
    '--exclude=refs/stash',
    '--all',
    ...(gitSupportsSinceAsFilter() ? ['--since-as-filter=' + sinceIso] : []),
    '--pretty=format:%cI',
  ];
}

function activityAt(output: string, sinceIso: string): Array<{ at: string }> {
  const since = Date.parse(sinceIso);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !(Date.parse(line) < since))
    .map((at) => ({ at }));
}

function readActivity(root: string, args: string[], timeout = 2000): Promise<string> {
  return execFileText('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root,
    windowsHide: true,
    timeout,
  }).then(({ stdout }) => stdout);
}

function revParse(root: string): string {
  try {
    return run(root, ['rev-parse', 'HEAD']).trim();
  } catch {
    return '';
  }
}

function commitIfChanges(root: string, message: string): string {
  run(root, ['add', '-A']);
  const status = run(root, ['status', '--porcelain']);
  if (status.trim().length === 0) return revParse(root);
  run(root, ['commit', '--no-gpg-sign', '-m', message]);
  return revParse(root);
}

function ensureIdentity(root: string, key: 'user.name' | 'user.email', value: string): void {
  try {
    if (run(root, ['config', '--local', '--get', key]).trim().length > 0) return;
  } catch {}
  run(root, ['config', key, value]);
}

export function initializeMemoryGit(root: string): { created: boolean } {
  const created = !existsSync(join(root, '.git'));
  if (created) {
    run(root, ['init', '-b', 'main']);
  }
  ensureIdentity(root, 'user.name', 'BotHarness');
  ensureIdentity(root, 'user.email', 'bot@botharness.local');
  run(root, ['config', 'commit.gpgsign', 'false']);
  run(root, ['config', 'core.autocrlf', 'false']);
  const attributes = join(root, '.gitattributes');
  if (revParse(root) === '' && !existsSync(attributes)) {
    writeFileSync(attributes, GITATTRIBUTES, 'utf8');
  }
  return { created };
}

export function commitMemoryRepositorySeed(root: string): string {
  return commitIfChanges(root, INIT_COMMIT_MESSAGE);
}

async function runAsync(root: string, args: string[]): Promise<string> {
  return (await execFileText('git', args, { cwd: root, windowsHide: true, timeout: 10_000 }))
    .stdout;
}

export async function initializeMemoryRepositoryAsync(root: string): Promise<{ created: boolean }> {
  const created = !existsSync(join(root, '.git'));
  if (created) await runAsync(root, ['init', '-b', 'main']);
  for (const [key, value] of [
    ['user.name', 'BotHarness'],
    ['user.email', 'bot@botharness.local'],
  ] as const) {
    let present = false;
    try {
      present = (await runAsync(root, ['config', '--local', '--get', key])).trim().length > 0;
    } catch {}
    if (!present) await runAsync(root, ['config', key, value]);
  }
  await runAsync(root, ['config', 'commit.gpgsign', 'false']);
  await runAsync(root, ['config', 'core.autocrlf', 'false']);
  let head = '';
  try {
    head = (await runAsync(root, ['rev-parse', 'HEAD'])).trim();
  } catch {}
  if (head === '') {
    const attributes = join(root, '.gitattributes');
    if (!existsSync(attributes)) writeFileSync(attributes, GITATTRIBUTES, 'utf8');
    await commitMemoryPathsAsync(root, [], INIT_COMMIT_MESSAGE);
  }
  return { created };
}

export async function ignoredMemoryPathsAsync(
  root: string,
  paths: readonly string[],
): Promise<string[]> {
  const output = await runAsync(root, [
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--',
    ...paths,
  ]);
  return output.split('\n').filter((line) => line.length > 0);
}

export async function commitMemoryPathsAsync(
  root: string,
  paths: readonly string[],
  message: string,
): Promise<void> {
  const scope = paths.length ? ['--', ...paths] : [];
  await runAsync(root, ['add', '-A', ...scope]);
  if ((await runAsync(root, ['status', '--porcelain', ...scope])).trim() === '') return;
  await runAsync(root, ['commit', '--no-gpg-sign', '-m', message, ...scope]);
}

export function createMemoryGit(root: string): MemoryGit {
  return {
    status() {
      return run(root, ['status', '--porcelain'])
        .split('\n')
        .map((line) => line.slice(3).trim())
        .filter((line) => line.length > 0);
    },
    diff() {
      return run(root, ['diff', 'HEAD']);
    },
    head() {
      return revParse(root);
    },
    commit(message) {
      return commitIfChanges(root, message);
    },
    commitPaths(paths, message) {
      run(root, ['add', '-A', '--', ...paths]);
      const status = run(root, ['status', '--porcelain', '--', ...paths]);
      if (status.trim().length === 0) return revParse(root);
      run(root, ['commit', '--no-gpg-sign', '-m', message, '--', ...paths]);
      return revParse(root);
    },
    log(limit = 10) {
      if (limit <= 0) return [];
      let output: string;
      try {
        output = run(root, [
          'log',
          '-n',
          String(limit),
          `--format=%H${FIELD_SEPARATOR}%cI${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`,
        ]);
      } catch {
        return [];
      }
      const commits: MemoryCommit[] = [];
      for (const record of output.split(RECORD_SEPARATOR)) {
        const trimmed = record.trim();
        if (trimmed.length === 0) continue;
        const [sha = '', date = '', ...rest] = trimmed.split(FIELD_SEPARATOR);
        commits.push({ sha, date, message: rest.join(FIELD_SEPARATOR).trim() });
      }
      return commits;
    },
    async activitySnapshot(sinceIso) {
      const commits = activityAt(await readActivity(root, activityArgs(sinceIso)), sinceIso);
      const dirty =
        (
          await readActivity(root, [
            'status',
            '--porcelain',
            '--untracked-files=all',
            '--ignore-submodules=none',
          ])
        ).trim().length > 0;
      return { commits, dirty };
    },
    async activitySince(sinceIso) {
      try {
        return activityAt(await readActivity(root, activityArgs(sinceIso), 30_000), sinceIso);
      } catch {
        return [];
      }
    },
  };
}
