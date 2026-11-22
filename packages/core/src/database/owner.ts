import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { atomicWriteFile } from '../fs/atomic-write.js';
import { closeDatabase } from './connection.js';
import {
  OperationalDatabaseError,
  injectFault,
  isThenable,
  toOperationalError,
} from './owner-errors.js';
import { prepareDatabase, summarizeOrphans } from './schema-preparation.js';
import { FOUNDATION_SCHEMA_PLAN, type SchemaPlan } from './schema.js';

export { OperationalDatabaseError } from './owner-errors.js';
export { validateOperationalSnapshot } from './schema-preparation.js';

export const OPERATIONAL_DATABASE_FILENAME = 'botharness.db';

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
  causes?: OperationalDatabaseCause[];
}

export interface OperationalDatabaseCause {
  name: string;
  message: string;
  code?: string;
  errcode?: number;
  syscall?: string;
}

export interface OperationalDatabaseStartup {
  instanceId: string;
  pid: number;
  stage:
    | 'lease-open'
    | 'lease-lock'
    | 'lease-metadata'
    | 'source-validation'
    | 'migration'
    | 'staged-validation'
    | 'activation'
    | 'active-validation'
    | 'ready';
  durationMs: number;
  targetGeneration: number;
  migrationGeneration?: number;
  observedWriter?: ProfileWriterLeaseMetadata;
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
  startup: OperationalDatabaseStartup;
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
  onDiagnostic?: (snapshot: OperationalDatabaseDiagnostics) => void;
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
  startup: OperationalDatabaseStartup;
  startedAt: number;
  onDiagnostic?: (snapshot: OperationalDatabaseDiagnostics) => void;
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
      startup: { ...internal.startup },
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
    let failure: Error | undefined;
    const attempt = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(String(error), { cause: error });
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
    notifyDiagnostic(internal);
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
    startup: {
      instanceId: leaseMetadata.instanceId,
      pid: process.pid,
      stage: 'lease-open',
      durationMs: 0,
      targetGeneration: (options.schemaPlan ?? FOUNDATION_SCHEMA_PLAN).targetGeneration,
    },
    startedAt: performance.now(),
    ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
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
  notifyDiagnostic(internal);

  try {
    internal.lease = acquireWriterLease(
      rootDir,
      leaseMetadata,
      internal.leaseMetadataPath,
      internal,
    );
  } catch (error) {
    const observedWriter = readLeaseMetadata(internal.leaseMetadataPath);
    if (observedWriter !== undefined) internal.startup.observedWriter = observedWriter;
    enterRecovery(
      owner,
      toOperationalError('lease-unavailable', 'Could not acquire Profile writer lease', error),
    );
    notifyDiagnostic(internal);
    return owner;
  }

  try {
    const plan = options.schemaPlan ?? FOUNDATION_SCHEMA_PLAN;
    const mounted = prepareDatabase(databasePath, plan, internal);
    internal.database = mounted.database;
    owner.generation = mounted.generation;
    owner.foreignKeyOrphans = summarizeOrphans(mounted.orphans);
    owner.mode = 'ready';
    internal.startup.stage = 'ready';
    owner.recovery = undefined;
  } catch (error) {
    enterRecovery(owner, normalizeMountError(error));
  }

  notifyDiagnostic(internal);

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
  internal: InternalOwner,
): DatabaseSync {
  const lease = new DatabaseSync(join(rootDir, 'botharness.writer-lock.db'), { timeout: 0 });
  try {
    internal.startup.stage = 'lease-lock';
    lease.exec('PRAGMA busy_timeout = 0; BEGIN IMMEDIATE');
    internal.startup.stage = 'lease-metadata';
    atomicWriteFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    return lease;
  } catch (error) {
    closeDatabase(lease);
    throw error;
  }
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
  const causes = errorCauses(error.cause);
  owner.recovery = {
    code: error.code,
    message: error.message,
    ...(causes.length === 0 ? {} : { causes }),
  };
}

function errorCauses(cause: unknown): OperationalDatabaseCause[] {
  const causes: OperationalDatabaseCause[] = [];
  const seen = new Set<unknown>();
  while (cause instanceof Error && causes.length < 4 && !seen.has(cause)) {
    seen.add(cause);
    const entry: OperationalDatabaseCause = {
      name: typeof cause.name === 'string' ? cause.name.slice(0, 80) : 'Error',
      message: typeof cause.message === 'string' ? cause.message.slice(0, 600) : 'Unknown error',
    };
    if ('code' in cause && typeof cause.code === 'string') entry.code = cause.code.slice(0, 80);
    if ('errcode' in cause && typeof cause.errcode === 'number' && Number.isFinite(cause.errcode))
      entry.errcode = cause.errcode;
    if ('syscall' in cause && typeof cause.syscall === 'string')
      entry.syscall = cause.syscall.slice(0, 80);
    causes.push(entry);
    cause = cause.cause;
  }
  return causes;
}

function notifyDiagnostic(internal: InternalOwner): void {
  internal.startup.durationMs = Math.round(performance.now() - internal.startedAt);
  const observerFailed = (error: unknown): void => {
    try {
      void Promise.resolve(internal.onObserverError?.(error)).catch(() => {});
    } catch {}
  };
  try {
    void Promise.resolve(internal.onDiagnostic?.(internal.owner.diagnostics())).catch(
      observerFailed,
    );
  } catch (error) {
    observerFailed(error);
  }
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

function tryRollback(database: DatabaseSync): unknown | undefined {
  if (!database.isTransaction) return undefined;
  try {
    database.exec('ROLLBACK');
    return undefined;
  } catch (error) {
    return error;
  }
}

function normalizeMountError(error: unknown): OperationalDatabaseError {
  return error instanceof OperationalDatabaseError
    ? error
    : toOperationalError('migration-failed', 'Operational database mount failed', error);
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
