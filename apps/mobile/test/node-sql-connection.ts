import { DatabaseSync } from 'node:sqlite';

import type { SqlConnection, SqlValue } from '../src/host/local-store';

export function nodeSqlConnection(
  path = ':memory:',
): SqlConnection & { readonly database: DatabaseSync } {
  const database = new DatabaseSync(path);
  const params = (values: readonly SqlValue[] | undefined) => [...(values ?? [])];
  return {
    database,
    async exec(sql) {
      database.exec(sql);
    },
    async run(sql, values) {
      database.prepare(sql).run(...params(values));
    },
    async all<T>(sql: string, values?: readonly SqlValue[]) {
      return database
        .prepare(sql)
        .all(...params(values))
        .map((row) => ({ ...row })) as T[];
    },
    async close() {
      if (database.isOpen) database.close();
    },
  };
}
