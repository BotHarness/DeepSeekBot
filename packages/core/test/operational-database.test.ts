import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it, vi } from 'vitest';

import {
  attachOperationalModule,
  mountOperationalDatabase,
  OperationalDatabaseError,
  type OperationalDatabaseFaultStage,
} from '../src/database/owner.js';
import {
  defineSchemaPlan,
  FOUNDATION_SCHEMA_GENERATION,
  LEGACY_FORWARD_MIGRATION_PLAN,
  type SchemaPlan,
} from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

function planWithRecords(): SchemaPlan {
  return defineSchemaPlan([
    {
      generation: 2,
      module: 'test-records',
      description: 'create a representative owning-module table',
      migrate(database) {
        database.exec(`
          CREATE TABLE test_records (
            id INTEGER PRIMARY KEY,
            value TEXT NOT NULL
          ) STRICT;
        `);
      },
    },
  ]);
}

function databasePath(dshHome: string): string {
  return join(dshHome, 'botharness', 'botharness.db');
}

function mutateGeneration(dshHome: string, generation: number): void {
  const database = new DatabaseSync(databasePath(dshHome));
  try {
    database
      .prepare('UPDATE _botharness_schema SET generation = ? WHERE singleton = 1')
      .run(generation);
  } finally {
    database.close();
  }
}

function faultAt(
  stage: OperationalDatabaseFaultStage,
): (context: { stage: OperationalDatabaseFaultStage }) => void {
  return (context) => {
    if (context.stage === stage) throw new Error(`fault:${stage}`);
  };
}

describe('operational database owner', () => {
  it('generation 79 adds empty groups without rewriting existing Role or pairing grants and refuses an older writer', () => {
    const dshHome = createTempRoot('bh-group-upgrade-');
    const priorPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 78),
    );
    const prior = mountOperationalDatabase({ dshHome, schemaPlan: priorPlan });
    const seed = attachOperationalModule(prior, 'messaging');
    const role = JSON.stringify({
      id: 'role',
      botSlug: 'ada',
      name: 'Reviewer',
      behavior: 'Review',
      capabilities: ['approve'],
      revision: 6,
    });
    const pairing = JSON.stringify({
      id: 'pair',
      botSlug: 'ada',
      bindingId: 'binding',
      actorId: 'ou_alice',
      purpose: 'management',
      status: 'approved',
      capabilities: ['reject', 'save-rules'],
      revision: 4,
    });
    seed.transaction((db) => {
      db.prepare(
        'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        'binding',
        'ada',
        'dsh-im/feishu',
        'feishu',
        'qa',
        'a'.repeat(64),
        FIXED_NOW().toISOString(),
        'QA',
      );
      db.prepare('INSERT INTO messaging_external_roles (id, bot_slug, body) VALUES (?, ?, ?)').run(
        'role',
        'ada',
        role,
      );
      db.prepare(
        'INSERT INTO messaging_pairings (id, bot_slug, binding_id, actor_id, purpose, status, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run('pair', 'ada', 'binding', 'ou_alice', 'management', 'approved', pairing);
    });
    prior.close();
    const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    expect(upgraded.mode).toBe('ready');
    const read = attachOperationalModule(upgraded, 'messaging');
    expect(
      read.read((db) =>
        db.prepare('SELECT body FROM messaging_external_roles WHERE id = ?').get('role'),
      ),
    ).toEqual({ body: role });
    expect(
      read.read((db) => db.prepare('SELECT body FROM messaging_pairings WHERE id = ?').get('pair')),
    ).toEqual({ body: pairing });
    expect(
      read.read((db) => db.prepare('SELECT * FROM messaging_permission_groups').all()),
    ).toEqual([]);
    upgraded.close();
    const oldWriter = mountOperationalDatabase({ dshHome, schemaPlan: priorPlan });
    expect(oldWriter.mode).toBe('recovery');
    expect(oldWriter.diagnostics().recovery?.code).toBe('upgrade-required');
    oldWriter.close();
  });

  it('upgrades the current main Profile without changing QQ and WeChat reception authority', () => {
    const dshHome = createTempRoot('botharness-qq-main-upgrade-');
    const priorPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 73),
    );
    const prior = mountOperationalDatabase({ dshHome, schemaPlan: priorPlan });
    expect(prior.mode).toBe('ready');
    const seed = attachOperationalModule(prior, 'qq-main-upgrade-seed');
    seed.transaction((database) => {
      for (const platform of ['qq', 'weixin'])
        database
          .prepare(`INSERT INTO messaging_bindings
          (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at,
           revision, enabled, display_name, enabled_inherited, typing_enabled,
           typing_inherited, receive_after)
          VALUES (?, 'ada', ?, ?, 'app', ?, ?, 7, 0, 'QA', 0, 0, 0, ?)`)
          .run(
            platform,
            `dsh-im/${platform}`,
            platform,
            'a'.repeat(64),
            '2026-10-08T00:00:00Z',
            '2026-10-09T00:00:00Z',
          );
    });
    const readBindings = (owner: ReturnType<typeof mountOperationalDatabase>) =>
      attachOperationalModule(owner, 'qq-main-upgrade-read').read((database) =>
        database.prepare('SELECT * FROM messaging_bindings ORDER BY id').all(),
      );
    const before = readBindings(prior);
    prior.close();
    const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    expect(upgraded.mode).toBe('ready');
    expect(upgraded.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
    expect(readBindings(upgraded)).toEqual(before);
    const module = attachOperationalModule(upgraded, 'qq-main-upgrade-history');
    expect(
      module.read((database) =>
        database.prepare('SELECT * FROM messaging_reception_history').all(),
      ),
    ).toEqual([]);
    module.transaction((database) =>
      database
        .prepare(
          'INSERT INTO messaging_reception_history (bot_slug, provider_id, fingerprint, body) VALUES (?, ?, ?, ?)',
        )
        .run('ada', 'dsh-im/qq', 'a'.repeat(64), '[]'),
    );
    upgraded.close();
    const reopened = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    expect(readBindings(reopened)).toEqual(before);
    expect(
      attachOperationalModule(reopened, 'qq-main-upgrade-reopen').read((database) =>
        database.prepare('SELECT body FROM messaging_reception_history').all(),
      ),
    ).toEqual([{ body: '[]' }]);
    reopened.close();
  });

  it.each([59, 60, 61, 62, 63, 64, 65, 66])(
    'upgrades generation %s identities with a durable typing preference and preserves their authority',
    (generation) => {
      const dshHome = createTempRoot('botharness-typing-migration-');
      const priorPlan = defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter(
          (migration) => migration.generation <= generation,
        ),
      );
      const prior = mountOperationalDatabase({ dshHome, schemaPlan: priorPlan });
      attachOperationalModule(prior, 'typing-seed').transaction((database) => {
        database
          .prepare(`INSERT INTO messaging_bindings
        (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at,
         revision, enabled, display_name, enabled_inherited)
        VALUES ('own', 'ada', 'dsh-im/weixin', 'weixin', 'paired', ?, ?, 7, 0, 'Own WeChat', 0)`)
          .run('a'.repeat(64), FIXED_NOW().toISOString());
        if (generation >= 60)
          database
            .prepare(
              'INSERT INTO messaging_approval_routes (bot_slug, revision, body) VALUES (?, ?, ?)',
            )
            .run('ada', 1, null);
      });
      prior.close();
      const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      const module = attachOperationalModule(upgraded, 'typing-check');
      const read = () =>
        module.read((database) =>
          database
            .prepare(
              'SELECT revision, enabled, display_name, fingerprint, typing_enabled FROM messaging_bindings WHERE id = ?',
            )
            .get('own'),
        );
      expect(read()).toEqual({
        revision: 7,
        enabled: 0,
        display_name: 'Own WeChat',
        fingerprint: 'a'.repeat(64),
        typing_enabled: 1,
      });
      expect(
        module.read((database) =>
          database.prepare('SELECT * FROM messaging_approval_routes').all(),
        ),
      ).toEqual(generation >= 60 ? [{ bot_slug: 'ada', revision: 1, body: null }] : []);
      module.transaction((database) =>
        database
          .prepare('UPDATE messaging_bindings SET typing_enabled = 0 WHERE id = ?')
          .run('own'),
      );
      upgraded.close();
      const reopened = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(
        attachOperationalModule(reopened, 'typing-reopen').read((database) =>
          database.prepare('SELECT typing_enabled FROM messaging_bindings WHERE id = ?').get('own'),
        ),
      ).toEqual({ typing_enabled: 0 });
      reopened.close();
    },
  );

  it('adds pairing after current Discord defaults without rewriting their immutable history', () => {
    const dshHome = createTempRoot('botharness-pairing-migration-');
    const priorPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 58),
    );
    const prior = mountOperationalDatabase({ dshHome, schemaPlan: priorPlan });
    expect(prior.generation).toBe(58);
    attachOperationalModule(prior, 'pairing-migration-seed').transaction((database) => {
      database
        .prepare(
          'INSERT INTO messaging_default_revisions (platform, revision, body) VALUES (?, ?, ?)',
        )
        .run('discord', 1, '{"preserved":true}');
    });
    prior.close();

    const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    expect(upgraded.mode).toBe('ready');
    expect(upgraded.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
    const module = attachOperationalModule(upgraded, 'pairing-migration-check');
    expect(
      module.read((database) =>
        database
          .prepare(
            'SELECT body FROM messaging_default_revisions WHERE platform = ? AND revision = ?',
          )
          .get('discord', 1),
      ),
    ).toEqual({ body: '{"preserved":true}' });
    expect(
      module.read((database) => database.prepare('SELECT * FROM messaging_pairings').all()),
    ).toEqual([]);
    expect(() =>
      module.transaction((database) =>
        database
          .prepare('UPDATE messaging_default_revisions SET body = ? WHERE platform = ?')
          .run('{}', 'discord'),
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'transaction-failed',
        cause: expect.objectContaining({ message: expect.stringContaining('immutable') }),
      }),
    );
    upgraded.close();
  });

  it('preserves existing Assignment reports when upgrading to the latest schema', () => {
    const dshHome = createTempRoot('botharness-lifecycle-migration-');
    const priorPlan = defineSchemaPlan(BOT_HARNESS_SCHEMA_PLAN.migrations.slice(0, -1));
    const prior = mountOperationalDatabase({ dshHome, schemaPlan: priorPlan });
    attachOperationalModule(prior, 'lifecycle-migration-seed').transaction((database) => {
      database
        .prepare(`INSERT INTO source_events (
          source_event_id, source_kind, bot_slug, assignment_session_id, body,
          created_at, handled_at, attempt_state, payload_json
        ) VALUES (?, 'assignment-report', ?, ?, ?, ?, ?, 'handled', ?)`)
        .run(
          'prior-report',
          'ada',
          'assignment-1',
          'A completed result',
          FIXED_NOW().toISOString(),
          FIXED_NOW().toISOString(),
          JSON.stringify({ assignmentReport: { state: 'completed' } }),
        );
      database
        .prepare(`INSERT INTO inbox_admissions (source_event_id, bot_slug, reason)
                  VALUES ('prior-report', 'ada', 'assignment-report')`)
        .run();
    });
    prior.close();

    const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    expect(upgraded.mode).toBe('ready');
    expect(upgraded.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
    const facts = attachOperationalModule(upgraded, 'lifecycle-migration-check').read(
      (database) => ({
        source: database
          .prepare(
            'SELECT source_kind, body, payload_json FROM source_events WHERE source_event_id = ?',
          )
          .get('prior-report'),
        admission: database
          .prepare('SELECT reason, attempt_state FROM inbox_admissions WHERE source_event_id = ?')
          .get('prior-report'),
        foreignKeys: database.prepare('PRAGMA foreign_key_check').all(),
      }),
    );
    expect(facts).toMatchObject({
      source: {
        source_kind: 'assignment-report',
        body: 'A completed result',
        payload_json: '{"assignmentReport":{"state":"completed"}}',
      },
      admission: { reason: 'assignment-report', attempt_state: 'pending' },
      foreignKeys: [],
    });
    upgraded.close();
  });

  it('backfills Group wake modes when upgrading existing Inbox Admissions', () => {
    const dshHome = createTempRoot('botharness-group-wake-migration-');
    const priorPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 26),
    );
    const prior = mountOperationalDatabase({ dshHome, schemaPlan: priorPlan });
    attachOperationalModule(prior, 'group-wake-migration-seed').transaction((database) => {
      for (const [id, reason, wakeCount, wakeIntervalMs] of [
        ['all', 'group-ordinary', 1, 0],
        ['digest', 'group-ordinary', 5, 60_000],
        ['silent', 'group-ordinary', null, null],
        ['mention', 'group-mention', null, null],
      ] as const) {
        database
          .prepare(`INSERT INTO source_events (
            source_event_id, source_kind, bot_slug, body, created_at
          ) VALUES (?, 'human-message', 'ada', ?, ?) `)
          .run(id, id, FIXED_NOW().toISOString());
        database
          .prepare(`INSERT INTO inbox_admissions (
            source_event_id, bot_slug, reason, wake_count, wake_interval_ms
          ) VALUES (?, 'ada', ?, ?, ?) `)
          .run(id, reason, wakeCount, wakeIntervalMs);
      }
    });
    prior.close();

    const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    expect(upgraded.mode).toBe('ready');
    expect(
      attachOperationalModule(upgraded, 'group-wake-migration-check').read((database) =>
        database
          .prepare(
            'SELECT source_event_id, wake_mode FROM inbox_admissions ORDER BY source_event_id',
          )
          .all(),
      ),
    ).toEqual([
      { source_event_id: 'all', wake_mode: 'all' },
      { source_event_id: 'digest', wake_mode: 'digest' },
      { source_event_id: 'mention', wake_mode: null },
      { source_event_id: 'silent', wake_mode: 'silent' },
    ]);
    upgraded.close();
  });

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

  it('migrates an isolated copy and atomically activates a validated generation', () => {
    const dshHome = createTempRoot('botharness-db-migrate-');
    const foundation = mountOperationalDatabase({ dshHome });
    foundation.close();

    const owner = mountOperationalDatabase({ dshHome, schemaPlan: planWithRecords() });
    const records = attachOperationalModule(owner, 'test-records');

    expect(owner.mode).toBe('ready');
    expect(owner.generation).toBe(2);
    expect(
      records.read((database) =>
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'test_records'")
          .get(),
      ),
    ).toEqual({ name: 'test_records' });
    expect(
      readdirSync(join(dshHome, 'botharness')).some((name) => name.endsWith('.migrating')),
    ).toBe(false);
    owner.close();
  });

  it('fails closed when WAL checkpointing is busy before the raw staging copy', () => {
    const dshHome = createTempRoot('botharness-db-checkpoint-');
    mountOperationalDatabase({ dshHome }).close();
    const writer = new DatabaseSync(databasePath(dshHome));
    writer.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE checkpoint_probe (id INTEGER PRIMARY KEY) STRICT;
      INSERT INTO checkpoint_probe (id) VALUES (1);
    `);
    const reader = new DatabaseSync(databasePath(dshHome));
    reader.exec('BEGIN');
    expect(reader.prepare('SELECT COUNT(*) AS count FROM checkpoint_probe').get()).toEqual({
      count: 1,
    });
    writer.exec('INSERT INTO checkpoint_probe (id) VALUES (2)');
    writer.close();

    const blocked = mountOperationalDatabase({ dshHome, schemaPlan: planWithRecords() });
    expect(blocked.mode).toBe('recovery');
    expect(blocked.recovery?.code).toBe('migration-failed');
    blocked.close();

    reader.exec('ROLLBACK');
    reader.close();
    const migrated = mountOperationalDatabase({ dshHome, schemaPlan: planWithRecords() });
    expect(migrated.mode).toBe('ready');
    expect(
      attachOperationalModule(migrated, 'probe').read((database) =>
        database.prepare('SELECT COUNT(*) AS count FROM checkpoint_probe').get(),
      ),
    ).toEqual({ count: 2 });
    migrated.close();
  });

  it('leaves the active generation untouched when activation has not published', () => {
    const dshHome = createTempRoot('botharness-db-before-publish-');
    mountOperationalDatabase({ dshHome }).close();

    const failed = mountOperationalDatabase({
      dshHome,
      schemaPlan: planWithRecords(),
      faultInjector: faultAt('before-activation'),
    });
    expect(failed.mode).toBe('recovery');
    expect(failed.recovery?.code).toBe('migration-failed');
    failed.close();

    const original = mountOperationalDatabase({ dshHome });
    expect(original.mode).toBe('ready');
    expect(original.generation).toBe(1);
    original.close();
  });

  it('recognizes an atomically published generation after an interrupted post-publish mount', () => {
    const dshHome = createTempRoot('botharness-db-after-publish-');
    mountOperationalDatabase({ dshHome }).close();

    const interrupted = mountOperationalDatabase({
      dshHome,
      schemaPlan: planWithRecords(),
      faultInjector: faultAt('after-activation'),
    });
    expect(interrupted.mode).toBe('recovery');
    interrupted.close();

    const resumed = mountOperationalDatabase({ dshHome, schemaPlan: planWithRecords() });
    expect(resumed.mode).toBe('ready');
    expect(resumed.generation).toBe(2);
    resumed.close();
  });

  it('rejects an integrity failure without publishing the staging copy', () => {
    const dshHome = createTempRoot('botharness-db-integrity-');
    mountOperationalDatabase({ dshHome }).close();

    const failed = mountOperationalDatabase({
      dshHome,
      schemaPlan: planWithRecords(),
      faultInjector(context) {
        if (context.stage === 'before-integrity-validation' && context.stagingPath !== undefined) {
          writeFileSync(context.stagingPath, 'not sqlite', 'utf8');
        }
      },
    });
    expect(failed.mode).toBe('recovery');
    expect(failed.recovery?.code).toBe('integrity-failed');
    failed.close();

    const original = mountOperationalDatabase({ dshHome });
    expect(original.mode).toBe('ready');
    expect(original.generation).toBe(1);
    original.close();
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

  it('keeps the active generation unchanged when a module migration fails', () => {
    const dshHome = createTempRoot('botharness-db-migration-failure-');
    mountOperationalDatabase({ dshHome }).close();
    const failedPlan = defineSchemaPlan([
      {
        generation: 2,
        module: 'broken-owner',
        description: 'exercise rollback',
        migrate() {
          throw new Error('migration failed');
        },
      },
    ]);

    const failed = mountOperationalDatabase({ dshHome, schemaPlan: failedPlan });
    expect(failed.mode).toBe('recovery');
    expect(failed.recovery?.code).toBe('migration-failed');
    failed.close();

    const original = mountOperationalDatabase({ dshHome });
    expect(original.mode).toBe('ready');
    expect(original.generation).toBe(1);
    original.close();
  });

  it('rejects thenable migration, read, and transaction callbacks', async () => {
    const migrationHome = createTempRoot('botharness-db-async-migration-');
    mountOperationalDatabase({ dshHome: migrationHome }).close();
    const asyncPlan = defineSchemaPlan([
      {
        generation: 2,
        module: 'async-owner',
        description: 'invalid asynchronous migration',
        async migrate() {},
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

  it('validates a complete ordered plan again at the mount seam', () => {
    const dshHome = createTempRoot('botharness-db-forged-plan-');
    mountOperationalDatabase({ dshHome }).close();
    const incompletePlan: SchemaPlan = { targetGeneration: 2, migrations: [] };

    const owner = mountOperationalDatabase({ dshHome, schemaPlan: incompletePlan });

    expect(owner.mode).toBe('recovery');
    expect(owner.recovery).toMatchObject({
      code: 'migration-failed',
      message: 'Schema plan for generation 2 is incomplete',
    });
    owner.close();
  });

  it('fails unknown newer generations with upgrade-required and never down-migrates', () => {
    const dshHome = createTempRoot('botharness-db-newer-');
    mountOperationalDatabase({ dshHome }).close();
    mutateGeneration(dshHome, 99);

    const owner = mountOperationalDatabase({ dshHome });

    expect(owner.mode).toBe('recovery');
    expect(owner.recovery).toMatchObject({ code: 'upgrade-required' });
    owner.close();
    expect(() => mutateGeneration(dshHome, 100)).not.toThrow();
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

  it('validates one monotonic complete schema plan', () => {
    expect(() =>
      defineSchemaPlan([
        {
          generation: 3,
          module: 'skips-generation-two',
          description: 'invalid',
          migrate() {},
        },
      ]),
    ).toThrow('expected 2, received 3');
    expect(() =>
      defineSchemaPlan([
        {
          generation: 2,
          module: '',
          description: 'invalid',
          migrate() {},
        },
      ]),
    ).toThrow('must name its owning module');
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
