import type { SchemaMigration } from '../schema.js';
import { rebuildWithKind } from './shared.js';

export const BOT_SCHEDULE_MIGRATION: SchemaMigration = {
  id: 'bot-schedule',
  module: 'bot-schedules',
  description: 'Own PersonaBot Schedules and admit their firings into the Bot Inbox',
  rebuildsReferencedTables: true,
  migrate(database) {
    rebuildWithKind(database, 'source_events', 'bridge-message');
    rebuildWithKind(database, 'inbox_admissions', 'memory-change');
    database.exec(`
      CREATE TABLE bot_schedules (
        schedule_id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        creator TEXT NOT NULL CHECK (creator IN ('human', 'personabot')),
        locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX bot_schedules_bot ON bot_schedules (bot_slug, created_at);
      CREATE TABLE bot_schedule_firings (
        firing_id TEXT PRIMARY KEY,
        schedule_id TEXT NOT NULL,
        bot_slug TEXT NOT NULL,
        trigger TEXT NOT NULL CHECK (trigger IN ('planned', 'manual')),
        occurrence_at TEXT NOT NULL,
        fired_at TEXT NOT NULL,
        source_event_id TEXT,
        coalesced INTEGER NOT NULL DEFAULT 0 CHECK (coalesced IN (0, 1)),
        skipped_reason TEXT,
        session_id TEXT
      );
      CREATE INDEX bot_schedule_firings_schedule
        ON bot_schedule_firings (schedule_id, fired_at);
      CREATE INDEX bot_schedule_firings_event ON bot_schedule_firings (source_event_id);
    `);
  },
};

export const BOT_SCHEDULE_CREATION_RECEIPTS_MIGRATION: SchemaMigration = {
  id: 'bot-schedule-creation-receipts',
  module: 'bot-schedules',
  description: 'Reconcile a retried Bot Schedule creation by its operation key',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_schedule_creations (
        operation_key TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        schedule_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX bot_schedule_creations_bot ON bot_schedule_creations(bot_slug);
    `);
  },
};
