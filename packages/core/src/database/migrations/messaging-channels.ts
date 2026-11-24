import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import type { SchemaMigration } from '../schema.js';

export const MESSAGING_TRACER_MIGRATION: SchemaMigration = {
  id: 'messaging-tracer',
  module: 'messaging',
  description: 'Create the minimal durable Source Event and Bot Inbox admission path',
  migrate(database) {
    database.exec(`
      CREATE TABLE source_events (
        source_event_id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('human-message', 'assignment-report')),
        bot_slug TEXT NOT NULL,
        channel_id TEXT,
        message_id TEXT,
        assignment_session_id TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        handled_at TEXT,
        UNIQUE (channel_id, message_id)
      );
      CREATE INDEX source_events_bot_created
        ON source_events (bot_slug, created_at, source_event_id);
    `);
  },
};

export const CHANNEL_MESSAGING_MIGRATION: SchemaMigration = {
  id: 'channel-messaging',
  module: 'messaging',
  description:
    'Move Channel messages to canonical Source Events, placements, and per-Bot admissions',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE source_events_next (
        source_event_id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN
          ('human-message', 'bot-message', 'system-message', 'assignment-report')),
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
      INSERT INTO source_events_next (
        source_event_id, source_kind, bot_slug, channel_id, message_id,
        assignment_session_id, body, created_at, handled_at, attempt_state,
        side_effect_started_at, expects_reply, observed_at
      )
      SELECT source_event_id, source_kind, bot_slug, channel_id, message_id,
             assignment_session_id, body, created_at, handled_at, attempt_state,
             side_effect_started_at, expects_reply, observed_at
        FROM source_events;
      DROP TABLE source_events;
      ALTER TABLE source_events_next RENAME TO source_events;
      CREATE INDEX source_events_bot_created
        ON source_events (bot_slug, created_at, source_event_id);
      CREATE TABLE channel_records (
        channel_id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );
      CREATE TABLE channel_placements (
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id),
        revision INTEGER NOT NULL,
        source_event_id TEXT NOT NULL UNIQUE REFERENCES source_events(source_event_id),
        message_id TEXT NOT NULL,
        PRIMARY KEY (channel_id, revision),
        UNIQUE (channel_id, message_id)
      );
      CREATE TABLE channel_read_positions (
        channel_id TEXT PRIMARY KEY REFERENCES channel_records(channel_id),
        message_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        read_at TEXT NOT NULL
      );
      CREATE TABLE inbox_admissions (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('human-dm', 'group-mention')),
        attempt_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled')),
        side_effect_started_at TEXT,
        handled_at TEXT,
        last_error TEXT,
        PRIMARY KEY (source_event_id, bot_slug)
      );
      CREATE INDEX inbox_admissions_bot_pending
        ON inbox_admissions (bot_slug, attempt_state, source_event_id);
    `);
  },
};

export const BOT_DM_ADMISSION_MIGRATION: SchemaMigration = {
  id: 'bot-dm-admission',
  module: 'messaging',
  description: 'Admit Bot-to-Bot DM messages through the canonical Inbox',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE inbox_admissions_next (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('human-dm', 'group-mention', 'bot-dm')),
        attempt_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled')),
        side_effect_started_at TEXT,
        handled_at TEXT,
        last_error TEXT,
        PRIMARY KEY (source_event_id, bot_slug)
      );
      INSERT INTO inbox_admissions_next
        (source_event_id, bot_slug, reason, attempt_state,
         side_effect_started_at, handled_at, last_error)
      SELECT source_event_id, bot_slug, reason, attempt_state,
             side_effect_started_at, handled_at, last_error
        FROM inbox_admissions;
      DROP TABLE inbox_admissions;
      ALTER TABLE inbox_admissions_next RENAME TO inbox_admissions;
      CREATE INDEX inbox_admissions_bot_pending
        ON inbox_admissions (bot_slug, attempt_state, source_event_id);
    `);
  },
};

export const GROUP_INVITATION_ADMISSION_MIGRATION: SchemaMigration = {
  id: 'group-invitation-admission',
  module: 'messaging',
  description: 'Deliver Group invitations through the Bot Inbox before membership',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE inbox_admissions_next (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('human-dm', 'group-mention', 'bot-dm', 'group-invite')),
        attempt_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled')),
        side_effect_started_at TEXT,
        handled_at TEXT,
        last_error TEXT,
        PRIMARY KEY (source_event_id, bot_slug)
      );
      INSERT INTO inbox_admissions_next
        (source_event_id, bot_slug, reason, attempt_state,
         side_effect_started_at, handled_at, last_error)
      SELECT source_event_id, bot_slug, reason, attempt_state,
             side_effect_started_at, handled_at, last_error
        FROM inbox_admissions;
      DROP TABLE inbox_admissions;
      ALTER TABLE inbox_admissions_next RENAME TO inbox_admissions;
      CREATE INDEX inbox_admissions_bot_pending
        ON inbox_admissions (bot_slug, attempt_state, source_event_id);
    `);
  },
};

export const GROUP_DIGEST_ADMISSION_MIGRATION: SchemaMigration = {
  id: 'group-digest-admission',
  module: 'messaging',
  description: 'Capture per-Group ordinary-message digest policy with each Inbox Admission',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE inbox_admissions_next (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN
          ('human-dm', 'group-mention', 'bot-dm', 'group-invite', 'group-ordinary')),
        attempt_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled')),
        side_effect_started_at TEXT,
        handled_at TEXT,
        last_error TEXT,
        wake_count INTEGER,
        wake_interval_ms INTEGER,
        wake_policy_revision INTEGER,
        observed_at TEXT,
        PRIMARY KEY (source_event_id, bot_slug)
      );
      INSERT INTO inbox_admissions_next
        (source_event_id, bot_slug, reason, attempt_state,
         side_effect_started_at, handled_at, last_error)
      SELECT source_event_id, bot_slug, reason, attempt_state,
             side_effect_started_at, handled_at, last_error
        FROM inbox_admissions;
      DROP TABLE inbox_admissions;
      ALTER TABLE inbox_admissions_next RENAME TO inbox_admissions;
      CREATE INDEX inbox_admissions_bot_pending
        ON inbox_admissions (bot_slug, attempt_state, source_event_id);
      CREATE INDEX inbox_admissions_digest_pending
        ON inbox_admissions (bot_slug, reason, attempt_state, wake_policy_revision);
    `);
  },
};

export const GROUP_JOIN_ADMISSION_MIGRATION: SchemaMigration = {
  id: 'group-join-admission',
  module: 'messaging',
  description: 'Admit Group join requests and decisions as durable Bot Inbox notifications',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE inbox_admissions_next (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN
          ('human-dm', 'group-mention', 'bot-dm', 'group-invite', 'group-ordinary',
           'group-join-request', 'group-join-decision')),
        attempt_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled')),
        side_effect_started_at TEXT,
        handled_at TEXT,
        last_error TEXT,
        wake_count INTEGER,
        wake_interval_ms INTEGER,
        wake_policy_revision INTEGER,
        observed_at TEXT,
        PRIMARY KEY (source_event_id, bot_slug)
      );
      INSERT INTO inbox_admissions_next
        (source_event_id, bot_slug, reason, attempt_state,
         side_effect_started_at, handled_at, last_error,
         wake_count, wake_interval_ms, wake_policy_revision, observed_at)
      SELECT source_event_id, bot_slug, reason, attempt_state,
             side_effect_started_at, handled_at, last_error,
             wake_count, wake_interval_ms, wake_policy_revision, observed_at
        FROM inbox_admissions;
      DROP TABLE inbox_admissions;
      ALTER TABLE inbox_admissions_next RENAME TO inbox_admissions;
      CREATE INDEX inbox_admissions_bot_pending
        ON inbox_admissions (bot_slug, attempt_state, source_event_id);
      CREATE INDEX inbox_admissions_digest_pending
        ON inbox_admissions (bot_slug, reason, attempt_state, wake_policy_revision);

    `);
  },
};

export const ASSIGNMENT_REPORT_ADMISSION_MIGRATION: SchemaMigration = {
  id: 'assignment-report-admission',
  module: 'messaging',
  description: 'Admit Assignment reports to their PersonaBot Inbox',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE inbox_admissions_next (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN
          ('human-dm', 'group-mention', 'bot-dm', 'group-invite', 'group-ordinary',
           'group-join-request', 'group-join-decision', 'assignment-report')),
        attempt_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (attempt_state IN ('pending', 'running', 'retryable', 'needs-repair', 'handled')),
        side_effect_started_at TEXT,
        handled_at TEXT,
        last_error TEXT,
        wake_count INTEGER,
        wake_interval_ms INTEGER,
        wake_policy_revision INTEGER,
        observed_at TEXT,
        PRIMARY KEY (source_event_id, bot_slug)
      );
      INSERT INTO inbox_admissions_next
        (source_event_id, bot_slug, reason, attempt_state,
         side_effect_started_at, handled_at, last_error,
         wake_count, wake_interval_ms, wake_policy_revision, observed_at)
      SELECT source_event_id, bot_slug, reason, attempt_state,
             side_effect_started_at, handled_at, last_error,
             wake_count, wake_interval_ms, wake_policy_revision, observed_at
        FROM inbox_admissions;
      INSERT OR IGNORE INTO inbox_admissions_next
        (source_event_id, bot_slug, reason, attempt_state, handled_at, observed_at)
      SELECT source_event_id, bot_slug, 'assignment-report',
             CASE WHEN observed_at IS NULL THEN 'pending' ELSE 'handled' END,
             observed_at, observed_at
        FROM source_events
       WHERE source_kind = 'assignment-report' AND bot_slug IS NOT NULL;
      DROP TABLE inbox_admissions;
      ALTER TABLE inbox_admissions_next RENAME TO inbox_admissions;
      CREATE INDEX inbox_admissions_bot_pending
        ON inbox_admissions (bot_slug, attempt_state, source_event_id);
      CREATE INDEX inbox_admissions_digest_pending
        ON inbox_admissions (bot_slug, reason, attempt_state, wake_policy_revision);
    `);
  },
};

export const LOCAL_HUMAN_RECEIPTS_MIGRATION: SchemaMigration = {
  id: 'local-human-receipts',
  module: 'messaging',
  description: 'Give the local Human explicit Group membership and identity-keyed read positions',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE channel_human_members (
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id),
        human_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        visible_from_revision INTEGER NOT NULL,
        joined_at TEXT NOT NULL,
        left_at TEXT,
        PRIMARY KEY (channel_id, human_id)
      );
    `);
    database
      .prepare(`
      INSERT INTO channel_human_members
        (channel_id, human_id, display_name, visible_from_revision, joined_at)
      SELECT channel_id, ?, 'Human', 1,
             json_extract(record_json, '$.createdAt')
        FROM channel_records
       WHERE json_extract(record_json, '$.type') = 'group'
         AND json_extract(record_json, '$.deletedAt') IS NULL;
    `)
      .run(OWNER_HUMAN_CONTEXT.humanId);
    database.exec(`
      CREATE TABLE channel_read_positions_next (
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id),
        human_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        read_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, human_id)
      );
    `);
    database
      .prepare(`
      INSERT INTO channel_read_positions_next
        (channel_id, human_id, message_id, revision, read_at)
      SELECT channel_id, ?, message_id, revision, read_at
        FROM channel_read_positions;
    `)
      .run(OWNER_HUMAN_CONTEXT.humanId);
    database.exec(`
      DROP TABLE channel_read_positions;
      ALTER TABLE channel_read_positions_next RENAME TO channel_read_positions;
    `);
  },
};

export const GROUP_WAKE_POLICY_AUDIT_MIGRATION: SchemaMigration = {
  id: 'group-wake-policy-audit',
  module: 'messaging',
  description: 'Audit per-member Group wake policy revisions without duplicating current policy',
  migrate(database) {
    database.exec(`
      CREATE TABLE group_wake_policy_audit (
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id),
        bot_slug TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('human', 'bot')),
        actor_bot_slug TEXT,
        changed_at TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('all', 'digest', 'mentions', 'silent')),
        count INTEGER NOT NULL CHECK (count BETWEEN 1 AND 100),
        interval_seconds INTEGER NOT NULL CHECK (interval_seconds BETWEEN 1 AND 3600),
        PRIMARY KEY (channel_id, bot_slug, revision),
        CHECK ((actor_kind = 'human' AND actor_bot_slug IS NULL)
            OR (actor_kind = 'bot' AND actor_bot_slug IS NOT NULL))
      );
      CREATE TRIGGER group_wake_policy_audit_no_update
      BEFORE UPDATE ON group_wake_policy_audit
      BEGIN SELECT RAISE(ABORT, 'Group wake policy audit is immutable'); END;
      CREATE TRIGGER group_wake_policy_audit_no_delete
      BEFORE DELETE ON group_wake_policy_audit
      BEGIN SELECT RAISE(ABORT, 'Group wake policy audit is immutable'); END;
    `);
  },
};

export const LOCAL_HUMAN_NAME_MIGRATION: SchemaMigration = {
  id: 'local-human-name',
  module: 'messaging',
  description: 'Retain one optional local Human default name without changing membership',
  migrate(database) {
    database.exec(`CREATE TABLE local_human_names (
      human_id TEXT PRIMARY KEY,
      default_display_name TEXT
    );`);
  },
};

export const HUMAN_CHANNEL_NICKNAME_MIGRATION: SchemaMigration = {
  id: 'human-channel-nickname',
  module: 'messaging',
  description: 'Retain explicit per-Channel Human nickname overrides',
  migrate(database) {
    database.exec(`CREATE TABLE channel_human_nicknames (
      channel_id TEXT NOT NULL REFERENCES channel_records(channel_id) ON DELETE CASCADE,
      human_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      PRIMARY KEY (channel_id, human_id)
    );`);
  },
};

export const CHANNEL_REACTION_MIGRATION: SchemaMigration = {
  id: 'channel-reaction',
  module: 'messaging',
  description: 'Record emoji reactions on Channel messages',
  migrate(database) {
    database.exec(`
      CREATE TABLE channel_reactions (
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id) ON DELETE CASCADE,
        message_id TEXT NOT NULL,
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('human', 'bot')),
        actor_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        reacted_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, message_id, actor_kind, actor_id, emoji)
      );
    `);
  },
};

export const CHANNEL_CHANGE_LOG_MIGRATION: SchemaMigration = {
  id: 'channel-change-log',
  module: 'messaging',
  description: 'Record every change to what a placed message renders in a global change log',
  migrate(database) {
    database.exec(`
      CREATE TABLE channel_change_epoch (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        epoch TEXT NOT NULL,
        floor_seq INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO channel_change_epoch (singleton, epoch) VALUES (1, lower(hex(randomblob(8))));
      CREATE TABLE channel_changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        message_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('message', 'removed', 'channel', 'read')),
        changed_at INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
      );
      CREATE INDEX channel_changes_channel ON channel_changes (channel_id, seq);
      CREATE INDEX channel_changes_changed_at ON channel_changes (changed_at);
      CREATE INDEX source_events_reply_target
        ON source_events (json_extract(payload_json, '$.replyTo'))
        WHERE json_valid(payload_json) AND json_extract(payload_json, '$.replyTo') IS NOT NULL;
      CREATE INDEX source_events_post_target
        ON source_events (json_extract(payload_json, '$.botChannelPost.messageId'))
        WHERE json_valid(payload_json)
          AND json_extract(payload_json, '$.botChannelPost.messageId') IS NOT NULL;

      CREATE TRIGGER channel_change_placement_insert AFTER INSERT ON channel_placements
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            VALUES (NEW.channel_id, NEW.message_id, 'message');
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT NEW.channel_id, json_extract(e.payload_json, '$.grantRequestResolution.requestMessageId'), 'message'
              FROM source_events e
             WHERE e.source_event_id = NEW.source_event_id AND json_valid(e.payload_json)
               AND json_extract(e.payload_json, '$.grantRequestResolution.requestMessageId') IS NOT NULL;
        END;
      CREATE TRIGGER channel_change_placement_delete AFTER DELETE ON channel_placements
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            VALUES (OLD.channel_id, OLD.message_id, 'removed');
        END;
      CREATE TRIGGER channel_change_source_update AFTER UPDATE OF body, payload_json ON source_events
        WHEN OLD.body IS NOT NEW.body
          OR (CASE WHEN json_valid(OLD.payload_json)
                THEN json_remove(OLD.payload_json, '$.feedback', '$.external.contextReads')
                ELSE OLD.payload_json END)
             IS NOT (CASE WHEN json_valid(NEW.payload_json)
                THEN json_remove(NEW.payload_json, '$.feedback', '$.external.contextReads')
                ELSE NEW.payload_json END)
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT channel_id, message_id, 'message' FROM channel_placements
             WHERE source_event_id = NEW.source_event_id;
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT r.channel_id, r.message_id, 'message'
              FROM channel_placements p
              JOIN source_events re
                ON json_valid(re.payload_json) AND json_extract(re.payload_json, '$.replyTo') = p.message_id
              JOIN channel_placements r
                ON r.source_event_id = re.source_event_id AND r.channel_id = p.channel_id
             WHERE p.source_event_id = NEW.source_event_id;
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT r.channel_id, r.message_id, 'message'
              FROM channel_placements p
              JOIN source_events re
                ON json_valid(re.payload_json)
               AND json_extract(re.payload_json, '$.botChannelPost.messageId') = p.message_id
               AND json_extract(re.payload_json, '$.botChannelPost.channelId') = p.channel_id
              JOIN channel_placements r ON r.source_event_id = re.source_event_id
             WHERE p.source_event_id = NEW.source_event_id;
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT p.channel_id, json_extract(x.payload, '$.grantRequestResolution.requestMessageId'), 'message'
              FROM channel_placements p,
                   (SELECT OLD.payload_json AS payload UNION ALL SELECT NEW.payload_json) x
             WHERE p.source_event_id = NEW.source_event_id AND json_valid(x.payload)
               AND json_extract(x.payload, '$.grantRequestResolution.requestMessageId') IS NOT NULL;
        END;
      CREATE TRIGGER channel_change_admission_insert AFTER INSERT ON inbox_admissions
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT channel_id, message_id, 'message' FROM channel_placements
             WHERE source_event_id = NEW.source_event_id;
        END;
      CREATE TRIGGER channel_change_admission_update AFTER UPDATE ON inbox_admissions
        WHEN OLD.attempt_state IS NOT NEW.attempt_state OR OLD.handled_at IS NOT NEW.handled_at
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT channel_id, message_id, 'message' FROM channel_placements
             WHERE source_event_id = NEW.source_event_id;
        END;
      CREATE TRIGGER channel_change_admission_delete AFTER DELETE ON inbox_admissions
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT channel_id, message_id, 'message' FROM channel_placements
             WHERE source_event_id = OLD.source_event_id;
        END;
      CREATE TRIGGER channel_change_reaction_insert AFTER INSERT ON channel_reactions
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            VALUES (NEW.channel_id, NEW.message_id, 'message');
        END;
      CREATE TRIGGER channel_change_reaction_delete AFTER DELETE ON channel_reactions
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            VALUES (OLD.channel_id, OLD.message_id, 'message');
        END;
      CREATE TRIGGER channel_change_binding_insert AFTER INSERT ON attachment_file_bindings
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT channel_id, message_id, 'message' FROM channel_placements
             WHERE source_event_id = NEW.source_event_id;
        END;
      CREATE TRIGGER channel_change_binding_update AFTER UPDATE ON attachment_file_bindings
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT channel_id, message_id, 'message' FROM channel_placements
             WHERE source_event_id = NEW.source_event_id;
        END;
      CREATE TRIGGER channel_change_binding_delete AFTER DELETE ON attachment_file_bindings
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT channel_id, message_id, 'message' FROM channel_placements
             WHERE source_event_id = OLD.source_event_id;
        END;
      CREATE TRIGGER channel_change_request_assignment_insert AFTER INSERT ON request_assignments
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT channel_id, message_id, 'message' FROM channel_placements
             WHERE source_event_id = NEW.request_source_event_id;
        END;
      CREATE TRIGGER channel_change_request_assignment_delete AFTER DELETE ON request_assignments
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind)
            SELECT channel_id, message_id, 'message' FROM channel_placements
             WHERE source_event_id = OLD.request_source_event_id;
        END;
      CREATE TRIGGER channel_change_read_insert AFTER INSERT ON channel_read_positions
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (NEW.channel_id, NULL, 'read');
        END;
      CREATE TRIGGER channel_change_read_update AFTER UPDATE ON channel_read_positions
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (NEW.channel_id, NULL, 'read');
        END;
      CREATE TRIGGER channel_change_record_insert AFTER INSERT ON channel_records
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (NEW.channel_id, NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_record_update AFTER UPDATE ON channel_records
        WHEN (CASE WHEN json_valid(OLD.record_json)
                THEN json_remove(OLD.record_json, '$.updatedAt') ELSE OLD.record_json END)
          IS NOT (CASE WHEN json_valid(NEW.record_json)
                THEN json_remove(NEW.record_json, '$.updatedAt') ELSE NEW.record_json END)
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (NEW.channel_id, NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_nickname_insert AFTER INSERT ON channel_human_nicknames
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (NEW.channel_id, NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_nickname_update AFTER UPDATE ON channel_human_nicknames
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (NEW.channel_id, NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_nickname_delete AFTER DELETE ON channel_human_nicknames
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (OLD.channel_id, NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_member_insert AFTER INSERT ON channel_human_members
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (NEW.channel_id, NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_member_update AFTER UPDATE ON channel_human_members
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (NEW.channel_id, NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_member_delete AFTER DELETE ON channel_human_members
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES (OLD.channel_id, NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_name_insert AFTER INSERT ON local_human_names
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES ('*', NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_name_update AFTER UPDATE ON local_human_names
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES ('*', NULL, 'channel');
        END;
    `);
  },
};

export const GENUI_PRIVATE_VIEW_MIGRATION: SchemaMigration = {
  id: 'genui-private-view',
  module: 'messaging',
  description:
    'Private Human view drafts reference canonical report placements and cascade on purge',
  migrate(database) {
    database.exec(`CREATE TABLE genui_private_views (
      human_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      state_json TEXT NOT NULL,
      PRIMARY KEY (human_id, channel_id, message_id),
      FOREIGN KEY (channel_id, message_id) REFERENCES channel_placements(channel_id, message_id) ON DELETE CASCADE
    )`);
  },
};

export const SOURCE_EVENT_HUMAN_MIGRATION: SchemaMigration = {
  id: 'source-event-human',
  module: 'messaging',
  description: 'Record the speaking Human on Source Events without changing message payloads',
  migrate(database) {
    database.exec('ALTER TABLE source_events ADD COLUMN human_id TEXT');
    database
      .prepare(`UPDATE source_events SET human_id = ?
      WHERE source_kind = 'human-message'`)
      .run(OWNER_HUMAN_CONTEXT.humanId);
    database.exec(`CREATE TABLE human_attention_decisions_next (
      human_id TEXT NOT NULL,
      source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
      decision TEXT NOT NULL CHECK (decision IN ('ignored')),
      decided_at TEXT NOT NULL,
      PRIMARY KEY (human_id, source_event_id)
    )`);
    database
      .prepare(`INSERT INTO human_attention_decisions_next
      (human_id, source_event_id, decision, decided_at)
      SELECT ?, source_event_id, decision, decided_at FROM human_attention_decisions`)
      .run(OWNER_HUMAN_CONTEXT.humanId);
    database.exec(`DROP TABLE human_attention_decisions;
      ALTER TABLE human_attention_decisions_next RENAME TO human_attention_decisions`);
  },
};
