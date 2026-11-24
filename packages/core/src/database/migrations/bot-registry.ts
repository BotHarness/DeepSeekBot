import type { SchemaMigration } from '../schema.js';

export const PERSONA_BOT_REGISTRY_MIGRATION: SchemaMigration = {
  id: 'persona-bot-registry',
  module: 'bot-registry',
  description: 'Own PersonaBot identities and applied plans with a durable Registry import marker',
  migrate(database) {
    database.exec(`
      CREATE TABLE persona_bots (slug TEXT PRIMARY KEY, body TEXT NOT NULL CHECK (json_valid(body)));
      CREATE TABLE persona_bots_import (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), imported_at TEXT NOT NULL
      );
    `);
  },
};

export const PERSONA_BOT_DELETION_MIGRATION: SchemaMigration = {
  id: 'persona-bot-deletion',
  module: 'bot-registry',
  description: 'Terminal PersonaBot deletion and exclusive Memory ownership proofs',
  migrate(database) {
    database.exec(`
      CREATE TABLE persona_bot_deletions (
        slug TEXT PRIMARY KEY REFERENCES persona_bots(slug),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
      CREATE TABLE persona_bot_memory_ownership (
        slug TEXT PRIMARY KEY REFERENCES persona_bots(slug),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
    `);
  },
};
