import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import {
  defineSchemaPlan,
  FOUNDATION_SCHEMA_GENERATION,
  FOUNDATION_SCHEMA_PLAN,
  type SchemaPlan,
  type SchemaMigration,
} from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { planWithRecords, databasePath, faultAt } from './support/operational-database.js';

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

  it.each([73, 86, 87, 88])(
    'upgrades generation %s without changing QQ and WeChat reception authority',
    (generation) => {
      const dshHome = createTempRoot('botharness-qq-main-upgrade-');
      const priorPlan = defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter(
          (migration) => migration.generation <= generation,
        ),
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
      expect(readBindings(upgraded)).toEqual(
        before.map((row) => ({ ...row, post_limit: 60, post_limit_revision: 1 })),
      );
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
      expect(readBindings(reopened)).toEqual(
        before.map((row) => ({ ...row, post_limit: 60, post_limit_revision: 1 })),
      );
      expect(
        attachOperationalModule(reopened, 'qq-main-upgrade-reopen').read((database) =>
          database.prepare('SELECT body FROM messaging_reception_history').all(),
        ),
      ).toEqual([{ body: '[]' }]);
      reopened.close();
    },
  );

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
    expect(prior.generation).toBe(
      BOT_HARNESS_SCHEMA_PLAN.generationOf('discord-platform-defaults'),
    );
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

  it('migrates an isolated copy and atomically activates a validated generation', () => {
    const dshHome = createTempRoot('botharness-db-migrate-');
    const foundation = mountOperationalDatabase({ dshHome });
    foundation.close();

    const owner = mountOperationalDatabase({ dshHome, schemaPlan: planWithRecords() });
    const records = attachOperationalModule(owner, 'test-records');

    expect(owner.mode).toBe('ready');
    expect(owner.generation).toBe(planWithRecords().targetGeneration);
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
    expect(original.generation).toBe(FOUNDATION_SCHEMA_GENERATION);
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
    expect(resumed.generation).toBe(planWithRecords().targetGeneration);
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
    expect(original.generation).toBe(FOUNDATION_SCHEMA_GENERATION);
    original.close();
  });

  function parentChildPlan(extra: readonly SchemaMigration[] = []): SchemaPlan {
    return defineSchemaPlan([
      {
        id: 'test-step-2',
        module: 'test-records',
        description: 'create a parent and a referencing child table',
        migrate(database) {
          database.exec(`
            CREATE TABLE test_parents (id INTEGER PRIMARY KEY) STRICT;
            CREATE TABLE test_children (
              id INTEGER PRIMARY KEY,
              parent_id INTEGER NOT NULL REFERENCES test_parents(id)
            ) STRICT;
          `);
        },
      },
      ...extra,
    ]);
  }

  function orphanChildrenOutsideHost(dshHome: string, plan: SchemaPlan): void {
    const owner = mountOperationalDatabase({ dshHome, schemaPlan: plan });
    attachOperationalModule(owner, 'test-records').transaction((database) => {
      database.exec(
        'INSERT INTO test_parents VALUES (1); INSERT INTO test_children VALUES (1, 1), (2, 1)',
      );
    });
    owner.close();
    const external = new DatabaseSync(databasePath(dshHome), {
      enableForeignKeyConstraints: false,
    });
    external.exec('DELETE FROM test_parents');
    external.close();
  }

  it('mounts a database with orphaned rows left by an external writer and reports them', () => {
    const dshHome = createTempRoot('botharness-db-orphans-');
    const plan = parentChildPlan();
    orphanChildrenOutsideHost(dshHome, plan);

    const owner = mountOperationalDatabase({ dshHome, schemaPlan: plan });
    expect(owner.mode).toBe('ready');
    expect(owner.foreignKeyOrphans).toBe('test_children -> test_parents x2');
    expect(owner.diagnostics().foreignKeyOrphans).toBe('test_children -> test_parents x2');
    const port = attachOperationalModule(owner, 'test-records');
    expect(() =>
      port.transaction((database) => database.exec('INSERT INTO test_children VALUES (3, 9)')),
    ).toThrow();
    owner.close();
  });

  it('carries existing orphans through a migration but rejects orphans it creates', () => {
    const dshHome = createTempRoot('botharness-db-orphan-migration-');
    orphanChildrenOutsideHost(dshHome, parentChildPlan());

    const keeps = parentChildPlan([
      {
        id: 'test-step-3',
        module: 'test-records',
        description: 'rebuild the child table',
        rebuildsReferencedTables: true,
        migrate(database) {
          database.exec(`
            CREATE TABLE test_children_next (
              id INTEGER PRIMARY KEY,
              parent_id INTEGER NOT NULL REFERENCES test_parents(id),
              note TEXT
            ) STRICT;
            INSERT INTO test_children_next (id, parent_id) SELECT id, parent_id FROM test_children;
            DROP TABLE test_children;
            ALTER TABLE test_children_next RENAME TO test_children;
          `);
        },
      },
    ]);
    const migrated = mountOperationalDatabase({ dshHome, schemaPlan: keeps });
    expect(migrated.mode).toBe('ready');
    expect(migrated.generation).toBe(keeps.targetGeneration);
    expect(migrated.foreignKeyOrphans).toBe('test_children -> test_parents x2');
    migrated.close();

    const orphaning = defineSchemaPlan([
      ...keeps.migrations,
      {
        id: 'test-step-4',
        module: 'test-records',
        description: 'orphan one more child',
        rebuildsReferencedTables: true,
        migrate(database) {
          database.exec('INSERT INTO test_children (id, parent_id) VALUES (3, 7)');
        },
      },
    ]);
    const failed = mountOperationalDatabase({ dshHome, schemaPlan: orphaning });
    expect(failed.recovery).toEqual({
      code: 'integrity-failed',
      message: 'SQLite foreign key check failed: test_children -> test_parents x3',
    });
    expect(() => attachOperationalModule(failed, 'test-records').read(() => 1)).toThrow(
      'Operational database is in recovery mode: integrity-failed (SQLite foreign key check failed: test_children -> test_parents x3)',
    );
    failed.close();
    const resumed = mountOperationalDatabase({ dshHome, schemaPlan: keeps });
    expect(resumed.generation).toBe(keeps.targetGeneration);
    resumed.close();
  });

  it('keeps the active generation unchanged when a module migration fails', () => {
    const dshHome = createTempRoot('botharness-db-migration-failure-');
    mountOperationalDatabase({ dshHome }).close();
    const failedPlan = defineSchemaPlan([
      {
        id: 'test-step-6',
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
    expect(original.generation).toBe(FOUNDATION_SCHEMA_GENERATION);
    original.close();
  });

  it('validates a complete ordered plan again at the mount seam', () => {
    const dshHome = createTempRoot('botharness-db-forged-plan-');
    mountOperationalDatabase({ dshHome }).close();
    const incompletePlan: SchemaPlan = {
      ...FOUNDATION_SCHEMA_PLAN,
      targetGeneration: 2,
      migrations: [],
    };

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

  it('validates one monotonic complete schema plan', () => {
    expect(() =>
      defineSchemaPlan([
        {
          id: 'Invalid ID',
          module: 'invalid-id',
          description: 'invalid',
          migrate() {},
        },
      ]),
    ).toThrow('unique kebab-case');
    expect(() =>
      defineSchemaPlan([
        {
          id: 'test-step-9',
          module: '',
          description: 'invalid',
          migrate() {},
        },
      ]),
    ).toThrow('must name its owning module');
  });
});
