import type { SchemaMigration } from '../schema.js';

export const DEVICE_PAIRING_MIGRATION: SchemaMigration = {
  id: 'device-pairing',
  module: 'device-pairing',
  description: 'Record the Host identity and paired devices for the device gateway (ADR-0199)',
  migrate(database) {
    database.exec(`
      CREATE TABLE device_pairing_host (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        host_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE paired_devices (
        device_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        public_key TEXT,
        paired_at TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at TEXT
      );
    `);
  },
};
