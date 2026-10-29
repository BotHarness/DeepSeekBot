import type { DatabaseSync } from 'node:sqlite';

import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type SessionRootRole = 'orchestrator' | 'assignment';

export type SessionOwnershipProvenance = 'created' | 'fork' | 'subagent' | 'repair' | 'legacy';

export interface SessionOwnershipRecord {
  sessionId: string;
  botSlug: string;
  rootRole: SessionRootRole;
  provenance: SessionOwnershipProvenance;

  parentSessionId: string | undefined;

  cwdReference: string | undefined;
  createdAt: string;
}

export interface SessionOwnershipClaim {
  sessionId: string;
  botSlug: string;
  rootRole: SessionRootRole;
  provenance?: SessionOwnershipProvenance;
  parentSessionId?: string;
  cwdReference?: string;
  at: string;
}

export interface SessionOwnershipRepair {
  sessionId: string;
  botSlug: string;
  rootRole: SessionRootRole;
  cwdReference?: string;
  at: string;
}

export interface SessionPersonaSnapshot {
  body: string;
  recordedAt: string;
}

export class SessionOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionOwnershipError';
  }
}

export class SessionOwnershipConflictError extends SessionOwnershipError {
  constructor(
    readonly sessionId: string,
    readonly existing: SessionOwnershipRecord,
    readonly claimed: { botSlug: string; rootRole: SessionRootRole },
  ) {
    super(
      `Session ${sessionId} is owned by ${existing.botSlug} as ${existing.rootRole}, not ${claimed.botSlug} as ${claimed.rootRole}`,
    );
    this.name = 'SessionOwnershipConflictError';
  }
}

export interface SessionOwnership {
  contentAvailable(sessionId: string): boolean;
  markContentUnavailable(): void;
  claim(input: SessionOwnershipClaim): SessionOwnershipRecord;

  claimWithin(connection: DatabaseSync, input: SessionOwnershipClaim): SessionOwnershipRecord;
  resolve(sessionId: string): SessionOwnershipRecord | undefined;

  rootsFor(botSlug: string, rootRole?: SessionRootRole): SessionOwnershipRecord[];

  descendantsOf(sessionId: string): SessionOwnershipRecord[];

  subagentCounts(sessionIds: readonly string[]): Map<string, number>;

  repair(input: SessionOwnershipRepair): SessionOwnershipRecord;
  repairRevision(sessionId: string): number;

  personaSnapshot(sessionId: string): SessionPersonaSnapshot | undefined;

  recordPersonaSnapshot(sessionId: string, body: string, at: string): SessionPersonaSnapshot;

  refreshPersonaSnapshot(sessionId: string, body: string, at: string): SessionPersonaSnapshot;

  promptSnapshot(sessionId: string): string | undefined;

  writePromptSnapshot(sessionId: string, body: string, replace: boolean): string;

  list(): SessionOwnershipRecord[];
}

interface OwnershipRow {
  session_id: string;
  bot_slug: string;
  root_role: string;
  provenance: string;
  parent_session_id: string | null;
  cwd_reference: string | null;
  created_at: string;
}

function toRecord(row: OwnershipRow): SessionOwnershipRecord {
  return {
    sessionId: row.session_id,
    botSlug: row.bot_slug,
    rootRole: row.root_role as SessionRootRole,
    provenance: row.provenance as SessionOwnershipProvenance,
    parentSessionId: row.parent_session_id ?? undefined,
    cwdReference: row.cwd_reference ?? undefined,
    createdAt: row.created_at,
  };
}

const COLUMNS =
  'session_id, bot_slug, root_role, provenance, parent_session_id, cwd_reference, created_at';

function readRow(connection: DatabaseSync, sessionId: string): OwnershipRow | undefined {
  return connection
    .prepare(`SELECT ${COLUMNS} FROM session_ownership WHERE session_id = ?`)
    .get(sessionId) as OwnershipRow | undefined;
}

interface PersonaSnapshotRow {
  persona_snapshot: string | null;
  persona_snapshot_at: string | null;
}

function readPersonaSnapshot(
  connection: DatabaseSync,
  sessionId: string,
): SessionPersonaSnapshot | undefined {
  const row = connection
    .prepare(
      'SELECT persona_snapshot, persona_snapshot_at FROM session_ownership WHERE session_id = ?',
    )
    .get(sessionId) as PersonaSnapshotRow | undefined;
  if (row?.persona_snapshot == null || row.persona_snapshot_at == null) return undefined;
  return { body: row.persona_snapshot, recordedAt: row.persona_snapshot_at };
}

function insertRow(
  connection: DatabaseSync,
  input: SessionOwnershipClaim,
  provenance: SessionOwnershipProvenance,
): void {
  connection
    .prepare(
      `INSERT INTO session_ownership
         (session_id, bot_slug, root_role, provenance, parent_session_id, cwd_reference, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.sessionId,
      input.botSlug,
      input.rootRole,
      provenance,
      input.parentSessionId ?? null,
      input.cwdReference ?? null,
      input.at,
    );
}

function claimRow(connection: DatabaseSync, input: SessionOwnershipClaim): SessionOwnershipRecord {
  const row = readRow(connection, input.sessionId);
  if (row !== undefined) {
    const existing = toRecord(row);
    if (existing.botSlug === input.botSlug && existing.rootRole === input.rootRole) {
      return existing;
    }
    throw new SessionOwnershipConflictError(input.sessionId, existing, {
      botSlug: input.botSlug,
      rootRole: input.rootRole,
    });
  }
  if (
    input.parentSessionId !== undefined &&
    readRow(connection, input.parentSessionId) === undefined
  ) {
    throw new SessionOwnershipError(`Unknown parent Session ownership: ${input.parentSessionId}`);
  }
  insertRow(connection, input, input.provenance ?? 'created');
  const claimed = readRow(connection, input.sessionId);
  if (claimed === undefined) throw new Error(`Session ownership write failed: ${input.sessionId}`);
  return toRecord(claimed);
}

export function createSessionOwnership(database: OperationalDatabaseModulePort): SessionOwnership {
  const repairRevisions = new Map<string, number>();
  const resolve = (sessionId: string): SessionOwnershipRecord | undefined => {
    const row = database.read((connection) => readRow(connection, sessionId)) as
      | OwnershipRow
      | undefined;
    return row === undefined ? undefined : toRecord(row);
  };

  const insert = (input: SessionOwnershipClaim, provenance: SessionOwnershipProvenance): void => {
    database.transaction(
      (connection) => insertRow(connection, input, provenance),
      ['session-ownership'],
    );
  };

  const rethrowDomainError = (error: unknown): never => {
    if (error instanceof SessionOwnershipError) throw error;
    const cause = (error as { cause?: unknown } | null)?.cause;
    if (cause instanceof SessionOwnershipError) throw cause;
    throw error;
  };

  return {
    contentAvailable(sessionId) {
      return database.read(
        (db) =>
          db
            .prepare('SELECT content_available FROM session_ownership WHERE session_id = ?')
            .get(sessionId)?.content_available === 1,
      );
    },
    markContentUnavailable() {
      database.transaction((db) => db.exec('UPDATE session_ownership SET content_available = 0'));
    },
    claim(input) {
      try {
        return database.transaction(
          (connection) => claimRow(connection, input),
          ['session-ownership'],
        );
      } catch (error) {
        return rethrowDomainError(error);
      }
    },
    claimWithin(connection, input) {
      return claimRow(connection, input);
    },
    resolve,
    rootsFor(botSlug, rootRole) {
      const rows = database.read((connection) =>
        connection
          .prepare(
            `SELECT ${COLUMNS} FROM session_ownership
              WHERE bot_slug = ? AND parent_session_id IS NULL
                ${rootRole === undefined ? '' : 'AND root_role = ?'}
              ORDER BY created_at DESC, session_id ASC`,
          )
          .all(...(rootRole === undefined ? [botSlug] : [botSlug, rootRole])),
      ) as unknown as OwnershipRow[];
      return rows.map(toRecord);
    },
    descendantsOf(sessionId) {
      const rows = database.read((connection) =>
        connection
          .prepare(
            `WITH RECURSIVE tree(session_id) AS (
               SELECT session_id FROM session_ownership WHERE parent_session_id = ?
               UNION
               SELECT owned.session_id FROM session_ownership owned
                 JOIN tree ON owned.parent_session_id = tree.session_id
             )
             SELECT ${COLUMNS} FROM session_ownership
              WHERE session_id IN (SELECT session_id FROM tree)
              ORDER BY created_at ASC, session_id ASC`,
          )
          .all(sessionId),
      ) as unknown as OwnershipRow[];
      return rows.map(toRecord);
    },
    subagentCounts(sessionIds) {
      const counts = new Map<string, number>();
      if (sessionIds.length === 0) return counts;
      const rows = database.read((connection) =>
        connection
          .prepare(
            `WITH RECURSIVE tree(root_id, session_id) AS (
               SELECT parent_session_id, session_id FROM session_ownership
                WHERE parent_session_id IN (SELECT value FROM json_each(?))
               UNION
               SELECT tree.root_id, owned.session_id FROM session_ownership owned
                 JOIN tree ON owned.parent_session_id = tree.session_id
             )
             SELECT tree.root_id AS root_id, COUNT(*) AS count FROM tree
               JOIN session_ownership owned ON owned.session_id = tree.session_id
              WHERE owned.provenance = 'subagent'
              GROUP BY tree.root_id`,
          )
          .all(JSON.stringify(sessionIds)),
      ) as unknown as Array<{ root_id: string; count: number }>;
      for (const row of rows) counts.set(row.root_id, Number(row.count));
      return counts;
    },
    repair(input) {
      const existing = resolve(input.sessionId);
      if (existing === undefined) {
        insert(
          {
            sessionId: input.sessionId,
            botSlug: input.botSlug,
            rootRole: input.rootRole,
            provenance: 'repair',
            ...(input.cwdReference === undefined ? {} : { cwdReference: input.cwdReference }),
            at: input.at,
          },
          'repair',
        );
      } else {
        database.transaction(
          (connection) => {
            connection
              .prepare(
                `UPDATE session_ownership
                    SET bot_slug = ?, root_role = ?, provenance = 'repair',
                        cwd_reference = COALESCE(?, cwd_reference),
                        persona_snapshot = CASE WHEN bot_slug = ? THEN persona_snapshot END,
                        persona_snapshot_at = CASE WHEN bot_slug = ? THEN persona_snapshot_at END,
                        prompt_snapshot = CASE WHEN bot_slug = ? THEN prompt_snapshot END
                  WHERE session_id = ?`,
              )
              .run(
                input.botSlug,
                input.rootRole,
                input.cwdReference ?? null,
                input.botSlug,
                input.botSlug,
                input.botSlug,
                input.sessionId,
              );
          },
          ['session-ownership'],
        );
      }
      const repaired = resolve(input.sessionId);
      if (repaired === undefined)
        throw new Error(`Session ownership repair failed: ${input.sessionId}`);
      repairRevisions.set(input.sessionId, (repairRevisions.get(input.sessionId) ?? 0) + 1);
      return repaired;
    },
    repairRevision(sessionId) {
      return repairRevisions.get(sessionId) ?? 0;
    },
    promptSnapshot(sessionId) {
      return database.read(
        (connection) =>
          (
            connection
              .prepare('SELECT prompt_snapshot FROM session_ownership WHERE session_id = ?')
              .get(sessionId) as { prompt_snapshot: string | null } | undefined
          )?.prompt_snapshot ?? undefined,
      );
    },
    writePromptSnapshot(sessionId, body, replace) {
      try {
        return database.transaction(
          (connection) => {
            if (readRow(connection, sessionId) === undefined) {
              throw new SessionOwnershipError(`Unknown Session ownership: ${sessionId}`);
            }
            connection
              .prepare(
                replace
                  ? 'UPDATE session_ownership SET prompt_snapshot = ? WHERE session_id = ?'
                  : 'UPDATE session_ownership SET prompt_snapshot = ? WHERE session_id = ? AND prompt_snapshot IS NULL',
              )
              .run(body, sessionId);
            const row = connection
              .prepare('SELECT prompt_snapshot FROM session_ownership WHERE session_id = ?')
              .get(sessionId) as { prompt_snapshot: string | null } | undefined;
            if (row?.prompt_snapshot == null) {
              throw new Error(`Prompt snapshot write failed: ${sessionId}`);
            }
            return row.prompt_snapshot;
          },
          ['session-ownership'],
        );
      } catch (error) {
        return rethrowDomainError(error);
      }
    },
    personaSnapshot(sessionId) {
      return database.read((connection) => readPersonaSnapshot(connection, sessionId));
    },
    recordPersonaSnapshot(sessionId, body, at) {
      try {
        return database.transaction(
          (connection) => {
            if (readRow(connection, sessionId) === undefined) {
              throw new SessionOwnershipError(`Unknown Session ownership: ${sessionId}`);
            }
            connection
              .prepare(
                `UPDATE session_ownership
                    SET persona_snapshot = ?, persona_snapshot_at = ?
                  WHERE session_id = ? AND persona_snapshot IS NULL`,
              )
              .run(body, at, sessionId);
            const recorded = readPersonaSnapshot(connection, sessionId);
            if (recorded === undefined) {
              throw new Error(`Persona snapshot write failed: ${sessionId}`);
            }
            return recorded;
          },
          ['session-ownership'],
        );
      } catch (error) {
        return rethrowDomainError(error);
      }
    },
    refreshPersonaSnapshot(sessionId, body, at) {
      try {
        return database.transaction(
          (connection) => {
            if (readRow(connection, sessionId) === undefined) {
              throw new SessionOwnershipError(`Unknown Session ownership: ${sessionId}`);
            }
            connection
              .prepare(
                `UPDATE session_ownership
                    SET persona_snapshot = ?, persona_snapshot_at = ?
                  WHERE session_id = ?`,
              )
              .run(body, at, sessionId);
            const recorded = readPersonaSnapshot(connection, sessionId);
            if (recorded === undefined) {
              throw new Error(`Persona snapshot refresh failed: ${sessionId}`);
            }
            return recorded;
          },
          ['session-ownership'],
        );
      } catch (error) {
        return rethrowDomainError(error);
      }
    },
    list() {
      const rows = database.read((connection) =>
        connection
          .prepare(
            `SELECT ${COLUMNS} FROM session_ownership ORDER BY created_at ASC, session_id ASC`,
          )
          .all(),
      ) as unknown as OwnershipRow[];
      return rows.map(toRecord);
    },
  };
}
