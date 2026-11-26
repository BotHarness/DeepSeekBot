import type { SchemaMigration } from '../schema.js';

export const CHANNEL_MANAGEMENT_OPERATION_MIGRATION: SchemaMigration = {
  id: 'channel-management-operation',
  module: 'channel-management',
  description: 'Reserve canonical Channel and invitation identities for scoped CLI retries',
  migrate(database) {
    database.exec(`CREATE TABLE channel_management_operations (
      operation_key TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('create','invite')),
      payload_hash TEXT NOT NULL, channel_id TEXT NOT NULL, invitation_id TEXT,
      targets_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('reserved','completed'))
    );`);
  },
};
