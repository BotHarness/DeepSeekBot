import type { SchemaMigration } from '../schema.js';

export const PROFILE_RECOVERY_MIGRATION: SchemaMigration = {
  id: 'profile-recovery',
  module: 'profile-portability',
  description: 'Persist Disaster Restore receipt and explicit target-local activation',
  migrate(database) {
    database.exec(`
      CREATE TABLE profile_recovery (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), body TEXT NOT NULL
      );
      CREATE TABLE profile_recovery_bots (
        bot_slug TEXT PRIMARY KEY, desired_json TEXT NOT NULL,
        authorized_plan_revision INTEGER, activated_session_id TEXT
      );
      ALTER TABLE session_ownership ADD COLUMN content_available INTEGER NOT NULL DEFAULT 1
        CHECK (content_available IN (0, 1));
    `);
  },
};
