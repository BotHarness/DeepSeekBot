import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = 'packages/core/src/database/schema-plan.ts';
const SNAPSHOT = 'scripts/schema-migrations.json';
const historicalExternalImports = new Map([
  ['inbox-history-index.ts', new Set(['INBOX_HISTORY_INDEX_SQL', 'MESSAGE_SEARCH_INDEX_SQL'])],
  ['owner.ts', new Set(['OperationalDatabaseError'])],
]);
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

function parseModule(source, path) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
  const definitions = new Map();
  const imports = new Map();
  const exports = new Map();
  const moduleRequests = new Set();
  for (const statement of ast.program.body) {
    if (statement.source) moduleRequests.add(statement.source.value);
    if (statement.type === 'ImportDeclaration' && statement.importKind !== 'type') {
      for (const specifier of statement.specifiers) {
        if (specifier.importKind === 'type') continue;
        const name =
          specifier.type === 'ImportDefaultSpecifier'
            ? 'default'
            : (specifier.imported?.name ?? specifier.imported?.value);
        imports.set(specifier.local.name, { name, request: statement.source.value });
      }
    }
    if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
      for (const specifier of statement.specifiers) {
        if (statement.exportKind === 'type' || specifier.exportKind === 'type') continue;
        exports.set(specifier.exported.name ?? specifier.exported.value, specifier.local.name);
      }
    }
    if (
      statement.type === 'ExportDefaultDeclaration' &&
      statement.declaration.type === 'Identifier'
    ) {
      exports.set('default', statement.declaration.name);
    }
    const exported = statement.type === 'ExportNamedDeclaration';
    const declaration = exported ? statement.declaration : statement;
    if (declaration?.type === 'VariableDeclaration') {
      for (const entry of declaration.declarations) {
        if (entry.id.type !== 'Identifier') continue;
        definitions.set(entry.id.name, entry.init);
        if (exported) exports.set(entry.id.name, entry.id.name);
      }
    } else if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
      definitions.set(declaration.id.name, declaration);
      if (exported) exports.set(declaration.id.name, declaration.id.name);
    }
  }
  return { path, definitions, imports, exports, moduleRequests };
}

function moduleResolver(planModule) {
  const database = dirname(planModule.path);
  const modules = new Map([[planModule.path, planModule]]);
  const inspected = new Set();

  function insideDatabase(path) {
    const fromDatabase = relative(database, path);
    return (
      fromDatabase !== '..' && !fromDatabase.startsWith(`..${sep}`) && !isAbsolute(fromDatabase)
    );
  }

  function databaseImport(from, request) {
    if (!request.startsWith('./') && !request.startsWith('../')) return undefined;
    const path = resolve(dirname(from.path), request.replace(/\.js$/, '.ts'));
    if (!insideDatabase(path)) return undefined;
    if (!path.endsWith('.ts'))
      throw new Error(`Expected a TypeScript database module for ${request}`);
    const sourcePath = realpathSync(path);
    if (!insideDatabase(sourcePath))
      throw new Error(`Import ${request} resolves outside packages/core/src/database/`);
    return sourcePath;
  }

  function load(path) {
    if (!modules.has(path)) modules.set(path, parseModule(readFileSync(path, 'utf8'), path));
    return modules.get(path);
  }

  function checkPlanCycle(module) {
    if (module === planModule) throw new Error('Circular import of schema-plan.ts');
    if (inspected.has(module)) return;
    inspected.add(module);
    for (const request of module.moduleRequests) {
      const path = databaseImport(module, request);
      if (path) checkPlanCycle(load(path));
    }
  }

  return (module, name, isMigration = false) => {
    if (module.definitions.has(name)) return { module, name, node: module.definitions.get(name) };
    const imported = module.imports.get(name);
    if (!imported) return undefined;
    const path = databaseImport(module, imported.request);
    if (!path) {
      if (isMigration)
        throw new Error(`Migration ${name} must be imported from packages/core/src/database/`);
      return undefined;
    }
    if (
      !isMigration &&
      historicalExternalImports.get(relative(database, path))?.has(imported.name)
    ) {
      return undefined;
    }
    const target = load(path);
    checkPlanCycle(target);
    const local = target.exports.get(imported.name);
    if (!target.definitions.has(local)) {
      throw new Error(`Cannot resolve ${name} to a local export in ${imported.request}`);
    }
    return { module: target, name: local, node: target.definitions.get(local) };
  };
}

export function migrationSnapshot(source, root = ROOT) {
  const planModule = parseModule(source, resolve(realpathSync(root), SOURCE));
  const resolveDefinition = moduleResolver(planModule);
  const plan = planModule.definitions.get('BOT_HARNESS_SCHEMA_PLAN');
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
    const migration = resolveDefinition(planModule, entry.name, true);
    if (migration?.node?.type !== 'ObjectExpression')
      throw new Error(`Missing migration definition ${entry.name}`);
    const definition = migration.node;
    const property = definition.properties.find((item) => item.key?.name === 'id');
    const id = property?.value?.value;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || ids.has(id))
      throw new Error(`Invalid or duplicate migration id: ${id}`);
    if (
      definition.properties.some(
        (item) =>
          item.type === 'SpreadElement' ||
          item.key?.name === 'generation' ||
          item.key?.value === 'generation',
      )
    )
      throw new Error(
        `Migration ${id} must declare its id and body without a generation or spread`,
      );
    ids.add(id);
    const dependencies = new Map();
    const visit = (node, module) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier') {
        const dependency = resolveDefinition(module, node.name);
        if (
          dependency &&
          (dependency.module !== migration.module || dependency.name !== migration.name)
        ) {
          const previous = dependencies.get(node.name);
          if (!previous) {
            dependencies.set(node.name, dependency);
            visit(dependency.node, dependency.module);
          } else if (previous.module !== dependency.module || previous.name !== dependency.name) {
            throw new Error(`Migration ${id} references multiple definitions of ${node.name}`);
          }
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (ignored.has(key)) continue;
        if (Array.isArray(value)) value.forEach((child) => visit(child, module));
        else if (value && typeof value === 'object') visit(value, module);
      }
    };
    visit(definition, migration.module);
    const body = normalized({
      definition,
      dependencies: [...dependencies]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, dependency]) => [name, dependency.node]),
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

function snapshotFromRoot(root) {
  return migrationSnapshot(readFileSync(resolve(root, SOURCE), 'utf8'), root);
}

export function checkSchemaMigrations(root = ROOT) {
  const current = snapshotFromRoot(root);
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
        shell: false,
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
        shell: false,
      }),
    );
    errors.push(...checkMigrationPrefix(snapshot, merged));
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.includes('--write-snapshot')) {
      const current = snapshotFromRoot(ROOT);
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
