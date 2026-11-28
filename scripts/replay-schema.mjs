import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { constants, DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

export async function replaySchema(root) {
  const source = pathToFileURL(resolve(root, 'packages/core/src/database/')).href + '/';
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (
          error.code !== 'ERR_MODULE_NOT_FOUND' ||
          !context.parentURL?.startsWith(source) ||
          !/^\.\.?\//u.test(specifier) ||
          !specifier.endsWith('.js')
        )
          throw error;
        return nextResolve(specifier.replace(/\.js$/u, '.ts'), context);
      }
    },
  });
  let plan;
  let foundation;
  try {
    ({ BOT_HARNESS_SCHEMA_PLAN: plan } = await import(`${source}schema-plan.ts`));
    foundation = await import(`${source}schema.ts`);
  } finally {
    hooks.deregister();
  }

  const database = new DatabaseSync(':memory:');
  try {
    if (plan.migrations.some((migration) => migration.rebuildsReferencedTables))
      database.exec('PRAGMA foreign_keys = OFF');
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE _botharness_schema (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        generation INTEGER NOT NULL CHECK (generation >= ${foundation.FOUNDATION_SCHEMA_GENERATION})
      ) STRICT;
      CREATE TABLE schema_migrations (generation INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE) STRICT;
      INSERT INTO _botharness_schema VALUES (1, ${foundation.FOUNDATION_SCHEMA_GENERATION});
    `);
    const record = database.prepare('INSERT INTO schema_migrations VALUES (?, ?)');
    const generation = database.prepare('UPDATE _botharness_schema SET generation = ?');
    const tableDefinitions = database.prepare(
      "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
    );
    const tables = () => new Map(tableDefinitions.all().map(({ name, sql }) => [name, sql]));
    record.run(foundation.FOUNDATION_SCHEMA_GENERATION, foundation.FOUNDATION_SCHEMA_ID);
    let previous = tables();
    const migrations = plan.migrations.map((migration) => {
      const altered = new Set();
      database.setAuthorizer((action, _first, table) => {
        if (action === constants.SQLITE_ALTER_TABLE && previous.has(table)) altered.add(table);
        return constants.SQLITE_OK;
      });
      try {
        migration.migrate(database);
        record.run(migration.generation, migration.id);
        generation.run(migration.generation);
      } catch (error) {
        throw new Error(`Migration ${migration.id}: ${error.message}`, { cause: error });
      } finally {
        database.setAuthorizer(null);
      }
      const current = tables();
      const changed = [...current.keys()].filter(
        (name) => current.get(name) !== previous.get(name),
      );
      previous = current;
      return {
        id: migration.id,
        module: migration.module,
        tables: [...new Set([...changed, ...altered])],
      };
    });
    database.exec('COMMIT');
    return { tables: [...previous.keys()], migrations };
  } finally {
    database.close();
  }
}
