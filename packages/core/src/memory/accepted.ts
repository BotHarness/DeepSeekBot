import {
  isMemoryMarkdown,
  readMemoryMarkdown,
  memoryMarkdownImagePath,
  MAX_MEMORY_MARKDOWN_BYTES,
  type MemoryMarkdown,
  type MemoryMarkdownComparison,
} from './markdown.js';
import {
  readMemoryImage,
  isMemoryImagePath,
  MemoryImageError,
  type MemoryImage,
  type MemoryImageComparison,
} from './image.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  cpSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readlinkSync,
  readSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { PersonaBotRegistry } from '../bots/registry.js';
import { LOCAL_HUMAN_ID } from '../channels/channel.js';
import { atomicWriteFile } from '../fs/atomic-write.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import {
  DEFAULT_STANDING_LIMITS,
  STANDING_FILES,
  standingUsage,
  type StandingUsage,
} from './soul.js';
import { toMemoryRelativePath, resolveMemoryPath } from './jail.js';
import { createMemoryRecovery, type MemoryRecoveryCheckpoint } from './recovery.js';

export type MemoryAcceptErrorCode =
  | 'memory-unavailable'
  | 'memory-conflict'
  | 'memory-invalid'
  | 'memory-unknown-commit';

export class MemoryAcceptError extends Error {
  constructor(
    readonly code: MemoryAcceptErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryAcceptError';
  }
}

export interface MemoryAcceptedCommit {
  botSlug: string;
  sha: string;
  parentSha: string | null;
  actorKind: 'agent' | 'human' | 'system';
  actorId: string;
  causeKind: 'source-event' | 'human-edit' | 'repository-init';
  causeId: string;
  validationResult: string;
  acceptedAt: string;
}

export interface MemoryRepairEvent {
  id: string;
  botSlug: string;
  acceptedHeadSha: string;
  provisionalHeadSha: string;
  backupPath: string;
  actorKind: 'human';
  actorId: string;
  causeKind: 'human-repair';
  status: 'started' | 'completed';
  requestedAt: string;
  completedAt: string | null;
}

export interface MemoryAcceptedSnapshot {
  head: string | null;
  files: string[];
  provisional: boolean;
  standing: StandingUsage[];
}

export interface MemoryChangeDelta {
  summary: string;
  fromBranch: string;
  toBranch: string;
  fromHead: string;
  toHead: string;
  committedPaths: string[];
  workingPaths: string[];
  clearedPaths: string[];
  personaChanged: boolean;
}

export interface MemoryChangeScan {
  change: MemoryChangeDelta | undefined;
  repositoryRoot: string;
  repositoryIdentity: string;
  observationJson: string;
}

export interface MemoryGitCommit {
  sha: string;
  parents: string[];
  subject: string;
  authoredAt: string;
  branches: string[];
  versions: MemoryVersionName[];
  status: 'accepted' | 'pending' | 'needs-repair';
}

export interface MemoryVersionName {
  tag: string;
  name: string;
}

export interface MemoryVersion extends MemoryVersionName {
  sha: string;
  subject: string;
  namedAt: string;
}

export interface MemoryGitGraph {
  head: string;
  currentBranch: string | null;
  branches: string[];
  dirty: boolean;
  commits: MemoryGitCommit[];
  hasMore: boolean;
}

export interface MemoryGitCommitDiff {
  sha: string;
  subject: string;
  files: {
    path: string;
    status: string;
    images?: MemoryImageComparison;
    markdown?: MemoryMarkdownComparison;
  }[];
  diff: string;
}

export type MemoryWorkingKind = 'staged' | 'unstaged' | 'untracked' | 'current';

export interface MemoryWorkingChange {
  path: string;
  kind: MemoryWorkingKind;
  status: string;
}

export interface MemoryWorkingDiff extends MemoryWorkingChange {
  images?: MemoryImageComparison;
  markdown?: MemoryMarkdownComparison;
  diff: string;
  binary: boolean;
}

export interface MemoryAcceptance {
  sourceReferences(sourceEventIds: readonly string[]): Array<{
    sourceEventId: string;
    botSlug: string;
    sha: string;
    memoryDir?: string;
    available: boolean;
  }>;
  continueFromCommit(input: { botSlug: string; sessionId: string; sha: string; branch: string }): {
    from: string;
    to: string;
    head: string;
  };
  switchBranch(input: { botSlug: string; sessionId: string; branch: string }): {
    from: string;
    to: string;
    head: string;
  };
  prepareTurn(
    botSlug: string,
    sessionId: string,
    options?: { coordinateBranchSwitch?: boolean },
  ): MemoryChangeDelta | undefined;
  scanChanges(botSlug: string): MemoryChangeScan;
  pendingCommits(botSlug: string): MemoryPendingCommits;
  advanceCommitCursor(botSlug: string, branch: string, head: string): void;
  preparedObservation(botSlug: string, sessionId: string): MemoryChangeScan;
  reconcileTurn(input: {
    botSlug: string;
    sessionId: string;
    sourceEventId: string;
    preserveObservation?: boolean;
  }): MemoryAcceptedCommit[];
  abortTurn(botSlug: string, sessionId: string, preserveObservation?: boolean): void;
  snapshot(botSlug: string): MemoryAcceptedSnapshot;
  readAccepted(
    botSlug: string,
    path: string,
  ):
    | {
        path: string;
        body: string;
        head: string;
        binary?: boolean;
        image?: MemoryImage;
        markdown?: MemoryMarkdown;
      }
    | undefined;
  markdownImageFile(
    botSlug: string,
    path: string,
    source: string,
    revision: string,
    reference: string,
  ): Buffer;
  imageFile(botSlug: string, path: string, source: string, revision: string): Buffer;
  history(botSlug: string, limit?: number): MemoryAcceptedCommit[];
  diff(botSlug: string, sha: string): { sha: string; diff: string };
  gitGraph(botSlug: string, offset?: number, path?: string): MemoryGitGraph;
  gitCommitDiff(botSlug: string, sha: string): MemoryGitCommitDiff;
  workingChanges(botSlug: string): MemoryWorkingChange[];
  workingDiff(botSlug: string, path: string, kind: MemoryWorkingKind): MemoryWorkingDiff;
  recoveryHistory(botSlug: string): MemoryRecoveryCheckpoint[];
  restoreHuman(input: { botSlug: string; checkpointId: string; expectedCurrentId: string }): {
    checkpoint: MemoryRecoveryCheckpoint;
    archivePath: string;
  };
  repairHuman(input: {
    botSlug: string;
    expectedHead: string;
    repairId: string;
  }): MemoryRepairEvent;
  saveHuman(input: {
    botSlug: string;
    path: string;
    body: string;
    expectedHead: string;
    editId: string;
  }): MemoryAcceptedCommit;
  restoreCommitHuman(input: {
    botSlug: string;
    sha: string;
    expectedHead: string;
    restoreId: string;
    name?: string;
  }): {
    head: string;
    backup: string | null;
    version: MemoryVersionName | null;
    saved: MemoryRecoveryCheckpoint;
  };
  nameVersionHuman(input: { botSlug: string; sha: string; name: string }): MemoryVersionName;
  versions(botSlug: string): MemoryVersion[];
  removeVersionNameHuman(input: { botSlug: string; tag: string }): void;
}

interface RepairRow {
  id: string;
  bot_slug: string;
  accepted_head_sha: string;
  provisional_head_sha: string;
  backup_path: string;
  actor_kind: 'human';
  actor_id: string;
  cause_kind: 'human-repair';
  status: 'started' | 'completed';
  requested_at: string;
  completed_at: string | null;
}

interface AcceptedRow {
  bot_slug: string;
  sha: string;
  parent_sha: string | null;
  actor_kind: MemoryAcceptedCommit['actorKind'];
  actor_id: string;
  cause_kind: MemoryAcceptedCommit['causeKind'];
  cause_id: string;
  validation_result: string;
  accepted_at: string;
}

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DIFF_BYTES = 4 * 1024 * 1024;

function run(root: string, args: string[], maxBuffer = MAX_DIFF_BYTES): Buffer {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  try {
    return execFileSync(
      'git',
      [
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
      {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer,
        windowsHide: true,
      },
    );
  } catch {
    throw new MemoryAcceptError(
      'memory-invalid',
      `Memory Git operation failed: ${args[0] ?? 'unknown'}`,
    );
  }
}

function output(root: string, args: string[]): string {
  return run(root, args).toString('utf8').trim();
}

function versionNames(root: string): Map<string, MemoryVersionName[]> {
  const names = new Map<string, MemoryVersionName[]>();
  for (const line of output(root, [
    'for-each-ref',
    '--format=%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)%1f%(objecttype)%1f%(refname:strip=2)%1f%(contents:subject)',
    'refs/tags',
  ]).split('\n')) {
    const [sha = '', type = '', tag = '', subject = ''] = line.split('\x1f');
    if (!/^[0-9a-f]{40}$/u.test(sha) || tag === '') continue;
    const name = type === 'tag' && subject !== '' ? subject : tag;
    names.set(sha, [...(names.get(sha) ?? []), { tag, name }]);
  }
  return names;
}

function versionList(root: string): MemoryVersion[] {
  const versions: MemoryVersion[] = [];
  for (const line of output(root, [
    'for-each-ref',
    '--sort=-creatordate',
    '--count=500',
    '--format=%(if)%(*objectname)%(then)%(*objectname)%(else)%(objectname)%(end)%1f%(if)%(*objecttype)%(then)%(*objecttype)%(else)%(objecttype)%(end)%1f%(objecttype)%1f%(refname:strip=2)%1f%(contents:subject)%1f%(if)%(*objectname)%(then)%(*subject)%(else)%(subject)%(end)%1f%(creatordate:iso-strict)',
    'refs/tags',
  ]).split('\n')) {
    const [sha = '', target = '', type = '', tag = '', message = '', subject = '', namedAt = ''] =
      line.split('\x1f');
    if (!/^[0-9a-f]{40}$/u.test(sha) || target !== 'commit' || tag === '') continue;
    versions.push({
      sha,
      tag,
      name: type === 'tag' && message !== '' ? message : tag,
      subject,
      namedAt,
    });
  }
  return versions;
}

function validVersionName(name: string): string {
  const label = name.trim();
  if (label === '' || label.length > 60 || /[\u0000-\u001f\u007f]/u.test(label))
    throw new MemoryAcceptError(
      'memory-invalid',
      'Version name must be one line of 1 to 60 characters',
    );
  return label;
}

function nameVersion(root: string, sha: string, name: string): MemoryVersionName {
  const label = validVersionName(name);
  let commit: string;
  try {
    commit = output(root, ['rev-parse', '--verify', `${sha}^{commit}`]);
  } catch {
    throw new MemoryAcceptError('memory-invalid', 'Memory commit is not in this repository');
  }
  const exists = (tag: string): boolean => {
    try {
      run(root, ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`]);
      return true;
    } catch {
      return false;
    }
  };
  let base = label.replace(/\s+/gu, '-');
  try {
    run(root, ['check-ref-format', `refs/tags/${base}`]);
  } catch {
    base = `version-${commit.slice(0, 7)}`;
  }
  let tag = base;
  for (let suffix = 2; exists(tag); suffix += 1) tag = `${base}-${suffix}`;
  run(root, ['tag', '-a', tag, '-m', label, commit]);
  return { tag, name: label };
}

function branchOf(root: string): string {
  try {
    return output(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  } catch {
    throw new MemoryAcceptError('memory-invalid', 'Memory Repository must be on a local branch');
  }
}

function verifiedRepository(root: string, botSlug: string): string {
  if (
    !existsSync(join(root, '.git')) ||
    !lstatSync(join(root, '.git')).isDirectory() ||
    lstatSync(join(root, '.git')).isSymbolicLink()
  ) {
    throw new MemoryAcceptError('memory-unavailable', `Memory Repository unavailable: ${botSlug}`);
  }
  branchOf(root);
  return root;
}

function repository(registry: PersonaBotRegistry, botSlug: string): string {
  const root = registry.memoryDirFor(botSlug);
  if (root === undefined) {
    throw new MemoryAcceptError('memory-unavailable', `Memory Repository unavailable: ${botSlug}`);
  }
  return verifiedRepository(root, botSlug);
}

export interface MemoryCommitFile {
  path: string;
  added: number | null;
  deleted: number | null;
}

export interface MemoryCommitSummary {
  sha: string;
  subject: string;
  authorName: string;
  authoredAt: string;
  files: MemoryCommitFile[];
  moreFiles: number;
}

export interface MemoryPendingCommits {
  branch: string;
  head: string;
  commits: MemoryCommitSummary[];
}

const MAX_RECORDED_COMMITS = 20;
const MAX_RECORDED_PATHS = 20;

function commitSummary(root: string, sha: string): MemoryCommitSummary {
  const [fullSha = sha, subject = '', authorName = '', authoredAt = ''] = output(root, [
    'show',
    '--no-patch',
    '--format=%H%x1f%s%x1f%an%x1f%aI',
    sha,
  ]).split('\x1f');
  const files = output(root, ['show', '--numstat', '--no-renames', '--format=', sha])
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

function head(root: string): string {
  const sha = output(root, ['rev-parse', '--verify', 'HEAD']);
  if (!/^[0-9a-f]{40}$/u.test(sha)) {
    throw new MemoryAcceptError('memory-invalid', 'Memory Repository HEAD is invalid');
  }
  return sha;
}

function dirty(root: string): boolean {
  return run(root, ['status', '--porcelain', '-z', '--untracked-files=all']).length > 0;
}

interface TurnWorktreeObservation {
  branch: string;
  head: string;
  files: TurnWorktreeFile[];
  overflowHash?: string;
  overflowCount?: number;
}

interface TurnWorktreeFile {
  path: string;
  status: string;
  version: string;
}

const MAX_ANNOTATION_PATHS = 30;
const MAX_ANNOTATION_BYTES = 4096;
const MAX_OBSERVED_PATHS = 500;
const MAX_HASHED_FILE_BYTES = 8 * 1024 * 1024;

function indexVersions(root: string, paths: string[]): Map<string, string> {
  if (paths.length === 0) return new Map();
  const versions = new Map<string, string>();
  let batch: string[] = [];
  let length = 0;
  const flush = () => {
    const raw = run(root, [
      '--literal-pathspecs',
      'ls-files',
      '--stage',
      '-z',
      '--',
      ...batch,
    ]).toString('utf8');
    for (const entry of raw.split('\0')) {
      const separator = entry.indexOf('\t');
      if (separator < 0) continue;
      const path = entry.slice(separator + 1);
      versions.set(path, `${versions.get(path) ?? ''}${entry.slice(0, separator)};`);
    }
    batch = [];
    length = 0;
  };
  for (const path of paths) {
    if (batch.length > 0 && (length + path.length + 1 > 8000 || batch.length === 100)) flush();
    batch.push(path);
    length += path.length + 1;
  }
  if (batch.length > 0) flush();
  return versions;
}

function unstableObservation(path: string): MemoryAcceptError {
  return new MemoryAcceptError(
    'memory-conflict',
    `Memory file changed during observation: ${path}`,
  );
}

function worktreeVersion(root: string, path: string, status: string): string {
  const target = join(root, toMemoryRelativePath(path));
  let stat;
  try {
    stat = lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (status.includes('D')) return 'absent';
      throw unstableObservation(path);
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    try {
      return `link:${readlinkSync(target)}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw unstableObservation(path);
      throw error;
    }
  }
  if (!stat.isFile()) return `mode:${stat.mode}:size:${stat.size}:mtime:${stat.mtimeMs}`;
  resolveMemoryPath(root, path);
  const hash = createHash('sha256');
  let fd;
  try {
    fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (['ENOENT', 'ELOOP', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
      throw unstableObservation(path);
    throw error;
  }
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino)
      throw unstableObservation(path);
    const buffer = Buffer.allocUnsafe(64 * 1024);
    if (stat.size > MAX_HASHED_FILE_BYTES) {
      for (const offset of [0, Math.max(0, stat.size - buffer.length)]) {
        const length = readSync(fd, buffer, 0, buffer.length, offset);
        hash.update(buffer.subarray(0, length));
      }
      hash.update(`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`);
    } else {
      for (;;) {
        const length = readSync(fd, buffer, 0, buffer.length, null);
        if (length === 0) break;
        hash.update(buffer.subarray(0, length));
      }
    }
  } finally {
    closeSync(fd);
  }
  let after;
  try {
    after = lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw unstableObservation(path);
    throw error;
  }
  if (
    !after.isFile() ||
    after.dev !== stat.dev ||
    after.ino !== stat.ino ||
    after.size !== stat.size ||
    after.mtimeMs !== stat.mtimeMs ||
    after.ctimeMs !== stat.ctimeMs
  )
    throw unstableObservation(path);
  return `file:${hash.digest('hex')}`;
}

function porcelainFiles(
  root: string,
): Pick<TurnWorktreeObservation, 'files' | 'overflowHash' | 'overflowCount'> {
  const raw = run(root, ['status', '--porcelain', '-z', '--untracked-files=all']).toString('utf8');
  if (raw.length === 0) return { files: [] };
  const changes: Array<{ path: string; status: string; oldPath?: string }> = [];
  const entries = raw.split('\0');
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? '';
    if (entry.length < 4) continue;
    const change: { path: string; status: string; oldPath?: string } = {
      path: entry.slice(3),
      status: entry.slice(0, 2),
    };
    if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') {
      const oldPath = entries[++index];
      if (oldPath !== undefined) change.oldPath = oldPath;
    }
    changes.push(change);
  }
  const selected = changes
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, MAX_OBSERVED_PATHS);
  const index = indexVersions(
    root,
    selected.map((change) => change.path),
  );
  const files = selected.map((change) => ({
    path: change.path,
    status: change.status,
    version: [
      change.status,
      change.oldPath ?? '',
      index.get(change.path) ?? '',
      worktreeVersion(root, change.path, change.status),
    ].join('\0'),
  }));
  const after = run(root, ['status', '--porcelain', '-z', '--untracked-files=all']).toString(
    'utf8',
  );
  if (after !== raw) throw unstableObservation('working tree');
  const overflowCount = changes.length - selected.length;
  return overflowCount > 0
    ? { files, overflowHash: createHash('sha256').update(raw).digest('hex'), overflowCount }
    : { files };
}

function currentWorkingChanges(root: string): MemoryWorkingChange[] {
  const raw = run(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']).toString(
    'utf8',
  );
  const entries = raw.split('\0');
  const changes: MemoryWorkingChange[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? '';
    if (entry.length < 4) continue;
    const path = entry.slice(3);
    if (entry.startsWith('??')) {
      changes.push({ path, kind: 'untracked', status: '?' });
    } else {
      if (entry[0] !== ' ') changes.push({ path, kind: 'staged', status: entry[0]! });
      if (entry[1] !== ' ') changes.push({ path, kind: 'unstaged', status: entry[1]! });
      if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') {
        index += 1;
      }
    }
    if (changes.length > 500) {
      throw new MemoryAcceptError('memory-invalid', 'Too many Memory working changes');
    }
  }
  return changes;
}

function observeWorktree(root: string): Omit<TurnWorktreeObservation, 'sessionId'> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const branch = branchOf(root);
      const currentHead = head(root);
      const files = porcelainFiles(root);
      if (branch !== branchOf(root) || currentHead !== head(root))
        throw unstableObservation('repository');
      return { branch, head: currentHead, ...files };
    } catch (error) {
      if (
        !(error instanceof MemoryAcceptError) ||
        error.code !== 'memory-conflict' ||
        attempt === 2
      )
        throw error;
    }
  }
  throw unstableObservation('working tree');
}

function safeGit(root: string, args: string[]): string {
  try {
    return output(root, args);
  } catch {
    return '';
  }
}

const PERSONA_FROZEN_SENTENCE =
  'SOUL.md or MEMORY.md changed on disk; your frozen Session copy still applies — the file version reaches new Sessions and the next compaction.';

function truncateUtf8(text: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(text);
  if (encoded.length <= maxBytes) return text;
  const byteAt = (index: number): number => encoded[index] ?? 0;

  let end = maxBytes;
  while (end > 0 && byteAt(end - 1) >= 0x80 && byteAt(end - 1) < 0xc0) end -= 1;
  const lead = byteAt(end - 1);
  const need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  if (need > 1 && maxBytes - (end - 1) < need) end -= 1;
  return `${new TextDecoder().decode(encoded.slice(0, end))}\n…(truncated)`;
}

function finishAnnotation(details: string[]): string | undefined {
  if (details.length === 0) return undefined;
  return truncateUtf8(
    `Memory changed since your last turn:\n${details.join('\n')}`,
    MAX_ANNOTATION_BYTES,
  );
}

function personaDiffersAcrossHeads(root: string, oldHead: string, newHead: string): boolean {
  return (
    safeGit(root, [
      'diff',
      '--name-only',
      '-z',
      oldHead,
      newHead,
      '--',
      ...STANDING_FILES,
    ]).replaceAll('\0', '').length > 0
  );
}

function buildTurnChange(
  root: string,
  previous: TurnWorktreeObservation,
  current: Omit<TurnWorktreeObservation, 'sessionId'>,
): MemoryChangeDelta | undefined {
  if (current.branch !== previous.branch) {
    const details = [`Memory branch is now '${current.branch}' (was '${previous.branch}').`];
    const personaChanged = personaDiffersAcrossHeads(root, previous.head, current.head);
    if (personaChanged) {
      details.push(PERSONA_FROZEN_SENTENCE);
    }
    return {
      summary: finishAnnotation(details)!,
      fromBranch: previous.branch,
      toBranch: current.branch,
      fromHead: previous.head,
      toHead: current.head,
      committedPaths: [],
      workingPaths: [],
      clearedPaths: [],
      personaChanged,
    };
  }
  const details: string[] = [];
  const committedNames: string[] = [];
  if (current.head !== previous.head) {
    for (const name of safeGit(root, [
      'diff',
      '--name-only',
      '-z',
      previous.head,
      current.head,
    ]).split('\0')) {
      if (name.length > 0) committedNames.push(name);
    }
    const shown = committedNames.slice(0, MAX_ANNOTATION_PATHS);
    if (shown.length > 0) {
      details.push(
        `Committed Memory changes since your last turn: ${shown.join(', ')}${committedNames.length > shown.length ? ` (+${committedNames.length - shown.length} more)` : ''}`,
      );
    } else {
      details.push('Memory commits changed since your last turn; inspect them with git commands.');
    }
  }
  const fileKey = (file: TurnWorktreeFile): string => `${file.path}\0${file.status}`;
  const previousFiles = new Map(previous.files.map((file) => [fileKey(file), file.version]));
  const currentKeys = new Set(current.files.map(fileKey));
  const changed = current.files.filter((file) => previousFiles.get(fileKey(file)) !== file.version);
  const cleared = previous.files.filter((file) => !currentKeys.has(fileKey(file)));
  if (
    current.overflowHash !== previous.overflowHash ||
    current.overflowCount !== previous.overflowCount
  ) {
    details.push(
      current.overflowCount
        ? `More than ${MAX_OBSERVED_PATHS} working Memory changes are present (${current.overflowCount} further paths).`
        : `Working Memory changes are now within the ${MAX_OBSERVED_PATHS}-path observation limit.`,
    );
  }
  if (changed.length > 0) {
    const shown = changed.slice(0, MAX_ANNOTATION_PATHS);
    details.push(
      `Working Memory changes since your last turn: ${shown.map((file) => `${file.status} ${file.path}`).join(', ')}${changed.length > shown.length ? ` (+${changed.length - shown.length} more)` : ''}`,
    );
  }
  if (cleared.length > 0) {
    const shown = cleared.slice(0, MAX_ANNOTATION_PATHS);
    details.push(
      `Previous working Memory statuses no longer present: ${shown.map((file) => file.path).join(', ')}${cleared.length > shown.length ? ` (+${cleared.length - shown.length} more)` : ''}`,
    );
  }
  if (details.length === 0) return undefined;
  const standing = (path: string): boolean => STANDING_FILES.includes(path);
  const personaChanged =
    committedNames.some(standing) ||
    changed.some((file) => standing(file.path)) ||
    cleared.some((file) => standing(file.path));
  if (personaChanged) {
    details.push(PERSONA_FROZEN_SENTENCE);
  }
  return {
    summary: finishAnnotation(details)!,
    fromBranch: previous.branch,
    toBranch: current.branch,
    fromHead: previous.head,
    toHead: current.head,
    committedPaths: committedNames.slice(0, MAX_ANNOTATION_PATHS),
    workingPaths: [...new Set(changed.map((file) => file.path))].slice(0, MAX_ANNOTATION_PATHS),
    clearedPaths: [...new Set(cleared.map((file) => file.path))].slice(0, MAX_ANNOTATION_PATHS),
    personaChanged,
  };
}

function validateCommit(root: string, sha: string): string {
  const tree = output(root, ['rev-parse', '--verify', `${sha}^{tree}`]);
  return JSON.stringify({ gitTree: tree });
}

function listCurrentFiles(root: string): string[] {
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

function rowToCommit(row: AcceptedRow): MemoryAcceptedCommit {
  return {
    botSlug: row.bot_slug,
    sha: row.sha,
    parentSha: row.parent_sha,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    causeKind: row.cause_kind,
    causeId: row.cause_id,
    validationResult: row.validation_result,
    acceptedAt: row.accepted_at,
  };
}

function rowToRepair(row: RepairRow): MemoryRepairEvent {
  return {
    id: row.id,
    botSlug: row.bot_slug,
    acceptedHeadSha: row.accepted_head_sha,
    provisionalHeadSha: row.provisional_head_sha,
    backupPath: row.backup_path,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    causeKind: row.cause_kind,
    status: row.status,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
  };
}

function parentOf(root: string, sha: string): string | null {
  const parents = output(root, ['rev-list', '--parents', '-n', '1', sha]).split(' ');
  if (parents.length > 2)
    throw new MemoryAcceptError('memory-invalid', 'Merge commits are not accepted as Memory');
  return parents[1] ?? null;
}

export function createMemoryAcceptance(options: {
  registry: PersonaBotRegistry;
  ownership: SessionOwnership;
  database: OperationalDatabaseModulePort;
  now?: () => Date;
  warn?: (message: string) => void;
}): MemoryAcceptance {
  const { registry, ownership, database } = options;
  const now = options.now ?? (() => new Date());
  const warn = options.warn;
  const recovery = createMemoryRecovery({
    database,
    now,
    ...(options.warn ? { warn: options.warn } : {}),
  });
  const inFlight = new Map<
    string,
    { sessionId: string; branch: string; preservePending?: boolean; observation?: MemoryChangeScan }
  >();

  const repositoryIdentity = (root: string): string => {
    const stat = statSync(join(root, '.git'));
    return `${stat.dev}:${stat.ino}`;
  };

  const readObservation = (botSlug: string, root: string): TurnWorktreeObservation | undefined => {
    const row = database.read(
      (db) =>
        db
          .prepare(
            'SELECT repository_root, repository_identity, observation_json FROM memory_change_checkpoints WHERE bot_slug = ?',
          )
          .get(botSlug) as
          | { repository_root: string; repository_identity: string; observation_json: string }
          | undefined,
    );
    if (
      row === undefined ||
      row.repository_root !== root ||
      row.repository_identity !== repositoryIdentity(root)
    )
      return undefined;
    const value: unknown = JSON.parse(row.observation_json);
    if (typeof value !== 'object' || value === null) {
      throw new MemoryAcceptError('memory-invalid', 'Invalid Memory observation checkpoint');
    }
    const observation = value as TurnWorktreeObservation;
    if (
      typeof observation.branch !== 'string' ||
      typeof observation.head !== 'string' ||
      !Array.isArray(observation.files) ||
      observation.files.length > MAX_OBSERVED_PATHS ||
      (observation.overflowHash !== undefined &&
        !/^[0-9a-f]{64}$/u.test(observation.overflowHash)) ||
      (observation.overflowCount !== undefined &&
        (!Number.isInteger(observation.overflowCount) || observation.overflowCount < 1)) ||
      (observation.overflowHash === undefined) !== (observation.overflowCount === undefined) ||
      observation.files.some(
        (file) =>
          typeof file.path !== 'string' ||
          typeof file.status !== 'string' ||
          typeof file.version !== 'string',
      )
    ) {
      throw new MemoryAcceptError('memory-invalid', 'Invalid Memory observation checkpoint');
    }
    return observation;
  };

  const saveObservation = (botSlug: string, root: string, current: TurnWorktreeObservation) => {
    database.transaction((db) => {
      db.prepare(`
        INSERT INTO memory_change_checkpoints
          (bot_slug, repository_root, repository_identity, observation_json, observed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(bot_slug) DO UPDATE SET
          repository_root = excluded.repository_root,
          repository_identity = excluded.repository_identity,
          observation_json = excluded.observation_json,
          observed_at = excluded.observed_at
      `).run(botSlug, root, repositoryIdentity(root), JSON.stringify(current), now().toISOString());
    });
  };

  const refreshObservation = (
    botSlug: string,
    sessionId: string,
    causeKind: 'source-event' | 'turn-abort' = 'turn-abort',
    causeId = sessionId,
    beforeObservationJson?: string,
  ): boolean => {
    try {
      const root = repository(registry, botSlug);
      const current = observeWorktree(root);
      saveObservation(botSlug, root, current);
      try {
        recovery.capture(
          botSlug,
          root,
          {
            origin: 'agent-session',
            originId: sessionId,
            causeKind,
            causeId,
          },
          beforeObservationJson !== undefined && JSON.stringify(current) !== beforeObservationJson,
        );
      } catch (error) {
        options.warn?.(
          `memory-recovery-capture-failed phase=turn-observation bot=${botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
        );
      }
      return true;
    } catch (error) {
      options.warn?.(
        `memory-observation-failed phase=turn-observation bot=${botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
      );
      return false;
    }
  };

  const scanChanges = (botSlug: string): MemoryChangeScan => {
    const root = repository(registry, botSlug);
    bootstrap(botSlug, root);
    if (pendingRepair(botSlug) !== undefined) {
      throw new MemoryAcceptError(
        'memory-conflict',
        'Memory repair must finish before observation',
      );
    }
    const current = observeWorktree(root);
    const previous = readObservation(botSlug, root);
    const change = previous === undefined ? undefined : buildTurnChange(root, previous, current);
    if (previous === undefined || change !== undefined) {
      try {
        recovery.capture(botSlug, root, {
          origin: 'host-observation',
          originId: 'botharness-host',
          causeKind: 'memory-scan',
          causeId: botSlug,
        });
      } catch (error) {
        options.warn?.(
          `memory-recovery-capture-failed phase=scan bot=${botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
        );
      }
    }
    return {
      change,
      repositoryRoot: root,
      repositoryIdentity: repositoryIdentity(root),
      observationJson: JSON.stringify(current),
    };
  };

  const pendingRepair = (botSlug: string): RepairRow | undefined =>
    database.read(
      (db) =>
        db
          .prepare(
            "SELECT * FROM memory_repair_events WHERE bot_slug = ? AND status = 'started' ORDER BY requested_at ASC LIMIT 1",
          )
          .get(botSlug) as RepairRow | undefined,
    );

  const readRepository = (botSlug: string): { root: string; repairing: boolean } => {
    const pending = pendingRepair(botSlug);
    if (pending === undefined) return { root: repository(registry, botSlug), repairing: false };
    const canonical = registry.memoryDirFor(botSlug);
    const archive = join(pending.backup_path, 'repository');
    const root =
      canonical !== undefined && existsSync(join(canonical, '.git')) ? canonical : archive;
    return { root: verifiedRepository(root, botSlug), repairing: true };
  };

  const graphRepository = (botSlug: string): string => {
    const root = registry.memoryDirFor(botSlug);
    if (
      root === undefined ||
      !existsSync(join(root, '.git')) ||
      !lstatSync(join(root, '.git')).isDirectory() ||
      lstatSync(join(root, '.git')).isSymbolicLink()
    ) {
      throw new MemoryAcceptError(
        'memory-unavailable',
        `Memory Repository unavailable: ${botSlug}`,
      );
    }
    return root;
  };

  const acceptedHead = (botSlug: string, branch: string): string | null =>
    database.read((db) => {
      const row = db
        .prepare(
          'SELECT head_sha FROM memory_accepted_heads WHERE bot_slug = ? AND branch_name = ?',
        )
        .get(botSlug, branch) as { head_sha: string } | undefined;
      return row?.head_sha ?? null;
    });

  const accept = (
    botSlug: string,
    branch: string,
    commits: Array<{
      sha: string;
      parentSha: string | null;
      actorKind: MemoryAcceptedCommit['actorKind'];
      actorId: string;
      causeKind: MemoryAcceptedCommit['causeKind'];
      causeId: string;
      validationResult: string;
    }>,
    expectedHead: string | null,
  ): MemoryAcceptedCommit[] => {
    if (commits.length === 0) return [];
    const at = now().toISOString();
    return database.transaction(
      (db) => {
        const current = db
          .prepare(
            'SELECT head_sha FROM memory_accepted_heads WHERE bot_slug = ? AND branch_name = ?',
          )
          .get(botSlug, branch) as { head_sha: string } | undefined;
        if ((current?.head_sha ?? null) !== expectedHead) {
          throw new MemoryAcceptError(
            'memory-conflict',
            'Accepted Memory head changed during validation',
          );
        }
        const result: MemoryAcceptedCommit[] = [];
        let previous = expectedHead;
        for (const commit of commits) {
          const inserted = db
            .prepare(`INSERT OR IGNORE INTO memory_accepted_commits (
          bot_slug, sha, parent_sha, actor_kind, actor_id, cause_kind, cause_id,
          validation_result, accepted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(
              botSlug,
              commit.sha,
              commit.parentSha,
              commit.actorKind,
              commit.actorId,
              commit.causeKind,
              commit.causeId,
              commit.validationResult,
              at,
            );
          if (inserted.changes > 0) {
            result.push({
              botSlug,
              sha: commit.sha,
              parentSha: commit.parentSha,
              actorKind: commit.actorKind,
              actorId: commit.actorId,
              causeKind: commit.causeKind,
              causeId: commit.causeId,
              validationResult: commit.validationResult,
              acceptedAt: at,
            });
          }
          previous = commit.sha;
        }
        db.prepare(`INSERT INTO memory_accepted_heads (bot_slug, branch_name, head_sha, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(bot_slug, branch_name) DO UPDATE SET
          head_sha = excluded.head_sha, updated_at = excluded.updated_at`).run(
          botSlug,
          branch,
          previous,
          at,
        );
        return result;
      },
      ['memory-accepted'],
    );
  };

  const bootstrap = (botSlug: string, root: string): string => {
    const branch = branchOf(root);
    const sha = head(root);
    if (acceptedHead(botSlug, branch) !== null) return sha;
    if (
      branch !== 'main' ||
      output(root, ['rev-list', '--parents', '-n', '1', sha]).split(' ').length !== 1 ||
      output(root, ['show', '-s', '--format=%s', sha]) !== 'Initialize memory repository'
    )
      return sha;
    accept(
      botSlug,
      branch,
      [
        {
          sha,
          parentSha: null,
          actorKind: 'system',
          actorId: 'botharness-bootstrap',
          causeKind: 'repository-init',
          causeId: `bootstrap:${sha}`,
          validationResult: validateCommit(root, sha),
        },
      ],
      null,
    );
    return sha;
  };

  const requireOwned = (botSlug: string, sessionId: string): void => {
    const owner = ownership.resolve(sessionId);
    if (owner?.botSlug !== botSlug || owner.rootRole !== 'orchestrator') {
      throw new MemoryAcceptError('memory-conflict', 'Session does not own this Memory Repository');
    }
  };

  const commitCursor = (botSlug: string): { branch: string; head: string } | undefined =>
    database.read(
      (db) =>
        db
          .prepare('SELECT branch, head FROM memory_commit_cursors WHERE bot_slug = ?')
          .get(botSlug) as { branch: string; head: string } | undefined,
    );
  const advanceCommitCursor = (botSlug: string, branch: string, sha: string): void => {
    database.transaction((db) => {
      db.prepare(`
        INSERT INTO memory_commit_cursors (bot_slug, branch, head, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(bot_slug) DO UPDATE SET
          branch = excluded.branch, head = excluded.head, updated_at = excluded.updated_at
      `).run(botSlug, branch, sha, now().toISOString());
    });
  };
  const pendingCommits = (botSlug: string): MemoryPendingCommits => {
    const root = repository(registry, botSlug);
    const branch = branchOf(root);
    const current = head(root);
    const cursor = commitCursor(botSlug);
    if (cursor === undefined || cursor.branch !== branch || cursor.head === current)
      return { branch, head: current, commits: [] };
    let shas: string[];
    try {
      shas = output(root, ['rev-list', '--reverse', current, `^${cursor.head}`])
        .split('\n')
        .filter((sha) => /^[0-9a-f]{40}$/u.test(sha));
    } catch {
      return { branch, head: current, commits: [] };
    }
    return {
      branch,
      head: current,
      commits: shas.slice(-MAX_RECORDED_COMMITS).map((sha) => commitSummary(root, sha)),
    };
  };

  const prepareTurn = (
    botSlug: string,
    sessionId: string,
    options?: { coordinateBranchSwitch?: boolean },
  ): MemoryChangeDelta | undefined => {
    requireOwned(botSlug, sessionId);
    if (pendingRepair(botSlug) !== undefined) {
      throw new MemoryAcceptError('memory-conflict', 'Memory repair must finish before turn');
    }
    const root = repository(registry, botSlug);
    bootstrap(botSlug, root);
    if (inFlight.has(botSlug)) {
      throw new MemoryAcceptError('memory-conflict', 'Another Memory turn is active');
    }
    void options;
    const observation = scanChanges(botSlug);
    try {
      advanceCommitCursor(botSlug, branchOf(root), head(root));
    } catch (error) {
      warn?.(
        `memory-commit-cursor-failed phase=prepare bot=${botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
    inFlight.set(botSlug, {
      sessionId,
      branch: JSON.parse(observation.observationJson).branch as string,
      observation,
    });
    return observation.change;
  };

  const reconcileTurn = (input: {
    botSlug: string;
    sessionId: string;
    sourceEventId: string;
    preserveObservation?: boolean;
  }): MemoryAcceptedCommit[] => {
    requireOwned(input.botSlug, input.sessionId);
    const flight = inFlight.get(input.botSlug);
    if (flight?.sessionId !== input.sessionId) {
      throw new MemoryAcceptError('memory-conflict', 'Memory turn was not prepared');
    }
    const source = database.read(
      (db) =>
        db
          .prepare('SELECT bot_slug, source_kind FROM source_events WHERE source_event_id = ?')
          .get(input.sourceEventId) as { bot_slug: string; source_kind: string } | undefined,
    );
    const departureAdmission =
      source?.source_kind === 'system-message' &&
      database.read((db) =>
        db
          .prepare(`
            SELECT 1 FROM inbox_admissions a
              JOIN source_events e ON e.source_event_id = a.source_event_id
             WHERE a.source_event_id = ? AND a.bot_slug = ?
               AND a.reason = 'group-ordinary' AND a.attempt_state = 'running'
               AND json_extract(e.payload_json, '$.author.kind') = 'system'
               AND json_extract(e.payload_json, '$.memberDeparture.memberKind') = 'bot'
          `)
          .get(input.sourceEventId, input.botSlug),
      ) !== undefined;
    if (
      (source?.bot_slug !== input.botSlug &&
        !database.read((db) =>
          db
            .prepare('SELECT 1 FROM inbox_admissions WHERE source_event_id = ? AND bot_slug = ?')
            .get(input.sourceEventId, input.botSlug),
        )) ||
      (!['human-message', 'assignment-report', 'assignment-lifecycle', 'schedule'].includes(
        source?.source_kind ?? '',
      ) &&
        !(
          (source?.source_kind === 'bot-message' || source?.source_kind === 'system-message') &&
          database.read((db) =>
            db
              .prepare(
                `SELECT 1 FROM inbox_admissions WHERE source_event_id = ? AND bot_slug = ? AND reason IN ('bot-dm', 'group-mention', 'group-invite', 'group-join-request', 'group-join-decision')`,
              )
              .get(input.sourceEventId, input.botSlug),
          )
        ) &&
        !departureAdmission)
    ) {
      throw new MemoryAcceptError(
        'memory-conflict',
        'Source Event does not authorize Memory observation',
      );
    }
    const root = repository(registry, input.botSlug);
    const branch = branchOf(root);
    const current = head(root);
    const checkpoint = acceptedHead(input.botSlug, branch);
    const result =
      current === checkpoint
        ? []
        : accept(
            input.botSlug,
            branch,
            [
              {
                sha: current,
                parentSha:
                  output(root, ['rev-list', '--parents', '-n', '1', current]).split(' ')[1] ?? null,
                actorKind: 'system',
                actorId: 'botharness-host',
                causeKind: 'source-event',
                causeId: input.sourceEventId,
                validationResult: validateCommit(root, current),
              },
            ],
            checkpoint,
          );
    if (!input.preserveObservation)
      refreshObservation(
        input.botSlug,
        input.sessionId,
        'source-event',
        input.sourceEventId,
        flight.observation?.observationJson,
      );
    inFlight.delete(input.botSlug);
    return result;
  };

  return {
    continueFromCommit(input) {
      requireOwned(input.botSlug, input.sessionId);
      const flight = inFlight.get(input.botSlug);
      if (flight?.sessionId !== input.sessionId) {
        throw new MemoryAcceptError('memory-conflict', 'Memory turn was not prepared');
      }
      const root = repository(registry, input.botSlug);
      const from = branchOf(root);
      if (from !== flight.branch) {
        throw new MemoryAcceptError('memory-conflict', 'Memory branch changed during turn');
      }
      const branch = input.branch.trim();
      if (branch.length === 0 || branch.length > 255 || branch !== input.branch) {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory branch name');
      }
      try {
        run(root, ['check-ref-format', '--branch', branch]);
      } catch {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory branch name');
      }
      let exists = false;
      try {
        run(root, ['show-ref', '--verify', '--quiet', 'refs/heads/' + branch]);
        exists = true;
      } catch {}
      if (exists) throw new MemoryAcceptError('memory-conflict', 'Memory branch already exists');
      if (!/^[0-9a-f]{40}$/u.test(input.sha)) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }

      this.gitCommitDiff(input.botSlug, input.sha);

      try {
        run(root, ['switch', '-c', branch, input.sha]);
      } catch {
        throw new MemoryAcceptError(
          'memory-conflict',
          'Git could not create and switch Memory branch',
        );
      }
      inFlight.set(input.botSlug, { sessionId: input.sessionId, branch });
      return { from, to: branch, head: input.sha };
    },
    switchBranch(input) {
      requireOwned(input.botSlug, input.sessionId);
      const flight = inFlight.get(input.botSlug);
      if (flight?.sessionId !== input.sessionId) {
        throw new MemoryAcceptError('memory-conflict', 'Memory turn was not prepared');
      }
      const branch = input.branch.trim();
      if (branch.length === 0 || branch.length > 255 || branch !== input.branch) {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory branch name');
      }
      const root = repository(registry, input.botSlug);
      const from = branchOf(root);
      if (from !== flight.branch) {
        throw new MemoryAcceptError('memory-conflict', 'Memory branch changed during turn');
      }
      try {
        run(root, ['check-ref-format', '--branch', branch]);
        run(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
      } catch {
        throw new MemoryAcceptError('memory-invalid', 'Memory branch does not exist');
      }

      const targetHead = output(root, ['rev-parse', '--verify', `refs/heads/${branch}`]);
      if (from !== branch) {
        try {
          run(root, ['switch', branch]);
        } catch {
          throw new MemoryAcceptError('memory-conflict', 'Git could not switch Memory branch');
        }
      }
      inFlight.set(input.botSlug, { sessionId: input.sessionId, branch });
      return { from, to: branch, head: targetHead };
    },
    prepareTurn,
    scanChanges,
    pendingCommits,
    advanceCommitCursor,
    preparedObservation(botSlug, sessionId) {
      const flight = inFlight.get(botSlug);
      if (flight?.sessionId !== sessionId || flight.observation === undefined) {
        throw new MemoryAcceptError('memory-conflict', 'Memory turn was not prepared');
      }
      return flight.observation;
    },
    reconcileTurn,
    abortTurn(botSlug, sessionId, preserveObservation = false) {
      const flight = inFlight.get(botSlug);
      if (flight?.sessionId !== sessionId) return;
      inFlight.delete(botSlug);
      if (!preserveObservation)
        refreshObservation(
          botSlug,
          sessionId,
          'turn-abort',
          sessionId,
          flight.observation?.observationJson,
        );
    },
    snapshot(botSlug) {
      const { root, repairing } = readRepository(botSlug);
      bootstrap(botSlug, root);
      return {
        head: head(root),
        files: listCurrentFiles(root),
        provisional: repairing,
        standing: standingUsage(
          root,
          registry.get(botSlug)?.standingLimits ?? DEFAULT_STANDING_LIMITS,
        ),
      };
    },
    markdownImageFile(botSlug, path, source, revision, reference) {
      const root = graphRepository(botSlug);
      const document = readMemoryMarkdown(root, path, source, run);
      if (document.status !== 'ready')
        throw new MemoryImageError(`memory-image-${document.status}`, 'Markdown is unavailable');
      if (document.revision !== revision)
        throw new MemoryImageError('memory-image-stale', 'Markdown changed; refresh the view');
      const imagePath = memoryMarkdownImagePath(path, reference);
      const { image, bytes } = readMemoryImage(root, imagePath, source, run);
      if (image.status !== 'ready' || bytes === undefined)
        throw new MemoryImageError(
          `memory-image-${image.status}`,
          'Image is unavailable or cannot be previewed',
        );
      if (readMemoryMarkdown(root, path, source, run).revision !== revision)
        throw new MemoryImageError('memory-image-stale', 'Markdown changed; refresh the view');
      return bytes;
    },
    imageFile(botSlug, path, source, revision) {
      if (!/^[0-9a-f]{64}$/u.test(revision))
        throw new MemoryImageError('memory-image-invalid', 'Invalid image content revision');
      const { image, bytes } = readMemoryImage(graphRepository(botSlug), path, source, run);
      if (image.status !== 'ready' || bytes === undefined)
        throw new MemoryImageError(
          `memory-image-${image.status}`,
          'Image is unavailable or cannot be previewed',
        );
      if (image.revision !== revision)
        throw new MemoryImageError('memory-image-stale', 'Image changed; refresh the view');
      return bytes;
    },
    readAccepted(botSlug, path) {
      const { root } = readRepository(botSlug);
      const relative = toMemoryRelativePath(path);
      const target = resolveMemoryPath(root, relative);
      if (!existsSync(target) || !statSync(target).isFile()) return undefined;
      if (isMemoryMarkdown(relative)) {
        const markdown = readMemoryMarkdown(root, relative, 'worktree', run);
        return {
          path: relative,
          body: markdown.body,
          head: head(root),
          markdown,
          ...(markdown.status === 'ready' ? {} : { binary: true }),
        };
      }
      if (isMemoryImagePath(relative)) {
        return {
          path: relative,
          body: '',
          head: head(root),
          binary: true,
          image: readMemoryImage(root, relative, 'worktree', run).image,
        };
      }
      const fileSize = statSync(target).size;
      if (fileSize > MAX_DIFF_BYTES) {
        return { path: relative, body: '', head: head(root), binary: true };
      }
      const bytes = readFileSync(target);
      let body: string;
      let binary = bytes.includes(0);
      try {
        body = binary ? '' : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        body = '';
        binary = true;
      }
      return {
        path: relative,
        body,
        head: head(root),
        ...(binary ? { binary: true } : {}),
      };
    },

    gitGraph(botSlug, offset = 0, path) {
      if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory graph offset');
      }
      const root = graphRepository(botSlug);
      const only = path === undefined ? undefined : toMemoryRelativePath(path);
      if (only !== undefined) resolveMemoryPath(root, only);
      const branchMap = new Map<string, string[]>();
      for (const line of output(root, [
        'for-each-ref',
        '--format=%(objectname) %(refname:short)',
        'refs/heads',
      ]).split('\n')) {
        if (line.length === 0) continue;
        const separator = line.indexOf(' ');
        if (separator < 0) continue;
        const sha = line.slice(0, separator);
        branchMap.set(sha, [...(branchMap.get(sha) ?? []), line.slice(separator + 1)]);
      }
      const versions = versionNames(root);
      const currentHead = head(root);
      let currentBranch: string | null;
      try {
        currentBranch = output(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
      } catch {
        currentBranch = null;
      }
      const repairing = pendingRepair(botSlug)?.provisional_head_sha;
      const lines = output(root, [
        'log',
        '--branches',
        'HEAD',
        '--topo-order',
        `--skip=${offset}`,
        '--max-count=61',
        '--format=%H%x1f%P%x1f%s%x1f%aI',
        ...(only === undefined ? [] : ['--', only]),
      ])
        .split('\n')
        .filter(Boolean);
      const displayedShas = lines.slice(0, 60).map((line) => line.slice(0, 40));
      const accepted = database.read((db) => {
        const lookup = db.prepare(
          'SELECT 1 AS found FROM memory_accepted_commits WHERE bot_slug = ? AND sha = ?',
        );
        return new Set(
          displayedShas.filter((sha) => {
            if (!/^[0-9a-f]{40}$/u.test(sha)) return false;
            return lookup.get(botSlug, sha) !== undefined;
          }),
        );
      });
      const commits = lines.slice(0, 60).map((line): MemoryGitCommit => {
        const [sha = '', parents = '', subject = '', authoredAt = ''] = line.split('\x1f');
        if (!/^[0-9a-f]{40}$/u.test(sha))
          throw new MemoryAcceptError('memory-invalid', 'Invalid Memory Git commit');
        return {
          sha,
          parents: parents === '' ? [] : parents.split(' '),
          subject,
          authoredAt,
          branches: branchMap.get(sha) ?? [],
          versions: versions.get(sha) ?? [],
          status: sha === repairing ? 'needs-repair' : accepted.has(sha) ? 'accepted' : 'pending',
        };
      });
      return {
        head: currentHead,
        currentBranch,
        branches: [...branchMap.values()].flat().sort(),
        dirty: dirty(root),
        commits,
        hasMore: lines.length > 60,
      };
    },
    gitCommitDiff(botSlug, sha) {
      if (!/^[0-9a-f]{40}$/u.test(sha)) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      const root = graphRepository(botSlug);
      let objectType: string;
      try {
        objectType = output(root, ['cat-file', '-t', sha]);
      } catch {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      if (objectType !== 'commit') {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      const containing = output(root, ['branch', '--contains', sha, '--format=%(refname:short)']);
      let reachableFromHead = false;
      try {
        run(root, ['merge-base', '--is-ancestor', sha, 'HEAD']);
        reachableFromHead = true;
      } catch {}
      if (containing.length === 0 && !reachableFromHead) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Unknown Memory Git commit');
      }
      const parents = output(root, ['rev-list', '--parents', '-n', '1', sha]).split(' ').slice(1);
      const firstParent = parents[0];
      const range = firstParent === undefined ? [sha] : [firstParent, sha];
      const nameStatus = run(
        root,
        firstParent === undefined
          ? [
              'diff-tree',
              '--root',
              '--no-renames',
              '--no-commit-id',
              '--name-status',
              '-r',
              '-z',
              sha,
            ]
          : ['diff', '--no-renames', '--name-status', '-z', ...range],
      )
        .toString('utf8')
        .split('\0')
        .filter(Boolean);
      const files: MemoryGitCommitDiff['files'] = [];
      let markdownBudget = MAX_MEMORY_MARKDOWN_BYTES;
      const document = (path: string, source: string) => {
        const result = readMemoryMarkdown(root, path, source, run, markdownBudget);
        markdownBudget -= Buffer.byteLength(result.body, 'utf8');
        return result;
      };
      for (let index = 0; index < nameStatus.length; index += 2) {
        const status = nameStatus[index] ?? '';
        const path = nameStatus[index + 1] ?? '';
        files.push({
          status,
          path,
          ...(isMemoryMarkdown(path)
            ? {
                markdown: {
                  ...(status === 'A' || firstParent === undefined
                    ? {}
                    : { before: document(path, firstParent) }),
                  ...(status === 'D' ? {} : { after: document(path, sha) }),
                },
              }
            : {}),
          ...(isMemoryImagePath(path)
            ? {
                images: {
                  ...(status === 'A' || firstParent === undefined
                    ? {}
                    : { before: readMemoryImage(root, path, firstParent, run).image }),
                  ...(status === 'D' ? {} : { after: readMemoryImage(root, path, sha, run).image }),
                },
              }
            : {}),
        });
      }
      return {
        sha,
        subject: output(root, ['show', '--no-patch', '--format=%s', sha]).slice(0, 200),
        files,
        diff: output(
          root,
          firstParent === undefined
            ? ['show', '--format=', '--no-ext-diff', '--no-textconv', '--no-renames', '--root', sha]
            : ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', ...range],
        ),
      };
    },
    workingChanges(botSlug) {
      return currentWorkingChanges(graphRepository(botSlug));
    },
    workingDiff(botSlug, path, kind) {
      if (!['staged', 'unstaged', 'untracked', 'current'].includes(kind)) {
        throw new MemoryAcceptError('memory-invalid', 'Invalid Memory change kind');
      }
      const root = graphRepository(botSlug);
      const relative = toMemoryRelativePath(path);
      const phases = currentWorkingChanges(root).filter((entry) => entry.path === relative);

      const addedThenRemoved =
        phases.some((entry) => entry.kind === 'staged' && entry.status === 'A') &&
        phases.some((entry) => entry.kind === 'unstaged' && entry.status === 'D');
      const change =
        kind === 'current'
          ? phases.length === 0 || addedThenRemoved
            ? undefined
            : {
                path: relative,
                kind,
                status: phases.some((entry) => entry.kind === 'untracked' || entry.status === 'A')
                  ? 'A'
                  : phases.some((entry) => entry.status === 'D')
                    ? 'D'
                    : 'M',
              }
          : phases.find((entry) => entry.kind === kind);
      if (change === undefined) {
        throw new MemoryAcceptError('memory-invalid', 'Memory working change no longer exists');
      }
      const comparisonHead = head(root);
      const markdown = isMemoryMarkdown(relative)
        ? {
            ...(change.status === 'A' || kind === 'untracked'
              ? {}
              : {
                  before: readMemoryMarkdown(
                    root,
                    relative,
                    kind === 'unstaged' ? 'index' : comparisonHead,
                    run,
                  ),
                }),
            ...(change.status === 'D'
              ? {}
              : {
                  after: readMemoryMarkdown(
                    root,
                    relative,
                    kind === 'staged' ? 'index' : 'worktree',
                    run,
                  ),
                }),
          }
        : undefined;
      if (isMemoryImagePath(relative)) {
        const oldSource = kind === 'unstaged' ? 'index' : head(root);
        const newSource = kind === 'staged' ? 'index' : 'worktree';
        return {
          ...change,
          diff: '',
          binary: true,
          images: {
            ...(change.status === 'A' || kind === 'untracked'
              ? {}
              : { before: readMemoryImage(root, relative, oldSource, run).image }),
            ...(change.status === 'D'
              ? {}
              : { after: readMemoryImage(root, relative, newSource, run).image }),
          },
        };
      }
      if (kind !== 'untracked' && !(kind === 'current' && phases[0]?.kind === 'untracked')) {
        const diff = output(root, [
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--no-renames',
          ...(kind === 'staged'
            ? ['--cached', comparisonHead]
            : kind === 'current'
              ? [comparisonHead]
              : []),
          '--',
          relative,
        ]);
        if (markdown !== undefined) {
          if (
            head(root) !== comparisonHead ||
            Object.values(markdown).some((document) => {
              const next = readMemoryMarkdown(root, relative, document.source, run);
              return next.revision !== document.revision || next.status !== document.status;
            })
          )
            throw new MemoryImageError('memory-image-stale', 'Markdown changed; refresh the view');
        }
        return {
          ...change,
          diff,
          binary: /^Binary files .+ differ$/mu.test(diff),
          ...(markdown === undefined ? {} : { markdown }),
        };
      }
      const target = resolveMemoryPath(root, relative);
      const stat = lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isFile()) return { ...change, diff: '', binary: true };
      if (stat.size > MAX_FILE_BYTES) {
        throw new MemoryAcceptError('memory-invalid', 'Memory file is too large to preview');
      }
      const bytes = readFileSync(target);
      if (bytes.includes(0)) return { ...change, diff: '', binary: true };
      let body: string;
      try {
        body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return { ...change, diff: '', binary: true };
      }
      const lines = body === '' ? [] : body.replace(/\n$/u, '').split('\n');
      const diff = [
        `diff --git a/${relative} b/${relative}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${relative}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => `+${line}`),
        ...(body !== '' && !body.endsWith('\n') ? ['\\ No newline at end of file'] : []),
      ].join('\n');
      return { ...change, diff, binary: false, ...(markdown === undefined ? {} : { markdown }) };
    },
    recoveryHistory(botSlug) {
      if (pendingRepair(botSlug) !== undefined)
        throw new MemoryAcceptError('memory-conflict', 'Memory repair must finish before recovery');
      const root = repository(registry, botSlug);
      try {
        if (!inFlight.has(botSlug))
          recovery.capture(botSlug, root, {
            origin: 'host-observation',
            originId: 'botharness-host',
            causeKind: 'memory-scan',
            causeId: botSlug,
          });
        return recovery.history(botSlug);
      } catch (error) {
        throw new MemoryAcceptError(
          'memory-conflict',
          `Memory checkpoint failed: ${String(error)}`,
        );
      }
    },
    restoreHuman(input) {
      if (inFlight.has(input.botSlug) || pendingRepair(input.botSlug) !== undefined)
        throw new MemoryAcceptError('memory-conflict', 'Memory is busy');
      const root = repository(registry, input.botSlug);
      try {
        const result = recovery.restore(
          input.botSlug,
          root,
          input.checkpointId,
          input.expectedCurrentId,
        );
        try {
          saveObservation(input.botSlug, root, observeWorktree(root));
        } catch (error) {
          options.warn?.(
            `memory-observation-failed phase=after-restore bot=${input.botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
          );
        }
        return result;
      } catch (error) {
        throw new MemoryAcceptError('memory-conflict', `Memory restore failed: ${String(error)}`);
      }
    },
    sourceReferences(sourceEventIds) {
      if (!sourceEventIds.length) return [];
      if (sourceEventIds.length > 100) throw new Error('Too many source references');
      return database.read((db) =>
        db
          .prepare(`SELECT bot_slug, sha, cause_id FROM memory_accepted_commits
            WHERE cause_kind = 'source-event' AND cause_id IN (${sourceEventIds.map(() => '?').join(',')})
            ORDER BY bot_slug, sha`)
          .all(...sourceEventIds)
          .map((row) => {
            const botSlug = String(row.bot_slug);
            const memoryDir = registry.memoryDirFor(botSlug);
            return {
              sourceEventId: String(row.cause_id),
              botSlug,
              sha: String(row.sha),
              ...(memoryDir ? { memoryDir } : {}),
              available: memoryDir !== undefined && existsSync(memoryDir),
            };
          }),
      );
    },
    history(botSlug, limit = 20) {
      const { root } = readRepository(botSlug);
      bootstrap(botSlug, root);
      const bounded = Math.max(1, Math.min(limit, 100));
      const rows = database.read(
        (db) =>
          db
            .prepare(`SELECT * FROM memory_accepted_commits WHERE bot_slug = ?
          ORDER BY rowid DESC LIMIT ?`)
            .all(botSlug, bounded) as unknown as AcceptedRow[],
      );
      return rows.map(rowToCommit);
    },
    diff(botSlug, sha) {
      const { root } = readRepository(botSlug);
      const exists = database.read(
        (db) =>
          db
            .prepare(
              'SELECT 1 AS found FROM memory_accepted_commits WHERE bot_slug = ? AND sha = ?',
            )
            .get(botSlug, sha) as { found: number } | undefined,
      );
      if (exists === undefined) {
        throw new MemoryAcceptError('memory-unknown-commit', 'Memory Commit is not accepted');
      }
      const patch = run(root, ['show', '--format=', '--no-ext-diff', sha], MAX_DIFF_BYTES);
      return { sha, diff: patch.toString('utf8') };
    },
    repairHuman(input) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(input.repairId)) {
        throw new MemoryAcceptError('memory-invalid', 'Valid Memory repair identity is required');
      }
      const root = registry.memoryDirFor(input.botSlug);
      const existing = database.read(
        (db) =>
          db.prepare('SELECT * FROM memory_repair_events WHERE id = ?').get(input.repairId) as
            | RepairRow
            | undefined,
      );
      const pending = existing ?? pendingRepair(input.botSlug);
      const archived = pending === undefined ? undefined : join(pending.backup_path, 'repository');

      const branchSource =
        archived !== undefined && existsSync(join(archived, '.git')) ? archived : root;
      const branch =
        branchSource === undefined || !existsSync(join(branchSource, '.git'))
          ? 'main'
          : branchOf(verifiedRepository(branchSource, input.botSlug));
      const baseline = acceptedHead(input.botSlug, branch);
      if (
        root === undefined ||
        baseline === null ||
        baseline !== input.expectedHead ||
        inFlight.has(input.botSlug)
      ) {
        throw new MemoryAcceptError(
          'memory-conflict',
          'Accepted Memory changed or a turn is active',
        );
      }
      if (existing !== undefined) {
        if (existing.bot_slug !== input.botSlug || existing.accepted_head_sha !== baseline) {
          throw new MemoryAcceptError('memory-conflict', 'Memory repair identity was already used');
        }
        if (existing.status === 'completed') return rowToRepair(existing);
      }
      let event = pending;
      if (event === undefined) {
        verifiedRepository(root, input.botSlug);
        const provisionalHead = head(root);
        if (provisionalHead === baseline && !dirty(root)) {
          throw new MemoryAcceptError('memory-conflict', 'Memory has no provisional changes');
        }
        const parent = join(dirname(root), 'memory-repairs');
        mkdirSync(parent, { recursive: true, mode: 0o700 });
        const backupPath = join(parent, input.repairId);
        if (existsSync(backupPath)) {
          throw new MemoryAcceptError('memory-conflict', 'Memory repair archive already exists');
        }
        mkdirSync(backupPath, { mode: 0o700 });
        const at = now().toISOString();
        event = database.transaction(
          (db) => {
            db.prepare(`INSERT INTO memory_repair_events (
            id, bot_slug, accepted_head_sha, provisional_head_sha, backup_path,
            actor_kind, actor_id, cause_kind, status, requested_at
          ) VALUES (?, ?, ?, ?, ?, 'human', ?, 'human-repair', 'started', ?)`).run(
              input.repairId,
              input.botSlug,
              baseline,
              provisionalHead,
              backupPath,
              LOCAL_HUMAN_ID,
              at,
            );
            return db
              .prepare('SELECT * FROM memory_repair_events WHERE id = ?')
              .get(input.repairId) as unknown as RepairRow;
          },
          ['memory-repair'],
        );
      }
      const archive = join(event.backup_path, 'repository');
      if (!existsSync(archive)) {
        if (!existsSync(root)) {
          throw new MemoryAcceptError(
            'memory-invalid',
            'Memory repair source and archive are missing',
          );
        }
        verifiedRepository(root, input.botSlug);
        if (branchOf(root) !== branch || head(root) !== event.provisional_head_sha) {
          throw new MemoryAcceptError('memory-conflict', 'Memory HEAD changed before archive');
        }
        renameSync(root, archive);
      }
      verifiedRepository(archive, input.botSlug);
      if (existsSync(root)) {
        verifiedRepository(root, input.botSlug);
        if (branchOf(root) !== branch || head(root) !== baseline || dirty(root)) {
          throw new MemoryAcceptError('memory-conflict', 'Memory root changed during repair');
        }
      } else {
        const staging = mkdtempSync(join(dirname(root), '.memory-restore-'));
        try {
          const restored = join(staging, 'repository');
          cpSync(archive, restored, { recursive: true, dereference: false });
          verifiedRepository(restored, input.botSlug);
          if (branchOf(restored) !== branch) {
            throw new MemoryAcceptError('memory-conflict', 'Memory repair branch changed');
          }
          run(restored, ['reset', '--hard', baseline]);
          run(restored, ['clean', '-ffdx']);
          if (head(restored) !== baseline || dirty(restored)) {
            throw new MemoryAcceptError(
              'memory-conflict',
              'Memory repair did not restore accepted head',
            );
          }
          if (existsSync(root)) {
            throw new MemoryAcceptError('memory-conflict', 'Memory root reappeared during repair');
          }
          renameSync(restored, root);
        } finally {
          rmSync(staging, { recursive: true, force: true });
        }
      }
      const at = now().toISOString();
      return rowToRepair(
        database.transaction(
          (db) => {
            db.prepare(
              "UPDATE memory_repair_events SET status = 'completed', completed_at = ? WHERE id = ?",
            ).run(at, event.id);
            return db
              .prepare('SELECT * FROM memory_repair_events WHERE id = ?')
              .get(event.id) as unknown as RepairRow;
          },
          ['memory-repair'],
        ),
      );
    },
    saveHuman(input) {
      if (pendingRepair(input.botSlug) !== undefined) {
        throw new MemoryAcceptError(
          'memory-conflict',
          'Memory repair must finish before Human save',
        );
      }
      const root = repository(registry, input.botSlug);
      const priorEdit = database.read(
        (db) =>
          db
            .prepare(`SELECT * FROM memory_accepted_commits
          WHERE bot_slug = ? AND cause_kind = 'human-edit' AND cause_id = ?`)
            .get(input.botSlug, input.editId) as AcceptedRow | undefined,
      );
      if (priorEdit !== undefined) {
        const current = head(root);
        const path = toMemoryRelativePath(input.path);
        const previousBody = run(
          root,
          ['show', `${priorEdit.sha}:${path}`],
          MAX_FILE_BYTES + 1,
        ).toString('utf8');
        if (current !== priorEdit.sha || previousBody !== input.body) {
          throw new MemoryAcceptError('memory-conflict', 'Human edit identity was already used');
        }
        return rowToCommit(priorEdit);
      }
      const baseline = head(root);
      if (inFlight.has(input.botSlug) || baseline !== input.expectedHead || dirty(root)) {
        throw new MemoryAcceptError('memory-conflict', 'Memory changed since the Human opened it');
      }
      const path = toMemoryRelativePath(input.path);
      if (Buffer.byteLength(input.body, 'utf8') > MAX_FILE_BYTES || input.body.includes('\0')) {
        throw new MemoryAcceptError('memory-invalid', 'Memory edit is too large or contains NUL');
      }
      const target = resolveMemoryPath(root, path);
      mkdirSync(dirname(target), { recursive: true });
      atomicWriteFile(target, input.body);
      run(root, ['add', '--', path]);
      if (run(root, ['diff', '--cached', '--name-only', '--', path]).length === 0) {
        throw new MemoryAcceptError('memory-conflict', 'Memory edit did not change the file');
      }
      if (head(root) !== baseline) {
        throw new MemoryAcceptError('memory-conflict', 'Memory head changed before Human commit');
      }
      run(root, ['commit', '--no-gpg-sign', '-m', `Human Memory edit: ${path}`]);
      const sha = head(root);
      if (parentOf(root, sha) !== baseline) {
        throw new MemoryAcceptError(
          'memory-conflict',
          'Human Memory commit has an unaccepted parent',
        );
      }
      const [accepted] = accept(
        input.botSlug,
        branchOf(root),
        [
          {
            sha,
            parentSha: baseline,
            actorKind: 'human',
            actorId: LOCAL_HUMAN_ID,
            causeKind: 'human-edit',
            causeId: input.editId,
            validationResult: validateCommit(root, sha),
          },
        ],
        acceptedHead(input.botSlug, branchOf(root)),
      );
      if (accepted === undefined)
        throw new MemoryAcceptError('memory-invalid', 'Memory edit was not accepted');
      try {
        recovery.capture(input.botSlug, root, {
          origin: 'human-command',
          originId: LOCAL_HUMAN_ID,
          causeKind: 'human-edit',
          causeId: input.editId,
        });
      } catch (error) {
        options.warn?.(
          `memory-recovery-capture-failed phase=after-human-edit bot=${input.botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
        );
      }
      return accepted;
    },
    restoreCommitHuman(input) {
      if (inFlight.has(input.botSlug) || pendingRepair(input.botSlug) !== undefined)
        throw new MemoryAcceptError('memory-conflict', 'Memory is busy');
      const root = repository(registry, input.botSlug);
      const branch = branchOf(root);
      const baseline = head(root);
      if (baseline !== input.expectedHead)
        throw new MemoryAcceptError('memory-conflict', 'Memory changed since the Human opened it');
      let targetTree: string;
      try {
        targetTree = output(root, ['rev-parse', '--verify', `${input.sha}^{commit}^{tree}`]);
      } catch {
        throw new MemoryAcceptError('memory-invalid', 'Memory commit is not in this repository');
      }
      const saved = recovery.capture(
        input.botSlug,
        root,
        {
          origin: 'human-command',
          originId: LOCAL_HUMAN_ID,
          causeKind: 'human-edit',
          causeId: input.restoreId,
        },
        true,
      );
      if (saved.branch !== branch || saved.head !== baseline)
        throw new MemoryAcceptError('memory-conflict', 'Memory changed while it was saved');
      if (input.name !== undefined) validVersionName(input.name);
      let backup: string | null = null;
      let parent = baseline;
      if (output(root, ['rev-parse', `${baseline}^{tree}`]) !== saved.workingTree) {
        backup = output(root, [
          'commit-tree',
          saved.workingTree,
          '-p',
          baseline,
          '-m',
          'Back up uncommitted Memory before restore',
        ]);
        parent = backup;
      }
      let loaded = parent;
      if (output(root, ['rev-parse', `${parent}^{tree}`]) !== targetTree) {
        const subject = output(root, ['log', '-1', '--format=%s', input.sha]).slice(0, 120);
        loaded = output(root, [
          'commit-tree',
          targetTree,
          '-p',
          parent,
          '-m',
          `Restore Memory to ${input.sha.slice(0, 7)}: ${subject}`,
        ]);
      }
      if (loaded !== baseline) run(root, ['update-ref', `refs/heads/${branch}`, loaded, baseline]);
      run(root, ['reset', '--hard', loaded]);
      run(root, ['clean', '-fd']);
      let version: MemoryVersionName | null = null;
      try {
        if (input.name !== undefined) version = nameVersion(root, parent, input.name);
      } catch (error) {
        options.warn?.(
          `memory-version-name-failed bot=${input.botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
        );
      }
      try {
        const commits = [
          ...(backup === null ? [] : [{ sha: backup, parentSha: baseline }]),
          ...(loaded === parent ? [] : [{ sha: loaded, parentSha: parent }]),
        ];
        if (commits.length > 0) {
          accept(
            input.botSlug,
            branch,
            commits.map((commit) => ({
              ...commit,
              actorKind: 'human' as const,
              actorId: LOCAL_HUMAN_ID,
              causeKind: 'human-edit' as const,
              causeId: input.restoreId,
              validationResult: validateCommit(root, commit.sha),
            })),
            acceptedHead(input.botSlug, branch),
          );
        }
        recovery.capture(input.botSlug, root, {
          origin: 'human-command',
          originId: LOCAL_HUMAN_ID,
          causeKind: 'human-edit',
          causeId: input.restoreId,
        });
        saveObservation(input.botSlug, root, observeWorktree(root));
      } catch (error) {
        options.warn?.(
          `memory-record-failed phase=after-human-commit-restore bot=${input.botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
        );
      }
      return { head: loaded, backup, version, saved };
    },
    versions(botSlug) {
      return versionList(graphRepository(botSlug));
    },
    nameVersionHuman(input) {
      return nameVersion(repository(registry, input.botSlug), input.sha, input.name);
    },
    removeVersionNameHuman(input) {
      const root = repository(registry, input.botSlug);
      try {
        run(root, ['show-ref', '--verify', '--quiet', `refs/tags/${input.tag}`]);
      } catch {
        throw new MemoryAcceptError('memory-invalid', 'Version name is not in this repository');
      }
      run(root, ['tag', '-d', input.tag]);
    },
  };
}
