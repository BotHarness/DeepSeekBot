import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORE_SOURCE, isCoreDomain } from './core-layer-order.mjs';
import { replaySchema } from './replay-schema.mjs';
import { isTableOwnerSource, scanTableSql } from './table-owner-sql.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OWNERS = 'scripts/table-owners.json';
const BASELINE = 'scripts/table-owner-write-baseline.json';
const SNAPSHOT = 'scripts/schema-migrations.json';
const UPDATE = 'node scripts/check-table-owners.mjs --update';
const plannedOwners = new Set(['inbox', 'approvals']);
const infrastructureTables = new Set(['_botharness_schema', 'schema_migrations']);

function writerModule(file) {
  const [, pkg, , directory, feature, ...rest] = file.split('/');
  if (pkg !== 'core') return `packages/${pkg}`;
  if (directory === 'features' && rest.length) return `features/${feature}`;
  return directory;
}

function gitOptions(root) {
  return { cwd: root, encoding: 'utf8', windowsHide: true, shell: false };
}

function scanSources(sources, owners) {
  const writes = new Map();
  const reads = new Map();
  const errors = [];
  for (const [file, source] of sources) {
    const writer = writerModule(file);
    const access = scanTableSql(file, source, owners);
    errors.push(...access.errors);
    for (const [table, line] of access.writes) {
      if (owners[table] === writer) continue;
      if (!writes.has(table)) writes.set(table, new Map());
      writes.get(table).set(writer, `${file}:${line}`);
    }
    for (const table of access.reads) {
      if (owners[table] === writer) continue;
      if (!reads.has(table)) reads.set(table, new Set());
      reads.get(table).add(writer);
    }
  }
  return { writes, reads, errors };
}

function* worktreeSources(root) {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'packages'],
    gitOptions(root),
  );
  for (const file of new Set(files.split('\0'))) {
    const path = resolve(root, file);
    if (isTableOwnerSource(file) && existsSync(path)) yield [file, readFileSync(path, 'utf8')];
  }
}

function* baseSources(root, base) {
  const tree = execFileSync('git', ['ls-tree', '-rz', base, '--', 'packages'], gitOptions(root));
  const files = tree.split('\0').flatMap((entry) => {
    const tab = entry.indexOf('\t');
    const [mode, type, oid] = entry.slice(0, tab).split(' ');
    const file = entry.slice(tab + 1);
    return type === 'blob' && mode !== '120000' && isTableOwnerSource(file) ? [{ file, oid }] : [];
  });
  if (!files.length) return;
  const blobs = execFileSync('git', ['cat-file', '--batch'], {
    ...gitOptions(root),
    encoding: null,
    input: `${files.map(({ oid }) => oid).join('\n')}\n`,
    maxBuffer: 64 * 1024 * 1024,
  });
  let offset = 0;
  for (const { file, oid } of files) {
    const headerEnd = blobs.indexOf(10, offset);
    const [blob, type, size] = blobs.toString('utf8', offset, headerEnd).split(' ');
    if (blob !== oid || type !== 'blob') throw new Error(`${base}:${file}: expected a Git blob`);
    const end = headerEnd + 1 + Number(size);
    yield [file, blobs.toString('utf8', headerEnd + 1, end)];
    offset = end + 1;
  }
}

function readAtBase(root, base, file) {
  const result = spawnSync('git', ['show', `${base}:${file}`], gitOptions(root));
  if (result.status === 0) return JSON.parse(result.stdout);
  if (/does not exist in|exists on disk, but not in/u.test(result.stderr)) return undefined;
  throw new Error(
    `${file}: cannot read ${base}; fetch it or set BASELINE_BASE to the PR base commit`,
  );
}

function inventory(access) {
  return Object.fromEntries(
    [...access.keys()].sort().map((table) => [table, [...access.get(table).keys()].sort()]),
  );
}

function* addedPairs(current, previous) {
  for (const [table, writers] of Object.entries(current)) {
    for (const writer of writers) {
      if (!Object.hasOwn(previous, table) || !previous[table].includes(writer))
        yield [table, writer];
    }
  }
}

function checkCoverage(root, tables, owners) {
  const errors = [];
  const directories = new Set(
    readdirSync(resolve(root, CORE_SOURCE), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
  for (const table of tables) {
    if (!Object.hasOwn(owners, table)) errors.push(`${OWNERS}: missing table ${table}`);
  }
  for (const [table, owner] of Object.entries(owners)) {
    if (!tables.includes(table)) errors.push(`${OWNERS}: unknown table ${table}`);
    if (infrastructureTables.has(table) && owner === 'database') continue;
    if (!plannedOwners.has(owner) && !(directories.has(owner) && isCoreDomain(owner)))
      errors.push(`${OWNERS}: ${table} must name a core domain directory, got ${owner}`);
    if (table.startsWith('inbox_history_fts_') && owner !== owners.inbox_history_fts)
      errors.push(`${OWNERS}: ${table} must share the inbox_history_fts owner`);
  }
  return errors;
}

export async function checkTableOwners(root = ROOT, { update = false } = {}) {
  const owners = JSON.parse(readFileSync(resolve(root, OWNERS), 'utf8'));
  const { tables, migrations } = await replaySchema(root);
  const errors = checkCoverage(root, tables, owners);
  const requested = process.env.BASELINE_BASE;
  const base = !requested ? 'origin/main' : /^0+$/u.test(requested) ? 'HEAD^' : requested;
  const baselineAt = resolve(root, BASELINE);
  const local = existsSync(baselineAt) ? JSON.parse(readFileSync(baselineAt, 'utf8')) : undefined;
  let baseBaseline;
  let baseSnapshot;
  try {
    baseSnapshot = readAtBase(root, base, SNAPSHOT);
    baseBaseline = readAtBase(root, base, BASELINE);
    if (baseBaseline === undefined)
      baseBaseline = inventory(scanSources(baseSources(root, base), owners).writes);
  } catch (error) {
    if (requested || !local) errors.push(error.message);
    else console.warn(`warning: ${error.message}`);
  }

  const committed = new Set(
    (baseSnapshot ?? JSON.parse(readFileSync(resolve(root, SNAPSHOT), 'utf8'))).map(({ id }) => id),
  );
  for (const migration of migrations) {
    if (committed.has(migration.id)) continue;
    for (const table of migration.tables) {
      if (owners[table] !== migration.module)
        errors.push(
          `Migration ${migration.id} (${migration.module}): cannot create or alter ${table}; owner is ${owners[table] ?? '<unregistered>'}`,
        );
    }
  }

  const { writes, reads, errors: scanErrors } = scanSources(worktreeSources(root), owners);
  errors.push(...scanErrors);
  const current = inventory(writes);
  if (!local && !update) errors.push(`${BASELINE}: missing; run ${UPDATE}`);
  if (baseBaseline && local) {
    for (const [table, writer] of addedPairs(local, baseBaseline))
      errors.push(`${BASELINE}: baseline grew; added ${table} ← ${writer}`);
  }
  const cap = local ?? baseBaseline ?? {};
  for (const [table, writer] of addedPairs(current, cap))
    errors.push(
      `${writes.get(table).get(writer)}: ${writer} writes ${table}, owned by ${owners[table]}; use the Table Owner's interface`,
    );
  if (!update) {
    for (const [table, writer] of addedPairs(cap, current))
      errors.push(`${BASELINE}: remove ${table} ← ${writer} with ${UPDATE}`);
  } else if (errors.length === 0) {
    writeFileSync(baselineAt, `${JSON.stringify(current, null, 2)}\n`);
  }

  return { errors, reads: inventory(reads), tables: tables.length, writes: pairCount(current) };
}

function pairCount(records) {
  return Object.values(records).reduce((count, modules) => count + modules.length, 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { errors, reads, tables, writes } = await checkTableOwners(ROOT, {
      update: process.argv.includes('--update'),
    });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Table owners: ${tables} tables, ${writes} cross-owner write pairs`);
    console.log(`Cross-owner reads (informational): ${pairCount(reads)} pairs`);
    for (const [table, modules] of Object.entries(reads))
      console.log(`  ${table} ← ${modules.join(', ')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
