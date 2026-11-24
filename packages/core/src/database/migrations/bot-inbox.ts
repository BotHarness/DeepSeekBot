import type { SchemaMigration } from '../schema.js';

export const BOT_ATTENTION_IGNORE_MIGRATION: SchemaMigration = {
  id: 'bot-attention-ignore',
  module: 'bot-inbox',
  description: 'Record explicit Bot ignore decisions on canonical Inbox Admissions',
  migrate(database) {
    database.exec(`
      ALTER TABLE inbox_admissions ADD COLUMN ignored_at TEXT;
      ALTER TABLE inbox_admissions ADD COLUMN ignored_by_session_id TEXT;
    `);
  },
};

export const GROUP_WAKE_MODE_MIGRATION: SchemaMigration = {
  id: 'group-wake-mode',
  module: 'bot-inbox',
  description: 'Preserve the Group wake policy mode on each ordinary Inbox Admission',
  migrate(database) {
    database.exec(`
      ALTER TABLE inbox_admissions ADD COLUMN wake_mode TEXT
        CHECK (wake_mode IN ('all', 'digest', 'mentions', 'silent'));
      UPDATE inbox_admissions
         SET wake_mode = CASE
           WHEN wake_count IS NULL THEN 'silent'
           WHEN wake_count = 1 AND wake_interval_ms = 0 THEN 'all'
           ELSE 'digest'
         END
       WHERE reason = 'group-ordinary';
    `);
  },
};

export const BOT_SOURCE_POLICY_MIGRATION: SchemaMigration = {
  id: 'bot-source-policy',
  module: 'bot-inbox',
  description: 'Record per-PersonaBot source policy revisions and Admission snapshots',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_source_policy_revisions (
        bot_slug TEXT NOT NULL,
        source_class TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('built-in', 'human', 'bot', 'template')),
        actor_bot_slug TEXT,
        changed_at TEXT NOT NULL,
        admission_mode TEXT NOT NULL CHECK (admission_mode IN ('admit', 'drop')),
        wake_mode TEXT NOT NULL CHECK (wake_mode IN ('immediate', 'digest', 'conditional')),
        digest_count INTEGER CHECK (digest_count BETWEEN 1 AND 100),
        digest_interval_seconds INTEGER CHECK (digest_interval_seconds BETWEEN 1 AND 3600),
        PRIMARY KEY (bot_slug, source_class, revision),
        CHECK ((actor_kind = 'bot' AND actor_bot_slug = bot_slug)
            OR (actor_kind <> 'bot' AND actor_bot_slug IS NULL)),
        CHECK ((wake_mode = 'digest' AND digest_count IS NOT NULL
                AND digest_interval_seconds IS NOT NULL)
            OR (wake_mode <> 'digest' AND digest_count IS NULL
                AND digest_interval_seconds IS NULL))
      );
      CREATE TRIGGER bot_source_policy_revisions_no_update
      BEFORE UPDATE ON bot_source_policy_revisions
      BEGIN SELECT RAISE(ABORT, 'Bot source policy revision is immutable'); END;
      CREATE TRIGGER bot_source_policy_revisions_no_delete
      BEFORE DELETE ON bot_source_policy_revisions
      BEGIN SELECT RAISE(ABORT, 'Bot source policy revision is immutable'); END;
      ALTER TABLE inbox_admissions ADD COLUMN source_policy_revision INTEGER;
      ALTER TABLE inbox_admissions ADD COLUMN source_policy_wake_mode TEXT;
    `);
  },
};

export const BOT_SOURCE_POLICY_EDIT_MIGRATION: SchemaMigration = {
  id: 'bot-source-policy-edit',
  module: 'bot-inbox',
  description: 'Distinguish active source overrides and record actual Orchestrator wake attempts',
  migrate(database) {
    database.exec(`
      ALTER TABLE bot_source_policy_revisions
        ADD COLUMN override_active INTEGER NOT NULL DEFAULT 0 CHECK (override_active IN (0, 1));
      CREATE TABLE bot_source_wake_attempts (
        wake_id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        source_class TEXT NOT NULL,
        session_id TEXT NOT NULL,
        started_at TEXT NOT NULL
      );
      CREATE INDEX bot_source_wake_attempts_recent
        ON bot_source_wake_attempts (bot_slug, source_class, started_at);
      CREATE TRIGGER bot_source_wake_attempts_no_update
      BEFORE UPDATE ON bot_source_wake_attempts
      BEGIN SELECT RAISE(ABORT, 'Bot source wake attempt is immutable'); END;
      CREATE TRIGGER bot_source_wake_attempts_no_delete
      BEFORE DELETE ON bot_source_wake_attempts
      BEGIN SELECT RAISE(ABORT, 'Bot source wake attempt is immutable'); END;
    `);
  },
};

export const BOT_SOURCE_DELIVERY_MIGRATION: SchemaMigration = {
  id: 'bot-source-delivery',
  module: 'bot-inbox',
  description: 'Record the delivery dimension of immediate source policies',
  migrate(database) {
    database.exec(`
      ALTER TABLE bot_source_policy_revisions
        ADD COLUMN delivery TEXT NOT NULL DEFAULT 'steer' CHECK (delivery IN ('steer', 'turn'));
    `);
  },
};

export const MEMORY_CHANGE_INBOX_MIGRATION: SchemaMigration = {
  id: 'memory-change-inbox',
  module: 'bot-inbox',
  description: 'Admit observed Memory changes as durable Source Events',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE source_events_next (
        source_event_id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN
          ('human-message', 'bot-message', 'system-message', 'assignment-report',
           'assignment-lifecycle', 'memory-change')),
        bot_slug TEXT,
        channel_id TEXT,
        message_id TEXT,
        assignment_session_id TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        handled_at TEXT,
        attempt_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled')),
        side_effect_started_at TEXT,
        expects_reply INTEGER NOT NULL DEFAULT 0 CHECK (expects_reply IN (0, 1)),
        observed_at TEXT,
        payload_json TEXT,
        UNIQUE (channel_id, message_id)
      );
      INSERT INTO source_events_next
      SELECT * FROM source_events;
      DROP TABLE source_events;
      ALTER TABLE source_events_next RENAME TO source_events;
      CREATE INDEX source_events_bot_created
        ON source_events (bot_slug, created_at, source_event_id);
      CREATE INDEX source_events_assignment_kind
        ON source_events (assignment_session_id, source_kind);

      CREATE TABLE inbox_admissions_next (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN
          ('human-dm', 'group-mention', 'bot-dm', 'group-invite', 'group-ordinary',
           'group-join-request', 'group-join-decision', 'assignment-report',
           'assignment-lifecycle', 'memory-change')),
        attempt_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled')),
        side_effect_started_at TEXT,
        handled_at TEXT,
        last_error TEXT,
        wake_count INTEGER,
        wake_interval_ms INTEGER,
        wake_policy_revision INTEGER,
        observed_at TEXT,
        ignored_at TEXT,
        ignored_by_session_id TEXT,
        wake_mode TEXT CHECK (wake_mode IN ('all', 'digest', 'mentions', 'silent')),
        source_policy_revision INTEGER,
        source_policy_wake_mode TEXT,
        PRIMARY KEY (source_event_id, bot_slug)
      );
      INSERT INTO inbox_admissions_next
      SELECT * FROM inbox_admissions;
      DROP TABLE inbox_admissions;
      ALTER TABLE inbox_admissions_next RENAME TO inbox_admissions;
      CREATE INDEX inbox_admissions_bot_pending
        ON inbox_admissions (bot_slug, attempt_state, source_event_id);
      CREATE INDEX inbox_admissions_digest_pending
        ON inbox_admissions (bot_slug, reason, attempt_state, wake_policy_revision);
    `);
  },
};

export const BOT_SOURCE_GROUP_MODES_MIGRATION: SchemaMigration = {
  id: 'bot-source-group-modes',
  module: 'bot-inbox',
  description: 'Allow ordinary Group source defaults to use mentions and silent wake modes',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_source_policy_revisions_next (
        bot_slug TEXT NOT NULL,
        source_class TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('built-in', 'human', 'bot', 'template')),
        actor_bot_slug TEXT,
        changed_at TEXT NOT NULL,
        admission_mode TEXT NOT NULL CHECK (admission_mode IN ('admit', 'drop')),
        wake_mode TEXT NOT NULL
          CHECK (wake_mode IN ('immediate', 'digest', 'conditional', 'mentions', 'silent')),
        digest_count INTEGER CHECK (digest_count BETWEEN 1 AND 100),
        digest_interval_seconds INTEGER CHECK (digest_interval_seconds BETWEEN 1 AND 3600),
        override_active INTEGER NOT NULL DEFAULT 0 CHECK (override_active IN (0, 1)),
        PRIMARY KEY (bot_slug, source_class, revision),
        CHECK ((actor_kind = 'bot' AND actor_bot_slug = bot_slug)
            OR (actor_kind <> 'bot' AND actor_bot_slug IS NULL)),
        CHECK ((wake_mode = 'digest' AND digest_count IS NOT NULL
                AND digest_interval_seconds IS NOT NULL)
            OR (wake_mode <> 'digest' AND digest_count IS NULL
                AND digest_interval_seconds IS NULL))
      );
      INSERT INTO bot_source_policy_revisions_next
        (bot_slug, source_class, revision, actor_kind, actor_bot_slug, changed_at,
         admission_mode, wake_mode, digest_count, digest_interval_seconds, override_active)
      SELECT bot_slug, source_class, revision, actor_kind, actor_bot_slug, changed_at,
             admission_mode, wake_mode, digest_count, digest_interval_seconds, override_active
        FROM bot_source_policy_revisions;
      DROP TRIGGER bot_source_policy_revisions_no_update;
      DROP TRIGGER bot_source_policy_revisions_no_delete;
      DROP TABLE bot_source_policy_revisions;
      ALTER TABLE bot_source_policy_revisions_next RENAME TO bot_source_policy_revisions;
      CREATE TRIGGER bot_source_policy_revisions_no_update
      BEFORE UPDATE ON bot_source_policy_revisions
      BEGIN SELECT RAISE(ABORT, 'Bot source policy revision is immutable'); END;
      CREATE TRIGGER bot_source_policy_revisions_no_delete
      BEFORE DELETE ON bot_source_policy_revisions
      BEGIN SELECT RAISE(ABORT, 'Bot source policy revision is immutable'); END;
    `);
  },
};

export const INBOX_RESOLUTION_MIGRATION: SchemaMigration = {
  id: 'inbox-resolution',
  module: 'bot-inbox',
  description: 'Keep Inbox Admissions open until the Orchestrator resolves them (ADR-0188)',
  migrate(database) {
    database.exec(`
      ALTER TABLE inbox_admissions ADD COLUMN opened_at TEXT;
      ALTER TABLE inbox_admissions ADD COLUMN resolved_at TEXT;
      ALTER TABLE inbox_admissions ADD COLUMN resolution TEXT
        CHECK (resolution IS NULL OR resolution IN ('done', 'ignored'));
      ALTER TABLE inbox_admissions ADD COLUMN resolution_note TEXT;
      ALTER TABLE inbox_admissions ADD COLUMN resolved_by_session_id TEXT;
      CREATE INDEX inbox_admissions_open
        ON inbox_admissions (bot_slug, opened_at)
        WHERE opened_at IS NOT NULL AND resolved_at IS NULL AND ignored_at IS NULL;
    `);
  },
};

export const INBOX_SNOOZE_MIGRATION: SchemaMigration = {
  id: 'inbox-snooze',
  module: 'bot-inbox',
  description: 'Let the Orchestrator snooze open Inbox Admissions until a time (ADR-0188)',
  migrate(database) {
    database.exec(`
      ALTER TABLE inbox_admissions ADD COLUMN snoozed_until TEXT;
      ALTER TABLE inbox_admissions ADD COLUMN snoozed_at TEXT;
      ALTER TABLE inbox_admissions ADD COLUMN snooze_note TEXT;
      CREATE INDEX inbox_admissions_snoozed
        ON inbox_admissions (bot_slug, snoozed_until)
        WHERE snoozed_until IS NOT NULL AND resolved_at IS NULL;
    `);
  },
};

export const NEEDS_REPAIR_INDEX_MIGRATION: SchemaMigration = {
  id: 'needs-repair-index',
  module: 'bot-inbox',
  description: 'Index Admissions that need repair without scanning Inbox history',
  migrate(database) {
    database.exec(`
      CREATE INDEX inbox_admissions_needs_repair ON inbox_admissions (source_event_id, bot_slug)
        WHERE attempt_state = 'needs-repair';
    `);
  },
};
