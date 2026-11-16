import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan, FOUNDATION_SCHEMA_ID } from '../src/database/schema.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const plan = BOT_HARNESS_SCHEMA_PLAN;
const ledger = (db: DatabaseSync) =>
  db.prepare('SELECT generation, id FROM schema_migrations ORDER BY generation').all();
const expected = [FOUNDATION_SCHEMA_ID, ...plan.migrations.map((step) => step.id)].map(
  (id, index) => ({ generation: index + 1, id }),
);

function open(home: string) {
  return trackTestOwner(mountOperationalDatabase({ dshHome: home, schemaPlan: plan }));
}

function edit(home: string, change: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(join(home, 'botharness/botharness.db'));
  try {
    change(db);
  } finally {
    db.close();
  }
}

describe('named schema migration ledger', () => {
  it('assigns frozen generations by list position and rejects duplicate or invalid ids', () => {
    const step = { id: 'second', module: 'test', description: '', migrate() {} };
    const custom = defineSchemaPlan([step, { ...step, id: 'first' }]);
    expect(custom.migrations.map(({ id, generation }) => ({ id, generation }))).toEqual([
      { id: 'second', generation: 2 },
      { id: 'first', generation: 3 },
    ]);
    step.id = 'changed-input';
    expect(custom.generationOf('second')).toBe(2);
    expect(custom.generationOf('foundation')).toBe(1);
    expect(Object.isFrozen(custom.migrations[0])).toBe(true);
    expect(() => custom.generationOf('missing')).toThrow('Unknown schema migration');
    for (const id of ['foundation', 'Bad id', '', '-bad']) {
      expect(() => defineSchemaPlan([{ ...step, id }])).toThrow('unique kebab-case');
    }
    expect(() => defineSchemaPlan([step, step])).toThrow('unique kebab-case');
  });

  it('records fresh installs and reopens without rewriting the database or rerunning migrations', () => {
    const home = createTempRoot('bh-ledger-fresh-');
    const first = open(home);
    expect(first.mode).toBe('ready');
    expect(attachOperationalModule(first, 'test').read(ledger)).toEqual(expected);
    first.close();
    const path = join(home, 'botharness/botharness.db');
    const before = readFileSync(path);
    const prepare = vi.spyOn(DatabaseSync.prototype, 'prepare');
    const second = open(home);
    const ledgerReads = prepare.mock.calls.filter(([sql]) =>
      sql.includes('SELECT generation, id FROM schema_migrations'),
    );
    prepare.mockRestore();
    expect(ledgerReads).toHaveLength(2);
    expect(second.mode).toBe('ready');
    expect(second.generation).toBe(plan.targetGeneration);
    expect(attachOperationalModule(second, 'test').read(ledger)).toEqual(expected);
    second.close();
    expect(readFileSync(path)).toEqual(before);
  });

  it.each([1, 25, 78, 116, 149, 153])(
    'backfills every applied generation from a pre-ledger generation %i',
    (generation) => {
      const home = createTempRoot('bh-ledger-old-');
      const oldPlan = defineSchemaPlan(plan.migrations.slice(0, generation - 1));
      const old = trackTestOwner(mountOperationalDatabase({ dshHome: home, schemaPlan: oldPlan }));
      expect(old.mode).toBe('ready');
      attachOperationalModule(old, 'test').transaction((db) => {
        db.exec(
          "CREATE TABLE ledger_upgrade_sentinel(value TEXT); INSERT INTO ledger_upgrade_sentinel VALUES ('kept'); DROP TABLE schema_migrations",
        );
      });
      old.close();
      const upgraded = open(home);
      expect(upgraded.mode).toBe('ready');
      expect(attachOperationalModule(upgraded, 'test').read(ledger)).toEqual(expected);
      expect(
        attachOperationalModule(upgraded, 'test').read((db) =>
          db.prepare('SELECT value FROM ledger_upgrade_sentinel').get(),
        ),
      ).toEqual({ value: 'kept' });
      upgraded.close();
    },
  );

  it('upgrades the merged invitations prefix by appending visibility and roster migrations', () => {
    const home = createTempRoot('bh-ledger-main-invitations-');
    const mainPlan = defineSchemaPlan(
      plan.migrations.slice(
        0,
        plan.migrations.findIndex((step) => step.id === 'bot-visibility'),
      ),
    );
    const previous = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: mainPlan }),
    );
    expect(previous.mode).toBe('ready');
    attachOperationalModule(previous, 'test').transaction((db) =>
      db.exec(
        "CREATE TABLE integration_sentinel(value TEXT); INSERT INTO integration_sentinel VALUES ('kept')",
      ),
    );
    previous.close();
    const upgraded = open(home);
    expect(upgraded.mode).toBe('ready');
    expect(attachOperationalModule(upgraded, 'test').read(ledger)).toEqual(expected);
    expect(
      attachOperationalModule(upgraded, 'test').read((db) =>
        db.prepare('SELECT value FROM integration_sentinel').get(),
      ),
    ).toEqual({ value: 'kept' });
    upgraded.close();
    expect(open(home).mode).toBe('ready');
  });

  it.each([false, true])(
    'preserves divergent visibility-first Profiles with invitations applied=%s',
    (includeInvitations) => {
      const home = createTempRoot('bh-ledger-visibility-first-');
      const invitations = plan.migrations.find((step) => step.id === 'channel-membership-basis')!;
      const branchSteps = plan.migrations.filter((step) => step.id !== invitations.id);
      const branchPlan = defineSchemaPlan(
        includeInvitations ? [...branchSteps, invitations] : branchSteps,
      );
      const previous = trackTestOwner(
        mountOperationalDatabase({ dshHome: home, schemaPlan: branchPlan }),
      );
      expect(previous.mode).toBe('ready');
      previous.close();
      const path = join(home, 'botharness/botharness.db');
      const before = readFileSync(path);
      const refused = open(home);
      expect(refused.mode).toBe('recovery');
      expect(refused.recovery?.code).toBe('upgrade-required');
      expect(refused.recovery?.message).toContain(
        'database id "bot-visibility", plan id "channel-membership-basis"',
      );
      refused.close();
      expect(readFileSync(path)).toEqual(before);
    },
  );

  it.each([
    'renamed',
    'reordered',
    'missing',
    'future',
    'sparse-future',
    'missing-ledger',
    'newer-generation',
  ])('refuses %s history before touching the source', (kind) => {
    const home = createTempRoot('bh-ledger-mismatch-');
    open(home).close();
    edit(home, (db) => {
      if (kind === 'renamed')
        db.exec("UPDATE schema_migrations SET id = 'another-branch' WHERE generation = 2");
      if (kind === 'reordered')
        db.exec(
          "UPDATE schema_migrations SET id = 'temporary' WHERE generation = 2; UPDATE schema_migrations SET id = 'session-ownership' WHERE generation = 3; UPDATE schema_migrations SET id = 'messaging-tracer' WHERE generation = 2",
        );
      if (kind === 'missing') db.exec('DELETE FROM schema_migrations WHERE generation = 2');
      if (kind === 'future')
        db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(
          plan.targetGeneration + 1,
          'future-branch',
        );
      if (kind === 'sparse-future')
        db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(
          plan.targetGeneration + 10,
          'future-branch',
        );
      if (kind === 'missing-ledger') db.exec('DROP TABLE schema_migrations');
      if (kind === 'newer-generation')
        db.prepare('UPDATE _botharness_schema SET generation = ?').run(plan.targetGeneration + 1);
    });
    const path = join(home, 'botharness/botharness.db');
    const before = readFileSync(path);
    const refused = open(home);
    expect(refused.mode).toBe('recovery');
    expect(refused.recovery?.code).toBe('upgrade-required');
    expect(refused.recovery?.message).toMatch(/generation \d+: database id ".*", plan id ".*"/);
    if (kind === 'sparse-future')
      expect(refused.recovery?.message).toContain('database id "future-branch"');
    if (kind === 'renamed')
      expect(refused.recovery?.message).toContain(
        'generation 2: database id "another-branch", plan id "session-ownership"',
      );
    refused.close();
    expect(readFileSync(path)).toEqual(before);
  });

  it('rolls back backfill, body and generation together on a failed staged migration', () => {
    const home = createTempRoot('bh-ledger-rollback-');
    const prefix = defineSchemaPlan(
      plan.migrations.slice(
        0,
        plan.migrations.findIndex((migration) => migration.id === 'migration-ledger'),
      ),
    );
    const old = trackTestOwner(mountOperationalDatabase({ dshHome: home, schemaPlan: prefix }));
    old.close();
    edit(home, (db) => db.exec('DROP TABLE schema_migrations'));
    const path = join(home, 'botharness/botharness.db');
    const before = readFileSync(path);
    const broken = defineSchemaPlan([
      ...prefix.migrations,
      {
        id: 'fails-after-write',
        module: 'test',
        description: '',
        migrate(db) {
          db.exec('CREATE TABLE should_not_exist(id TEXT)');
          throw new Error('injected');
        },
      },
    ]);
    const failed = trackTestOwner(mountOperationalDatabase({ dshHome: home, schemaPlan: broken }));
    expect(failed.recovery?.code).toBe('migration-failed');
    failed.close();
    expect(readFileSync(path)).toEqual(before);
    expect(open(home).mode).toBe('ready');
  });
});
