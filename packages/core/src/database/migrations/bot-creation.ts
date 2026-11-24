import type { SchemaMigration } from '../schema.js';

export const BOT_CREATION_OPERATION_MIGRATION: SchemaMigration = {
  id: 'bot-creation-operation',
  module: 'bot-creation',
  description: 'Reserve stable Bot creation identities for idempotent live CLI retries',
  migrate(database) {
    database.exec(`CREATE TABLE bot_creation_operations (
      operation_key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL,
      bot_slug TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('reserved','created'))
    );`);
  },
};
