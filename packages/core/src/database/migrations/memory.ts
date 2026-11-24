import type { SchemaMigration } from '../schema.js';

export const MEMORY_ACCEPTED_COMMIT_MIGRATION: SchemaMigration = {
  id: 'memory-accepted-commit',
  module: 'memory',
  description: 'Record accepted Memory Commit lineage and repository heads',
  migrate(database) {
    database.exec(`
      CREATE TABLE memory_accepted_commits (
        bot_slug TEXT NOT NULL,
        sha TEXT NOT NULL,
        parent_sha TEXT,
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('agent', 'human', 'system')),
        actor_id TEXT NOT NULL,
        cause_kind TEXT NOT NULL CHECK (cause_kind IN ('source-event', 'human-edit', 'repository-init')),
        cause_id TEXT NOT NULL,
        validation_result TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        PRIMARY KEY (bot_slug, sha)
      );
      CREATE INDEX memory_accepted_commits_history
        ON memory_accepted_commits (bot_slug, accepted_at DESC, sha);
      CREATE TABLE memory_accepted_heads (
        bot_slug TEXT PRIMARY KEY,
        head_sha TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (bot_slug, head_sha)
          REFERENCES memory_accepted_commits(bot_slug, sha)
      );
      CREATE TABLE memory_repair_events (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        accepted_head_sha TEXT NOT NULL,
        provisional_head_sha TEXT NOT NULL,
        backup_path TEXT NOT NULL,
        actor_kind TEXT NOT NULL CHECK (actor_kind = 'human'),
        actor_id TEXT NOT NULL,
        cause_kind TEXT NOT NULL CHECK (cause_kind = 'human-repair'),
        status TEXT NOT NULL CHECK (status IN ('started', 'completed')),
        requested_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX memory_repair_events_bot_time
        ON memory_repair_events (bot_slug, requested_at DESC);
    `);
  },
};

export const MEMORY_BRANCH_HEAD_MIGRATION: SchemaMigration = {
  id: 'memory-branch-head',
  module: 'memory',
  description: 'Track the accepted Memory head independently for each local branch',
  migrate(database) {
    database.exec(`
      CREATE TABLE memory_accepted_heads_by_branch (
        bot_slug TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (bot_slug, branch_name),
        FOREIGN KEY (bot_slug, head_sha)
          REFERENCES memory_accepted_commits(bot_slug, sha)
      );
      INSERT INTO memory_accepted_heads_by_branch (bot_slug, branch_name, head_sha, updated_at)
        SELECT bot_slug, 'main', head_sha, updated_at FROM memory_accepted_heads;
      DROP TABLE memory_accepted_heads;
      ALTER TABLE memory_accepted_heads_by_branch RENAME TO memory_accepted_heads;
    `);
  },
};

export const MEMORY_CHANGE_CHECKPOINT_MIGRATION: SchemaMigration = {
  id: 'memory-change-checkpoint',
  module: 'memory',
  description: 'Keep per-Bot Memory observations across Host restarts',
  migrate(database) {
    database.exec(`
      CREATE TABLE memory_change_checkpoints (
        bot_slug TEXT PRIMARY KEY,
        repository_root TEXT NOT NULL,
        repository_identity TEXT NOT NULL,
        observation_json TEXT NOT NULL,
        observed_at TEXT NOT NULL
      );
    `);
  },
};

export const MEMORY_RECOVERY_CHECKPOINT_MIGRATION: SchemaMigration = {
  id: 'memory-recovery-checkpoint',
  module: 'memory',
  description: 'Retain audited Git recovery checkpoints for Memory state',
  migrate(database) {
    database.exec(`
      CREATE TABLE memory_recovery_checkpoints (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        index_tree_sha TEXT NOT NULL,
        working_tree_sha TEXT NOT NULL,
        git_ref TEXT NOT NULL,
        origin_kind TEXT NOT NULL CHECK (origin_kind IN ('host-observation', 'agent-session', 'human-command')),
        origin_id TEXT NOT NULL,
        cause_kind TEXT NOT NULL CHECK (cause_kind IN ('memory-scan', 'source-event', 'human-edit', 'turn-abort', 'human-restore')),
        cause_id TEXT NOT NULL,
        captured_at TEXT NOT NULL
      );
      CREATE INDEX memory_recovery_checkpoints_history
        ON memory_recovery_checkpoints (bot_slug, captured_at DESC);
    `);
  },
};
