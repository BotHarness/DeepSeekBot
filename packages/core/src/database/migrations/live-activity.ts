import type { SchemaMigration } from '../schema.js';

export const DEVICE_LIVE_ACTIVITY_MIGRATION: SchemaMigration = {
  id: 'device-live-activity',
  module: 'live-activity',
  description: 'Track device-owned Live Activity delivery handles, never request execution state',
  migrate(database) {
    database.exec(`CREATE TABLE device_live_activities (
      client_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL, source_event_id TEXT NOT NULL, handle TEXT NOT NULL,
      expires_at INTEGER NOT NULL, locale TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
      terminal INTEGER NOT NULL DEFAULT 0, last_sent INTEGER NOT NULL DEFAULT 0,
      last_state TEXT NOT NULL DEFAULT '', pending_state TEXT NOT NULL DEFAULT '',
      attempt_at INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0
    );`);
  },
};
