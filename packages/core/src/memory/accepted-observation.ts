import { syncGitSteps, type GitSteps } from './git-steps.js';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readlinkSync,
  readSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { STANDING_FILES } from './soul.js';
import { toMemoryRelativePath, resolveMemoryPath } from './jail.js';
import { createMemoryRecovery } from './recovery.js';
import {
  runSteps,
  run,
  branchOfSteps,
  headSteps,
  outputSteps,
  repositorySteps,
} from './accepted-git.js';
import { MemoryAcceptError } from './accepted-types.js';
import type {
  MemoryWorkingChange,
  MemoryChangeDelta,
  MemoryChangeScan,
  MemoryAcceptance,
} from './accepted-types.js';
import type { RepairRow } from './accepted-repository.js';

export interface TurnWorktreeObservation {
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

function* indexVersionsSteps(root: string, paths: string[]): GitSteps<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const versions = new Map<string, string>();
  let batch: string[] = [];
  let length = 0;
  const flush = function* (): GitSteps<void> {
    const raw = (yield* runSteps(root, [
      '--literal-pathspecs',
      'ls-files',
      '--stage',
      '-z',
      '--',
      ...batch,
    ])).toString('utf8');
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
    if (batch.length > 0 && (length + path.length + 1 > 8000 || batch.length === 100))
      yield* flush();
    batch.push(path);
    length += path.length + 1;
  }
  if (batch.length > 0) yield* flush();
  return versions;
}

export function unstableObservation(path: string): MemoryAcceptError {
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

function* porcelainFilesSteps(
  root: string,
): GitSteps<Pick<TurnWorktreeObservation, 'files' | 'overflowHash' | 'overflowCount'>> {
  const raw = (yield* runSteps(root, [
    'status',
    '--porcelain',
    '-z',
    '--untracked-files=all',
  ])).toString('utf8');
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
  const index = yield* indexVersionsSteps(
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
  const after = (yield* runSteps(root, [
    'status',
    '--porcelain',
    '-z',
    '--untracked-files=all',
  ])).toString('utf8');
  if (after !== raw) throw unstableObservation('working tree');
  const overflowCount = changes.length - selected.length;
  return overflowCount > 0
    ? { files, overflowHash: createHash('sha256').update(raw).digest('hex'), overflowCount }
    : { files };
}

export function currentWorkingChanges(root: string): MemoryWorkingChange[] {
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

export function observeWorktree(root: string): Omit<TurnWorktreeObservation, 'sessionId'> {
  return syncGitSteps(observeWorktreeSteps(root));
}

function* observeWorktreeSteps(root: string): GitSteps<Omit<TurnWorktreeObservation, 'sessionId'>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const branch = yield* branchOfSteps(root);
      const currentHead = yield* headSteps(root);
      const files = yield* porcelainFilesSteps(root);
      if (branch !== (yield* branchOfSteps(root)) || currentHead !== (yield* headSteps(root)))
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

function* safeGitSteps(root: string, args: string[]): GitSteps<string> {
  try {
    return yield* outputSteps(root, args);
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

function* personaDiffersAcrossHeadsSteps(
  root: string,
  oldHead: string,
  newHead: string,
): GitSteps<boolean> {
  return (
    (yield* safeGitSteps(root, [
      'diff',
      '--name-only',
      '-z',
      oldHead,
      newHead,
      '--',
      ...STANDING_FILES,
    ])).replaceAll('\0', '').length > 0
  );
}

function* buildTurnChangeSteps(
  root: string,
  previous: TurnWorktreeObservation,
  current: Omit<TurnWorktreeObservation, 'sessionId'>,
): GitSteps<MemoryChangeDelta | undefined> {
  if (current.branch !== previous.branch) {
    const details = [`Memory branch is now '${current.branch}' (was '${previous.branch}').`];
    const personaChanged = yield* personaDiffersAcrossHeadsSteps(root, previous.head, current.head);
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
    for (const name of (yield* safeGitSteps(root, [
      'diff',
      '--name-only',
      '-z',
      previous.head,
      current.head,
    ])).split('\0')) {
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

export function createMemoryObservation(wiring: {
  database: OperationalDatabaseModulePort;
  now: () => Date;
  registry: PersonaBotRegistry;
  recovery: ReturnType<typeof createMemoryRecovery>;
  options: {
    registry: PersonaBotRegistry;
    ownership: SessionOwnership;
    database: OperationalDatabaseModulePort;
    now?: () => Date;
    warn?: (message: string) => void;
  };
  bootstrapSteps: (botSlug: string, root: string) => GitSteps<string>;
  pendingRepair: (botSlug: string) => RepairRow | undefined;
  assertIdle: (botSlug: string) => void;
  runAsync: <T>(botSlug: string, steps: GitSteps<T>) => Promise<T>;
}) {
  const { database, now, registry, recovery, options, assertIdle, runAsync } = wiring;

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

  function* refreshObservationSteps(
    botSlug: string,
    sessionId: string,
    causeKind: 'source-event' | 'turn-abort' = 'turn-abort',
    causeId = sessionId,
    beforeObservationJson?: string,
  ): GitSteps<boolean> {
    try {
      const root = yield* repositorySteps(registry, botSlug);
      const current = yield* observeWorktreeSteps(root);
      saveObservation(botSlug, root, current);
      try {
        yield* recovery.captureSteps(
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
  }

  function* scanChangesSteps(botSlug: string): GitSteps<MemoryChangeScan> {
    const root = yield* repositorySteps(registry, botSlug);
    yield* wiring.bootstrapSteps(botSlug, root);
    if (wiring.pendingRepair(botSlug) !== undefined) {
      throw new MemoryAcceptError(
        'memory-conflict',
        'Memory repair must finish before observation',
      );
    }
    const current = yield* observeWorktreeSteps(root);
    const previous = readObservation(botSlug, root);
    const change =
      previous === undefined ? undefined : yield* buildTurnChangeSteps(root, previous, current);
    if (previous === undefined || change !== undefined) {
      try {
        yield* recovery.captureSteps(botSlug, root, {
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
  }

  const scanChanges = (botSlug: string): MemoryChangeScan => {
    assertIdle(botSlug);
    return syncGitSteps(scanChangesSteps(botSlug));
  };

  const methods: Pick<MemoryAcceptance, 'scanChangesAsync'> = {
    scanChangesAsync: (botSlug) => runAsync(botSlug, scanChangesSteps(botSlug)),
  };

  return {
    repositoryIdentity,
    saveObservation,
    refreshObservationSteps,
    scanChangesSteps,
    scanChanges,
    methods,
  };
}
