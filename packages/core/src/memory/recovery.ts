import { asyncGitSteps, syncGitSteps, type GitSteps } from './git-steps.js';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { LOCAL_HUMAN_ID } from '../channels/channel.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type MemoryCheckpointOrigin = 'host-observation' | 'agent-session' | 'human-command';

export interface MemoryRecoveryCheckpoint {
  id: string;
  botSlug: string;
  branch: string;
  head: string;
  indexTree: string;
  workingTree: string;
  ref: string;
  origin: MemoryCheckpointOrigin;
  originId: string;
  causeKind: 'memory-scan' | 'source-event' | 'human-edit' | 'turn-abort' | 'human-restore';
  causeId: string;
  capturedAt: string;
}

interface CheckpointRow {
  id: string;
  bot_slug: string;
  branch_name: string;
  head_sha: string;
  index_tree_sha: string;
  working_tree_sha: string;
  git_ref: string;
  origin_kind: MemoryCheckpointOrigin;
  origin_id: string;
  cause_kind: MemoryRecoveryCheckpoint['causeKind'];
  cause_id: string;
  captured_at: string;
}

const SHA = /^[0-9a-f]{40}$/u;
const MAX_GIT_OUTPUT = 4 * 1024 * 1024;

type GitRunner = (root: string, args: string[], indexFile?: string) => string;

function* gitSteps(
  root: string,
  args: string[],
  indexFile?: string,
  warn?: (message: string) => void,
): GitSteps<string> {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  if (indexFile !== undefined) env.GIT_INDEX_FILE = indexFile;
  const started = Date.now();
  try {
    return (yield {
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
        'commit.gpgsign=false',
        '-c',
        'core.attributesFile=/dev/null',
        '-c',
        'user.name=BotHarness',
        '-c',
        'user.email=memory@botharness.local',
        ...args,
      ],
      options: {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: MAX_GIT_OUTPUT,
        windowsHide: true,
      },
    })
      .toString('utf8')
      .trim();
  } finally {
    const duration = Date.now() - started;
    if (duration > 2_000)
      warn?.(`memory-recovery-git phase=${args[0] ?? 'unknown'} duration_ms=${duration}`);
  }
}

function rowToCheckpoint(row: CheckpointRow): MemoryRecoveryCheckpoint {
  return {
    id: row.id,
    botSlug: row.bot_slug,
    branch: row.branch_name,
    head: row.head_sha,
    indexTree: row.index_tree_sha,
    workingTree: row.working_tree_sha,
    ref: row.git_ref,
    origin: row.origin_kind,
    originId: row.origin_id,
    causeKind: row.cause_kind,
    causeId: row.cause_id,
    capturedAt: row.captured_at,
  };
}

function* captureTreesSteps(
  root: string,
  run: (root: string, args: string[], indexFile?: string) => GitSteps<string>,
): GitSteps<{
  branch: string;
  head: string;
  indexTree: string;
  workingTree: string;
}> {
  const branch = yield* run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const head = yield* run(root, ['rev-parse', '--verify', 'HEAD']);
  if (!SHA.test(head)) throw new Error('Invalid Memory HEAD');
  const temp = mkdtempSync(join(tmpdir(), 'botharness-memory-index-'));
  if (dirname(resolve(temp)) !== resolve(tmpdir()))
    throw new Error('Memory capture staging directory escaped the temporary root');
  const indexFile = join(temp, 'index');
  try {
    const sourceIndex = join(root, '.git', 'index');
    if (existsSync(sourceIndex)) cpSync(sourceIndex, indexFile);
    else yield* run(root, ['read-tree', 'HEAD'], indexFile);
    const indexTree = yield* run(root, ['write-tree'], indexFile);
    yield* run(root, ['add', '-A'], indexFile);
    const workingTree = yield* run(root, ['write-tree'], indexFile);
    if (
      branch !== (yield* run(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])) ||
      head !== (yield* run(root, ['rev-parse', '--verify', 'HEAD']))
    )
      throw new Error('Memory branch changed while capturing checkpoint');
    return { branch, head, indexTree, workingTree };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function createMemoryRecovery(options: {
  database: OperationalDatabaseModulePort;
  now: () => Date;
  warn?: (message: string) => void;
}) {
  const { database, now } = options;
  const runSteps = (root: string, args: string[], indexFile?: string) =>
    gitSteps(root, args, indexFile, options.warn);
  const run: GitRunner = (root, args, indexFile) => syncGitSteps(runSteps(root, args, indexFile));
  const captureTrees = (root: string) => syncGitSteps(captureTreesSteps(root, runSteps));
  const latest = (botSlug: string): MemoryRecoveryCheckpoint | undefined => {
    const row = database.read(
      (db) =>
        db
          .prepare(
            'SELECT * FROM memory_recovery_checkpoints WHERE bot_slug = ? ORDER BY captured_at DESC, rowid DESC LIMIT 1',
          )
          .get(botSlug) as CheckpointRow | undefined,
    );
    return row === undefined ? undefined : rowToCheckpoint(row);
  };
  const history = (botSlug: string, limit = 50): MemoryRecoveryCheckpoint[] =>
    database.read((db) =>
      (
        db
          .prepare(
            'SELECT * FROM memory_recovery_checkpoints WHERE bot_slug = ? ORDER BY captured_at DESC, rowid DESC LIMIT ?',
          )
          .all(botSlug, limit) as unknown as CheckpointRow[]
      ).map(rowToCheckpoint),
    );
  const captureSteps = function* (
    botSlug: string,
    root: string,
    context: Pick<MemoryRecoveryCheckpoint, 'origin' | 'originId' | 'causeKind' | 'causeId'>,
    force = false,
  ): GitSteps<MemoryRecoveryCheckpoint> {
    const state = yield* captureTreesSteps(root, runSteps);
    const previous = latest(botSlug);
    if (
      !force &&
      previous?.branch === state.branch &&
      previous.head === state.head &&
      previous.indexTree === state.indexTree &&
      previous.workingTree === state.workingTree
    )
      return previous;
    const id = randomUUID();
    const ref = `refs/botharness/recovery/${id}`;
    const indexCommit = yield* runSteps(root, [
      'commit-tree',
      state.indexTree,
      '-p',
      state.head,
      '-m',
      `Memory checkpoint ${id} index`,
    ]);
    const workingCommit = yield* runSteps(root, [
      'commit-tree',
      state.workingTree,
      '-p',
      indexCommit,
      '-m',
      `Memory checkpoint ${id} working tree`,
    ]);
    yield* runSteps(root, ['update-ref', ref, workingCommit]);
    const point: MemoryRecoveryCheckpoint = {
      id,
      botSlug,
      ...state,
      ref,
      ...context,
      capturedAt: now().toISOString(),
    };
    database.transaction(
      (db) => {
        db.prepare(`INSERT INTO memory_recovery_checkpoints (
        id, bot_slug, branch_name, head_sha, index_tree_sha, working_tree_sha,
        git_ref, origin_kind, origin_id, cause_kind, cause_id, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          point.id,
          point.botSlug,
          point.branch,
          point.head,
          point.indexTree,
          point.workingTree,
          point.ref,
          point.origin,
          point.originId,
          point.causeKind,
          point.causeId,
          point.capturedAt,
        );
      },
      ['memory-recovery'],
    );
    return point;
  };
  const capture = (...args: Parameters<typeof captureSteps>) => syncGitSteps(captureSteps(...args));
  const captureAsync = (...args: Parameters<typeof captureSteps>) =>
    asyncGitSteps(captureSteps(...args));
  const restore = (
    botSlug: string,
    root: string,
    targetId: string,
    expectedCurrentId: string,
  ): { checkpoint: MemoryRecoveryCheckpoint; archivePath: string } => {
    const targetRow = database.read(
      (db) =>
        db
          .prepare('SELECT * FROM memory_recovery_checkpoints WHERE bot_slug = ? AND id = ?')
          .get(botSlug, targetId) as CheckpointRow | undefined,
    );
    const target = targetRow === undefined ? undefined : rowToCheckpoint(targetRow);
    if (target === undefined) throw new Error('Unknown Memory recovery checkpoint');
    const current = capture(botSlug, root, {
      origin: 'host-observation',
      originId: 'botharness-host',
      causeKind: 'memory-scan',
      causeId: botSlug,
    });
    if (current.id !== expectedCurrentId)
      throw new Error('Memory changed since recovery was opened');
    if (
      target.ref !== `refs/botharness/recovery/${target.id}` ||
      ![target.head, target.indexTree, target.workingTree].every((sha) => SHA.test(sha)) ||
      run(root, ['rev-parse', '--verify', target.ref]) !==
        run(root, ['rev-parse', '--verify', `${target.ref}^{commit}`])
    ) {
      throw new Error('Memory recovery reference is invalid');
    }
    if (
      run(root, ['rev-parse', `${target.ref}^1^{tree}`]) !== target.indexTree ||
      run(root, ['rev-parse', `${target.ref}^{tree}`]) !== target.workingTree ||
      run(root, ['rev-parse', `${target.ref}^1^1`]) !== target.head
    )
      throw new Error('Memory recovery reference no longer matches its checkpoint');
    const parent = resolve(dirname(root));
    const stage = resolve(parent, `.memory-restore-${randomUUID()}`);
    const archivePath = resolve(parent, `.memory-before-restore-${randomUUID()}`);
    if (
      dirname(stage) !== parent ||
      dirname(archivePath) !== parent ||
      stage === resolve(root) ||
      archivePath === resolve(root)
    )
      throw new Error('Memory restore staging paths escaped the repository parent');
    try {
      cpSync(root, stage, { recursive: true, errorOnExist: true, force: false });
      run(stage, ['reset', '--hard']);
      run(stage, ['clean', '-ffdx']);
      run(stage, ['switch', '-C', target.branch, target.head]);
      run(stage, ['read-tree', '--reset', '-u', target.workingTree]);
      run(stage, ['read-tree', '--reset', target.indexTree]);
      const state = captureTrees(stage);
      if (
        state.branch !== target.branch ||
        state.head !== target.head ||
        state.indexTree !== target.indexTree ||
        state.workingTree !== target.workingTree
      )
        throw new Error('Restored Memory state did not match checkpoint');
      const beforeSwap = captureTrees(root);
      if (
        beforeSwap.branch !== current.branch ||
        beforeSwap.head !== current.head ||
        beforeSwap.indexTree !== current.indexTree ||
        beforeSwap.workingTree !== current.workingTree
      )
        throw new Error('Memory changed while recovery was prepared');
      if (existsSync(archivePath)) throw new Error('Memory archive path already exists');
      renameSync(root, archivePath);
      try {
        renameSync(stage, root);
      } catch (error) {
        renameSync(archivePath, root);
        throw error;
      }
      try {
        capture(
          botSlug,
          root,
          {
            origin: 'human-command',
            originId: LOCAL_HUMAN_ID,
            causeKind: 'human-restore',
            causeId: targetId,
          },
          true,
        );
      } catch (error) {
        options.warn?.(
          `memory-recovery-capture-failed phase=after-restore bot=${botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
        );
      }
      return { checkpoint: target, archivePath };
    } finally {
      if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
    }
  };
  return { capture, captureAsync, captureSteps, history, latest, restore };
}
