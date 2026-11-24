import type { SchemaMigration } from '../schema.js';

export const MIGRATION_LEDGER_MIGRATION: SchemaMigration = {
  id: 'migration-ledger',
  module: 'database',
  description: 'Require named migration history on every subsequent open',
  migrate() {},
};
