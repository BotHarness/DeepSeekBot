import type { SchemaMigration } from '../schema.js';

export const TOOL_APPROVAL_RULE_MIGRATION: SchemaMigration = {
  id: 'tool-approval-rule',
  module: 'tool-approval-rules',
  description: 'Persist revocable Human rules for native tool approval',
  migrate(database) {
    database.exec(`
      CREATE TABLE tool_approval_rules (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('orchestrator', 'assignment')),
        scope_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('exact', 'all-opaque')),
        tool_name TEXT NOT NULL,
        input TEXT NOT NULL,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        revoked_at TEXT
      );
      CREATE INDEX tool_approval_rules_lookup
        ON tool_approval_rules (bot_slug, role, scope_key, active, revoked_at);
    `);
  },
};

export const EXTERNAL_TOOL_RULE_CREATOR_MIGRATION: SchemaMigration = {
  id: 'external-tool-rule-creator',
  module: 'tool-approval-rules',
  description: 'Retain external creator provenance for revocable native approval rules',
  migrate(database) {
    database.exec('ALTER TABLE tool_approval_rules ADD COLUMN external_creator TEXT');
  },
};

export const SECRET_CLI_TOOL_RULE_MIGRATION: SchemaMigration = {
  id: 'secret-cli-tool-rule',
  module: 'tool-approval-rules',
  description: 'Allow secret_cli always-allow rules per program, account and variable names',
  migrate(database) {
    database.exec(`
      CREATE TABLE tool_approval_rules_next (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('orchestrator', 'assignment')),
        scope_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('exact', 'all-opaque', 'secret-cli')),
        tool_name TEXT NOT NULL,
        input TEXT NOT NULL,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        revoked_at TEXT,
        external_creator TEXT
      );
      INSERT INTO tool_approval_rules_next
        (id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active, revoked_at,
         external_creator)
      SELECT id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active, revoked_at,
             external_creator
        FROM tool_approval_rules;
      DROP TABLE tool_approval_rules;
      ALTER TABLE tool_approval_rules_next RENAME TO tool_approval_rules;
      CREATE INDEX tool_approval_rules_lookup
        ON tool_approval_rules (bot_slug, role, scope_key, active, revoked_at);
    `);
  },
};

export const THREE_ACTION_APPROVAL_MIGRATION: SchemaMigration = {
  id: 'three-action-approval',
  module: 'tool-approval-rules',
  description: 'Remember one tool per authority scope and retain native ask for Full Access',
  migrate(database) {
    database.exec(`
      CREATE TABLE tool_approval_rules_next (
        id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('orchestrator', 'assignment')),
        scope_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('exact', 'tool', 'all-opaque', 'secret-cli')),
        tool_name TEXT NOT NULL, input TEXT NOT NULL, created_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)), revoked_at TEXT, external_creator TEXT
      );
      INSERT INTO tool_approval_rules_next
        SELECT * FROM tool_approval_rules;
      DROP TABLE tool_approval_rules;
      ALTER TABLE tool_approval_rules_next RENAME TO tool_approval_rules;
      CREATE INDEX tool_approval_rules_lookup
        ON tool_approval_rules (bot_slug, role, scope_key, active, revoked_at);
      UPDATE assignments SET approval_policy = 'ask'
        WHERE permission_mode = 'danger-full-access' AND approval_policy = 'never';
    `);
  },
};

export const TOOL_RULE_AUTO_APPROVAL_COUNT_MIGRATION: SchemaMigration = {
  id: 'tool-rule-auto-approval-count',
  module: 'tool-approval-rules',
  description: 'Count the approval requests each always-allow rule answers',
  migrate(database) {
    database.exec(
      'ALTER TABLE tool_approval_rules ADD COLUMN auto_approved_count INTEGER NOT NULL DEFAULT 0;',
    );
  },
};

export const SHELL_PREFIX_TOOL_RULE_MIGRATION: SchemaMigration = {
  id: 'shell-prefix-tool-rule',
  module: 'tool-approval-rules',
  description: 'Allow scoped Shell command prefix approval rules',
  migrate(database) {
    database.exec(`
      CREATE TABLE tool_approval_rules_next (
        id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('orchestrator', 'assignment')),
        scope_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('exact', 'prefix', 'tool', 'all-opaque', 'secret-cli')),
        tool_name TEXT NOT NULL, input TEXT NOT NULL, created_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)), revoked_at TEXT, external_creator TEXT,
        auto_approved_count INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO tool_approval_rules_next
        (id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active, revoked_at,
         external_creator, auto_approved_count)
      SELECT id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active, revoked_at,
             external_creator, auto_approved_count
        FROM tool_approval_rules;
      DROP TABLE tool_approval_rules;
      ALTER TABLE tool_approval_rules_next RENAME TO tool_approval_rules;
      CREATE INDEX tool_approval_rules_lookup
        ON tool_approval_rules (bot_slug, role, scope_key, active, revoked_at);
    `);
  },
};
