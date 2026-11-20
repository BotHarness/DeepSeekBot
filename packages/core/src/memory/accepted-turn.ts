import { syncGitSteps, type GitSteps } from './git-steps.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { MemoryAcceptError } from './accepted-types.js';
import type {
  MemoryPendingCommits,
  MemoryCommitSummary,
  MemoryChangeDelta,
  MemoryChangeScan,
  MemoryAcceptedCommit,
  MemoryAcceptance,
} from './accepted-types.js';
import {
  repositorySteps,
  branchOfSteps,
  headSteps,
  outputSteps,
  MAX_RECORDED_COMMITS,
  commitSummarySteps,
  validateCommitSteps,
} from './accepted-git.js';
import type { RepairRow } from './accepted-repository.js';
import { unstableObservation } from './accepted-observation.js';
import type { TurnWorktreeObservation } from './accepted-observation.js';

export function createAcceptedTurn({
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
}: {
  ownership: SessionOwnership;
  database: OperationalDatabaseModulePort;
  now: () => Date;
  registry: PersonaBotRegistry;
  assertIdle: (botSlug: string) => void;
  pendingRepair: (botSlug: string) => RepairRow | undefined;
  inFlight: Map<
    string,
    { sessionId: string; branch: string; preservePending?: boolean; observation?: MemoryChangeScan }
  >;
  bootstrapSteps: (botSlug: string, root: string) => GitSteps<string>;
  scanChangesSteps: (botSlug: string) => GitSteps<MemoryChangeScan>;
  repositoryIdentity: (root: string) => string;
  warn: ((message: string) => void) | undefined;
  acceptedHead: (botSlug: string, branch: string) => string | null;
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
  refreshObservationSteps: (
    botSlug: string,
    sessionId: string,
    causeKind?: 'source-event' | 'turn-abort',
    causeId?: string,
    beforeObservationJson?: string,
  ) => GitSteps<boolean>;
  runAsync: <T>(botSlug: string, steps: GitSteps<T>) => Promise<T>;
}) {
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

  function* pendingCommitsSteps(botSlug: string): GitSteps<MemoryPendingCommits> {
    const root = yield* repositorySteps(registry, botSlug);
    const branch = yield* branchOfSteps(root);
    const current = yield* headSteps(root);
    const cursor = commitCursor(botSlug);
    if (cursor === undefined || cursor.branch !== branch || cursor.head === current)
      return { branch, head: current, commits: [] };
    let shas: string[];
    try {
      shas = (yield* outputSteps(root, ['rev-list', '--reverse', current, `^${cursor.head}`]))
        .split('\n')
        .filter((sha) => /^[0-9a-f]{40}$/u.test(sha));
    } catch {
      return { branch, head: current, commits: [] };
    }
    const commits: MemoryCommitSummary[] = [];
    for (const sha of shas.slice(-MAX_RECORDED_COMMITS))
      commits.push(yield* commitSummarySteps(root, sha));
    return { branch, head: current, commits };
  }

  const pendingCommits = (botSlug: string): MemoryPendingCommits => {
    assertIdle(botSlug);
    return syncGitSteps(pendingCommitsSteps(botSlug));
  };

  function* prepareTurnSteps(
    botSlug: string,
    sessionId: string,
    options?: { coordinateBranchSwitch?: boolean },
  ): GitSteps<MemoryChangeDelta | undefined> {
    requireOwned(botSlug, sessionId);
    if (pendingRepair(botSlug) !== undefined) {
      throw new MemoryAcceptError('memory-conflict', 'Memory repair must finish before turn');
    }
    if (inFlight.has(botSlug)) {
      throw new MemoryAcceptError('memory-conflict', 'Another Memory turn is active');
    }
    const root = yield* repositorySteps(registry, botSlug);
    yield* bootstrapSteps(botSlug, root);
    void options;
    const observation = yield* scanChangesSteps(botSlug);
    const observed: TurnWorktreeObservation = JSON.parse(observation.observationJson);
    const branch = yield* branchOfSteps(root);
    const current = yield* headSteps(root);
    requireOwned(botSlug, sessionId);
    if (
      registry.memoryDirFor(botSlug) !== root ||
      repositoryIdentity(root) !== observation.repositoryIdentity ||
      branch !== observed.branch ||
      current !== observed.head
    )
      throw unstableObservation('repository');
    try {
      advanceCommitCursor(botSlug, branch, current);
    } catch (error) {
      warn?.(
        `memory-commit-cursor-failed phase=prepare bot=${botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
    inFlight.set(botSlug, {
      sessionId,
      branch,
      observation,
    });
    return observation.change;
  }

  const prepareTurn = (
    botSlug: string,
    sessionId: string,
    options?: { coordinateBranchSwitch?: boolean },
  ): MemoryChangeDelta | undefined => {
    assertIdle(botSlug);
    return syncGitSteps(prepareTurnSteps(botSlug, sessionId, options));
  };

  function* reconcileTurnSteps(input: {
    botSlug: string;
    sessionId: string;
    sourceEventId: string;
    preserveObservation?: boolean;
  }): GitSteps<MemoryAcceptedCommit[]> {
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
    const root = yield* repositorySteps(registry, input.botSlug);
    const identity = repositoryIdentity(root);
    const branch = yield* branchOfSteps(root);
    const current = yield* headSteps(root);
    const checkpoint = acceptedHead(input.botSlug, branch);
    let result: MemoryAcceptedCommit[] = [];
    if (current !== checkpoint) {
      const parentSha =
        (yield* outputSteps(root, ['rev-list', '--parents', '-n', '1', current])).split(' ')[1] ??
        null;
      const validationResult = yield* validateCommitSteps(root, current);
      const afterBranch = yield* branchOfSteps(root);
      const afterHead = yield* headSteps(root);
      requireOwned(input.botSlug, input.sessionId);
      if (
        inFlight.get(input.botSlug) !== flight ||
        registry.memoryDirFor(input.botSlug) !== root ||
        repositoryIdentity(root) !== identity ||
        afterBranch !== branch ||
        afterHead !== current
      )
        throw unstableObservation('repository');
      result = accept(
        input.botSlug,
        branch,
        [
          {
            sha: current,
            parentSha,
            actorKind: 'system',
            actorId: 'botharness-host',
            causeKind: 'source-event',
            causeId: input.sourceEventId,
            validationResult,
          },
        ],
        checkpoint,
      );
    }
    if (!input.preserveObservation)
      yield* refreshObservationSteps(
        input.botSlug,
        input.sessionId,
        'source-event',
        input.sourceEventId,
        flight.observation?.observationJson,
      );
    inFlight.delete(input.botSlug);
    return result;
  }

  const reconcileTurn = (input: {
    botSlug: string;
    sessionId: string;
    sourceEventId: string;
    preserveObservation?: boolean;
  }): MemoryAcceptedCommit[] => {
    assertIdle(input.botSlug);
    return syncGitSteps(reconcileTurnSteps(input));
  };

  function* abortTurnSteps(
    botSlug: string,
    sessionId: string,
    preserveObservation = false,
  ): GitSteps<void> {
    const flight = inFlight.get(botSlug);
    if (flight?.sessionId !== sessionId) return;
    try {
      if (!preserveObservation)
        yield* refreshObservationSteps(
          botSlug,
          sessionId,
          'turn-abort',
          sessionId,
          flight.observation?.observationJson,
        );
    } finally {
      if (inFlight.get(botSlug) === flight) inFlight.delete(botSlug);
    }
  }

  const methods: Pick<
    MemoryAcceptance,
    | 'prepareTurnAsync'
    | 'reconcileTurnAsync'
    | 'abortTurnAsync'
    | 'pendingCommitsAsync'
    | 'advanceCommitCursor'
    | 'preparedObservation'
    | 'abortTurn'
  > = {
    prepareTurnAsync: (botSlug, sessionId, options) =>
      runAsync(botSlug, prepareTurnSteps(botSlug, sessionId, options)),
    reconcileTurnAsync: (input) => runAsync(input.botSlug, reconcileTurnSteps(input)),
    abortTurnAsync: (botSlug, sessionId, preserveObservation) =>
      runAsync(botSlug, abortTurnSteps(botSlug, sessionId, preserveObservation)),
    pendingCommitsAsync: (botSlug) => runAsync(botSlug, pendingCommitsSteps(botSlug)),
    advanceCommitCursor: (botSlug, branch, head) => {
      assertIdle(botSlug);
      advanceCommitCursor(botSlug, branch, head);
    },
    preparedObservation(botSlug, sessionId) {
      assertIdle(botSlug);
      const flight = inFlight.get(botSlug);
      if (flight?.sessionId !== sessionId || flight.observation === undefined) {
        throw new MemoryAcceptError('memory-conflict', 'Memory turn was not prepared');
      }
      return flight.observation;
    },
    abortTurn(botSlug, sessionId, preserveObservation = false) {
      assertIdle(botSlug);
      syncGitSteps(abortTurnSteps(botSlug, sessionId, preserveObservation));
    },
  };

  return { requireOwned, pendingCommits, prepareTurn, reconcileTurn, methods };
}
