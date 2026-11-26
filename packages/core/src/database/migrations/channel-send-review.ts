import type { SchemaMigration } from '../schema.js';

export const GROUP_SEND_REVIEW_MIGRATION: SchemaMigration = {
  id: 'group-send-review',
  module: 'channel-send-review',
  description: 'Opt-in local Group send review and bounded durable draft intents',
  migrate(database) {
    database.exec(`
      CREATE TABLE group_send_review_enabled (channel_id TEXT PRIMARY KEY);
      CREATE TABLE group_send_review_drafts (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, channel_id TEXT NOT NULL,
        source_event_id TEXT NOT NULL, record_json TEXT NOT NULL
      );
      CREATE INDEX group_send_review_source ON group_send_review_drafts(source_event_id);
    `);
  },
};
