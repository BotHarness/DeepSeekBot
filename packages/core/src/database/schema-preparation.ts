import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  openSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import type {
  OperationalDatabaseOwner,
  OperationalDatabaseOwnerOptions,
  OperationalDatabaseStartup,
  ProfileWriterLeaseMetadata,
} from './owner.js';
import {
  OperationalDatabaseError,
  injectFault,
  isThenable,
  toOperationalError,
} from './owner-errors.js';
import {
  FOUNDATION_SCHEMA_GENERATION,
  FOUNDATION_SCHEMA_ID,
  LEGACY_SCHEMA_GENERATION_LIMIT,
  defineSchemaPlan,
  type SchemaPlan,
} from './schema.js';

interface MigrationContext extends Pick<
  OperationalDatabaseOwnerOptions,
  'faultInjector' | 'onObserverError'
> {
  startup: OperationalDatabaseStartup;
  leaseMetadata: ProfileWriterLeaseMetadata;
  owner: OperationalDatabaseOwner;
}

interface DatabaseConnections {
  openDatabase(path: string): DatabaseSync;
  closeDatabase(database: DatabaseSync | undefined): void;
}

const SCHEMA_TABLE = '_botharness_schema';
const MIGRATIONS_TABLE = 'schema_migrations';
const INTEGRITY_FINDINGS_SHOWN = 5;

export function migrateInStaging(
  databasePath: string,
  sourceGeneration: number,
  sourceOrphans: ReadonlyMap<string, number>,
  plan: SchemaPlan,
  internal: MigrationContext,
  { openDatabase, closeDatabase }: DatabaseConnections,
): void {
  internal.startup.stage = 'migration';
  const stagingPath = `${databasePath}.${internal.leaseMetadata.instanceId}.migrating`;
  cleanupDatabaseFiles(stagingPath);
  try {
    if (existsSync(databasePath)) copyFileSync(databasePath, stagingPath);
    injectFault(internal, 'after-staged-copy', stagingPath);

    let staging: DatabaseSync | undefined;
    try {
      staging = openDatabase(stagingPath);

      if (
        plan.migrations.some(
          (migration) =>
            migration.generation > sourceGeneration && migration.rebuildsReferencedTables === true,
        )
      )
        staging.exec('PRAGMA foreign_keys = OFF');
      staging.exec('PRAGMA journal_mode = DELETE; BEGIN IMMEDIATE');
      if (sourceGeneration === 0) bootstrapFoundation(staging);
      if (!hasMigrationLedger(staging)) {
        staging.exec(`CREATE TABLE ${MIGRATIONS_TABLE} (
          generation INTEGER PRIMARY KEY,
          id TEXT NOT NULL UNIQUE
        ) STRICT`);
        const insert = staging.prepare(
          `INSERT INTO ${MIGRATIONS_TABLE} (generation, id) VALUES (?, ?)`,
        );
        insert.run(FOUNDATION_SCHEMA_GENERATION, FOUNDATION_SCHEMA_ID);
        for (const migration of plan.migrations) {
          if (migration.generation > sourceGeneration) break;
          insert.run(migration.generation, migration.id);
        }
      }
      for (const migration of plan.migrations) {
        if (migration.generation <= sourceGeneration) continue;
        internal.startup.migrationGeneration = migration.generation;
        const result = migration.migrate(staging);
        if (isThenable(result)) {
          void Promise.resolve(result).catch((error: unknown) => internal.onObserverError?.(error));
          throw new Error(
            `Schema migration ${migration.generation} returned a thenable; migrations must be synchronous`,
          );
        }
        staging
          .prepare(`INSERT INTO ${MIGRATIONS_TABLE} (generation, id) VALUES (?, ?)`)
          .run(migration.generation, migration.id);
        writeSchemaGeneration(staging, migration.generation);
      }
      staging.exec('COMMIT');
    } catch (error) {
      if (staging?.isTransaction === true) {
        try {
          staging.exec('ROLLBACK');
        } catch {}
      }
      throw toOperationalError('migration-failed', 'Staged schema migration failed', error);
    } finally {
      closeDatabase(staging);
    }

    internal.startup.stage = 'staged-validation';
    injectFault(internal, 'before-integrity-validation', stagingPath);
    let validation: DatabaseSync | undefined;
    try {
      validation = openDatabase(stagingPath);
      assertPageIntegrity(validation);
      assertNoNewOrphans(foreignKeyOrphans(validation), sourceOrphans);
      const generation = readSchemaGeneration(validation);
      verifyMigrationLedger(validation, generation, plan, false);
      if (generation !== plan.targetGeneration) {
        throw new Error(
          `Staged database generation ${generation} does not match target ${plan.targetGeneration}`,
        );
      }
    } catch (error) {
      throw toOperationalError('integrity-failed', 'Staged database validation failed', error);
    } finally {
      closeDatabase(validation);
    }

    internal.startup.stage = 'activation';
    fsyncFile(stagingPath);
    injectFault(internal, 'before-activation', stagingPath);
    cleanupSidecars(databasePath);
    renameSync(stagingPath, databasePath);
    fsyncDirectory(dirname(databasePath));
    injectFault(internal, 'after-activation', stagingPath);
  } finally {
    cleanupDatabaseFiles(stagingPath);
  }
}

function bootstrapFoundation(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE ${SCHEMA_TABLE} (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      generation INTEGER NOT NULL CHECK (generation >= ${FOUNDATION_SCHEMA_GENERATION})
    ) STRICT;
    INSERT INTO ${SCHEMA_TABLE} (singleton, generation)
    VALUES (1, ${FOUNDATION_SCHEMA_GENERATION});
  `);
}

export function readSchemaGeneration(database: DatabaseSync): number {
  const table = database
    .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(SCHEMA_TABLE) as { present?: number } | undefined;
  if (table?.present !== 1) return 0;
  const row = database
    .prepare(`SELECT generation FROM ${SCHEMA_TABLE} WHERE singleton = 1`)
    .get() as { generation?: number | bigint } | undefined;
  const generation = Number(row?.generation);
  if (!Number.isSafeInteger(generation) || generation < FOUNDATION_SCHEMA_GENERATION) {
    throw new OperationalDatabaseError('integrity-failed', 'Schema generation metadata is invalid');
  }
  return generation;
}

function hasMigrationLedger(database: DatabaseSync): boolean {
  return (
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(MIGRATIONS_TABLE) !== undefined
  );
}

export function verifyMigrationLedger(
  database: DatabaseSync,
  generation: number,
  plan: SchemaPlan,
  allowLegacy = true,
): boolean {
  const mismatch = (at: number, actual: string, expected: string): never => {
    throw new OperationalDatabaseError(
      'upgrade-required',
      `Schema migration mismatch at generation ${at}: database id "${actual}", plan id "${expected}"; use a compatible Host or restore a compatible Profile`,
    );
  };
  if (!hasMigrationLedger(database)) {
    if (generation > plan.targetGeneration) {
      mismatch(plan.targetGeneration + 1, '<unknown: legacy database>', '<unsupported>');
    }
    if (allowLegacy && generation <= LEGACY_SCHEMA_GENERATION_LIMIT) return false;
    mismatch(1, '<missing ledger>', FOUNDATION_SCHEMA_ID);
  }
  const rows = database
    .prepare(`SELECT generation, id FROM ${MIGRATIONS_TABLE} ORDER BY generation`)
    .all();
  const expectedIds = [FOUNDATION_SCHEMA_ID, ...plan.migrations.map((migration) => migration.id)];
  for (let index = 0; index < Math.max(generation, rows.length); index += 1) {
    const at = index + 1;
    const row = rows[index];
    if (index >= generation && row !== undefined) {
      const recordedGeneration = Number(row.generation);
      mismatch(
        recordedGeneration,
        String(row.id),
        recordedGeneration > plan.targetGeneration ? '<unsupported>' : '<not applied>',
      );
    }
    const expected = expectedIds[index] ?? '<unsupported>';
    if (row?.generation !== at || row.id !== expected || at > plan.targetGeneration) {
      mismatch(at, row?.generation === at ? String(row.id) : '<missing>', expected);
    }
  }
  return true;
}

function writeSchemaGeneration(database: DatabaseSync, generation: number): void {
  database.prepare(`UPDATE ${SCHEMA_TABLE} SET generation = ? WHERE singleton = 1`).run(generation);
}

export function assertPageIntegrity(database: DatabaseSync): void {
  const rows = database.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>;
  const values = rows.flatMap((row) => Object.values(row)).map(String);
  if (values.length !== 1 || values[0] !== 'ok') {
    throw new OperationalDatabaseError(
      'integrity-failed',
      `SQLite integrity check failed: ${summarizeFindings(values)}`,
    );
  }
}

export function foreignKeyOrphans(database: DatabaseSync): Map<string, number> {
  const orphans = new Map<string, number>();
  const rows = database.prepare('PRAGMA foreign_key_check').all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    const edge = `${String(row.table)} -> ${String(row.parent)}`;
    orphans.set(edge, (orphans.get(edge) ?? 0) + 1);
  }
  return orphans;
}

function assertNoNewOrphans(
  orphans: ReadonlyMap<string, number>,
  tolerated: ReadonlyMap<string, number>,
): void {
  const added = new Map([...orphans].filter(([edge, count]) => count > (tolerated.get(edge) ?? 0)));
  if (added.size > 0) {
    throw new OperationalDatabaseError(
      'integrity-failed',
      `SQLite foreign key check failed: ${summarizeOrphans(added)}`,
    );
  }
}

export function summarizeOrphans(orphans: ReadonlyMap<string, number>): string | undefined {
  if (orphans.size === 0) return undefined;
  return summarizeFindings([...orphans].map(([edge, count]) => `${edge} x${count}`));
}

function summarizeFindings(findings: readonly string[]): string {
  const shown = findings.slice(0, INTEGRITY_FINDINGS_SHOWN).join('; ');
  const hidden = findings.length - INTEGRITY_FINDINGS_SHOWN;
  return hidden > 0 ? `${shown}; +${hidden} more` : shown;
}

export function validateSchemaPlan(plan: SchemaPlan): void {
  if (!Number.isSafeInteger(plan.targetGeneration) || plan.targetGeneration < 1) {
    throw new OperationalDatabaseError(
      'migration-failed',
      `Invalid target schema generation ${plan.targetGeneration}`,
    );
  }
  if (plan.migrations.length !== plan.targetGeneration - FOUNDATION_SCHEMA_GENERATION) {
    throw new OperationalDatabaseError(
      'migration-failed',
      `Schema plan for generation ${plan.targetGeneration} is incomplete`,
    );
  }
  const canonical = defineSchemaPlan(plan.migrations);
  for (let index = 0; index < plan.migrations.length; index += 1) {
    if (plan.migrations[index]?.generation !== canonical.migrations[index]?.generation) {
      throw new OperationalDatabaseError(
        'migration-failed',
        `Schema plan must contain ordered generation ${FOUNDATION_SCHEMA_GENERATION + index + 1}`,
      );
    }
  }
}

function cleanupDatabaseFiles(path: string): void {
  rmSync(path, { force: true });
  cleanupSidecars(path);
}

function cleanupSidecars(path: string): void {
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

function fsyncFile(path: string): void {
  const descriptor = openSync(path, 'r+');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function fsyncDirectory(path: string): void {
  if (process.platform === 'win32') return;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EINVAL' && code !== 'ENOTSUP' && code !== 'EOPNOTSUPP' && code !== 'EISDIR') {
      throw error;
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
