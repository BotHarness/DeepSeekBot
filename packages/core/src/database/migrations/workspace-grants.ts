import type { SchemaMigration } from '../schema.js';

export const WORKSPACE_GRANT_MIGRATION: SchemaMigration = {
  id: 'workspace-grant',
  module: 'workspace-grants',
  description: 'Record Human Workspace Grants and immutable Assignment permission provenance',
  migrate(database) {
    database.exec(`
      CREATE TABLE workspace_grants (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        workspace_title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE UNIQUE INDEX workspace_grants_active_target
        ON workspace_grants (bot_slug, workspace_id) WHERE revoked_at IS NULL;
      ALTER TABLE assignments ADD COLUMN grant_id TEXT REFERENCES workspace_grants(id);
      ALTER TABLE assignments ADD COLUMN workspace_id TEXT;
      ALTER TABLE assignments ADD COLUMN primary_cwd TEXT;
      ALTER TABLE assignments ADD COLUMN permission_mode TEXT;
      ALTER TABLE assignments ADD COLUMN approval_policy TEXT;
      ALTER TABLE assignments ADD COLUMN preset_revision INTEGER;
    `);
  },
};

export const ORCHESTRATOR_WORKSPACE_WRITE_MIGRATION: SchemaMigration = {
  id: 'orchestrator-workspace-write',
  module: 'workspace-grants',
  description: 'Explicit Human-owned Orchestrator write permission on Workspace Grants',
  migrate(database) {
    database.exec(`
      ALTER TABLE workspace_grants ADD COLUMN orchestrator_write INTEGER NOT NULL DEFAULT 0
        CHECK (orchestrator_write IN (0, 1));
      ALTER TABLE workspace_grants ADD COLUMN write_revision INTEGER NOT NULL DEFAULT 0;
    `);
  },
};

export const WORKSPACE_GRANT_PATH_MIGRATION: SchemaMigration = {
  id: 'workspace-grant-path',
  module: 'workspace-grants',
  description: 'Keep one active Workspace Grant per Bot and canonical directory',
  migrate(database) {
    database.exec(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY bot_slug, workspace_path ORDER BY created_at DESC, id DESC
        ) AS position,
        MAX(created_at) OVER (PARTITION BY bot_slug, workspace_path) AS superseded_at
        FROM workspace_grants WHERE revoked_at IS NULL
      )
      UPDATE workspace_grants SET revoked_at = (
        SELECT superseded_at FROM ranked WHERE ranked.id = workspace_grants.id
      ) WHERE id IN (SELECT id FROM ranked WHERE position > 1);
      CREATE UNIQUE INDEX workspace_grants_active_path
        ON workspace_grants (bot_slug, workspace_path) WHERE revoked_at IS NULL;
    `);
  },
};
