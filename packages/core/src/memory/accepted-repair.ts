import type { HumanContext } from '../humans/context.js';
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { createMemoryRecovery } from './recovery.js';
import { rowToRepair } from './accepted-repository.js';
import type { RepairRow } from './accepted-repository.js';
import { MemoryAcceptError } from './accepted-contract.js';
import type { MemoryChangeScan, MemoryAcceptance } from './accepted-contract.js';
import { repository, branchOf, verifiedRepository, head, dirty, run } from './accepted-git.js';

export function createAcceptedRepair({
  assertIdle,
  pendingRepair,
  registry,
  inFlight,
  recovery,
  database,
  acceptedHead,
  now,
}: {
  assertIdle: (botSlug: string) => void;
  pendingRepair: (botSlug: string) => RepairRow | undefined;
  registry: PersonaBotRegistry;
  inFlight: Map<
    string,
    { sessionId: string; branch: string; preservePending?: boolean; observation?: MemoryChangeScan }
  >;
  recovery: ReturnType<typeof createMemoryRecovery>;
  database: OperationalDatabaseModulePort;
  acceptedHead: (botSlug: string, branch: string) => string | null;
  now: () => Date;
}): Pick<MemoryAcceptance, 'recoveryHistory' | 'repairHuman'> {
  return {
    recoveryHistory(botSlug) {
      assertIdle(botSlug);
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
    repairHuman(human: HumanContext, input) {
      assertIdle(input.botSlug);
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
              human.humanId,
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
  };
}
