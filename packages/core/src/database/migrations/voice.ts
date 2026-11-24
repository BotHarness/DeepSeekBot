import type { SchemaMigration } from '../schema.js';

export const VOICE_PROVIDER_MIGRATION: SchemaMigration = {
  id: 'voice-provider',
  module: 'voice',
  description: 'Store TTS Providers; their keys stay in the credentials service',
  migrate(database) {
    database.exec(`
      CREATE TABLE voice_providers (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL CHECK (json_valid(body)),
        created_at TEXT NOT NULL
      );
    `);
  },
};

export const VOICE_DEFAULTS_MIGRATION: SchemaMigration = {
  id: 'voice-defaults',
  module: 'voice',
  description: 'Store the Host-wide default TTS and ASR Provider every Bot falls back to',
  migrate(database) {
    database.exec(`
      CREATE TABLE voice_defaults (
        kind TEXT PRIMARY KEY CHECK (kind IN ('tts', 'asr')),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
    `);
  },
};

export const VOICE_SETTINGS_MIGRATION: SchemaMigration = {
  id: 'voice-settings',
  module: 'voice',
  description: 'Store Host-wide voice tuning such as the speech detection threshold',
  migrate(database) {
    database.exec(`
      CREATE TABLE voice_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL CHECK (json_valid(value))
      );
    `);
  },
};

const callGridLayoutFor = (frames: string) =>
  `CASE ${frames} WHEN 1 THEN '1' WHEN 2 THEN '2' WHEN 3 THEN '3' WHEN 4 THEN '2+2' WHEN 5 THEN '3+2'
    WHEN 6 THEN '3+3' WHEN 7 THEN '3+2+2' WHEN 8 THEN '3+3+2' WHEN 9 THEN '3+3+3' END`;

export const CALL_GRID_ROWS_MIGRATION: SchemaMigration = {
  id: 'call-grid-rows',
  module: 'voice',
  description: 'Rewrite call grid layouts from square grids to balanced rows of at most three',
  migrate(database) {
    const visualFrames = "json_extract(payload_json, '$.voiceCall.visual.frames')";
    const recordFrames = "json_extract(payload_json, '$.voiceCallRecord.frames')";
    const oldVisual = `json_valid(payload_json)
      AND json_extract(payload_json, '$.voiceCall.visual.layout') IN ('1x1', '2x2', '3x3', '4x4')`;
    const oldRecord = `json_valid(payload_json)
      AND json_extract(payload_json, '$.voiceCallRecord.state') = 'frames'
      AND json_extract(payload_json, '$.voiceCallRecord.layout') IN ('1x1', '2x2', '3x3', '4x4')`;
    database.exec(`
      UPDATE source_events
         SET payload_json = json_set(payload_json, '$.voiceCall.visual.layout',
           ${callGridLayoutFor(visualFrames)})
       WHERE ${oldVisual} AND ${visualFrames} BETWEEN 1 AND 9;
      UPDATE source_events SET payload_json = json_remove(payload_json, '$.voiceCall.visual')
       WHERE ${oldVisual};
      UPDATE source_events
         SET body = replace(body,
               'a ' || json_extract(payload_json, '$.voiceCallRecord.layout') || ' grid of',
               'a ' || ${callGridLayoutFor(recordFrames)} || ' grid of'),
             payload_json = json_set(payload_json, '$.voiceCallRecord.layout',
               ${callGridLayoutFor(recordFrames)})
       WHERE ${oldRecord} AND ${recordFrames} BETWEEN 1 AND 9;
    `);
  },
};
