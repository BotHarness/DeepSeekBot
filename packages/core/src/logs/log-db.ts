import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const LOG_DB_FILENAME = 'logs.db';

export const LOG_DB_VERSION = 2;

export const LOG_DEFAULT_MAX_ROWS = 50_000;
export const LOG_DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const LOG_DETAIL_MAX_CHARS = 4000;
const TRUNCATION_MARKER = '…[truncated]';

export function truncateDetail(detail: string): string {
  if (detail.length <= LOG_DETAIL_MAX_CHARS) return detail;
  return `${detail.slice(0, LOG_DETAIL_MAX_CHARS)}${TRUNCATION_MARKER}`;
}

export type LogOwnerScope = 'profile-shared' | `bot:${string}`;

export interface LogEntryInput {
  readonly plugin: string;
  readonly owner: LogOwnerScope;
  readonly kind: string;
  readonly detail: string;

  readonly ts?: number;

  readonly principal?: string;

  readonly bot?: string;

  readonly orchestratorSession?: string;

  readonly assignmentSession?: string;

  readonly traceId?: string;

  readonly payload?: string;
}

export interface LogMigration {
  readonly from: number;

  readonly migrate: (database: DatabaseSync) => void;
}

export interface OpenLogDatabaseOptions {
  readonly dir: string;
  readonly now?: () => number;

  readonly maxRows?: number;

  readonly maxAgeMs?: number;

  readonly migrations?: readonly LogMigration[];
}

export interface LogDatabase {
  write(entry: LogEntryInput): void;

  writeMany(entries: readonly LogEntryInput[]): void;

  query(filter?: LogQuery): LogEntry[];

  range(since: number, max: number): LogEntry[];
  close(): void;
}

export interface LogEntry extends LogEntryInput {
  readonly id: number;
  readonly ts: number;
}

export const LOG_QUERY_DEFAULT_LIMIT = 100;

export const LOG_QUERY_MAX_LIMIT = 1000;

export const LOG_EXPORT_MAX_ROWS = LOG_DEFAULT_MAX_ROWS;

export interface LogQuery {
  readonly plugin?: string;
  readonly owner?: LogOwnerScope;

  readonly entity?: string;

  readonly since?: number;
  readonly limit?: number;

  readonly kinds?: readonly string[];
}

const BUILTIN_MIGRATIONS: readonly LogMigration[] = [
  {
    from: 1,
    migrate: (database) => {
      database.exec(`
        ALTER TABLE log_entries ADD COLUMN payload TEXT CHECK (payload IS NULL OR json_valid(payload));
      `);
    },
  },
];

function dbPath(dir: string): string {
  return join(dir, LOG_DB_FILENAME);
}

function createSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE log_schema (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      version INTEGER NOT NULL
    ) STRICT;
    INSERT INTO log_schema (singleton, version) VALUES (1, ${LOG_DB_VERSION});
    CREATE TABLE log_entries (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      plugin TEXT NOT NULL,
      owner TEXT NOT NULL,
      kind TEXT NOT NULL,
      detail TEXT NOT NULL,
      principal TEXT,
      bot TEXT,
      orchestrator_session TEXT,
      assignment_session TEXT,
      trace_id TEXT,
      payload TEXT CHECK (payload IS NULL OR json_valid(payload))
    ) STRICT;
    CREATE INDEX log_entries_ts ON log_entries (ts);
    CREATE INDEX log_entries_plugin_owner ON log_entries (plugin, owner);
    CREATE INDEX log_entries_trace ON log_entries (trace_id);
    CREATE INDEX log_entries_owner ON log_entries (owner);
  `);
}

function ensureIndexes(database: DatabaseSync): void {
  database.exec(`
    CREATE INDEX IF NOT EXISTS log_entries_ts ON log_entries (ts);
    CREATE INDEX IF NOT EXISTS log_entries_plugin_owner ON log_entries (plugin, owner);
    CREATE INDEX IF NOT EXISTS log_entries_trace ON log_entries (trace_id);
    CREATE INDEX IF NOT EXISTS log_entries_owner ON log_entries (owner);
  `);
}

function readVersion(database: DatabaseSync): number | undefined {
  try {
    const row = database.prepare('SELECT version FROM log_schema WHERE singleton = 1').get() as
      | { version?: unknown }
      | undefined;
    return typeof row?.version === 'number' ? row.version : undefined;
  } catch {
    return undefined;
  }
}

export function openLogDatabase(options: OpenLogDatabaseOptions): LogDatabase {
  const now = options.now ?? Date.now;
  const maxRows = options.maxRows ?? LOG_DEFAULT_MAX_ROWS;
  const maxAgeMs = options.maxAgeMs ?? LOG_DEFAULT_MAX_AGE_MS;

  const chain = [...BUILTIN_MIGRATIONS, ...(options.migrations ?? [])].sort(
    (a, b) => a.from - b.from,
  );
  const path = dbPath(options.dir);

  const rebuildEmpty = (): DatabaseSync => {
    rmSync(path, { force: true });
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
    mkdirSync(options.dir, { recursive: true });
    const database = new DatabaseSync(path);
    database.exec('PRAGMA journal_mode = WAL;');
    createSchema(database);
    return database;
  };

  const migrateForward = (database: DatabaseSync, from: number): boolean => {
    if (from > LOG_DB_VERSION) return false;
    let version = from;
    while (version < LOG_DB_VERSION) {
      const step = chain.find((m) => m.from === version);
      if (step === undefined) return false;
      step.migrate(database);
      version += 1;
      database.prepare('UPDATE log_schema SET version = ? WHERE singleton = 1').run(version);
    }
    return true;
  };

  const openOrRebuild = (): DatabaseSync => {
    try {
      if (!existsSync(path)) return rebuildEmpty();
      const database = new DatabaseSync(path);
      try {
        database.exec('PRAGMA journal_mode = WAL;');
        const version = readVersion(database);
        if (version === LOG_DB_VERSION) {
          ensureIndexes(database);
          return database;
        }
        if (version !== undefined && migrateForward(database, version)) {
          ensureIndexes(database);
          return database;
        }
      } catch {}
      database.close();
    } catch {}
    return rebuildEmpty();
  };

  let database = openOrRebuild();

  const swap = (next: DatabaseSync): void => {
    try {
      database.close();
    } catch {}
    database = next;
  };

  const insertRow = (entry: LogEntryInput): number => {
    const at = entry.ts ?? now();
    database
      .prepare(
        'INSERT INTO log_entries (ts, plugin, owner, kind, detail, principal, bot, orchestrator_session, assignment_session, trace_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        at,
        entry.plugin,
        entry.owner,
        entry.kind,
        truncateDetail(entry.detail),
        entry.principal ?? null,
        entry.bot ?? null,
        entry.orchestratorSession ?? null,
        entry.assignmentSession ?? null,
        entry.traceId ?? null,
        entry.payload ?? null,
      );
    return at;
  };

  const prune = (at: number): void => {
    database.prepare('DELETE FROM log_entries WHERE ts < ?').run(at - maxAgeMs);
    database
      .prepare(
        'DELETE FROM log_entries WHERE id NOT IN (SELECT id FROM log_entries ORDER BY id DESC LIMIT ?)',
      )
      .run(maxRows);
  };

  const writeRow = (entry: LogEntryInput): void => prune(insertRow(entry));

  const writeRows = (entries: readonly LogEntryInput[]): void => {
    database.exec('BEGIN');
    try {
      for (const entry of entries) insertRow(entry);
      prune(now());
      database.exec('COMMIT');
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {}
      throw error;
    }
  };

  return {
    write(entry: LogEntryInput): void {
      try {
        if (!existsSync(path)) swap(openOrRebuild());
        writeRow(entry);
      } catch {
        swap(openOrRebuild());
        writeRow(entry);
      }
    },
    writeMany(entries: readonly LogEntryInput[]): void {
      if (entries.length === 0) return;
      try {
        if (!existsSync(path)) swap(openOrRebuild());
        writeRows(entries);
      } catch {
        swap(openOrRebuild());
        writeRows(entries);
      }
    },
    query(filter?: LogQuery): LogEntry[] {
      return select(filter, LOG_QUERY_MAX_LIMIT);
    },
    range(since: number, max: number): LogEntry[] {
      const limit = Math.min(Math.max(1, Math.trunc(max)), LOG_EXPORT_MAX_ROWS + 1);
      return select({ since, limit }, LOG_EXPORT_MAX_ROWS + 1).reverse();
    },
    close(): void {
      database.close();
    },
  };

  function select(filter: LogQuery | undefined, maxLimit: number): LogEntry[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filter?.plugin !== undefined && filter.plugin !== '') {
      conditions.push('plugin = ?');
      params.push(filter.plugin);
    }
    if (filter?.owner !== undefined) {
      conditions.push('owner = ?');
      params.push(filter.owner);
    }
    if (filter?.entity !== undefined && filter.entity !== '') {
      conditions.push(
        '(principal = ? OR bot = ? OR orchestrator_session = ? OR assignment_session = ? OR trace_id = ?)',
      );
      params.push(filter.entity, filter.entity, filter.entity, filter.entity, filter.entity);
    }
    if (filter?.kinds !== undefined && filter.kinds.length > 0) {
      conditions.push(`kind IN (${filter.kinds.map(() => '?').join(', ')})`);
      params.push(...filter.kinds);
    }
    if (filter?.since !== undefined && Number.isFinite(filter.since)) {
      conditions.push('ts >= ?');
      params.push(filter.since);
    }
    const limit =
      filter?.limit !== undefined &&
      Number.isInteger(filter.limit) &&
      filter.limit > 0 &&
      filter.limit <= maxLimit
        ? filter.limit
        : LOG_QUERY_DEFAULT_LIMIT;
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    try {
      const rows = database
        .prepare(
          `SELECT id, ts, plugin, owner, kind, detail, principal, bot, orchestrator_session, assignment_session, trace_id, payload FROM log_entries ${where} ORDER BY ts DESC, id DESC LIMIT ?`,
        )
        .all(...params, limit) as {
        id: number;
        ts: number;
        plugin: string;
        owner: string;
        kind: string;
        detail: string;
        principal: string | null;
        bot: string | null;
        orchestrator_session: string | null;
        assignment_session: string | null;
        trace_id: string | null;
        payload: string | null;
      }[];
      return rows.map((row): LogEntry => ({
        id: row.id,
        ts: row.ts,
        plugin: row.plugin,
        owner: row.owner as LogOwnerScope,
        kind: row.kind,
        detail: row.detail,
        ...(row.principal === null ? {} : { principal: row.principal }),
        ...(row.bot === null ? {} : { bot: row.bot }),
        ...(row.orchestrator_session === null
          ? {}
          : { orchestratorSession: row.orchestrator_session }),
        ...(row.assignment_session === null ? {} : { assignmentSession: row.assignment_session }),
        ...(row.trace_id === null ? {} : { traceId: row.trace_id }),
        ...(row.payload === null ? {} : { payload: row.payload }),
      }));
    } catch {
      return [];
    }
  }
}
