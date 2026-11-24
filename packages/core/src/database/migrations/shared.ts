import type { DatabaseSync } from 'node:sqlite';

export function rebuildWithKind(
  database: DatabaseSync,
  table: 'source_events' | 'inbox_admissions',
  lastKind: string,
  addedKinds: readonly string[] = ['schedule'],
): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql: string } | undefined;
  const marker = `'${lastKind}'))`;
  if (row === undefined || row.sql.split(marker).length !== 2)
    throw new Error(`Cannot extend the ${table} kind check`);
  const dependents = (
    database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type IN ('index', 'trigger') AND tbl_name = ? AND sql IS NOT NULL",
      )
      .all(table) as Array<{ sql: string }>
  ).map((dependent) => dependent.sql);
  const next = row.sql
    .replace(marker, `'${[lastKind, ...addedKinds].join("', '")}'))`)
    .replace(/^CREATE TABLE\s+"?\w+"?/u, `CREATE TABLE ${table}_next`);
  database.exec(next);
  database.exec(`INSERT INTO ${table}_next SELECT * FROM ${table};
    DROP TABLE ${table};
    ALTER TABLE ${table}_next RENAME TO ${table};`);
  for (const dependent of dependents) database.exec(dependent);
}
