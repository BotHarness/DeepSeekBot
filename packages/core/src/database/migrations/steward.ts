import type { SchemaMigration } from '../schema.js';

const noticeOf = (payload: string) =>
  `CASE WHEN json_valid(${payload}) THEN coalesce(${[
    'botDmAction',
    'botCreateAction',
    'botChannelPost',
    'memoryCommit',
    'toolAutoApproval',
    'toolAutoApprovalPause',
    'modelSwitch',
    'stewardTransfer',
  ]
    .map((field) => `json_type(${payload}, '$.${field}') = 'object'`)
    .join(' OR ')}, 0) ELSE 0 END`;

export const STEWARD_ROLE_MIGRATION: SchemaMigration = {
  id: 'steward-role',
  module: 'tob',
  description: 'Persist the Profile Steward independently of the built-in Tob identity',
  migrate(database) {
    database.exec(`
      CREATE TABLE steward_role (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        bot_slug TEXT NOT NULL REFERENCES persona_bots(slug),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
      ) STRICT;
      CREATE INDEX source_events_steward_transfer
        ON source_events (channel_id)
        WHERE source_kind = 'system-message' AND json_type(payload_json, '$.stewardTransfer') IS NOT NULL;
      DROP TRIGGER channel_placements_notice_insert;
      DROP TRIGGER channel_placements_notice_update;
      CREATE TRIGGER channel_placements_notice_insert AFTER INSERT ON channel_placements
        BEGIN
          UPDATE channel_placements SET notice = coalesce((
            SELECT ${noticeOf('payload_json')} FROM source_events
             WHERE source_event_id = NEW.source_event_id
          ), 0)
           WHERE channel_id = NEW.channel_id AND revision = NEW.revision;
        END;
      CREATE TRIGGER channel_placements_notice_update AFTER UPDATE OF payload_json ON source_events
        BEGIN
          UPDATE channel_placements SET notice = ${noticeOf('NEW.payload_json')}
           WHERE source_event_id = NEW.source_event_id;
        END;
      INSERT INTO steward_role (singleton, bot_slug)
        SELECT 1, t.bot_slug FROM tob_identity t
        JOIN team_settings s ON s.owner_human_id = t.human_id
        JOIN persona_bots b ON b.slug = t.bot_slug;
    `);
  },
};
