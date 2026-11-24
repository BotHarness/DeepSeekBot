import type { SchemaMigration } from '../schema.js';

export const HUMAN_MODEL_FAVORITES_MIGRATION: SchemaMigration = {
  id: 'human-model-favorites',
  module: 'model-favorites',
  description: 'Keep each Human favorite models as a personal preference shared by their devices',
  migrate(database) {
    database.exec(`CREATE TABLE human_model_favorites (
      human_id TEXT NOT NULL REFERENCES humans(human_id) ON DELETE CASCADE,
      favorite_key TEXT NOT NULL,
      favorite_json TEXT NOT NULL CHECK (json_valid(favorite_json)),
      position INTEGER NOT NULL,
      PRIMARY KEY (human_id, favorite_key)
    )`);
  },
};
