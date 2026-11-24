import type { SchemaMigration } from '../schema.js';

export const AVATAR_PART_LIBRARY_MIGRATION: SchemaMigration = {
  id: 'avatar-part-library',
  module: 'avatar-part-library',
  description: 'Persist the Profile Part Library of Human-drawn Avatar Custom Parts',
  migrate(database) {
    database.exec(`
      CREATE TABLE avatar_part_library (
        id TEXT PRIMARY KEY CHECK (length(id) = 64),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
    `);
  },
};
