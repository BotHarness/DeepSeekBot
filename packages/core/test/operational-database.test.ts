import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  OperationalDatabaseError,
} from '../src/database/owner.js';
import { defineSchemaPlan, FOUNDATION_SCHEMA_GENERATION } from '../src/database/schema.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { planWithRecords, databasePath, faultAt } from './support/operational-database.js';

describe('operational database owner', () => {
  it('mounts one profile database with foundation generation and lifecycle diagnostics', () => {
    const dshHome = createTempRoot('botharness-db-');
    const owner = mountOperationalDatabase({ dshHome, now: FIXED_NOW, instanceId: 'owner-1' });

    expect(owner.mode).toBe('ready');
    expect(owner.generation).toBe(FOUNDATION_SCHEMA_GENERATION);
    expect(owner.databasePath).toBe(databasePath(dshHome));
    expect(owner.diagnostics()).toMatchObject({
      mode: 'ready',
      generation: 1,
      databaseBytes: expect.any(Number),
      walBytes: expect.any(Number),
      shmBytes: expect.any(Number),
      leaseHolder: {
        instanceId: 'owner-1',
        pid: process.pid,
        acquiredAt: '2026-09-17T00:00:00.000Z',
      },
      metrics: {
        reads: 0,
        transactionsCommitted: 0,
        transactionsRolledBack: 0,
      },
    });
    expect(owner.diagnostics().databaseBytes).toBeGreaterThan(0);

    owner.close();
    owner.close();
    expect(owner.mode).toBe('closed');
    expect(() => owner.subscribe(() => undefined)).toThrowError(
      expect.objectContaining({ code: 'closed' }),
    );
  });

  it('fails a concurrent writer closed while preserving read-only diagnostics', () => {
    const dshHome = createTempRoot('botharness-db-lease-');
    const first = mountOperationalDatabase({ dshHome, instanceId: 'first' });
    const second = mountOperationalDatabase({ dshHome, instanceId: 'second' });

    expect(first.mode).toBe('ready');
    expect(second.mode).toBe('recovery');
    expect(second.recovery?.code).toBe('lease-unavailable');
    expect(second.diagnostics().leaseHolder?.instanceId).toBe('first');
    expect(() => attachOperationalModule(second, 'blocked').read(() => true)).toThrowError(
      expect.objectContaining({ code: 'recovery-mode' }),
    );

    second.close();
    expect(first.diagnostics().leaseHolder?.instanceId).toBe('first');
    first.close();

    const nextHost = mountOperationalDatabase({ dshHome, instanceId: 'next-host' });
    expect(nextHost.mode).toBe('ready');
    nextHost.close();
  });

  it('always releases the writer lease when active database close reports an error', () => {
    const dshHome = createTempRoot('botharness-db-close-failure-');
    const owner = mountOperationalDatabase({ dshHome });
    const port = attachOperationalModule(owner, 'close-probe');
    const database = port.read((current) => current);
    const close = database.close.bind(database);
    Object.defineProperty(database, 'close', {
      configurable: true,
      value() {
        throw new Error('close failed');
      },
    });

    try {
      expect(() => owner.close()).toThrow('close failed');
      const nextHost = mountOperationalDatabase({ dshHome, instanceId: 'after-close-failure' });
      expect(nextHost.mode).toBe('ready');
      nextHost.close();
    } finally {
      Object.defineProperty(database, 'close', { configurable: true, value: close });
      close();
    }
  });

  it('reports the first SQLite integrity findings for a damaged index', () => {
    const dshHome = createTempRoot('botharness-db-damaged-index-');
    const plan = defineSchemaPlan([
      {
        id: 'test-step-5',
        module: 'test-records',
        description: 'create an indexed table',
        migrate(database) {
          database.exec(`
            CREATE TABLE test_records (id INTEGER PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL) STRICT;
            CREATE INDEX test_records_a ON test_records(a);
          `);
        },
      },
    ]);
    const owner = mountOperationalDatabase({ dshHome, schemaPlan: plan });
    attachOperationalModule(owner, 'test-records').transaction((database) => {
      const insert = database.prepare('INSERT INTO test_records VALUES (?, ?, ?)');
      for (let id = 1; id <= 8; id += 1) insert.run(id, `a${id}`, `b${id}`);
    });
    owner.close();

    const inspect = new DatabaseSync(databasePath(dshHome), { readOnly: true });
    const { rootpage } = inspect
      .prepare("SELECT rootpage FROM sqlite_master WHERE name = 'test_records_a'")
      .get() as { rootpage: number };
    const { page_size: pageSize } = inspect.prepare('PRAGMA page_size').get() as {
      page_size: number;
    };
    inspect.close();
    const offset = (rootpage - 1) * pageSize;
    const bytes = readFileSync(databasePath(dshHome));
    const page = bytes.subarray(offset, offset + pageSize);
    for (let id = 1; id <= 8; id += 1) page[page.indexOf(`a${id}`)] = 'z'.charCodeAt(0);
    const file = openSync(databasePath(dshHome), 'r+');
    writeSync(file, page, 0, pageSize, offset);
    closeSync(file);

    const failed = mountOperationalDatabase({ dshHome, schemaPlan: plan });
    expect(failed.recovery?.code).toBe('integrity-failed');
    expect(failed.recovery?.message).toMatch(
      /^SQLite integrity check failed: (?:[^;]+; ){5}\+\d+ more$/,
    );
    expect(failed.recovery?.message).toContain('missing from index test_records_a');
    failed.close();
  });

  it('enters recovery mode for an unreadable active database', () => {
    const dshHome = createTempRoot('botharness-db-open-failure-');
    const path = databasePath(dshHome);
    mkdirSync(join(dshHome, 'botharness'), { recursive: true });
    writeFileSync(path, 'not a sqlite database', 'utf8');

    const owner = mountOperationalDatabase({ dshHome });

    expect(owner.mode).toBe('recovery');
    expect(owner.recovery?.code).toBe('open-failed');
    expect(owner.diagnostics().databaseBytes).toBeGreaterThan(0);
    owner.close();
  });

  it('rejects thenable migration, read, and transaction callbacks', async () => {
    const migrationHome = createTempRoot('botharness-db-async-migration-');
    mountOperationalDatabase({ dshHome: migrationHome }).close();
    const asyncPlan = defineSchemaPlan([
      {
        id: 'test-step-7',
        module: 'async-owner',
        description: 'invalid asynchronous migration',
        migrate: (async () => {}) as () => void,
      },
    ]);
    const migration = mountOperationalDatabase({ dshHome: migrationHome, schemaPlan: asyncPlan });
    expect(migration.mode).toBe('recovery');
    expect(migration.recovery?.code).toBe('migration-failed');
    migration.close();

    const transactionHome = createTempRoot('botharness-db-async-transaction-');
    const transactionError = vi.fn();
    const transactionOwner = mountOperationalDatabase({
      dshHome: transactionHome,
      schemaPlan: planWithRecords(),
      onObserverError: transactionError,
    });
    const transactionRecords = attachOperationalModule(transactionOwner, 'test-records');
    expect(() =>
      transactionRecords.transaction(async (database) => {
        database.prepare('INSERT INTO test_records (value) VALUES (?)').run('rolled back');
        await Promise.resolve();
        database.prepare('INSERT INTO test_records (value) VALUES (?)').run('too late');
      }),
    ).toThrowError(expect.objectContaining({ code: 'transaction-failed' }));
    expect(transactionOwner.mode).toBe('recovery');
    await vi.waitFor(() => expect(transactionError).toHaveBeenCalledOnce());
    transactionOwner.close();

    const transactionReopened = mountOperationalDatabase({
      dshHome: transactionHome,
      schemaPlan: planWithRecords(),
    });
    expect(
      attachOperationalModule(transactionReopened, 'test-records').read((database) =>
        database.prepare('SELECT COUNT(*) AS count FROM test_records').get(),
      ),
    ).toEqual({ count: 0 });
    transactionReopened.close();

    const readHome = createTempRoot('botharness-db-async-read-');
    const readError = vi.fn();
    const readOwner = mountOperationalDatabase({
      dshHome: readHome,
      schemaPlan: planWithRecords(),
      onObserverError: readError,
    });
    const readRecords = attachOperationalModule(readOwner, 'test-records');
    expect(() =>
      readRecords.read(async (database) => {
        await Promise.resolve();
        database.prepare('INSERT INTO test_records (value) VALUES (?)').run('too late');
      }),
    ).toThrowError(expect.objectContaining({ code: 'read-failed' }));
    expect(readOwner.mode).toBe('recovery');
    await vi.waitFor(() => expect(readError).toHaveBeenCalledOnce());
    readOwner.close();

    const readReopened = mountOperationalDatabase({
      dshHome: readHome,
      schemaPlan: planWithRecords(),
    });
    expect(
      attachOperationalModule(readReopened, 'test-records').read((database) =>
        database.prepare('SELECT COUNT(*) AS count FROM test_records').get(),
      ),
    ).toEqual({ count: 0 });
    readReopened.close();
  });

  it('notifies only after commit and isolates observer failures', () => {
    const dshHome = createTempRoot('botharness-db-commit-');
    const observerError = vi.fn();
    const owner = mountOperationalDatabase({
      dshHome,
      schemaPlan: planWithRecords(),
      now: FIXED_NOW,
      onObserverError: observerError,
    });
    const records = attachOperationalModule(owner, 'test-records');
    const notifications: unknown[] = [];
    owner.subscribe((notification) => {
      notifications.push(notification);
      expect(
        records.read((database) =>
          database.prepare('SELECT COUNT(*) AS count FROM test_records').get(),
        ),
      ).toEqual({ count: 1 });
    });
    owner.subscribe(() => {
      throw new Error('observer failed');
    });

    const id = records.transaction(
      (database) => {
        database.prepare('INSERT INTO test_records (value) VALUES (?)').run('hello');
        expect(notifications).toEqual([]);
        return 1;
      },
      ['records/changed'],
    );

    expect(id).toBe(1);
    expect(notifications).toEqual([
      {
        module: 'test-records',
        topics: ['records/changed'],
        committedAt: '2026-09-17T00:00:00.000Z',
      },
    ]);
    expect(observerError).toHaveBeenCalledOnce();
    expect(owner.diagnostics().metrics).toMatchObject({
      reads: 1,
      transactionsCommitted: 1,
      transactionsRolledBack: 0,
      lastCommitAt: '2026-09-17T00:00:00.000Z',
    });
    owner.close();
  });

  it('routes asynchronous observer rejection without changing the committed result', async () => {
    const dshHome = createTempRoot('botharness-db-async-observer-');
    const observerError = vi.fn();
    const owner = mountOperationalDatabase({
      dshHome,
      schemaPlan: planWithRecords(),
      onObserverError: observerError,
    });
    const records = attachOperationalModule(owner, 'test-records');
    owner.subscribe(async () => {
      throw new Error('async observer failed');
    });

    records.transaction(
      (database) => {
        database.prepare('INSERT INTO test_records (value) VALUES (?)').run('committed');
      },
      ['records/changed'],
    );

    await vi.waitFor(() => expect(observerError).toHaveBeenCalledOnce());
    expect(
      records.read((database) =>
        database.prepare('SELECT COUNT(*) AS count FROM test_records').get(),
      ),
    ).toEqual({ count: 1 });
    expect(owner.mode).toBe('ready');
    owner.close();
  });

  it('enters recovery and closes the active database when rollback fails', () => {
    const dshHome = createTempRoot('botharness-db-rollback-failure-');
    const plan = planWithRecords();
    const owner = mountOperationalDatabase({ dshHome, schemaPlan: plan });
    const records = attachOperationalModule(owner, 'test-records');

    expect(() =>
      records.transaction((database) => {
        const exec = database.exec.bind(database);
        Object.defineProperty(database, 'exec', {
          configurable: true,
          value(sql: string) {
            if (sql === 'ROLLBACK') throw new Error('rollback failed');
            return exec(sql);
          },
        });
        database.prepare('INSERT INTO test_records (value) VALUES (?)').run('not committed');
        throw new Error('command failed');
      }),
    ).toThrowError(expect.objectContaining({ code: 'rollback-failed' }));
    expect(owner.mode).toBe('recovery');
    owner.close();

    const reopened = mountOperationalDatabase({ dshHome, schemaPlan: plan });
    expect(reopened.mode).toBe('ready');
    expect(
      attachOperationalModule(reopened, 'test-records').read((database) =>
        database.prepare('SELECT COUNT(*) AS count FROM test_records').get(),
      ),
    ).toEqual({ count: 0 });
    reopened.close();
  });

  it('rolls back before-commit interruption and preserves after-commit interruption', () => {
    const plan = planWithRecords();
    const beforeHome = createTempRoot('botharness-db-tx-before-');
    const before = mountOperationalDatabase({
      dshHome: beforeHome,
      schemaPlan: plan,
      faultInjector: faultAt('before-commit'),
    });
    expect(() =>
      attachOperationalModule(before, 'test-records').transaction((database) => {
        database.prepare('INSERT INTO test_records (value) VALUES (?)').run('rolled back');
      }),
    ).toThrowError(expect.objectContaining({ code: 'commit-failed' }));
    before.close();
    const beforeReopen = mountOperationalDatabase({ dshHome: beforeHome, schemaPlan: plan });
    expect(
      attachOperationalModule(beforeReopen, 'test-records').read((database) =>
        database.prepare('SELECT COUNT(*) AS count FROM test_records').get(),
      ),
    ).toEqual({ count: 0 });
    beforeReopen.close();

    const afterHome = createTempRoot('botharness-db-tx-after-');
    const after = mountOperationalDatabase({
      dshHome: afterHome,
      schemaPlan: plan,
      faultInjector: faultAt('after-commit-before-notify'),
    });
    expect(() =>
      attachOperationalModule(after, 'test-records').transaction((database) => {
        database.prepare('INSERT INTO test_records (value) VALUES (?)').run('committed');
      }),
    ).toThrowError(expect.objectContaining({ code: 'post-commit-interrupted' }));
    after.close();
    const afterReopen = mountOperationalDatabase({ dshHome: afterHome, schemaPlan: plan });
    expect(
      attachOperationalModule(afterReopen, 'test-records').read((database) =>
        database.prepare('SELECT COUNT(*) AS count FROM test_records').get(),
      ),
    ).toEqual({ count: 1 });
    afterReopen.close();
  });

  it('records indexed write/read metrics and file sizes in one transaction', () => {
    const dshHome = createTempRoot('botharness-db-nfr-');
    const owner = mountOperationalDatabase({ dshHome, schemaPlan: planWithRecords() });
    const records = attachOperationalModule(owner, 'test-records');
    const recordsCount = 50;

    records.transaction((database) => {
      const insert = database.prepare('INSERT INTO test_records (value) VALUES (?)');
      for (let index = 0; index < recordsCount; index += 1) insert.run(`value-${index}`);
    });
    for (let id = 1; id <= recordsCount; id += 1) {
      expect(
        records.read((database) =>
          database.prepare('SELECT value FROM test_records WHERE id = ?').get(id),
        ),
      ).toEqual({ value: `value-${id - 1}` });
    }

    expect(owner.diagnostics()).toMatchObject({
      databaseBytes: expect.any(Number),
      walBytes: expect.any(Number),
      shmBytes: expect.any(Number),
      metrics: { reads: recordsCount, transactionsCommitted: 1 },
    });
    expect(owner.diagnostics().databaseBytes + owner.diagnostics().walBytes).toBeGreaterThan(0);
    owner.close();
  });

  it('uses stable operational error codes', () => {
    const error = new OperationalDatabaseError('open-failed', 'cannot open');
    expect(error).toMatchObject({
      name: 'OperationalDatabaseError',
      code: 'open-failed',
      message: 'cannot open',
    });
  });
});
