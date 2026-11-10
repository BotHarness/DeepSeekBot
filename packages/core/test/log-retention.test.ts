import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, expect, it, vi } from 'vitest';

import { LOG_DB_FILENAME, openLogDatabase, type LogEntryInput } from '../src/logs/log-db.js';

const directories: string[] = [];
const entry = {
  plugin: 'retention',
  owner: 'profile-shared',
  kind: 'test',
  detail: 'row',
} satisfies LogEntryInput;

function directory(): string {
  const dir = mkdtempSync(join(tmpdir(), 'botharness-retention-'));
  directories.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('keeps exactly the latest 50,000 insertion IDs across gaps, batches and reopen using an indexed delete', () => {
  const dir = directory();
  const logs = openLogDatabase({ dir, now: () => 1000 });
  const database = new DatabaseSync(join(dir, LOG_DB_FILENAME));
  try {
    database.exec(`
      WITH RECURSIVE numbers(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM numbers WHERE n < 50000)
      INSERT INTO log_entries (id, ts, plugin, owner, kind, detail)
      SELECT n * 3, 1000 - n % 2, 'retention', 'profile-shared', 'test', 'seed' FROM numbers;
    `);
    const prepare = vi.spyOn(DatabaseSync.prototype, 'prepare');
    logs.write(entry);
    const statements = prepare.mock.calls.map(([sql]) => sql);
    prepare.mockRestore();
    const rowDelete = statements.find((sql) => sql.startsWith('DELETE FROM log_entries WHERE id'));
    expect(rowDelete).toBeDefined();
    if (rowDelete === undefined) throw new Error('No row retention operation');
    const plan = database.prepare(`EXPLAIN QUERY PLAN ${rowDelete}`).all(50_000);
    expect(plan[0]?.detail).toMatch(/SEARCH log_entries USING INTEGER PRIMARY KEY/);
    const bounds = () =>
      database
        .prepare('SELECT count(*) AS count, min(id) AS first, max(id) AS last FROM log_entries')
        .get();
    expect(bounds()).toEqual({ count: 50_000, first: 6, last: 150_001 });
    logs.writeMany([entry, entry]);
    expect(bounds()).toEqual({ count: 50_000, first: 12, last: 150_003 });
    logs.close();
    logs.write(entry);
    expect(bounds()).toEqual({ count: 50_000, first: 15, last: 150_004 });
  } finally {
    logs.close();
    database.close();
  }
});

it('preserves the strict age boundary and the distinct single-entry and batch clocks', () => {
  const dir = directory();
  const logs = openLogDatabase({ dir, now: () => 1000, maxAgeMs: 100, maxRows: 3 });
  try {
    logs.write({ ...entry, detail: 'before', ts: 899 });
    logs.write({ ...entry, detail: 'boundary', ts: 900 });
    logs.write({ ...entry, detail: 'late arrival', ts: 950 });
    expect(logs.query().map((row) => row.detail)).toEqual(['late arrival', 'boundary', 'before']);
    logs.writeMany([{ ...entry, detail: 'batch', ts: 900 }]);
    expect(logs.query().map((row) => row.detail)).toEqual(['late arrival', 'batch', 'boundary']);
    logs.writeMany([{ ...entry, detail: 'older inserted last', ts: 900 }]);
    expect(logs.query().map((row) => row.detail)).toEqual([
      'late arrival',
      'older inserted last',
      'batch',
    ]);
  } finally {
    logs.close();
  }
});

it.each([0, -1, -5])('preserves SQLite LIMIT behavior for maxRows=%i', (maxRows) => {
  const logs = openLogDatabase({ dir: directory(), now: () => 1000, maxRows });
  try {
    logs.write(entry);
    logs.writeMany([entry, entry]);
    expect(logs.query()).toHaveLength(maxRows === 0 ? 0 : 3);
  } finally {
    logs.close();
  }
});

it('rolls back a batch and its retention when pruning fails on both attempts, then accepts a later retry', () => {
  const dir = directory();
  const logs = openLogDatabase({ dir, now: () => 1000, maxRows: 2 });
  const database = new DatabaseSync(join(dir, LOG_DB_FILENAME));
  try {
    logs.writeMany([
      { ...entry, detail: 'one' },
      { ...entry, detail: 'two' },
    ]);
    database.exec(
      "CREATE TRIGGER fail_prune BEFORE DELETE ON log_entries BEGIN SELECT RAISE(ABORT, 'fixture prune failure'); END",
    );
    expect(() => logs.writeMany([{ ...entry, detail: 'three' }])).toThrow('fixture prune failure');
    expect(logs.query().map((row) => row.detail)).toEqual(['two', 'one']);
    database.exec('DROP TRIGGER fail_prune');
    logs.writeMany([{ ...entry, detail: 'three' }]);
    expect(logs.query().map((row) => row.detail)).toEqual(['three', 'two']);
    expect(() => logs.writeMany([entry, { ...entry, payload: 'not JSON' }])).toThrow();
    expect(logs.query().map((row) => row.detail)).toEqual(['three', 'two']);
  } finally {
    logs.close();
    database.close();
  }
});
