import type { HumanContext } from '../humans/context.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { atomicWriteFile } from '../fs/atomic-write.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { toMemoryRelativePath, resolveMemoryPath } from './jail.js';
import { createMemoryRecovery } from './recovery.js';
import { MemoryAcceptError } from './accepted-contract.js';
import type {
  MemoryChangeScan,
  MemoryAcceptedCommit,
  MemoryVersionName,
  MemoryAcceptance,
} from './accepted-contract.js';
import {
  repository,
  branchOf,
  run,
  output,
  head,
  MAX_FILE_BYTES,
  dirty,
  parentOf,
  validateCommit,
} from './accepted-git.js';
import type { RepairRow } from './accepted-repository.js';
import { observeWorktree } from './accepted-observation.js';
import type { TurnWorktreeObservation } from './accepted-observation.js';
import { rowToCommit } from './accepted-ledger.js';
import type { AcceptedRow } from './accepted-ledger.js';
import { validVersionName, nameVersion } from './accepted-versions.js';

export function createAcceptedHumanEdits({
  assertIdle,
  requireOwned,
  inFlight,
  registry,
  pendingRepair,
  recovery,
  saveObservation,
  options,
  database,
  accept,
  acceptedHead,
}: {
  assertIdle: (botSlug: string) => void;
  requireOwned: (botSlug: string, sessionId: string) => void;
  inFlight: Map<
    string,
    { sessionId: string; branch: string; preservePending?: boolean; observation?: MemoryChangeScan }
  >;
  registry: PersonaBotRegistry;
  pendingRepair: (botSlug: string) => RepairRow | undefined;
  recovery: ReturnType<typeof createMemoryRecovery>;
  saveObservation: (botSlug: string, root: string, current: TurnWorktreeObservation) => void;
  options: {
    registry: PersonaBotRegistry;
    ownership: SessionOwnership;
    database: OperationalDatabaseModulePort;
    now?: () => Date;
    warn?: (message: string) => void;
  };
  database: OperationalDatabaseModulePort;
  accept: (
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
  ) => MemoryAcceptedCommit[];
  acceptedHead: (botSlug: string, branch: string) => string | null;
}): Pick<MemoryAcceptance, 'switchBranch' | 'restoreHuman' | 'saveHuman' | 'restoreCommitHuman'> {
  return {
    switchBranch(input) {
      assertIdle(input.botSlug);
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
    restoreHuman(human: HumanContext, input) {
      assertIdle(input.botSlug);
      if (inFlight.has(input.botSlug) || pendingRepair(input.botSlug) !== undefined)
        throw new MemoryAcceptError('memory-conflict', 'Memory is busy');
      const root = repository(registry, input.botSlug);
      try {
        const result = recovery.restore(
          human,
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
    saveHuman(human: HumanContext, input) {
      assertIdle(input.botSlug);
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
            actorId: human.humanId,
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
          originId: human.humanId,
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
    restoreCommitHuman(human: HumanContext, input) {
      assertIdle(input.botSlug);
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
          originId: human.humanId,
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
              actorId: human.humanId,
              causeKind: 'human-edit' as const,
              causeId: input.restoreId,
              validationResult: validateCommit(root, commit.sha),
            })),
            acceptedHead(input.botSlug, branch),
          );
        }
        recovery.capture(input.botSlug, root, {
          origin: 'human-command',
          originId: human.humanId,
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
  };
}
