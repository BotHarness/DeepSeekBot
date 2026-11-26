import type { SchemaMigration } from '../schema.js';

export const REMOTE_HOST_CUSTODY_MIGRATION: SchemaMigration = {
  id: 'remote-host-custody',
  module: 'remote-host-custody',
  description: 'The local Host keeps Remote Host credentials; the Client only holds handles',
  migrate(database) {
    database.exec(`
      CREATE TABLE remote_host_custody (
        handle TEXT PRIMARY KEY,
        owner_human_id TEXT NOT NULL,
        host_id TEXT NOT NULL,
        member INTEGER NOT NULL CHECK (member IN (0, 1)),
        routes TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;
    `);
  },
};
