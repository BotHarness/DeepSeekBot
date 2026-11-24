import type { SchemaMigration } from '../schema.js';

export const CONTENT_PURGE_MIGRATION: SchemaMigration = {
  id: 'content-purge',
  module: 'messaging-purge',
  description: 'Require an independent Purge Ledger and fence accepted local Source Events',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_purge_requirement (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), version INTEGER NOT NULL);
      CREATE TABLE messaging_purge_facts (
        source_event_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
        accepted_at TEXT NOT NULL, tombstone_json TEXT NOT NULL CHECK(json_valid(tombstone_json))
      );
      CREATE TRIGGER messaging_purge_no_delete BEFORE DELETE ON messaging_purge_facts
        BEGIN SELECT RAISE(ABORT, 'purge facts are monotonic'); END;
      CREATE TRIGGER messaging_purge_no_update BEFORE UPDATE ON messaging_purge_facts
        BEGIN SELECT RAISE(ABORT, 'purge facts are monotonic'); END;
      CREATE TRIGGER messaging_purge_source_insert BEFORE INSERT ON source_events
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts f WHERE f.source_event_id = NEW.source_event_id
          OR (f.channel_id = NEW.channel_id AND f.message_id = NEW.message_id)
          OR f.source_event_id = json_extract(NEW.payload_json, '$.botCausation.rootSourceEventId')
          OR f.source_event_id = json_extract(NEW.payload_json, '$.botCausation.parentSourceEventId'))
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_source_update BEFORE UPDATE ON source_events
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts f WHERE (f.source_event_id = OLD.source_event_id
          OR (f.channel_id = NEW.channel_id AND f.message_id = NEW.message_id))
          AND (NEW.source_event_id != f.source_event_id OR NEW.channel_id != f.channel_id OR NEW.message_id != f.message_id
            OR NEW.body != '' OR NEW.payload_json != f.tombstone_json))
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_source_delete BEFORE DELETE ON source_events
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id = OLD.source_event_id)
        BEGIN SELECT RAISE(ABORT, 'retain purge causality'); END;
      CREATE TRIGGER messaging_purge_admission_insert BEFORE INSERT ON inbox_admissions
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id = NEW.source_event_id)
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_admission_update BEFORE UPDATE ON inbox_admissions
        WHEN NEW.attempt_state IN ('pending', 'retryable', 'running') AND EXISTS
          (SELECT 1 FROM messaging_purge_facts WHERE source_event_id = NEW.source_event_id)
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_outbox_insert BEFORE INSERT ON messaging_outbox
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id = json_extract(NEW.body, '$.sourceEventId'))
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_outbox_update BEFORE UPDATE ON messaging_outbox
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id = json_extract(NEW.body, '$.sourceEventId'))
          AND (COALESCE(json_extract(NEW.body, '$.text'), '') != '' OR json_type(NEW.body, '$.file') IS NOT NULL
            OR NEW.state IN ('pending', 'in-flight'))
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
    `);
  },
};

export const COMPLETE_CONTENT_PURGE_MIGRATION: SchemaMigration = {
  id: 'complete-content-purge',
  module: 'messaging-purge',
  description:
    'Track acquired media and fence shared content, stale effects and attachment bindings',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_managed_files (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        file_id TEXT NOT NULL, role TEXT NOT NULL,
        PRIMARY KEY (source_event_id, file_id)
      );
      CREATE INDEX memory_accepted_commits_source ON memory_accepted_commits(cause_kind, cause_id);
      DROP TRIGGER messaging_purge_source_update;
      CREATE TRIGGER messaging_purge_source_update BEFORE UPDATE ON source_events
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts f WHERE
          ((f.source_event_id IN (OLD.source_event_id, NEW.source_event_id)
            OR (f.channel_id = NEW.channel_id AND f.message_id = NEW.message_id))
           AND (NEW.source_event_id != f.source_event_id OR NEW.channel_id IS NOT f.channel_id
             OR NEW.message_id IS NOT f.message_id OR NEW.body != '' OR NEW.payload_json IS NOT f.tombstone_json))
          OR (f.source_event_id IN (json_extract(NEW.payload_json, '$.botCausation.rootSourceEventId'),
            json_extract(NEW.payload_json, '$.botCausation.parentSourceEventId'))
            AND NEW.payload_json IS NOT f.tombstone_json AND NEW.payload_json IS NOT OLD.payload_json))
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      DROP TRIGGER messaging_purge_outbox_update;
      CREATE TRIGGER messaging_purge_outbox_update BEFORE UPDATE ON messaging_outbox
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id IN
          (json_extract(OLD.body, '$.sourceEventId'), json_extract(NEW.body, '$.sourceEventId')))
          AND (json_extract(OLD.body, '$.sourceEventId') IS NOT json_extract(NEW.body, '$.sourceEventId')
            OR COALESCE(json_extract(NEW.body, '$.text'), '') != '' OR json_type(NEW.body, '$.file') IS NOT NULL
            OR NEW.state = 'pending')
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_file_binding_insert BEFORE INSERT ON attachment_file_bindings
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id = NEW.source_event_id)
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_file_binding_update BEFORE UPDATE ON attachment_file_bindings
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id IN (OLD.source_event_id, NEW.source_event_id))
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_managed_file_insert BEFORE INSERT ON messaging_managed_files
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id = NEW.source_event_id)
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_placement_insert BEFORE INSERT ON channel_placements
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id = NEW.source_event_id)
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
      CREATE TRIGGER messaging_purge_assignment_insert BEFORE INSERT ON assignments
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts WHERE source_event_id = NEW.source_event_id)
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
    `);
  },
};

export const CAUSAL_PURGE_TOMBSTONE_MIGRATION: SchemaMigration = {
  id: 'causal-purge-tombstone',
  module: 'messaging-purge',
  description: 'Allow a Source Event canonical tombstone when its causal ancestors are purged',
  migrate(database) {
    database.exec(`
      DROP TRIGGER messaging_purge_source_update;
      CREATE TRIGGER messaging_purge_source_update BEFORE UPDATE ON source_events
        WHEN EXISTS (SELECT 1 FROM messaging_purge_facts f WHERE
          ((f.source_event_id IN (OLD.source_event_id, NEW.source_event_id)
            OR (f.channel_id = NEW.channel_id AND f.message_id = NEW.message_id))
           AND (NEW.source_event_id != f.source_event_id OR NEW.channel_id IS NOT f.channel_id
             OR NEW.message_id IS NOT f.message_id OR NEW.body != '' OR NEW.payload_json IS NOT f.tombstone_json))
          OR (f.source_event_id IN (json_extract(NEW.payload_json, '$.botCausation.rootSourceEventId'),
            json_extract(NEW.payload_json, '$.botCausation.parentSourceEventId'))
            AND NEW.payload_json IS NOT f.tombstone_json AND NEW.payload_json IS NOT OLD.payload_json
            AND NOT EXISTS (SELECT 1 FROM messaging_purge_facts own
              WHERE own.source_event_id = NEW.source_event_id
                AND own.channel_id IS NEW.channel_id AND own.message_id IS NEW.message_id
                AND NEW.body = '' AND own.tombstone_json IS NEW.payload_json)))
        BEGIN SELECT RAISE(ABORT, 'content purged'); END;
    `);
  },
};
