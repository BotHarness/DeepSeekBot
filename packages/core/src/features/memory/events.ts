import type { DatabaseSync } from 'node:sqlite';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { MemoryChangeDelta, MemoryChangeScan } from '../../memory/accepted.js';
import type { MemoryService } from '../../memory/service.js';
import {
  recordSchedulingDiagnostic,
  schedulingIdentity,
  withinSchedulingScan,
} from '../../process/scheduling-diagnostics.js';
import type { InboxUnit } from '../../runtime/inbox-render.js';

interface MemoryInboxRow {
  source_event_id: string;
  source_kind: 'memory-change';
  assignment_session_id: string | null;
  body: string;
  created_at: string;
  expects_reply: number;
  continuity_key: null;
  activity: null;
}

export function createMemoryEvents({
  database,
  registry,
  memory,
  now,
  createEventId,
  insertMemoryChange,
  warn,
}: {
  database: OperationalDatabaseModulePort;
  registry: Pick<PersonaBotRegistry, 'list'>;
  memory: Partial<Pick<MemoryService, 'scanChanges' | 'scanChangesAsync'>> | undefined;
  now: () => Date;
  createEventId: () => string;
  insertMemoryChange: (
    database: DatabaseSync,
    sourceEventId: string,
    botSlug: string,
    change: MemoryChangeDelta,
  ) => void;
  warn: ((message: string) => void) | undefined;
}) {
  const steerMemoryScans = new Map<string, { again: boolean; done: Promise<void> }>();

  function admitMemoryChange(botSlug: string, change: MemoryChangeDelta): string {
    const sourceEventId = createEventId();
    database.transaction(
      (db) => insertMemoryChange(db, sourceEventId, botSlug, change),
      ['source-event', 'bot-inbox'],
    );
    return sourceEventId;
  }

  function recordMemoryObservation(botSlug: string, scan: MemoryChangeScan): void {
    const sourceEventId = scan.change === undefined ? undefined : createEventId();
    database.transaction(
      (database) => {
        if (scan.change !== undefined && sourceEventId !== undefined)
          insertMemoryChange(database, sourceEventId, botSlug, scan.change);
        database
          .prepare(
            `
            INSERT INTO memory_change_checkpoints
              (bot_slug, repository_root, repository_identity, observation_json, observed_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(bot_slug) DO UPDATE SET
              repository_root = excluded.repository_root,
              repository_identity = excluded.repository_identity,
              observation_json = excluded.observation_json,
              observed_at = excluded.observed_at
          `,
          )
          .run(
            botSlug,
            scan.repositoryRoot,
            scan.repositoryIdentity,
            scan.observationJson,
            now().toISOString(),
          );
      },
      ['source-event', 'bot-inbox', 'memory'],
    );
  }

  return {
    admitMemoryChange,
    recordMemoryObservation,
    reconcileMemoryChangesOnStartup(closed: boolean): void {
      if (closed || memory?.scanChanges === undefined) return;
      for (const bot of registry.list()) {
        try {
          recordMemoryObservation(bot.slug, memory.scanChanges(bot.slug));
        } catch (error) {
          warn?.(`Memory observation failed for ${bot.slug}: ${String(error)}`);
        }
      }
    },
    collectMemoryInbox(
      botSlug: string,
      coalesceInbox: (rows: MemoryInboxRow[]) => InboxUnit[],
    ): {
      units: InboxUnit[];
      eventIds: string[];
    } {
      const rows = database.read(
        (database) =>
          database
            .prepare(
              `
            SELECT e.source_event_id, e.source_kind, e.assignment_session_id,
                   e.body, e.created_at, e.expects_reply,
                   NULL AS continuity_key, NULL AS activity
              FROM source_events e
              JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
             WHERE e.bot_slug = ? AND a.bot_slug = ?
               AND e.source_kind = 'memory-change'
               AND a.reason = 'memory-change'
               AND a.attempt_state IN ('pending', 'retryable')
               AND e.observed_at IS NULL
             ORDER BY e.rowid ASC
             LIMIT 20
          `,
            )
            .all(botSlug, botSlug) as unknown as MemoryInboxRow[],
      );
      return {
        units: coalesceInbox(rows),
        eventIds: rows.map((row) => row.source_event_id),
      };
    },
    scanMemoryWhileSteering(
      botSlug: string,
      activeEvents: { eventIds: string[]; preserveObservation: boolean },
      current: () => boolean,
      steerMemoryInbox: () => void,
    ): void {
      const running = steerMemoryScans.get(botSlug);
      if (running !== undefined) {
        if (!running.again)
          recordSchedulingDiagnostic({
            kind: 'scan-coalesced',
            turn: schedulingIdentity(activeEvents),
            operation: schedulingIdentity(running),
          });
        running.again = true;
        return;
      }
      const scan =
        memory?.scanChangesAsync ??
        (memory?.scanChanges === undefined
          ? undefined
          : async (slug: string) => memory.scanChanges!(slug));
      if (scan === undefined) return;
      const entry = { again: false, done: Promise.resolve() };
      entry.done = (async () => {
        do {
          entry.again = false;
          const operation = schedulingIdentity(entry);
          const turn = schedulingIdentity(activeEvents);
          recordSchedulingDiagnostic({ kind: 'scan-start', turn, operation });
          let outcome: 'ok' | 'stale' | 'error' = 'error';
          try {
            const observation = await withinSchedulingScan(operation, () => scan(botSlug));
            if (!current()) {
              outcome = 'stale';
              return;
            }
            recordMemoryObservation(botSlug, observation);
            steerMemoryInbox();
            outcome = 'ok';
          } catch (error) {
            activeEvents.preserveObservation = true;
            warn?.(`Memory observation failed for ${botSlug}: ${String(error)}`);
            return;
          } finally {
            recordSchedulingDiagnostic({ kind: 'scan-end', turn, operation, outcome });
          }
        } while (entry.again && current());
      })().finally(() => {
        if (steerMemoryScans.get(botSlug) === entry) steerMemoryScans.delete(botSlug);
      });
      steerMemoryScans.set(botSlug, entry);
    },
    async settleSteerMemoryScan(botSlug: string): Promise<void> {
      await steerMemoryScans.get(botSlug)?.done;
    },
  };
}
