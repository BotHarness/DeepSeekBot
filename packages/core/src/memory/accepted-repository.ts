import { existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MemoryAcceptError } from './accepted-contract.js';
import type { MemoryRepairEvent } from './accepted-contract.js';
import { repository, verifiedRepository } from './accepted-git.js';

export interface RepairRow {
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

export function rowToRepair(row: RepairRow): MemoryRepairEvent {
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

export function createAcceptedRepository({
  database,
  registry,
}: {
  database: OperationalDatabaseModulePort;
  registry: PersonaBotRegistry;
}) {
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

  return { pendingRepair, readRepository, graphRepository };
}
