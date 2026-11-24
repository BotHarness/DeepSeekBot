import type { SchemaMigration } from '../schema.js';

export const TOB_IDENTITY_MIGRATION: SchemaMigration = {
  id: 'tob-identity',
  module: 'tob',
  description: 'Reserve the protected local Tob identity',
  migrate(database) {
    database.exec(`CREATE TABLE tob_identity (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1), bot_slug TEXT NOT NULL UNIQUE
    );`);
  },
};
