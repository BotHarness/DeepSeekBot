import type { SchemaMigration } from '../schema.js';

export const BOT_LAN_ADMISSION_MIGRATION: SchemaMigration = {
  id: 'bot-lan-admission',
  module: 'bot-lan',
  description: 'Record explicit Host-key-bound LAN Bot collaboration admissions',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_lan_admissions (
        host_id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        admission_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        admitted_at TEXT NOT NULL,
        revoked_at TEXT
      );
    `);
  },
};
