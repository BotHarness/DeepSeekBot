import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

const database = 'packages/core/src/database';
const sharedHelper =
  "const createSql = 'CREATE TABLE sample(id TEXT)';\nfunction helper(db) { db.exec(createSql); }";
const first =
  "const FIRST = { id: 'first', module: 'test', description: 'first', migrate(db) { helper(db); } };";
const second =
  "const SECOND = { id: 'second', module: 'test', description: 'second', migrate(db) {} };";
const plan = 'export const BOT_HARNESS_SCHEMA_PLAN = defineSchemaPlan([FIRST, SECOND]);';
const splitBaseline = migrationSnapshot([sharedHelper, first, second, plan].join('\n'));
const splitPlan = "import { FIRST, SECOND } from './migrations/sample.js';\n" + plan;
const splitMigrations = `export ${first}\nexport ${second}`;
const withSharedHelper = `import { helper } from './shared.ts';\n${splitMigrations}`;

function checkSplitPlan({
  schemaPlan = splitPlan,
  migrations = withSharedHelper,
  shared = `${sharedHelper}\nexport { helper };`,
  extraFiles = {},
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bh-split-migrations-'));
  try {
    const files = {
      [`${database}/schema-plan.ts`]: schemaPlan,
      [`${database}/migrations/sample.ts`]: migrations,
      [`${database}/migrations/shared.ts`]: shared,
      'scripts/schema-migrations.json': JSON.stringify(splitBaseline),
      ...extraFiles,
    };
    for (const [relativePath, contents] of Object.entries(files)) {
      const path = join(root, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    }
    return checkSchemaMigrations(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

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
      execFileSync('git', args, { cwd: root, stdio: 'pipe', windowsHide: true, shell: false });
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

describe('split migration modules', () => {
  it('keeps the hash when moving a migration and its local helpers verbatim', () => {
    expect(checkSplitPlan({ migrations: `${sharedHelper}\n${splitMigrations}` })).toEqual([]);
  });

  it('keeps the hash when a migration imports a helper with its own local dependency', () => {
    expect(checkSplitPlan()).toEqual([]);
  });

  it('rejects a changed migration body', () => {
    expect(
      checkSplitPlan({
        migrations: withSharedHelper.replace('helper(db);', 'db.exec("SELECT 1");'),
      }),
    ).toEqual(['Migration first: body changed; append a corrective migration instead']);
  });

  it('rejects a SQL change in a shared helper dependency', () => {
    expect(
      checkSplitPlan({ shared: `${sharedHelper.replace('TEXT', 'INTEGER')}\nexport { helper };` }),
    ).toEqual(['Migration first: body changed; append a corrective migration instead']);
  });

  it.each([
    ['reordered', 'SECOND, FIRST', 'expected first, received second'],
    ['removed', 'FIRST', 'expected second, received <missing>'],
  ])('rejects a %s migration', (_, list, error) => {
    expect(checkSplitPlan({ schemaPlan: splitPlan.replace('FIRST, SECOND]', `${list}]`) })).toEqual(
      expect.arrayContaining([expect.stringContaining(error)]),
    );
  });

  it('rejects a migration imported from outside the database directory', () => {
    expect(() =>
      checkSplitPlan({
        schemaPlan: splitPlan.replace('./migrations/sample.js', '../database-other/sample.js'),
        extraFiles: { 'packages/core/src/database-other/sample.ts': splitMigrations },
      }),
    ).toThrow('must be imported from packages/core/src/database/');
  });

  it('rejects migration re-exports without a local definition', () => {
    expect(() =>
      checkSplitPlan({
        migrations: "export { FIRST, SECOND } from './shared.js';",
        shared: splitMigrations,
      }),
    ).toThrow('Cannot resolve FIRST to a local export');
  });

  it.each(['import "../schema-plan.js";', 'import "./shared.ts";'])(
    'rejects a migration module that leads back to the plan through %s',
    (cycle) => {
      expect(() =>
        checkSplitPlan({
          migrations: `${cycle}\n${sharedHelper}\n${splitMigrations}`,
          shared: 'import "../schema-plan.ts";',
        }),
      ).toThrow('Circular import of schema-plan.ts');
    },
  );

  it.each(['...OTHER', 'migrations["FIRST"]', 'FIRST()'])(
    'rejects %s as a list element',
    (entry) => {
      expect(() =>
        checkSplitPlan({ schemaPlan: splitPlan.replace('[FIRST, SECOND]', `[${entry}, SECOND]`) }),
      ).toThrow('Migration list entries must name migration constants');
    },
  );
});
