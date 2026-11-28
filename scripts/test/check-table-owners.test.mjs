import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanTableSql } from '../table-owner-sql.mjs';

const database = 'packages/core/src/database';
const snapshot = 'scripts/schema-migrations.json';
const baseline = 'scripts/table-owner-write-baseline.json';
const manifest = 'scripts/table-owners.json';
const writer = 'packages/core/src/purge/write.ts';
const checker = new URL('../check-table-owners.mjs', import.meta.url).href;
const owners = {
  _botharness_schema: 'database',
  channels: 'channels',
  humans: 'humans',
  schema_migrations: 'database',
};
const schemaPlan = `
import { first } from './migrations.js';
export const BOT_HARNESS_SCHEMA_PLAN = { migrations: [first] };
`;
const first = `
export const first = {
  generation: 2,
  id: 'first',
  module: 'database',
  migrate(db: import('node:sqlite').DatabaseSync) {
    db.exec('CREATE TABLE channels(id INTEGER); CREATE TABLE humans(id INTEGER);');
  },
};
`;

function fixture({ existing = {}, changes = {}, update = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bh-table-owners-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe', shell: false, windowsHide: true });
  const write = (file, contents) => {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
  };
  try {
    git('init', '-q');
    for (const [file, contents] of Object.entries({
      'package.json': { type: 'module' },
      [manifest]: owners,
      [baseline]: {},
      [snapshot]: [{ id: 'first' }],
      [`${database}/schema.ts`]: `
        export const FOUNDATION_SCHEMA_GENERATION = 1;
        export const FOUNDATION_SCHEMA_ID = 'foundation';
      `,
      [`${database}/schema-plan.ts`]: schemaPlan,
      [`${database}/migrations.ts`]: first,
      'packages/core/src/channels/owner.ts': '',
      'packages/core/src/humans/owner.ts': '',
      ...existing,
    }))
      write(file, contents);
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base');
    for (const [file, contents] of Object.entries(changes)) write(file, contents);

    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { checkTableOwners } from ${JSON.stringify(checker)};
         console.log(JSON.stringify(await checkTableOwners(process.cwd(), { update: ${update} })));`,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, BASELINE_BASE: 'HEAD' },
        shell: false,
        windowsHide: true,
      },
    );
    return { ...JSON.parse(output), baseline: JSON.parse(readFileSync(join(root, baseline))) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('table owner lint', { timeout: 60_000 }, () => {
  it('rejects a missing manifest table', () => {
    const { errors } = fixture({ changes: { [manifest]: { ...owners, humans: undefined } } });
    expect(errors).toContain('scripts/table-owners.json: missing table humans');
  });

  it('rejects a new cross-owner write and ignores test files', () => {
    const { errors } = fixture({
      changes: {
        [writer]: 'db.exec("insert/* ownership */ or ignore into main.[HuMANS] values (1)")',
        'packages/core/src/channels/owner.test.ts': 'db.exec("DELETE FROM humans")',
        'packages/core/src/humans/__tests__/helper.ts': 'db.exec("DELETE FROM channels")',
      },
    });
    expect(errors).toEqual([
      expect.stringContaining(
        "purge writes humans, owned by humans; use the Table Owner's interface",
      ),
    ]);
  });

  it('rejects an unannotated dynamic target and checks an annotated target against its owner', () => {
    const sql = 'db.exec(`UPDATE ${table} SET id = 1`)';
    const { errors } = fixture({ changes: { [writer]: sql } });
    expect(errors).toEqual([expect.stringContaining('unresolved SQL write target')]);
    const annotated = fixture({ changes: { [writer]: `// table-owner-write: humans\n${sql}` } });
    expect(annotated.errors).toEqual([expect.stringContaining('purge writes humans')]);
  });

  it('rejects an appended migration altering another owner’s table after snapshot regeneration', () => {
    const { errors } = fixture({
      changes: {
        [`${database}/schema-plan.ts`]: schemaPlan.replaceAll('first', 'first, second'),
        [`${database}/migrations.ts`]: `${first}
          export const second = {
            generation: 3,
            id: 'second',
            module: 'channels',
            migrate(db) { db.exec('ALTER TABLE humans ADD COLUMN name TEXT'); },
          };
        `,
        [snapshot]: [{ id: 'first' }, { id: 'second' }],
      },
    });
    expect(errors).toEqual([
      'Migration second (channels): cannot create or alter humans; owner is humans',
    ]);
  });

  it('attributes row writes in a new migration to its module', () => {
    const migration = (sql) => ({
      [`${database}/schema-plan.ts`]: `
        import { first } from './migrations.js';
        import { second } from './migrations/second.js';
        export const BOT_HARNESS_SCHEMA_PLAN = { migrations: [first, second] };
      `,
      [`${database}/migrations/second.ts`]: `
        export const second = {
          generation: 3,
          id: 'second',
          module: 'channels',
          migrate(db) { db.exec(${JSON.stringify(sql)}); },
        };
      `,
      [snapshot]: [{ id: 'first' }, { id: 'second' }],
    });
    const own = fixture({ changes: migration('UPDATE channels SET id = id') });
    expect(own.errors).toEqual([]);
    expect(own.baseline).toEqual({});
    const other = fixture({ changes: migration('INSERT INTO humans SELECT id FROM channels') });
    expect(other.errors).toEqual([
      'Migration second (channels): cannot write rows of humans; owner is humans',
    ]);
  });

  it('rejects a hand-grown baseline and refuses to grow it with --update', () => {
    const changes = { [writer]: 'db.exec("DELETE FROM humans")' };
    const updated = fixture({ changes, update: true });
    expect(updated.errors).toEqual([expect.stringContaining('purge writes humans')]);
    expect(updated.baseline).toEqual({});
    const edited = fixture({ changes: { ...changes, [baseline]: { humans: ['purge'] } } });
    expect(edited.errors).toEqual([expect.stringContaining('baseline grew; added humans')]);
  });

  it('shrinks the baseline and reports cross-owner reads without failing', () => {
    const result = fixture({
      existing: { [writer]: 'db.exec("DELETE FROM humans")', [baseline]: { humans: ['purge'] } },
      changes: { [writer]: 'db.exec("SELECT * FROM channels JOIN humans USING (id)")' },
      update: true,
    });
    expect(result.errors).toEqual([]);
    expect(result.baseline).toEqual({});
    expect(result.reads).toEqual({ channels: ['purge'], humans: ['purge'] });
  });

  it('resolves finite literal loops and distinguishes upsert clauses from writes', () => {
    const source = [
      "for (const table of ['channels', 'humans']) db.exec(`DELETE FROM ${table}`)",
      'db.exec("REPLACE INTO humans VALUES (1)")',
      'db.exec("INSERT INTO channels VALUES (1) ON CONFLICT DO UPDATE SET id = 1")',
    ].join('\n');
    const { writes, errors } = scanTableSql(writer, source, owners);
    expect(errors).toEqual([]);
    expect([...writes.keys()].sort()).toEqual(['channels', 'humans']);
  });
});
