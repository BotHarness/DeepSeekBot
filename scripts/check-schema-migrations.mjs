import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DATABASE = 'packages/core/src/database';
const SOURCE = `${DATABASE}/schema-plan.ts`;
const SNAPSHOT = 'scripts/schema-migrations.json';
const FROZEN_INPUTS = 'historical-migration-snapshots.ts';
const FROZEN_INPUTS_HASH = '35771bec95fbdd6fdef5b8fb618e372f6cbfacf4422fe258f422d643cc354905';
const platformImports = new Set(['node:crypto', 'node:sqlite']);
const historicalExternalImports = new Map([
  [
    'inbox-history-index.ts',
    new Map([
      ['INBOX_HISTORY_INDEX_SQL', ['inbox-history']],
      ['MESSAGE_SEARCH_INDEX_SQL', ['message-search-attachment-name']],
    ]),
  ],
  ['owner-errors.ts', new Map([['OperationalDatabaseError', ['question-messaging-recovery']]])],
  [
    FROZEN_INPUTS,
    new Map([
      ['ADMIN_PERMISSIONS', ['team-roles']],
      ['MEMBER_PERMISSIONS', ['team-roles']],
      ['DEFAULT_CHANNEL_POLICY', ['channel-access']],
      ['OWNER_HUMAN_CONTEXT', ['local-human-receipts', 'source-event-human']],
      ['deriveAssignmentTitle', ['assignment-title']],
      ['presetSubFromLegacy', ['model-preset-sub-choices', 'model-preset-sub-engine-choices']],
      ['presetSubWithEngine', ['model-preset-sub-engine-choices']],
      ['z', ['minimal-member']],
    ]),
  ],
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

function syntaxHash(node) {
  return createHash('sha256')
    .update(JSON.stringify(normalized(node)))
    .digest('hex');
}

function dependencyError(path, detail) {
  return new Error(`${path}: database-only migration dependency: ${detail}`);
}

function checkDynamicLoads(node, path) {
  if (!node?.type) return;
  if (
    node.type === 'ImportExpression' ||
    (node.type === 'TSImportEqualsDeclaration' &&
      node.moduleReference.type === 'TSExternalModuleReference') ||
    (node.type === 'Identifier' && node.name === 'require') ||
    ((node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
      node.property.value === 'require')
  ) {
    throw dependencyError(path, 'use static imports instead of dynamic import() or require');
  }
  for (const [key, value] of Object.entries(node)) {
    if (ignored.has(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => checkDynamicLoads(child, path));
    else checkDynamicLoads(value, path);
  }
}

function parseModule(source, path) {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    createImportExpressions: true,
  });
  const definitions = new Map();
  const imports = new Map();
  const exports = new Map();
  const moduleRequests = new Set();
  for (const statement of ast.program.body) {
    if (statement.importKind === 'type' || statement.exportKind === 'type') continue;
    if (statement.source) moduleRequests.add(statement.source.value);
    checkDynamicLoads(statement, path);
    if (statement.type === 'ImportDeclaration') {
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
        if (specifier.exportKind === 'type') continue;
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
    } else if (
      (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') &&
      declaration.id
    ) {
      definitions.set(declaration.id.name, declaration);
      if (exported) exports.set(declaration.id.name, declaration.id.name);
    }
  }
  return { path, definitions, imports, exports, moduleRequests, body: ast.program.body };
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
    if (platformImports.has(request)) return undefined;
    const path = resolve(dirname(from.path), request.replace(/\.js$/, '.ts'));
    if ((!request.startsWith('./') && !request.startsWith('../')) || !insideDatabase(path))
      throw dependencyError(
        from.path,
        `${request} must resolve inside packages/core/src/database/`,
      );
    if (!path.endsWith('.ts'))
      throw dependencyError(from.path, `expected a TypeScript database module for ${request}`);
    const sourcePath = realpathSync(path);
    if (!insideDatabase(sourcePath))
      throw dependencyError(from.path, `${request} resolves outside packages/core/src/database/`);
    return sourcePath;
  }

  function load(path) {
    if (!modules.has(path)) {
      const module = parseModule(readFileSync(path, 'utf8'), path);
      if (
        relative(database, path) === FROZEN_INPUTS &&
        syntaxHash(module.body) !== FROZEN_INPUTS_HASH
      )
        throw new Error(
          `${FROZEN_INPUTS}: frozen migration inputs changed; append a corrective migration instead`,
        );
      modules.set(path, module);
    }
    return modules.get(path);
  }

  function inspect(module) {
    if (module === planModule) throw new Error('Circular import of schema-plan.ts');
    if (inspected.has(module)) return;
    inspected.add(module);
    inspectDependencies(module);
  }

  function inspectDependencies(module) {
    for (const request of module.moduleRequests) {
      const path = databaseImport(module, request);
      if (path) inspect(load(path));
    }
  }

  function checkRuntimeImports() {
    inspectDependencies(planModule);
    const migrations = resolve(database, 'migrations');
    if (!existsSync(migrations)) return;
    for (const entry of readdirSync(migrations, { recursive: true, withFileTypes: true })) {
      if (entry.isDirectory() || !entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts'))
        continue;
      const path = databaseImport(
        planModule,
        `./${relative(database, resolve(entry.parentPath, entry.name))}`,
      );
      inspect(load(path));
    }
  }

  function resolveDefinition(module, name, migrationId) {
    if (module.definitions.has(name)) return { module, name, node: module.definitions.get(name) };
    const imported = module.imports.get(name);
    if (!imported) return undefined;
    const path = databaseImport(module, imported.request);
    if (!path) {
      if (migrationId === undefined)
        throw new Error(`Migration ${name} must be imported from packages/core/src/database/`);
      return undefined;
    }
    const target = load(path);
    const filename = relative(database, path);
    if (
      imported.name === name &&
      historicalExternalImports.get(filename)?.get(name)?.includes(migrationId)
    )
      return undefined;
    const local = target.exports.get(imported.name);
    if (!target.definitions.has(local)) {
      throw new Error(`Cannot resolve ${name} to a local export in ${imported.request}`);
    }
    return { module: target, name: local, node: target.definitions.get(local) };
  }

  return { checkRuntimeImports, resolveDefinition };
}

export function migrationSnapshot(source, root = ROOT) {
  const planModule = parseModule(source, resolve(realpathSync(root), SOURCE));
  const { checkRuntimeImports, resolveDefinition } = moduleResolver(planModule);
  const plan = planModule.definitions.get('BOT_HARNESS_SCHEMA_PLAN');
  if (
    plan?.type !== 'CallExpression' ||
    plan.callee.name !== 'defineSchemaPlan' ||
    plan.arguments[0]?.type !== 'ArrayExpression'
  ) {
    throw new Error('Expected an explicit ordered defineSchemaPlan([...]) migration list');
  }
  checkRuntimeImports();
  const ids = new Set(['foundation']);
  return plan.arguments[0].elements.map((entry) => {
    if (entry?.type !== 'Identifier')
      throw new Error('Migration list entries must name migration constants');
    const migration = resolveDefinition(planModule, entry.name);
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
        const dependency = resolveDefinition(module, node.name, id);
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
    const body = {
      definition,
      dependencies: [...dependencies]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, dependency]) => [name, dependency.node]),
    };
    return { id, sha256: syntaxHash(body) };
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

function readMergedFile(root, path) {
  try {
    return execFileSync('git', ['show', `origin/main:${path}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      shell: false,
    });
  } catch {
    return undefined;
  }
}

export function checkSchemaMigrations(root = ROOT) {
  const current = snapshotFromRoot(root);
  const snapshot = JSON.parse(readFileSync(resolve(root, SNAPSHOT), 'utf8'));
  const errors = checkMigrationPrefix(current, snapshot);
  if (current.length !== snapshot.length)
    errors.push('Append new migrations to scripts/schema-migrations.json with --write-snapshot');
  const merged = readMergedFile(root, SNAPSHOT);
  if (merged !== undefined) errors.push(...checkMigrationPrefix(snapshot, JSON.parse(merged)));
  const frozenPath = `${DATABASE}/${FROZEN_INPUTS}`;
  const mergedInputs = readMergedFile(root, frozenPath);
  if (
    mergedInputs !== undefined &&
    syntaxHash(parseModule(mergedInputs, frozenPath).body) !== FROZEN_INPUTS_HASH
  ) {
    errors.push(
      `${FROZEN_INPUTS}: merged frozen inputs changed; append a corrective migration instead`,
    );
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
