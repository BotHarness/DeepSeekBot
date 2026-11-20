import { asyncGitSteps, type GitSteps } from './git-steps.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { createMemoryRecovery } from './recovery.js';
import { MemoryAcceptError } from './accepted-contract.js';
import type { MemoryChangeScan, MemoryAcceptance } from './accepted-contract.js';
import { repository, branchOf, run } from './accepted-git.js';
import { createMemoryObservation } from './accepted-observation.js';
import { createAcceptedRepository } from './accepted-repository.js';
import { createAcceptedLedger } from './accepted-ledger.js';
import { createAcceptedTurn } from './accepted-turn.js';
import { createMemoryReads } from './accepted-reads.js';
import { createAcceptedHumanEdits } from './accepted-human.js';
import { createAcceptedRepair } from './accepted-repair.js';
import { createAcceptedVersions } from './accepted-versions.js';
export { MemoryAcceptError } from './accepted-contract.js';
export type {
  MemoryAcceptErrorCode,
  MemoryAcceptedCommit,
  MemoryRepairEvent,
  MemoryAcceptedSnapshot,
  MemoryChangeDelta,
  MemoryChangeScan,
  MemoryGitCommit,
  MemoryVersionName,
  MemoryVersion,
  MemoryGitGraph,
  MemoryGitCommitDiff,
  MemoryWorkingKind,
  MemoryWorkingChange,
  MemoryWorkingDiff,
  MemoryAcceptance,
  MemoryCommitFile,
  MemoryCommitSummary,
  MemoryPendingCommits,
} from './accepted-contract.js';

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
  const operations = new Set<string>();
  const assertIdle = (botSlug: string): void => {
    if (operations.has(botSlug))
      throw new MemoryAcceptError('memory-conflict', 'Memory observation is in progress');
  };
  const runAsync = async <T>(botSlug: string, steps: GitSteps<T>): Promise<T> => {
    assertIdle(botSlug);
    operations.add(botSlug);
    try {
      return await asyncGitSteps(steps);
    } finally {
      operations.delete(botSlug);
    }
  };
  const recovery = createMemoryRecovery({
    database,
    now,
    ...(options.warn ? { warn: options.warn } : {}),
  });
  const inFlight = new Map<
    string,
    { sessionId: string; branch: string; preservePending?: boolean; observation?: MemoryChangeScan }
  >();
  const {
    repositoryIdentity,
    saveObservation,
    refreshObservationSteps,
    scanChangesSteps,
    scanChanges,
    methods: observation,
  } = createMemoryObservation({
    database,
    now,
    registry,
    recovery,
    options,
    get bootstrapSteps() {
      return bootstrapSteps;
    },
    get pendingRepair() {
      return pendingRepair;
    },
    assertIdle,
    runAsync,
  });
  const { pendingRepair, readRepository, graphRepository } = createAcceptedRepository({
    database,
    registry,
  });
  const {
    acceptedHead,
    accept,
    bootstrapSteps,
    methods: ledger,
  } = createAcceptedLedger({ database, now, assertIdle, readRepository, registry });
  const {
    requireOwned,
    pendingCommits,
    prepareTurn,
    reconcileTurn,
    methods: turn,
  } = createAcceptedTurn({
    ownership,
    database,
    now,
    registry,
    assertIdle,
    pendingRepair,
    inFlight,
    bootstrapSteps,
    scanChangesSteps,
    repositoryIdentity,
    warn,
    acceptedHead,
    accept,
    refreshObservationSteps,
    runAsync,
  });
  const reads = createMemoryReads({
    assertIdle,
    graphRepository,
    readRepository,
    pendingRepair,
    database,
  });
  const humanEdits = createAcceptedHumanEdits({
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
  });
  const repair = createAcceptedRepair({
    assertIdle,
    pendingRepair,
    registry,
    inFlight,
    recovery,
    database,
    acceptedHead,
    now,
  });
  const versions = createAcceptedVersions({ assertIdle, graphRepository, registry });

  return {
    prepareTurnAsync: turn.prepareTurnAsync,
    reconcileTurnAsync: turn.reconcileTurnAsync,
    abortTurnAsync: turn.abortTurnAsync,
    pendingCommitsAsync: turn.pendingCommitsAsync,
    scanChangesAsync: observation.scanChangesAsync,
    continueFromCommit(input) {
      assertIdle(input.botSlug);
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
    switchBranch: humanEdits.switchBranch,
    prepareTurn,
    scanChanges,
    pendingCommits,
    advanceCommitCursor: turn.advanceCommitCursor,
    preparedObservation: turn.preparedObservation,
    reconcileTurn,
    abortTurn: turn.abortTurn,
    snapshot: ledger.snapshot,
    markdownImageFile: reads.markdownImageFile,
    imageFile: reads.imageFile,
    readAccepted: reads.readAccepted,

    gitGraph: reads.gitGraph,
    gitCommitDiff: reads.gitCommitDiff,
    workingChanges: reads.workingChanges,
    workingDiff: reads.workingDiff,
    recoveryHistory: repair.recoveryHistory,
    restoreHuman: humanEdits.restoreHuman,
    sourceReferences: ledger.sourceReferences,
    history: ledger.history,
    diff: ledger.diff,
    repairHuman: repair.repairHuman,
    saveHuman: humanEdits.saveHuman,
    restoreCommitHuman: humanEdits.restoreCommitHuman,
    versions: versions.versions,
    nameVersionHuman: versions.nameVersionHuman,
    removeVersionNameHuman: versions.removeVersionNameHuman,
  };
}
