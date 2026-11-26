import type { SchemaMigration } from '../schema.js';

export const BOT_ONBOARDING_MIGRATION: SchemaMigration = {
  id: 'bot-onboarding',
  module: 'bot-onboarding',
  description: 'Persist Profile onboarding receipts and trusted Channel output provenance',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_onboarding (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        profile_id TEXT NOT NULL,
        entered_at TEXT NOT NULL,
        default_bot_slug TEXT,
        preparation TEXT NOT NULL CHECK (preparation IN ('requested', 'ready')),
        tutorial TEXT NOT NULL DEFAULT 'not-started'
          CHECK (tutorial IN ('not-started', 'active', 'paused', 'skipped')),
        completed_channel_id TEXT,
        completed_message_id TEXT
      );
      CREATE TABLE channel_output_origins (
        source_event_id TEXT PRIMARY KEY REFERENCES source_events(source_event_id),
        session_id TEXT NOT NULL REFERENCES session_ownership(session_id),
        request_source_event_id TEXT REFERENCES source_events(source_event_id)
      );
    `);
  },
};

export const TOB_ONBOARDING_MIGRATION: SchemaMigration = {
  id: 'tob-onboarding',
  module: 'bot-onboarding',
  description: 'Version the short Tob journey without restarting legacy tutorials',
  migrate(database) {
    database.exec(`
      ALTER TABLE bot_onboarding ADD COLUMN journey_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE bot_onboarding ADD COLUMN journey_started_at TEXT;
      ALTER TABLE bot_onboarding ADD COLUMN journey_bot TEXT;
      ALTER TABLE bot_onboarding ADD COLUMN journey_group TEXT;
      ALTER TABLE bot_onboarding ADD COLUMN journey_done INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE onboarding_creation_results (
        operation_key TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT,
        session_id TEXT NOT NULL, recorded_at TEXT NOT NULL,
        PRIMARY KEY (operation_key, kind)
      );
    `);
  },
};

export const CLIENT_ACKNOWLEDGEMENT_MIGRATION: SchemaMigration = {
  id: 'client-acknowledgement',
  module: 'bot-onboarding',
  description: 'Remember one-time Client notices per Profile instead of per browser origin',
  migrate(database) {
    database.exec(`
      CREATE TABLE client_acknowledgements (
        ack_key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
    `);
  },
};
