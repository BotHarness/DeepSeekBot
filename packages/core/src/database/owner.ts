import { randomUUID } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { atomicWriteFile } from '../fs/atomic-write.js';
import { FOUNDATION_SCHEMA_GENERATION, FOUNDATION_SCHEMA_PLAN, type SchemaPlan } from './schema.js';

export const OPERATIONAL_DATABASE_FILENAME = 'botharness.db';

const SCHEMA_TABLE = '_botharness_schema';
const INTEGRITY_FINDINGS_SHOWN = 5;

export type OperationalDatabaseMode = 'ready' | 'recovery' | 'closed';

export type OperationalDatabaseErrorCode =
  | 'closed'
  | 'commit-failed'
  | 'integrity-failed'
  | 'lease-unavailable'
  | 'migration-failed'
  | 'open-failed'
  | 'post-commit-interrupted'
  | 'read-failed'
  | 'recovery-mode'
  | 'rollback-failed'
  | 'transaction-failed'
  | 'upgrade-required';

export type OperationalDatabaseFaultStage =
  | 'after-staged-copy'
  | 'before-integrity-validation'
  | 'before-activation'
  | 'after-activation'
  | 'before-commit'
  | 'after-commit-before-notify';

export interface OperationalDatabaseFaultContext {
  stage: OperationalDatabaseFaultStage;
  activePath: string;
  stagingPath?: string;
}

export interface OperationalDatabaseErrorDetails {
  code: OperationalDatabaseErrorCode;
  message: string;
}

export class OperationalDatabaseError extends Error {
  readonly code: OperationalDatabaseErrorCode;

  constructor(code: OperationalDatabaseErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OperationalDatabaseError';
    this.code = code;
  }
}

export interface ProfileWriterLeaseMetadata {
  instanceId: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
}

export interface OperationalDatabaseMetrics {
  reads: number;
  transactionsCommitted: number;
  transactionsRolledBack: number;
  lastCommitAt?: string;
  lastCommitDurationMs?: number;
  maxCommitDurationMs: number;
}

export interface OperationalDatabaseDiagnostics {
  mode: OperationalDatabaseMode;
  databasePath: string;
  generation?: number;
  recovery?: OperationalDatabaseErrorDetails;
  foreignKeyOrphans?: string;
  leaseHolder?: ProfileWriterLeaseMetadata;
  databaseBytes: number;
  walBytes: number;
  shmBytes: number;
  metrics: OperationalDatabaseMetrics;
}

export interface PostCommitNotification {
  module: string;
  topics: readonly string[];
  committedAt: string;
}

export interface OperationalDatabaseOwner {
  readonly mode: OperationalDatabaseMode;
  readonly databasePath: string;
  readonly generation: number | undefined;
  readonly recovery: OperationalDatabaseErrorDetails | undefined;
  readonly foreignKeyOrphans?: string | undefined;
  subscribe(listener: (notification: PostCommitNotification) => unknown): () => void;
  diagnostics(): OperationalDatabaseDiagnostics;
  close(): void;
}

export interface OperationalDatabaseOwnerOptions {
  dshHome: string;
  schemaPlan?: SchemaPlan;
  now?: () => Date;
  instanceId?: string;
  faultInjector?: (context: OperationalDatabaseFaultContext) => void;
  onObserverError?: (error: unknown) => void;
}

export interface OperationalDatabaseModulePort {
  readonly module: string;
  read<T>(query: (database: DatabaseSync) => T): T;
  transaction<T>(command: (database: DatabaseSync) => T, notificationTopics?: readonly string[]): T;
}

interface MutableMetrics {
  reads: number;
  transactionsCommitted: number;
  transactionsRolledBack: number;
  lastCommitAt?: string;
  lastCommitDurationMs?: number;
  maxCommitDurationMs: number;
}

interface InternalOwner {
  backupBarrier?: boolean;
  closeEffects: Set<() => void>;
  owner: OwnerImplementation;
  database: DatabaseSync | undefined;
  lease: DatabaseSync | undefined;
  leaseMetadata: ProfileWriterLeaseMetadata;
  leaseMetadataPath: string;
  faultInjector?: (context: OperationalDatabaseFaultContext) => void;
  onObserverError?: (error: unknown) => void;
  now: () => Date;
  metrics: MutableMetrics;
}

const owners = new WeakMap<OperationalDatabaseOwner, InternalOwner>();

class OwnerImplementation implements OperationalDatabaseOwner {
  mode: OperationalDatabaseMode = 'recovery';
  generation: number | undefined;
  recovery: OperationalDatabaseErrorDetails | undefined;
  foreignKeyOrphans: string | undefined;
  readonly databasePath: string;
  readonly #listeners = new Set<(notification: PostCommitNotification) => unknown>();

  constructor(databasePath: string) {
    this.databasePath = databasePath;
  }

  subscribe(listener: (notification: PostCommitNotification) => unknown): () => void {
    if (this.mode === 'closed') {
      throw new OperationalDatabaseError('closed', 'Operational database owner is closed');
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  notify(notification: PostCommitNotification, onError?: (error: unknown) => void): void {
    for (const listener of this.#listeners) {
      try {
        const result = listener(notification);
        if (isThenable(result)) {
          void Promise.resolve(result).catch((error: unknown) => onError?.(error));
        }
      } catch (error) {
        onError?.(error);
      }
    }
  }

  diagnostics(): OperationalDatabaseDiagnostics {
    const internal = requireInternal(this);
    const leaseHolder = readLeaseMetadata(internal.leaseMetadataPath);
    return {
      mode: this.mode,
      databasePath: this.databasePath,
      ...(this.generation === undefined ? {} : { generation: this.generation }),
      ...(this.recovery === undefined ? {} : { recovery: this.recovery }),
      ...(this.foreignKeyOrphans === undefined
        ? {}
        : { foreignKeyOrphans: this.foreignKeyOrphans }),
      ...(leaseHolder === undefined ? {} : { leaseHolder }),
      databaseBytes: fileSize(this.databasePath),
      walBytes: fileSize(`${this.databasePath}-wal`),
      shmBytes: fileSize(`${this.databasePath}-shm`),
      metrics: { ...internal.metrics },
    };
  }

  close(): void {
    if (this.mode === 'closed') return;
    this.mode = 'closed';
    this.#listeners.clear();
    const internal = requireInternal(this);
    let failure: unknown;
    const attempt = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        failure ??= error;
      }
    };

    for (const effect of internal.closeEffects) attempt(effect);
    internal.closeEffects.clear();

    attempt(() => closeDatabase(internal.database));
    internal.database = undefined;
    attempt(() => {
      if (internal.lease?.isTransaction === true) internal.lease.exec('ROLLBACK');
    });
    attempt(() => closeDatabase(internal.lease));
    internal.lease = undefined;
    const metadata = readLeaseMetadata(internal.leaseMetadataPath);
    if (metadata?.instanceId === internal.leaseMetadata.instanceId) {
      attempt(() => rmSync(internal.leaseMetadataPath, { force: true }));
    }
    if (failure !== undefined) throw failure;
  }
}

export function mountOperationalDatabase(
  options: OperationalDatabaseOwnerOptions,
): OperationalDatabaseOwner {
  const rootDir = join(options.dshHome, 'botharness');
  mkdirSync(rootDir, { recursive: true });
  const databasePath = join(rootDir, OPERATIONAL_DATABASE_FILENAME);
  const owner = new OwnerImplementation(databasePath);
  const now = options.now ?? (() => new Date());
  const leaseMetadata: ProfileWriterLeaseMetadata = {
    instanceId: options.instanceId ?? randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    acquiredAt: now().toISOString(),
  };
  const internal: InternalOwner = {
    closeEffects: new Set(),
    owner,
    database: undefined,
    lease: undefined,
    leaseMetadata,
    leaseMetadataPath: join(rootDir, 'botharness.writer.json'),
    ...(options.faultInjector === undefined ? {} : { faultInjector: options.faultInjector }),
    ...(options.onObserverError === undefined ? {} : { onObserverError: options.onObserverError }),
    now,
    metrics: {
      reads: 0,
      transactionsCommitted: 0,
      transactionsRolledBack: 0,
      maxCommitDurationMs: 0,
    },
  };
  owners.set(owner, internal);

  try {
    internal.lease = acquireWriterLease(rootDir, leaseMetadata, internal.leaseMetadataPath);
  } catch (error) {
    enterRecovery(
      owner,
      toOperationalError('lease-unavailable', 'Profile writer lease is held', error),
    );
    return owner;
  }

  try {
    const plan = options.schemaPlan ?? FOUNDATION_SCHEMA_PLAN;
    const mounted = prepareDatabase(databasePath, plan, internal);
    internal.database = mounted.database;
    owner.generation = mounted.generation;
    owner.foreignKeyOrphans = summarizeOrphans(mounted.orphans);
    owner.mode = 'ready';
    owner.recovery = undefined;
  } catch (error) {
    enterRecovery(owner, normalizeMountError(error));
  }

  return owner;
}

export function attachOperationalModule(
  owner: OperationalDatabaseOwner,
  module: string,
): OperationalDatabaseModulePort {
  const name = module.trim();
  if (name.length === 0) throw new TypeError('Operational module name must not be blank');
  const internal = requireInternal(owner);

  return {
    module: name,
    read<T>(query: (database: DatabaseSync) => T): T {
      const database = readyDatabase(internal);
      internal.metrics.reads += 1;
      const result = query(database);
      if (isThenable(result)) {
        void Promise.resolve(result).catch((error: unknown) => internal.onObserverError?.(error));
        const failure = new OperationalDatabaseError(
          'read-failed',
          `Operational read for ${name} returned a thenable; database callbacks must be synchronous`,
        );
        enterRecoveryAndClose(internal, failure);
        throw failure;
      }
      return result;
    },
    transaction<T>(
      command: (database: DatabaseSync) => T,
      notificationTopics: readonly string[] = [],
    ): T {
      if (internal.backupBarrier)
        throw new OperationalDatabaseError('transaction-failed', 'Profile Backup Barrier is held');
      const database = readyDatabase(internal);
      if (database.isTransaction) {
        throw new OperationalDatabaseError(
          'transaction-failed',
          `Nested operational transaction requested by ${name}`,
        );
      }

      const startedAt = performance.now();
      let value: T;
      let thenableViolation = false;
      try {
        database.exec('BEGIN IMMEDIATE');
      } catch (error) {
        throw toOperationalError(
          'transaction-failed',
          `Could not begin operational transaction for ${name}`,
          error,
        );
      }
      try {
        value = command(database);
        if (isThenable(value)) {
          void Promise.resolve(value).catch((error: unknown) => internal.onObserverError?.(error));
          thenableViolation = true;
          throw new Error('database callbacks must be synchronous');
        }
      } catch (error) {
        const rollbackError = tryRollback(database);
        if (rollbackError !== undefined) {
          const failure = toOperationalError(
            'rollback-failed',
            `Operational rollback for ${name} failed`,
            rollbackError,
          );
          enterRecoveryAndClose(internal, failure);
          throw failure;
        }
        internal.metrics.transactionsRolledBack += 1;
        const failure = toOperationalError(
          'transaction-failed',
          `Operational transaction for ${name} failed`,
          error,
        );
        if (thenableViolation) enterRecoveryAndClose(internal, failure);
        throw failure;
      }

      try {
        injectFault(internal, 'before-commit');
        database.exec('COMMIT');
      } catch (error) {
        const rollbackError = tryRollback(database);
        const failure =
          rollbackError === undefined
            ? toOperationalError('commit-failed', `Operational commit for ${name} failed`, error)
            : toOperationalError(
                'rollback-failed',
                `Operational commit and rollback for ${name} failed`,
                rollbackError,
              );
        if (rollbackError === undefined) internal.metrics.transactionsRolledBack += 1;
        enterRecoveryAndClose(internal, failure);
        throw failure;
      }

      const committedAt = internal.now().toISOString();
      const duration = performance.now() - startedAt;
      internal.metrics.transactionsCommitted += 1;
      internal.metrics.lastCommitAt = committedAt;
      internal.metrics.lastCommitDurationMs = duration;
      internal.metrics.maxCommitDurationMs = Math.max(
        internal.metrics.maxCommitDurationMs,
        duration,
      );

      try {
        injectFault(internal, 'after-commit-before-notify');
      } catch (error) {
        const failure = toOperationalError(
          'post-commit-interrupted',
          `Operational commit for ${name} succeeded before notification was interrupted`,
          error,
        );
        enterRecoveryAndClose(internal, failure);
        throw failure;
      }

      if (notificationTopics.length > 0) {
        internal.owner.notify(
          { module: name, topics: [...notificationTopics], committedAt },
          internal.onObserverError,
        );
      }
      return value;
    },
  };
}

export function failOperationalDatabase(owner: OperationalDatabaseOwner, message: string): void {
  enterRecoveryAndClose(
    requireInternal(owner),
    new OperationalDatabaseError('recovery-mode', message),
  );
}
export function withOperationalBackup<T>(
  owner: OperationalDatabaseOwner,
  snapshotPath: string,
  capture: () => T,
): T {
  const internal = requireInternal(owner);
  const database = readyDatabase(internal);
  if (internal.backupBarrier || database.isTransaction || existsSync(snapshotPath))
    throw new OperationalDatabaseError('transaction-failed', 'Profile snapshot is busy');
  internal.backupBarrier = true;
  try {
    database.prepare('VACUUM INTO ?').run(snapshotPath);
    const result = capture();
    if (isThenable(result)) throw new TypeError('Backup Barrier capture must be synchronous');
    return result;
  } finally {
    internal.backupBarrier = false;
  }
}

export function validateOperationalSnapshot(path: string): number {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    assertPageIntegrity(database);
    return readSchemaGeneration(database);
  } finally {
    database.close();
  }
}

export function onOperationalDatabaseClose(
  owner: OperationalDatabaseOwner,
  cleanup: () => void,
): void {
  requireInternal(owner).closeEffects.add(cleanup);
}

function acquireWriterLease(
  rootDir: string,
  metadata: ProfileWriterLeaseMetadata,
  metadataPath: string,
): DatabaseSync {
  const lease = new DatabaseSync(join(rootDir, 'botharness.writer-lock.db'), { timeout: 0 });
  try {
    lease.exec('PRAGMA busy_timeout = 0; BEGIN IMMEDIATE');
    atomicWriteFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    return lease;
  } catch (error) {
    closeDatabase(lease);
    throw error;
  }
}

function prepareDatabase(
  databasePath: string,
  plan: SchemaPlan,
  internal: InternalOwner,
): { database: DatabaseSync; generation: number; orphans: Map<string, number> } {
  validateSchemaPlan(plan);

  let sourceGeneration = 0;
  let sourceOrphans = new Map<string, number>();
  if (existsSync(databasePath)) {
    let source: DatabaseSync | undefined;
    try {
      source = openDatabase(databasePath);
      assertPageIntegrity(source);
      sourceOrphans = foreignKeyOrphans(source);
      sourceGeneration = readSchemaGeneration(source);
      if (sourceGeneration > plan.targetGeneration) {
        throw new OperationalDatabaseError(
          'upgrade-required',
          `Database generation ${sourceGeneration} is newer than supported generation ${plan.targetGeneration}`,
        );
      }
      if (sourceGeneration < plan.targetGeneration) {
        const checkpoint = source.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as
          | { busy?: number | bigint }
          | undefined;
        if (Number(checkpoint?.busy) !== 0) {
          throw new OperationalDatabaseError(
            'migration-failed',
            'Could not checkpoint the active database before staged migration',
          );
        }
      }
    } catch (error) {
      if (error instanceof OperationalDatabaseError) throw error;
      throw toOperationalError('open-failed', 'Could not open operational database', error);
    } finally {
      closeDatabase(source);
    }
  }

  if (sourceGeneration < plan.targetGeneration) {
    migrateInStaging(databasePath, sourceGeneration, sourceOrphans, plan, internal);
  }

  try {
    const database = openDatabase(databasePath);
    configureActiveDatabase(database);
    assertPageIntegrity(database);
    const orphans = foreignKeyOrphans(database);
    const generation = readSchemaGeneration(database);
    if (generation !== plan.targetGeneration) {
      closeDatabase(database);
      throw new OperationalDatabaseError(
        'migration-failed',
        `Expected schema generation ${plan.targetGeneration}, found ${generation}`,
      );
    }
    return { database, generation, orphans };
  } catch (error) {
    if (error instanceof OperationalDatabaseError) throw error;
    throw toOperationalError('open-failed', 'Could not mount operational database', error);
  }
}

function migrateInStaging(
  databasePath: string,
  sourceGeneration: number,
  sourceOrphans: ReadonlyMap<string, number>,
  plan: SchemaPlan,
  internal: InternalOwner,
): void {
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
      for (const migration of plan.migrations) {
        if (migration.generation <= sourceGeneration) continue;
        const result = migration.migrate(staging);
        if (isThenable(result)) {
          void Promise.resolve(result).catch((error: unknown) => internal.onObserverError?.(error));
          throw new Error(
            `Schema migration ${migration.generation} returned a thenable; migrations must be synchronous`,
          );
        }
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

    injectFault(internal, 'before-integrity-validation', stagingPath);
    let validation: DatabaseSync | undefined;
    try {
      validation = openDatabase(stagingPath);
      assertPageIntegrity(validation);
      assertNoNewOrphans(foreignKeyOrphans(validation), sourceOrphans);
      const generation = readSchemaGeneration(validation);
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

function readSchemaGeneration(database: DatabaseSync): number {
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

function writeSchemaGeneration(database: DatabaseSync, generation: number): void {
  database.prepare(`UPDATE ${SCHEMA_TABLE} SET generation = ? WHERE singleton = 1`).run(generation);
}

function assertPageIntegrity(database: DatabaseSync): void {
  const rows = database.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>;
  const values = rows.flatMap((row) => Object.values(row)).map(String);
  if (values.length !== 1 || values[0] !== 'ok') {
    throw new OperationalDatabaseError(
      'integrity-failed',
      `SQLite integrity check failed: ${summarizeFindings(values)}`,
    );
  }
}

function foreignKeyOrphans(database: DatabaseSync): Map<string, number> {
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

function summarizeOrphans(orphans: ReadonlyMap<string, number>): string | undefined {
  if (orphans.size === 0) return undefined;
  return summarizeFindings([...orphans].map(([edge, count]) => `${edge} x${count}`));
}

function summarizeFindings(findings: readonly string[]): string {
  const shown = findings.slice(0, INTEGRITY_FINDINGS_SHOWN).join('; ');
  const hidden = findings.length - INTEGRITY_FINDINGS_SHOWN;
  return hidden > 0 ? `${shown}; +${hidden} more` : shown;
}

function openDatabase(path: string): DatabaseSync {
  return new DatabaseSync(path, {
    timeout: 0,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
  });
}

function configureActiveDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 0;
  `);
}

function readyDatabase(internal: InternalOwner): DatabaseSync {
  const { owner, database } = internal;
  if (owner.mode === 'closed') {
    throw new OperationalDatabaseError('closed', 'Operational database owner is closed');
  }
  if (owner.mode !== 'ready' || database === undefined) {
    throw new OperationalDatabaseError(
      'recovery-mode',
      owner.recovery === undefined
        ? 'Operational database is not ready'
        : `Operational database is in recovery mode: ${owner.recovery.code} (${owner.recovery.message})`,
    );
  }
  return database;
}

function requireInternal(owner: OperationalDatabaseOwner): InternalOwner {
  const internal = owners.get(owner);
  if (internal === undefined) {
    throw new TypeError('Operational database owner was not created by this module');
  }
  return internal;
}

function enterRecovery(owner: OwnerImplementation, error: OperationalDatabaseError): void {
  owner.mode = 'recovery';
  owner.recovery = { code: error.code, message: error.message };
}

function enterRecoveryAndClose(internal: InternalOwner, error: OperationalDatabaseError): void {
  enterRecovery(internal.owner, error);
  try {
    closeDatabase(internal.database);
  } catch (closeError) {
    internal.onObserverError?.(closeError);
  } finally {
    internal.database = undefined;
  }
}

function validateSchemaPlan(plan: SchemaPlan): void {
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
  for (let index = 0; index < plan.migrations.length; index += 1) {
    const migration = plan.migrations[index];
    const expected = FOUNDATION_SCHEMA_GENERATION + index + 1;
    if (
      migration === undefined ||
      migration.generation !== expected ||
      migration.module.trim().length === 0 ||
      typeof migration.migrate !== 'function'
    ) {
      throw new OperationalDatabaseError(
        'migration-failed',
        `Schema plan must contain ordered generation ${expected}`,
      );
    }
  }
}

function tryRollback(database: DatabaseSync): unknown | undefined {
  if (!database.isTransaction) return undefined;
  try {
    database.exec('ROLLBACK');
    return undefined;
  } catch (error) {
    return error;
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  return typeof (value as { then?: unknown }).then === 'function';
}

function normalizeMountError(error: unknown): OperationalDatabaseError {
  return error instanceof OperationalDatabaseError
    ? error
    : toOperationalError('migration-failed', 'Operational database mount failed', error);
}

function toOperationalError(
  code: OperationalDatabaseErrorCode,
  message: string,
  cause: unknown,
): OperationalDatabaseError {
  if (cause instanceof OperationalDatabaseError && cause.code === code) return cause;
  return new OperationalDatabaseError(code, message, { cause });
}

function injectFault(
  internal: InternalOwner,
  stage: OperationalDatabaseFaultStage,
  stagingPath?: string,
): void {
  internal.faultInjector?.({
    stage,
    activePath: internal.owner.databasePath,
    ...(stagingPath === undefined ? {} : { stagingPath }),
  });
}

function closeDatabase(database: DatabaseSync | undefined): void {
  if (database?.isOpen === true) database.close();
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

function readLeaseMetadata(path: string): ProfileWriterLeaseMetadata | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ProfileWriterLeaseMetadata>;
    if (
      typeof parsed.instanceId !== 'string' ||
      typeof parsed.pid !== 'number' ||
      typeof parsed.hostname !== 'string' ||
      typeof parsed.acquiredAt !== 'string'
    ) {
      return undefined;
    }
    return parsed as ProfileWriterLeaseMetadata;
  } catch {
    return undefined;
  }
}

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
