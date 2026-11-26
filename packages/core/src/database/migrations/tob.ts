import type { SchemaMigration } from '../schema.js';

export const TOB_IDENTITY_MIGRATION: SchemaMigration = {
  id: 'tob-identity',
  module: 'tob',
  description: 'Reserve the protected local Tob identity',
  migrate(database) {
    database.exec(`CREATE TABLE tob_identity (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1), bot_slug TEXT NOT NULL UNIQUE
    );`);
  },
};

export const TOB_MEMORY_LEASE_MIGRATION: SchemaMigration = {
  id: 'tob-memory-leases',
  module: 'tob',
  description: 'Bind read-only cross-Bot Memory leases to one Tob Assignment and its Human request',
  migrate(database) {
    database.exec(`
      CREATE TABLE tob_memory_leases (
        lease_id TEXT PRIMARY KEY,
        tob_slug TEXT NOT NULL,
        lease_key TEXT NOT NULL,
        assignment_session_id TEXT NOT NULL,
        source_channel_id TEXT NOT NULL,
        source_event_ids_json TEXT NOT NULL,
        targets_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        revoke_reason TEXT,
        UNIQUE (tob_slug, lease_key)
      ) STRICT;
      CREATE INDEX tob_memory_leases_assignment ON tob_memory_leases(assignment_session_id);
      CREATE TABLE tob_memory_lease_reads (
        lease_id TEXT NOT NULL REFERENCES tob_memory_leases(lease_id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        bot_slug TEXT NOT NULL,
        kind TEXT NOT NULL,
        path TEXT,
        revision TEXT,
        bytes INTEGER NOT NULL,
        sha256 TEXT,
        truncated INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        read_at TEXT NOT NULL,
        PRIMARY KEY (lease_id, seq)
      ) STRICT;
    `);
  },
};
