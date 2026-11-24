import { randomBytes } from 'node:crypto';
import type { SchemaMigration } from '../schema.js';

export const USAGE_DAILY_MIGRATION: SchemaMigration = {
  id: 'usage-daily',
  module: 'usage',
  description: 'Derive per-PersonaBot daily token buckets from DSH Session usage events',
  migrate(database) {
    database.exec(`
      CREATE TABLE usage_daily (
        bot_slug TEXT NOT NULL,
        day TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        purpose TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bot_slug, day, provider, model, purpose)
      );
      CREATE INDEX usage_daily_bot_day ON usage_daily (bot_slug, day);
    `);
  },
};

export const USAGE_REPORT_COMPLETENESS_MIGRATION: SchemaMigration = {
  id: 'usage-report-completeness',
  module: 'usage',
  description: 'Distinguish unreported provider token buckets from reported zero',
  migrate(database) {
    database.exec(`
      ALTER TABLE usage_daily ADD COLUMN unknown_input INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN unknown_output INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN unknown_cache_read INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN unknown_cache_write INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN unknown_total INTEGER NOT NULL DEFAULT 0;
      UPDATE usage_daily SET unknown_cache_read = 1, unknown_cache_write = 1, unknown_total = 1;
    `);
  },
};

export const USAGE_RETENTION_MIGRATION: SchemaMigration = {
  id: 'usage-retention',
  module: 'usage',
  description:
    'Retain daily usage independently of Session histories with durable anonymous receipts',
  migrate(database) {
    database.exec(`
      CREATE TABLE usage_receipt_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        fingerprint_key TEXT NOT NULL
      );
      CREATE TABLE usage_receipts (
        fingerprint TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL
      );
      CREATE INDEX usage_receipts_bot ON usage_receipts(bot_slug);
      CREATE TABLE usage_retired_roots (
        fingerprint TEXT PRIMARY KEY
      );
      CREATE TABLE usage_legacy_baselines (
        bot_slug TEXT PRIMARY KEY,
        through_ms INTEGER NOT NULL
      );
    `);
    database
      .prepare('INSERT INTO usage_receipt_state VALUES (1, ?)')
      .run(randomBytes(32).toString('hex'));
    database
      .prepare(`INSERT INTO usage_legacy_baselines (bot_slug, through_ms)
      SELECT DISTINCT bot_slug, ? FROM usage_daily`)
      .run(Date.now());
  },
};

export const USAGE_IDLE_COMPACTION_MIGRATION: SchemaMigration = {
  id: 'usage-idle-compaction',
  module: 'usage',
  description: 'Record idle Orchestrator Session compactions for Bot activity',
  migrate(database) {
    database.exec(`
      CREATE TABLE usage_idle_compactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_slug TEXT NOT NULL,
        at TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        idle_gap_ms INTEGER NOT NULL,
        cache_lifetime_ms INTEGER NOT NULL,
        cache_lifetime_source TEXT NOT NULL,
        tokens_before INTEGER NOT NULL,
        tokens_after INTEGER,
        outcome TEXT NOT NULL CHECK (outcome IN ('compacted', 'nothing', 'failed')),
        error TEXT,
        input_tokens INTEGER,
        cache_read_tokens INTEGER,
        output_tokens INTEGER
      );
      CREATE INDEX usage_idle_compactions_bot_at ON usage_idle_compactions (bot_slug, at);
    `);
  },
};

export const MEMBER_USAGE_MIGRATION: SchemaMigration = {
  id: 'member-usage',
  module: 'usage',
  description: 'Human-attributed usage receipts and daily buckets',
  migrate(db) {
    db.exec(`
      ALTER TABLE usage_daily RENAME TO usage_daily_old;
      CREATE TABLE usage_daily (
        bot_slug TEXT NOT NULL, day TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, purpose TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        unknown_input INTEGER NOT NULL DEFAULT 0, unknown_output INTEGER NOT NULL DEFAULT 0,
        unknown_cache_read INTEGER NOT NULL DEFAULT 0, unknown_cache_write INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0, unknown_total INTEGER NOT NULL DEFAULT 0,
        human_id TEXT NOT NULL DEFAULT '', legacy INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (bot_slug, day, provider, model, purpose, human_id, legacy)
      );
      INSERT INTO usage_daily SELECT *, (SELECT owner_human_id FROM team_settings WHERE singleton = 1), 1 FROM usage_daily_old;
      DROP TABLE usage_daily_old;
      CREATE INDEX usage_daily_bot_day ON usage_daily(bot_slug, day);
      CREATE INDEX usage_daily_period_human ON usage_daily(day, human_id, bot_slug);
      ALTER TABLE usage_receipts ADD COLUMN human_id TEXT;
      UPDATE usage_receipts SET human_id = (SELECT owner_human_id FROM team_settings WHERE singleton = 1);
      ALTER TABLE usage_idle_compactions ADD COLUMN human_id TEXT;
      ALTER TABLE bot_schedules ADD COLUMN creator_human_id TEXT;
      CREATE TABLE usage_turn_humans (session_id TEXT NOT NULL, turn INTEGER NOT NULL, human_id TEXT NOT NULL, at_ms INTEGER NOT NULL,
        PRIMARY KEY(session_id, turn));
      CREATE INDEX usage_turn_humans_time ON usage_turn_humans(session_id, at_ms DESC, turn DESC) WHERE turn >= 0;
    `);
  },
};
