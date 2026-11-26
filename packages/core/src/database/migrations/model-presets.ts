import type { SchemaMigration } from '../schema.js';
import {
  presetSubFromLegacy,
  presetSubWithEngine,
  type ModelPreset,
} from '../historical-migration-snapshots.js';

export const MODEL_PRESET_STORAGE_MIGRATION: SchemaMigration = {
  id: 'model-preset-storage',
  module: 'model-presets',
  description:
    'Own reusable Model Presets and their one-time import marker in the Profile database',
  migrate(database) {
    database.exec(`
      CREATE TABLE model_presets (id TEXT PRIMARY KEY, body TEXT NOT NULL CHECK (json_valid(body)));
      CREATE TABLE model_presets_import (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), imported_at TEXT NOT NULL
      );
    `);
  },
};

export const DEFAULT_MODEL_PRESET_MIGRATION: SchemaMigration = {
  id: 'default-model-preset',
  module: 'model-presets',
  description: 'Reserve the pinned Model Preset and stage the legacy Routing Group selection',
  migrate(database) {
    database.exec(`
      ALTER TABLE routing_group_default RENAME TO legacy_routing_group_default;
      CREATE TRIGGER model_presets_keep_default
        BEFORE DELETE ON model_presets WHEN OLD.id = 'default'
        BEGIN SELECT RAISE(ABORT, 'default-preset-pinned'); END;
    `);
  },
};

export const MODEL_PRESET_SUB_MIGRATION: SchemaMigration = {
  id: 'model-preset-sub-choices',
  module: 'model-presets',
  description: 'Backfill the explicit Assignment choices and default for each Model Preset',
  migrate(database) {
    const rows = database
      .prepare(`
      SELECT id, body FROM model_presets WHERE json_type(body, '$.sub') IS NULL
    `)
      .all();
    const update = database.prepare(`
      UPDATE model_presets SET body = json_set(body, '$.sub', json(?)) WHERE id = ?
    `);
    for (const row of rows) {
      const preset: ModelPreset = JSON.parse(String(row['body']));
      update.run(JSON.stringify(presetSubFromLegacy(preset)), String(row['id']));
    }
  },
};

export const MODEL_PRESET_SUB_ENGINE_MIGRATION: SchemaMigration = {
  id: 'model-preset-sub-engine-choices',
  module: 'model-presets',
  description: 'Backfill legacy Assignment Subscription Engines into Model Preset sub choices',
  migrate(database) {
    const rows = database
      .prepare(`
        SELECT id, body FROM model_presets
        WHERE json_type(body, '$.assignmentEngine') = 'object'
      `)
      .all();
    const update = database.prepare(`
      UPDATE model_presets SET body = json_set(body, '$.sub', json(?)) WHERE id = ?
    `);
    for (const row of rows) {
      const preset: ModelPreset = JSON.parse(String(row['body']));
      const sub = preset.sub ?? presetSubFromLegacy(preset);
      const migrated = presetSubWithEngine(sub, preset.assignmentEngine);
      if (migrated !== sub) update.run(JSON.stringify(migrated), String(row['id']));
    }
  },
};
