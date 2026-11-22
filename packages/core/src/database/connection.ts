import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path: string): DatabaseSync {
  return new DatabaseSync(path, {
    timeout: 0,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
  });
}

export function configureActiveDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 0;
  `);
}

export function closeDatabase(database: DatabaseSync | undefined): void {
  if (database?.isOpen === true) database.close();
}
