import type { SchemaMigration } from '../schema.js';

export const SESSION_OWNERSHIP_MIGRATION: SchemaMigration = {
  id: 'session-ownership',
  module: 'session-ownership',
  description: 'Create explicit PersonaBot root Session ownership',
  migrate(database) {
    database.exec(`
      CREATE TABLE session_ownership (
        session_id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        root_role TEXT NOT NULL CHECK (root_role IN ('orchestrator', 'assignment')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX session_ownership_bot_role
        ON session_ownership (bot_slug, root_role, created_at, session_id);
    `);
  },
};

export const SESSION_OWNERSHIP_LINEAGE_MIGRATION: SchemaMigration = {
  id: 'session-ownership-lineage',
  module: 'session-ownership',
  description: 'Record ownership provenance, lineage, and the explicit cwd reference',
  migrate(database) {
    database.exec(`
      ALTER TABLE session_ownership
        ADD COLUMN provenance TEXT NOT NULL DEFAULT 'legacy'
        CHECK (provenance IN ('created', 'fork', 'subagent', 'repair', 'legacy'));
      ALTER TABLE session_ownership ADD COLUMN parent_session_id TEXT;
      ALTER TABLE session_ownership ADD COLUMN cwd_reference TEXT;
    `);
  },
};

export const SESSION_PERSONA_SNAPSHOT_MIGRATION: SchemaMigration = {
  id: 'session-persona-snapshot',
  module: 'session-ownership',
  description: 'Freeze each Session system-prompt persona at its first assembly',
  migrate(database) {
    database.exec(`
      ALTER TABLE session_ownership ADD COLUMN persona_snapshot TEXT;
      ALTER TABLE session_ownership ADD COLUMN persona_snapshot_at TEXT;
    `);
  },
};

export const SESSION_AGENT_PRESET_MIGRATION: SchemaMigration = {
  id: 'session-agent-preset',
  module: 'session-ownership',
  description: 'Record the DSH mode each owned root Session was composed from',
  migrate(database) {
    database.exec(`ALTER TABLE session_ownership ADD COLUMN agent_preset TEXT;`);
  },
};

export const SESSION_PROMPT_SNAPSHOT_MIGRATION: SchemaMigration = {
  id: 'session-prompt-snapshot',
  module: 'session-ownership',
  description: 'Freeze each Session Prompt Preset text at its first assembly',
  migrate(database) {
    database.exec('ALTER TABLE session_ownership ADD COLUMN prompt_snapshot TEXT;');
  },
};

export const SESSION_PARENT_INDEX_MIGRATION: SchemaMigration = {
  id: 'session-parent-index',
  module: 'session-ownership',
  description: 'Index child Sessions by parent without scanning every Session',
  migrate(database) {
    database.exec(`
      CREATE INDEX session_ownership_parent ON session_ownership (parent_session_id);
    `);
  },
};

export const PENDING_ORCHESTRATOR_REPLACEMENTS_MIGRATION: SchemaMigration = {
  id: 'pending-orchestrator-replacements',
  module: 'session-ownership',
  description: 'Store Orchestrator reservations separately from committed Session ownership',
  migrate(database) {
    database.exec(`
      CREATE TABLE pending_orchestrator_replacements (
        session_id TEXT PRIMARY KEY NOT NULL,
        bot_slug TEXT NOT NULL,
        cwd_reference TEXT,
        previous_cwd_reference TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX pending_orchestrator_replacements_bot
        ON pending_orchestrator_replacements (bot_slug, created_at DESC, session_id);
    `);
  },
};
