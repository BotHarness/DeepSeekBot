import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  checkMigrationPrefix,
  checkSchemaMigrations,
  migrationSnapshot,
} from '../check-schema-migrations.mjs';

const source = `
const helper = (db) => db.exec('CREATE TABLE sample(id TEXT)');
const FIRST = { id: 'first', module: 'test', description: 'first', migrate(db) { helper(db); } };
const SECOND = { id: 'second', module: 'test', description: 'second', migrate(db) {} };
export const BOT_HARNESS_SCHEMA_PLAN = defineSchemaPlan([FIRST, SECOND]);
`;
const baseline = migrationSnapshot(source);

describe('append-only migration guard', () => {
  it('passes the real committed snapshot, including M13, and preserves the historical execution order', () => {
    expect(checkSchemaMigrations()).toEqual([]);
    const snapshot = JSON.parse(
      readFileSync(new URL('../schema-migrations.json', import.meta.url), 'utf8'),
    );
    expect(snapshot.findIndex((entry) => entry.id === 'migration-ledger')).toBe(
      snapshot.findIndex((entry) => entry.id === 'minimal-member') + 1,
    );
    expect(snapshot[0].id).toBe('session-ownership');
  });
  it('checks the merged snapshot even when source and local hashes are edited together', () => {
    const root = mkdtempSync(join(tmpdir(), 'bh-migration-guard-'));
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, stdio: 'pipe', windowsHide: true });
    try {
      mkdirSync(join(root, 'packages/core/src/database'), { recursive: true });
      mkdirSync(join(root, 'scripts'));
      writeFileSync(join(root, 'packages/core/src/database/schema-plan.ts'), source);
      writeFileSync(join(root, 'scripts/schema-migrations.json'), JSON.stringify(baseline));
      git('init');
      git('add', '.');
      git(
        '-c',
        'user.name=Schema test',
        '-c',
        'user.email=schema@example.test',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        'baseline',
      );
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      const changed = source.replace('id TEXT', 'id INTEGER');
      writeFileSync(join(root, 'packages/core/src/database/schema-plan.ts'), changed);
      writeFileSync(
        join(root, 'scripts/schema-migrations.json'),
        JSON.stringify(migrationSnapshot(changed)),
      );
      expect(checkSchemaMigrations(root).join('\n')).toContain('body changed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows only appends', () => {
    expect(checkMigrationPrefix([...baseline, { id: 'third', sha256: 'new' }], baseline)).toEqual(
      [],
    );
    for (const altered of [
      baseline.slice(1),
      [...baseline].reverse(),
      [{ ...baseline[0], id: 'renamed' }, baseline[1]],
    ]) {
      expect(checkMigrationPrefix(altered, baseline).join('\n')).toContain(
        'cannot be removed, renamed or reordered',
      );
    }
  });
  it('ignores comments and source formatting while guarding bodies and local helper bodies', () => {
    expect(
      migrationSnapshot(source.replace('helper(db);', '/* explanation */ helper ( db );')),
    ).toEqual(baseline);
    for (const altered of [
      source.replace('helper(db);', "db.exec('DROP TABLE sample');"),
      source.replace('id TEXT', 'id INTEGER'),
    ]) {
      expect(checkMigrationPrefix(migrationSnapshot(altered), baseline).join('\n')).toContain(
        'body changed',
      );
    }
  });
  it('rejects duplicate, invalid and foundation ids, numbers, hidden spreads and nonliteral lists', () => {
    for (const altered of [
      source.replace("id: 'second'", "id: 'first'"),
      source.replace("id: 'first'", "id: 'Bad id'"),
      source.replace("id: 'first'", "id: 'foundation'"),
      source.replace("id: 'first'", "generation: 2, id: 'first'"),
      source.replace("id: 'first'", "...hidden, id: 'first'"),
      source.replace('[FIRST, SECOND]', '[...OTHER]'),
    ])
      expect(() => migrationSnapshot(altered)).toThrow();
  });
});
