import type { SchemaMigration } from '../schema.js';

export const EXTERNAL_CONTACTS_MIGRATION: SchemaMigration = {
  id: 'external-contacts',
  module: 'messaging',
  description: 'Record external contacts and Bot-wide person blocks',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_contact_observations (
        binding_id TEXT NOT NULL REFERENCES messaging_bindings(id) ON DELETE CASCADE,
        bot_slug TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        name TEXT,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY (binding_id, bot_slug, actor_id)
      );
      CREATE INDEX messaging_contact_observations_bot ON messaging_contact_observations(bot_slug);
      CREATE TABLE messaging_person_blocks (
        contact_id TEXT NOT NULL,
        bot_slug TEXT NOT NULL,
        scope_kind TEXT NOT NULL CHECK (scope_kind IN ('bot', 'external-conversation', 'channel')),
        scope_id TEXT NOT NULL DEFAULT '',
        blocked_at TEXT NOT NULL,
        CHECK ((scope_kind = 'bot') = (scope_id = '')),
        PRIMARY KEY (bot_slug, contact_id, scope_kind, scope_id)
      );

      INSERT OR IGNORE INTO messaging_contact_observations
        (binding_id, bot_slug, actor_id, name, last_seen_at)
      SELECT b.id, recipients.bot_slug, json_extract(s.payload_json, '$.external.event.actor.id'),
             json_extract(s.payload_json, '$.external.event.actor.name'), s.created_at
      FROM source_events s
      JOIN messaging_bindings b ON b.id = COALESCE(
        json_extract(s.payload_json, '$.external.ingressBindingId'),
        (SELECT g.binding_id FROM messaging_grants g
         WHERE g.id = json_extract(s.payload_json, '$.external.grantId'))
      )
      JOIN (
        SELECT source_event_id, bot_slug FROM source_events WHERE source_kind = 'bridge-message'
        UNION
        SELECT source_event_id, bot_slug FROM inbox_admissions
      ) recipients ON recipients.source_event_id = s.source_event_id
      WHERE s.source_kind = 'bridge-message' AND recipients.bot_slug IS NOT NULL
        AND json_extract(s.payload_json, '$.external.event.actor.kind') = 'user'
        AND json_extract(s.payload_json, '$.external.event.actor.id') IS NOT NULL
      ORDER BY s.created_at DESC, s.source_event_id;

      CREATE TRIGGER messaging_observe_inbox_contact AFTER INSERT ON inbox_admissions BEGIN
        INSERT OR IGNORE INTO messaging_contact_observations
          (binding_id, bot_slug, actor_id, name, last_seen_at)
        SELECT b.id, NEW.bot_slug, json_extract(s.payload_json, '$.external.event.actor.id'),
               json_extract(s.payload_json, '$.external.event.actor.name'), s.created_at
        FROM source_events s
        JOIN messaging_bindings b ON b.id = COALESCE(
          json_extract(s.payload_json, '$.external.ingressBindingId'),
          (SELECT g.binding_id FROM messaging_grants g
           WHERE g.id = json_extract(s.payload_json, '$.external.grantId'))
        )
        WHERE s.source_event_id = NEW.source_event_id AND s.source_kind = 'bridge-message'
          AND json_extract(s.payload_json, '$.external.event.actor.kind') = 'user'
          AND json_extract(s.payload_json, '$.external.event.actor.id') IS NOT NULL;
      END;
    `);
  },
};
