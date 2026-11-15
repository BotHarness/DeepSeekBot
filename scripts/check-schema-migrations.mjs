import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = 'packages/core/src/database/schema-plan.ts';
const SNAPSHOT = 'scripts/schema-migrations.json';
const ignored = new Set([
  'start',
  'end',
  'loc',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'comments',
  'typeAnnotation',
  'returnType',
]);

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => !ignored.has(key))
      .map((key) => [key, normalized(value[key])]),
  );
}

export function migrationSnapshot(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  const definitions = new Map();
  for (const statement of ast.program.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'VariableDeclaration') {
      for (const entry of declaration.declarations) {
        if (entry.id.type === 'Identifier') definitions.set(entry.id.name, entry.init);
      }
    } else if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
      definitions.set(declaration.id.name, declaration);
    }
  }
  const plan = definitions.get('BOT_HARNESS_SCHEMA_PLAN');
  if (
    plan?.type !== 'CallExpression' ||
    plan.callee.name !== 'defineSchemaPlan' ||
    plan.arguments[0]?.type !== 'ArrayExpression'
  ) {
    throw new Error('Expected an explicit ordered defineSchemaPlan([...]) migration list');
  }
  const ids = new Set(['foundation']);
  return plan.arguments[0].elements.map((entry) => {
    if (entry?.type !== 'Identifier')
      throw new Error('Migration list entries must name migration constants');
    const definition = definitions.get(entry.name);
    if (definition?.type !== 'ObjectExpression')
      throw new Error(`Missing migration definition ${entry.name}`);
    const property = definition.properties.find((item) => item.key?.name === 'id');
    const id = property?.value?.value;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || ids.has(id))
      throw new Error(`Invalid or duplicate migration id: ${id}`);
    if (
      definition.properties.some(
        (item) => item.type === 'SpreadElement' || item.key?.name === 'generation',
      )
    )
      throw new Error(
        `Migration ${id} must declare its id and body without a generation or spread`,
      );
    ids.add(id);
    const dependencies = new Map();
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'Identifier' &&
        definitions.has(node.name) &&
        node.name !== entry.name &&
        !dependencies.has(node.name)
      ) {
        dependencies.set(node.name, definitions.get(node.name));
        visit(definitions.get(node.name));
      }
      for (const [key, value] of Object.entries(node)) {
        if (ignored.has(key)) continue;
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    };
    visit(definition);
    const body = normalized({
      definition,
      dependencies: [...dependencies].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    });
    return { id, sha256: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
  });
}

export function checkMigrationPrefix(current, baseline) {
  const errors = [];
  baseline.forEach((entry, index) => {
    const actual = current[index];
    if (actual?.id !== entry.id)
      errors.push(
        `Migration generation ${index + 2}: expected ${entry.id}, received ${actual?.id ?? '<missing>'}; merged migrations cannot be removed, renamed or reordered`,
      );
    else if (actual.sha256 !== entry.sha256)
      errors.push(`Migration ${entry.id}: body changed; append a corrective migration instead`);
  });
  return errors;
}

export function checkSchemaMigrations(root = ROOT) {
  const current = migrationSnapshot(readFileSync(resolve(root, SOURCE), 'utf8'));
  const snapshot = JSON.parse(readFileSync(resolve(root, SNAPSHOT), 'utf8'));
  const errors = checkMigrationPrefix(current, snapshot);
  if (current.length !== snapshot.length)
    errors.push('Append new migrations to scripts/schema-migrations.json with --write-snapshot');
  const mainExists = (() => {
    try {
      execFileSync('git', ['cat-file', '-e', `origin/main:${SNAPSHOT}`], {
        cwd: root,
        stdio: 'ignore',
        windowsHide: true,
      });
      return true;
    } catch {
      return false;
    }
  })();
  if (mainExists) {
    const merged = JSON.parse(
      execFileSync('git', ['show', `origin/main:${SNAPSHOT}`], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
      }),
    );
    errors.push(...checkMigrationPrefix(snapshot, merged));
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.includes('--write-snapshot')) {
      const current = migrationSnapshot(readFileSync(resolve(ROOT, SOURCE), 'utf8'));
      let baseline = [];
      try {
        baseline = JSON.parse(readFileSync(resolve(ROOT, SNAPSHOT), 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const errors = checkMigrationPrefix(current, baseline);
      if (errors.length) throw new Error(errors.join('\n'));
      writeFileSync(resolve(ROOT, SNAPSHOT), `${JSON.stringify(current, null, 2)}\n`);
    }
    const errors = checkSchemaMigrations();
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Schema migrations: append-only ids and body hashes verified');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
