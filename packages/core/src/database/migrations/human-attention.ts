import type { SchemaMigration } from '../schema.js';

export const HUMAN_ATTENTION_DECISION_MIGRATION: SchemaMigration = {
  id: 'human-attention-decision',
  module: 'human-attention',
  description: 'Record Human decisions for informational Source Events',
  migrate(database) {
    database.exec(`
      CREATE TABLE human_attention_decisions (
        source_event_id TEXT PRIMARY KEY REFERENCES source_events(source_event_id),
        decision TEXT NOT NULL CHECK (decision IN ('ignored')),
        decided_at TEXT NOT NULL
      );
      CREATE INDEX source_events_assignment_kind
        ON source_events (assignment_session_id, source_kind);
    `);
  },
};

export const HUMAN_INBOX_DISMISSAL_MIGRATION: SchemaMigration = {
  id: 'human-inbox-dismissal',
  module: 'human-attention',
  description: 'Persist Inbox-only dismissal independently of source request decisions',
  migrate(database) {
    database.exec(`
      CREATE TABLE human_inbox_dismissals (
        human_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        source_key TEXT NOT NULL,
        through_revision INTEGER,
        dismissed_at TEXT NOT NULL,
        PRIMARY KEY (human_id, item_id, source_key)
      );
    `);
  },
};

export const HUMAN_INBOX_SNOOZE_MIGRATION: SchemaMigration = {
  id: 'human-inbox-snooze',
  module: 'human-attention',
  description: 'Let the Human snooze a Human Inbox item until a later time',
  migrate(database) {
    database.exec(`
      CREATE TABLE human_inbox_snoozes (
        human_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        source_key TEXT NOT NULL,
        until TEXT NOT NULL,
        snoozed_at TEXT NOT NULL,
        PRIMARY KEY (human_id, item_id, source_key)
      );
    `);
  },
};
