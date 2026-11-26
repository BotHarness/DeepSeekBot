import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { mountOperationalDatabase, OPERATIONAL_DATABASE_FILENAME } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan, FOUNDATION_SCHEMA_ID } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';

type Row = Record<string, SQLOutputValue>;

interface Table {
  columns: string[];
  primaryKey: string[];
  rows: Row[];
}

const plan = BOT_HARNESS_SCHEMA_PLAN;
const fixtureDirectory = new URL('./fixtures/release-upgrade/', import.meta.url);
const fixtures = readdirSync(fixtureDirectory).filter((name) =>
  /^v\d+\.\d+\.\d+\.db\.gz$/u.test(name),
);
const ledger = [
  { generation: 1, id: FOUNDATION_SCHEMA_ID },
  ...plan.migrations.map(({ generation, id }) => ({ generation, id })),
];

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function rows(database: DatabaseSync, table: string, { columns, primaryKey }: Table): Row[] {
  const order = primaryKey.length > 0 ? primaryKey.map(quote).join(', ') : 'rowid';
  return database
    .prepare(`SELECT ${columns.map(quote).join(', ')} FROM ${quote(table)} ORDER BY ${order}`)
    .all();
}

function snapshot(path: string) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    expect(database.prepare('PRAGMA integrity_check').all()).toEqual([{ integrity_check: 'ok' }]);
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const tables = new Map<string, Table>();
    for (const { name } of database
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
      .all()) {
      const tableName = String(name);
      const info = database.prepare(`PRAGMA table_info(${quote(tableName)})`).all();
      const table = {
        columns: info.map((column) => String(column.name)),
        primaryKey: info
          .filter((column) => Number(column.pk) > 0)
          .sort((left, right) => Number(left.pk) - Number(right.pk))
          .map((column) => String(column.name)),
        rows: [],
      } satisfies Table;
      tables.set(tableName, { ...table, rows: rows(database, tableName, table) });
    }
    const generation = Number(
      database.prepare('SELECT generation FROM _botharness_schema').get()?.generation,
    );
    return { generation, tables };
  } finally {
    database.close();
  }
}

function expectedRows(name: string, table: Table, generation: number, groupChanges: number): Row[] {
  return table.rows.map((row) => {
    if (name === 'persona_bots' && generation < plan.generationOf('private-bots')) {
      const persona = JSON.parse(String(row.body));
      return { ...row, body: JSON.stringify({ ...persona, ownerHumanId: 'local-human' }) };
    }
    if (name === 'channel_records' && generation < plan.generationOf('member-lifecycle')) {
      const channel = JSON.parse(String(row.record_json));
      if (channel.type === 'group' && !channel.ownerBotSlug) {
        return { ...row, record_json: JSON.stringify({ ...channel, ownerHumanId: 'local-human' }) };
      }
    }
    if (name === 'model_presets' && generation < plan.generationOf('model-preset-sub-choices')) {
      const preset = JSON.parse(String(row.body));
      const { provider, model } = preset.assignmentDefault;
      const target = { kind: 'model', provider, model };
      const sub = {
        choices: [{ provider, model, allowedEfforts: [''], defaultEffort: '', kind: 'model' }],
        default: target,
      };
      return { ...row, body: JSON.stringify({ ...preset, sub }) };
    }
    if (name === 'sqlite_sequence' && row.name === 'channel_changes') {
      return { ...row, seq: Number(row.seq) + groupChanges };
    }
    return row;
  });
}

function assertPreserved(
  path: string,
  before: ReturnType<typeof snapshot>,
  after: ReturnType<typeof snapshot>,
) {
  const legacyGroupBackfill = before.generation < plan.generationOf('member-lifecycle');
  const group = 'group-upgrade-fixture';
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    if (legacyGroupBackfill) {
      const change = database
        .prepare(
          'SELECT channel_id, kind, message_id FROM channel_changes ORDER BY seq DESC LIMIT 1',
        )
        .get();
      expect(change).toEqual({ channel_id: group, kind: 'channel', message_id: null });
    }
    for (const [name, table] of before.tables) {
      const upgraded = after.tables.get(name);
      expect(upgraded, name).toBeDefined();
      if (name === '_botharness_schema' || name === 'schema_migrations' || upgraded === undefined)
        continue;
      if (/_fts_(data|idx)$/.test(name)) continue;
      const expected = expectedRows(name, table, before.generation, Number(legacyGroupBackfill));
      if (name === 'sqlite_sequence' && !before.tables.has('channel_changes')) {
        expected.push({ name: 'channel_changes', seq: 1 });
      }
      if (expected.length === 0) {
        expect(upgraded.rows, name).toEqual([]);
        continue;
      }
      const actual = rows(database, name, table);
      const appended = name === 'channel_changes' && legacyGroupBackfill ? 1 : 0;
      expect(actual, name).toHaveLength(expected.length + appended);
      expect(actual.slice(0, expected.length), name).toEqual(expected);
    }
  } finally {
    database.close();
  }
  if (before.tables.has('inbox_history_fts')) {
    const writable = new DatabaseSync(path);
    try {
      writable.exec(
        "INSERT INTO inbox_history_fts(inbox_history_fts, rank) VALUES ('integrity-check', 1)",
      );
    } finally {
      writable.close();
    }
  }
}

describe('operational database upgrades from npm releases', () => {
  it('tracks the latest release and an older release', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2);
  });

  it.each(fixtures)('preserves published data from %s and opens again at head', (fixture) => {
    const home = createTempRoot('bh-release-database-');
    const directory = join(home, 'botharness');
    mkdirSync(directory);
    const path = join(directory, OPERATIONAL_DATABASE_FILENAME);
    writeFileSync(path, gunzipSync(readFileSync(new URL(fixture, fixtureDirectory))));

    const before = snapshot(path);
    expect(before.generation).toBeGreaterThan(1);
    expect(before.generation).toBeLessThanOrEqual(plan.targetGeneration);
    for (const name of [
      'persona_bots',
      'channel_records',
      'channel_placements',
      'source_events',
      'session_ownership',
      'bot_schedules',
      'model_presets',
      'tool_approval_rules',
      'usage_daily',
    ]) {
      expect(before.tables.get(name)?.rows.length, name).toBeGreaterThan(0);
    }
    const prefix = ledger.slice(0, before.generation);
    const originalLedger = before.tables.get('schema_migrations')?.rows;
    if (originalLedger === undefined) {
      expect(before.generation).toBeLessThan(plan.generationOf('migration-ledger'));
    } else {
      expect(originalLedger).toEqual(prefix);
    }

    const calls: string[] = [];
    const schemaPlan = defineSchemaPlan(
      plan.migrations.map((migration) => ({
        ...migration,
        migrate(database) {
          calls.push(migration.id);
          migration.migrate(database);
        },
      })),
    );
    const mount = () => {
      const owner = mountOperationalDatabase({ dshHome: home, schemaPlan });
      try {
        expect(owner.mode, JSON.stringify(owner.recovery)).toBe('ready');
        expect(owner.generation).toBe(plan.targetGeneration);
      } finally {
        owner.close();
      }
    };
    mount();

    const suffix = ledger.slice(before.generation);
    expect(calls).toEqual(suffix.map(({ id }) => id));
    const after = snapshot(path);
    expect(after.tables.get('schema_migrations')?.rows).toEqual([
      ...(originalLedger ?? prefix),
      ...suffix,
    ]);
    assertPreserved(path, before, after);

    calls.length = 0;
    mount();
    expect(calls).toEqual([]);
    expect(snapshot(path)).toEqual(after);
  });
});
