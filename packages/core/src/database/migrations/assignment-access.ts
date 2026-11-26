import type { SchemaMigration } from '../schema.js';

export const ASSIGNMENT_ACCESS_MIGRATION: SchemaMigration = {
  id: 'assignment-access',
  module: 'assignment-access',
  description: 'Persist Human-owned per-Bot Assignment access preset and audit',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_assignment_access (
        bot_slug TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('workspace-write', 'danger-full-access')),
        revision INTEGER NOT NULL,
        changed_at TEXT NOT NULL
      );
      CREATE TABLE bot_assignment_access_events (
        bot_slug TEXT NOT NULL,
        revision INTEGER NOT NULL,
        prior_mode TEXT NOT NULL,
        mode TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        actor_kind TEXT NOT NULL CHECK (actor_kind = 'human'),
        PRIMARY KEY (bot_slug, revision)
      );
    `);
  },
};

export const ASSIGNMENT_ACCESS_SCOPE_MIGRATION: SchemaMigration = {
  id: 'assignment-access-scope',
  module: 'assignment-access',
  description: 'Record whether full access also covers the Orchestrator (ADR-0193)',
  migrate(database) {
    database.exec(`
      ALTER TABLE bot_assignment_access ADD COLUMN scope TEXT NOT NULL DEFAULT 'assignments'
        CHECK (scope IN ('chat', 'assignments'));
    `);
  },
};
