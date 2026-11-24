import type { SchemaMigration } from '../schema.js';

export const WORKSPACE_SPACES_MIGRATION: SchemaMigration = {
  id: 'workspace-spaces',
  module: 'workspace-spaces',
  description:
    'Account and audience-contained shared Workspace roots and resumable Memory relocation',
  migrate(database) {
    database.exec(`
      CREATE TABLE workspace_spaces (
        space_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('account', 'shared')),
        name TEXT NOT NULL COLLATE NOCASE,
        owner_human_id TEXT UNIQUE,
        audience_json TEXT,
        CHECK ((kind = 'account' AND owner_human_id IS NOT NULL AND audience_json IS NULL)
          OR (kind = 'shared' AND owner_human_id IS NULL AND json_valid(audience_json)))
      );
      CREATE UNIQUE INDEX workspace_shared_names ON workspace_spaces(name) WHERE kind = 'shared';
      INSERT INTO workspace_spaces
        SELECT 'spaces/' || human_id, 'account', display_name, human_id, NULL FROM humans;
      CREATE TABLE workspace_file_transfers (human_id TEXT PRIMARY KEY, moves_json TEXT NOT NULL);
      CREATE TABLE workspace_memory_moves (
        slug TEXT PRIMARY KEY,
        source TEXT,
        target TEXT,
        proof_json TEXT
      );
      INSERT INTO workspace_memory_moves(slug)
        SELECT b.slug FROM persona_bots b
        WHERE b.owner_human_id <> (SELECT owner_human_id FROM team_settings WHERE singleton = 1)
          AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug = b.slug
          AND (json_extract(d.body, '$.memory') = 'erased' OR json_extract(d.body, '$.eraseMemory') = 1));
    `);
  },
};
