import type { SchemaMigration } from '../schema.js';

export const SOURCE_EVENT_ATTEMPT_MIGRATION: SchemaMigration = {
  id: 'source-event-attempt',
  module: 'bot-runtime',
  description: 'Track replay-safe Source Event attempt state',
  migrate(database) {
    database.exec(`
      ALTER TABLE source_events
        ADD COLUMN attempt_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled'));
      UPDATE source_events SET attempt_state = 'handled' WHERE handled_at IS NOT NULL;
    `);
  },
};

export const SOURCE_EVENT_SIDE_EFFECT_MIGRATION: SchemaMigration = {
  id: 'source-event-side-effect',
  module: 'bot-runtime',
  description: 'Separate an in-flight side effect from an unreplayable failure state',
  migrate(database) {
    database.exec(`
      ALTER TABLE source_events ADD COLUMN side_effect_started_at TEXT;
      UPDATE source_events
         SET side_effect_started_at = created_at
       WHERE attempt_state = 'needs-repair';
    `);
  },
};

export const SESSION_TURN_TARGET_MIGRATION: SchemaMigration = {
  id: 'session-turn-targets',
  module: 'bot-runtime',
  description: 'Record executed model and engine segments by Session turn',
  migrate(database) {
    database.exec(`
      CREATE TABLE session_turn_targets (
        session_id TEXT NOT NULL REFERENCES session_ownership(session_id) ON DELETE CASCADE,
        turn INTEGER NOT NULL,
        step INTEGER NOT NULL,
        request_id TEXT NOT NULL,
        target_json TEXT NOT NULL CHECK (json_valid(target_json)),
        PRIMARY KEY (session_id, turn, step)
      ) WITHOUT ROWID;
    `);
  },
};

export const SESSION_MODEL_CHOICES_MIGRATION: SchemaMigration = {
  id: 'session-model-choices',
  module: 'bot-runtime',
  description: 'Persist Session Model Choice overrides and Routing Group switch reasons',
  migrate(database) {
    database.exec(`
      CREATE TABLE session_model_choices (
        session_id TEXT PRIMARY KEY REFERENCES session_ownership(session_id) ON DELETE CASCADE,
        choice_json TEXT NOT NULL CHECK (json_valid(choice_json))
      ) WITHOUT ROWID;
      ALTER TABLE session_turn_targets ADD COLUMN switch_reason TEXT
        CHECK (switch_reason IN ('quota', 'rate-limit', 'credential'));
    `);
  },
};
