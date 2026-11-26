import type { SchemaMigration } from '../schema.js';

export const WORKSPACE_LOOKS_MIGRATION: SchemaMigration = {
  id: 'workspace-looks',
  module: 'workspace-looks',
  description: 'Record the Owner-chosen colour and icon of each Workspace folder',
  migrate(database) {
    database.exec(`
      CREATE TABLE workspace_looks (
        path TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
  },
};
