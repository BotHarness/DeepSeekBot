import { syncGitSteps, type GitSteps } from './git-steps.js';
import { existsSync } from 'node:fs';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { DEFAULT_STANDING_LIMITS, standingUsage } from './soul.js';
import { MemoryAcceptError } from './accepted-types.js';
import type { MemoryAcceptedCommit, MemoryAcceptance } from './accepted-types.js';
import {
  branchOfSteps,
  headSteps,
  outputSteps,
  validateCommitSteps,
  head,
  listCurrentFiles,
  run,
  MAX_DIFF_BYTES,
} from './accepted-git.js';

export interface AcceptedRow {
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

export function rowToCommit(row: AcceptedRow): MemoryAcceptedCommit {
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

export function createAcceptedLedger({
  database,
  now,
  assertIdle,
  readRepository,
  registry,
}: {
  database: OperationalDatabaseModulePort;
  now: () => Date;
  assertIdle: (botSlug: string) => void;
  readRepository: (botSlug: string) => { root: string; repairing: boolean };
  registry: PersonaBotRegistry;
}) {
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

  function* bootstrapSteps(botSlug: string, root: string): GitSteps<string> {
    const branch = yield* branchOfSteps(root);
    const sha = yield* headSteps(root);
    if (acceptedHead(botSlug, branch) !== null) return sha;
    if (
      branch !== 'main' ||
      (yield* outputSteps(root, ['rev-list', '--parents', '-n', '1', sha])).split(' ').length !==
        1 ||
      (yield* outputSteps(root, ['show', '-s', '--format=%s', sha])) !==
        'Initialize memory repository'
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
          validationResult: yield* validateCommitSteps(root, sha),
        },
      ],
      null,
    );
    return sha;
  }

  const bootstrap = (botSlug: string, root: string): string => {
    assertIdle(botSlug);
    return syncGitSteps(bootstrapSteps(botSlug, root));
  };

  const methods: Pick<MemoryAcceptance, 'snapshot' | 'sourceReferences' | 'history' | 'diff'> = {
    snapshot(botSlug) {
      assertIdle(botSlug);
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
      assertIdle(botSlug);
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
      assertIdle(botSlug);
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
  };

  return { acceptedHead, accept, bootstrapSteps, methods };
}
