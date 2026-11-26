import type { SchemaMigration } from '../schema.js';

export const ROUTING_GROUP_STORAGE_MIGRATION: SchemaMigration = {
  id: 'routing-group-storage',
  module: 'routing-groups',
  description: 'Own Host-wide Routing Groups: named, ordered model routes and nested groups',
  migrate(database) {
    database.exec(`
      CREATE TABLE routing_groups (id TEXT PRIMARY KEY, body TEXT NOT NULL CHECK (json_valid(body)));
    `);
  },
};

export const ROUTING_GROUP_DEFAULT_MIGRATION: SchemaMigration = {
  id: 'routing-group-default',
  module: 'routing-groups',
  description: 'Own the Routing Group chosen as the Profile default model, with its revision',
  migrate(database) {
    database.exec(`
      CREATE TABLE routing_group_default (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        group_id TEXT,
        revision INTEGER NOT NULL CHECK (revision >= 0)
      );
    `);
  },
};

export const ROUTING_GROUP_DEFAULT_EFFORT_MIGRATION: SchemaMigration = {
  id: 'routing-group-default-effort',
  module: 'routing-groups',
  description: 'Keep the reasoning effort chosen with the Profile default Routing Group',
  migrate(database) {
    database.exec('ALTER TABLE routing_group_default ADD COLUMN effort TEXT');
  },
};

export const GROUP_FALLBACK_OVERRIDES_MIGRATION: SchemaMigration = {
  id: 'group-fallback-overrides',
  module: 'routing-groups',
  description: 'Keep the Routing Group member an Orchestrator Session fell back to across restarts',
  migrate(database) {
    database.exec(`
      CREATE TABLE group_fallback_overrides (
        session_id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        group_id TEXT NOT NULL,
        route_json TEXT NOT NULL CHECK (json_valid(route_json)),
        updated_at TEXT NOT NULL
      );
    `);
  },
};
