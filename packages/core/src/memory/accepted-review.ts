import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { toMemoryRelativePath, resolveMemoryPath } from './jail.js';
import { MemoryAcceptError } from './accepted-types.js';
import type { MemoryAcceptance } from './accepted-types.js';
import { repository, run, output, head, dirty, MAX_FILE_BYTES } from './accepted-git.js';
import type { RepairRow } from './accepted-repository.js';
import { rowToCommit, type AcceptedRow } from './accepted-ledger.js';
import { unifiedLineDiff } from './line-diff.js';

function textAt(root: string, revision: string, path: string): string | null {
  let kind: string;
  try {
    kind = output(root, ['cat-file', '-t', `${revision}:${path}`]);
  } catch {
    return null;
  }
  if (kind !== 'blob') throw new MemoryAcceptError('memory-invalid', 'Memory path is not a file');
  const bytes = run(root, ['cat-file', 'blob', `${revision}:${path}`], MAX_FILE_BYTES + 1);
  if (bytes.length > MAX_FILE_BYTES || bytes.includes(0))
    throw new MemoryAcceptError('memory-invalid', 'Memory file cannot be reviewed as text');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new MemoryAcceptError('memory-invalid', 'Memory file cannot be reviewed as text');
  }
}

export function createAcceptedReviews({
  assertIdle,
  inFlight,
  registry,
  pendingRepair,
  database,
}: {
  assertIdle: (botSlug: string) => void;
  inFlight: Map<string, unknown>;
  registry: PersonaBotRegistry;
  pendingRepair: (botSlug: string) => RepairRow | undefined;
  database: OperationalDatabaseModulePort;
}): Pick<MemoryAcceptance, 'reviewHumanSave' | 'reviewHumanRestore'> {
  const prior = (botSlug: string, causeId: string) =>
    database.read(
      (db) =>
        db
          .prepare(`SELECT * FROM memory_accepted_commits
          WHERE bot_slug = ? AND cause_kind = 'human-edit' AND cause_id = ?
          ORDER BY rowid DESC LIMIT 1`)
          .get(botSlug, causeId) as AcceptedRow | undefined,
    );
  const requireReady = (botSlug: string) => {
    if (inFlight.has(botSlug) || pendingRepair(botSlug) !== undefined)
      throw new MemoryAcceptError('memory-conflict', 'Memory is busy');
  };
  return {
    reviewHumanSave(input) {
      assertIdle(input.botSlug);
      const root = repository(registry, input.botSlug);
      const path = toMemoryRelativePath(input.path);
      resolveMemoryPath(root, path);
      const current = head(root);
      const before = textAt(root, current, path);
      const edit = prior(input.botSlug, input.editId);
      if (edit !== undefined) {
        if (textAt(root, edit.sha, path) !== input.body)
          throw new MemoryAcceptError('memory-conflict', 'Human edit identity was already used');
        return { head: current, path, before, diff: '', accepted: rowToCommit(edit) };
      }
      requireReady(input.botSlug);
      if (dirty(root))
        throw new MemoryAcceptError('memory-conflict', 'Memory has uncommitted changes');
      if (Buffer.byteLength(input.body, 'utf8') > MAX_FILE_BYTES || input.body.includes('\0'))
        throw new MemoryAcceptError('memory-invalid', 'Memory edit is too large or contains NUL');
      if (before === input.body)
        throw new MemoryAcceptError('memory-invalid', 'Memory edit does not change the file');
      return { head: current, path, before, diff: unifiedLineDiff(path, before, input.body) };
    },
    reviewHumanRestore(input) {
      assertIdle(input.botSlug);
      const root = repository(registry, input.botSlug);
      let target: string;
      try {
        target = output(root, ['rev-parse', '--verify', `${input.sha}^{commit}^{tree}`]);
      } catch {
        throw new MemoryAcceptError('memory-invalid', 'Memory commit is not in this repository');
      }
      const current = head(root);
      const restore = prior(input.botSlug, input.restoreId);
      if (restore !== undefined) {
        if (output(root, ['rev-parse', `${restore.sha}^{tree}`]) !== target)
          throw new MemoryAcceptError('memory-conflict', 'Restore identity was already used');
        return {
          head: current,
          dirty: false,
          paths: run(root, [
            'diff-tree',
            '--no-commit-id',
            '--no-renames',
            '--name-only',
            '-r',
            '-z',
            restore.sha,
          ])
            .toString('utf8')
            .split('\0')
            .filter(Boolean),
          diff: '',
          accepted: rowToCommit(restore),
        };
      }
      requireReady(input.botSlug);
      const pending = dirty(root);
      const paths = run(root, ['diff', '--no-renames', '--name-only', '-z', current, input.sha])
        .toString('utf8')
        .split('\0')
        .filter(Boolean);
      if (paths.length === 0 && !pending)
        throw new MemoryAcceptError('memory-invalid', 'Memory already matches that commit');
      const diff = run(root, [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-renames',
        '--no-textconv',
        current,
        input.sha,
      ]).toString('utf8');
      return { head: current, dirty: pending, paths, diff };
    },
  };
}
