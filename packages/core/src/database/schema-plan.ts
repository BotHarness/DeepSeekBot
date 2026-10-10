import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { defineSchemaPlan, type SchemaMigration } from './schema.js';
import { INBOX_HISTORY_INDEX_SQL } from './inbox-history-index.js';

const SESSION_OWNERSHIP_MIGRATION: SchemaMigration = {
  generation: 2,
  module: 'session-ownership',
  description: 'Create explicit PersonaBot root Session ownership',
  migrate(database) {
    database.exec(`
      CREATE TABLE session_ownership (
        session_id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        root_role TEXT NOT NULL CHECK (root_role IN ('orchestrator', 'assignment')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX session_ownership_bot_role
        ON session_ownership (bot_slug, root_role, created_at, session_id);
    `);
  },
};

const MESSAGING_TRACER_MIGRATION: SchemaMigration = {
  generation: 3,
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

const ASSIGNMENT_DIRECTORY_MIGRATION: SchemaMigration = {
  generation: 4,
  module: 'assignments',
  description: 'Create the durable Assignment Directory and latest report projection',
  migrate(database) {
    database.exec(`
      CREATE TABLE assignments (
        session_id TEXT PRIMARY KEY REFERENCES session_ownership(session_id),
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL,
        purpose TEXT NOT NULL,
        activity TEXT NOT NULL CHECK (activity IN ('working', 'idle', 'error')),
        latest_report_state TEXT,
        latest_report_summary TEXT,
        latest_report_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX assignments_bot_updated
        ON assignments (bot_slug, updated_at DESC, session_id);
    `);
  },
};

const SOURCE_EVENT_ATTEMPT_MIGRATION: SchemaMigration = {
  generation: 5,
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

const SESSION_OWNERSHIP_LINEAGE_MIGRATION: SchemaMigration = {
  generation: 6,
  module: 'session-ownership',
  description: 'Record ownership provenance, lineage, and the explicit cwd reference',
  migrate(database) {
    database.exec(`
      ALTER TABLE session_ownership
        ADD COLUMN provenance TEXT NOT NULL DEFAULT 'legacy'
        CHECK (provenance IN ('created', 'fork', 'subagent', 'repair', 'legacy'));
      ALTER TABLE session_ownership ADD COLUMN parent_session_id TEXT;
      ALTER TABLE session_ownership ADD COLUMN cwd_reference TEXT;
    `);
  },
};

const SOURCE_EVENT_SIDE_EFFECT_MIGRATION: SchemaMigration = {
  generation: 7,
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

const ASSIGNMENT_COLLABORATION_MIGRATION: SchemaMigration = {
  generation: 8,
  module: 'assignments',
  description: 'Admit Assignment reports and asks with observation and continuity facts',
  migrate(database) {
    database.exec(`
      ALTER TABLE source_events
        ADD COLUMN expects_reply INTEGER NOT NULL DEFAULT 0 CHECK (expects_reply IN (0, 1));
      ALTER TABLE source_events ADD COLUMN observed_at TEXT;
      ALTER TABLE assignments ADD COLUMN continuity_key TEXT;
      ALTER TABLE assignments ADD COLUMN open_ask_source_event_id TEXT;
      ALTER TABLE assignments ADD COLUMN open_ask_at TEXT;
      UPDATE source_events
         SET observed_at = handled_at
       WHERE source_kind = 'assignment-report' AND handled_at IS NOT NULL;
      CREATE UNIQUE INDEX assignments_bot_continuity_key
        ON assignments (bot_slug, continuity_key)
        WHERE continuity_key IS NOT NULL;
    `);
  },
};

const SESSION_PERSONA_SNAPSHOT_MIGRATION: SchemaMigration = {
  generation: 9,
  module: 'session-ownership',
  description: 'Freeze each Session system-prompt persona at its first assembly',
  migrate(database) {
    database.exec(`
      ALTER TABLE session_ownership ADD COLUMN persona_snapshot TEXT;
      ALTER TABLE session_ownership ADD COLUMN persona_snapshot_at TEXT;
    `);
  },
};

const MEMORY_ACCEPTED_COMMIT_MIGRATION: SchemaMigration = {
  generation: 10,
  module: 'memory',
  description: 'Record accepted Memory Commit lineage and repository heads',
  migrate(database) {
    database.exec(`
      CREATE TABLE memory_accepted_commits (
        bot_slug TEXT NOT NULL,
        sha TEXT NOT NULL,
        parent_sha TEXT,
        actor_kind TEXT NOT NULL CHECK (actor_kind IN ('agent', 'human', 'system')),
        actor_id TEXT NOT NULL,
        cause_kind TEXT NOT NULL CHECK (cause_kind IN ('source-event', 'human-edit', 'repository-init')),
        cause_id TEXT NOT NULL,
        validation_result TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        PRIMARY KEY (bot_slug, sha)
      );
      CREATE INDEX memory_accepted_commits_history
        ON memory_accepted_commits (bot_slug, accepted_at DESC, sha);
      CREATE TABLE memory_accepted_heads (
        bot_slug TEXT PRIMARY KEY,
        head_sha TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (bot_slug, head_sha)
          REFERENCES memory_accepted_commits(bot_slug, sha)
      );
      CREATE TABLE memory_repair_events (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        accepted_head_sha TEXT NOT NULL,
        provisional_head_sha TEXT NOT NULL,
        backup_path TEXT NOT NULL,
        actor_kind TEXT NOT NULL CHECK (actor_kind = 'human'),
        actor_id TEXT NOT NULL,
        cause_kind TEXT NOT NULL CHECK (cause_kind = 'human-repair'),
        status TEXT NOT NULL CHECK (status IN ('started', 'completed')),
        requested_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX memory_repair_events_bot_time
        ON memory_repair_events (bot_slug, requested_at DESC);
    `);
  },
};

export const WORKSPACE_GRANT_MIGRATION: SchemaMigration = {
  generation: 11,
  module: 'workspace-grants',
  description: 'Record Human Workspace Grants and immutable Assignment permission provenance',
  migrate(database) {
    database.exec(`
      CREATE TABLE workspace_grants (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        workspace_title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE UNIQUE INDEX workspace_grants_active_target
        ON workspace_grants (bot_slug, workspace_id) WHERE revoked_at IS NULL;
      ALTER TABLE assignments ADD COLUMN grant_id TEXT REFERENCES workspace_grants(id);
      ALTER TABLE assignments ADD COLUMN workspace_id TEXT;
      ALTER TABLE assignments ADD COLUMN primary_cwd TEXT;
      ALTER TABLE assignments ADD COLUMN permission_mode TEXT;
      ALTER TABLE assignments ADD COLUMN approval_policy TEXT;
      ALTER TABLE assignments ADD COLUMN preset_revision INTEGER;
    `);
  },
};

export const TOOL_APPROVAL_RULE_MIGRATION: SchemaMigration = {
  generation: 12,
  module: 'tool-approval-rules',
  description: 'Persist revocable Human rules for native tool approval',
  migrate(database) {
    database.exec(`
      CREATE TABLE tool_approval_rules (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('orchestrator', 'assignment')),
        scope_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('exact', 'all-opaque')),
        tool_name TEXT NOT NULL,
        input TEXT NOT NULL,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        revoked_at TEXT
      );
      CREATE INDEX tool_approval_rules_lookup
        ON tool_approval_rules (bot_slug, role, scope_key, active, revoked_at);
    `);
  },
};

export const ASSIGNMENT_ACCESS_MIGRATION: SchemaMigration = {
  generation: 13,
  module: 'assignment-access',
  description: 'Persist Human-owned per-Bot Assignment access preset and audit',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_assignment_access (
        bot_slug TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('workspace-write', 'danger-full-access')),
        revision INTEGER NOT NULL,
        changed_at TEXT NOT NULL
      );
      CREATE TABLE bot_assignment_access_events (
        bot_slug TEXT NOT NULL,
        revision INTEGER NOT NULL,
        prior_mode TEXT NOT NULL,
        mode TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        actor_kind TEXT NOT NULL CHECK (actor_kind = 'human'),
        PRIMARY KEY (bot_slug, revision)
      );
    `);
  },
};

export const MEMORY_BRANCH_HEAD_MIGRATION: SchemaMigration = {
  generation: 14,
  module: 'memory',
  description: 'Track the accepted Memory head independently for each local branch',
  migrate(database) {
    database.exec(`
      CREATE TABLE memory_accepted_heads_by_branch (
        bot_slug TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (bot_slug, branch_name),
        FOREIGN KEY (bot_slug, head_sha)
          REFERENCES memory_accepted_commits(bot_slug, sha)
      );
      INSERT INTO memory_accepted_heads_by_branch (bot_slug, branch_name, head_sha, updated_at)
        SELECT bot_slug, 'main', head_sha, updated_at FROM memory_accepted_heads;
      DROP TABLE memory_accepted_heads;
      ALTER TABLE memory_accepted_heads_by_branch RENAME TO memory_accepted_heads;
    `);
  },
};

export const CHANNEL_MESSAGING_MIGRATION: SchemaMigration = {
  generation: 15,
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

const BOT_DM_ADMISSION_MIGRATION: SchemaMigration = {
  generation: 16,
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

const GROUP_INVITATION_ADMISSION_MIGRATION: SchemaMigration = {
  generation: 17,
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

const GROUP_DIGEST_ADMISSION_MIGRATION: SchemaMigration = {
  generation: 18,
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

const GROUP_JOIN_ADMISSION_MIGRATION: SchemaMigration = {
  generation: 19,
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

const ASSIGNMENT_STOP_MIGRATION: SchemaMigration = {
  generation: 20,
  module: 'assignments',
  description:
    'Persist stopping and stopped Assignment lifecycle while retaining DSH Session history',
  migrate(database) {
    database.exec(`
      ALTER TABLE assignments ADD COLUMN stop_state TEXT NOT NULL DEFAULT 'running'
        CHECK (stop_state IN ('running', 'requested', 'stopped'));
    `);
  },
};
const ASSIGNMENT_REPORT_ADMISSION_MIGRATION: SchemaMigration = {
  generation: 21,
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

const HUMAN_ATTENTION_DECISION_MIGRATION: SchemaMigration = {
  generation: 22,
  module: 'human-attention',
  description: 'Record Human decisions for informational Source Events',
  migrate(database) {
    database.exec(`
      CREATE TABLE human_attention_decisions (
        source_event_id TEXT PRIMARY KEY REFERENCES source_events(source_event_id),
        decision TEXT NOT NULL CHECK (decision IN ('ignored')),
        decided_at TEXT NOT NULL
      );
      CREATE INDEX source_events_assignment_kind
        ON source_events (assignment_session_id, source_kind);
    `);
  },
};

const BOT_ATTENTION_IGNORE_MIGRATION: SchemaMigration = {
  generation: 23,
  module: 'bot-inbox',
  description: 'Record explicit Bot ignore decisions on canonical Inbox Admissions',
  migrate(database) {
    database.exec(`
      ALTER TABLE inbox_admissions ADD COLUMN ignored_at TEXT;
      ALTER TABLE inbox_admissions ADD COLUMN ignored_by_session_id TEXT;
    `);
  },
};

const ASSIGNMENT_LIFECYCLE_NOTICE_MIGRATION: SchemaMigration = {
  generation: 24,
  module: 'assignments',
  description: 'Admit Host-origin Assignment lifecycle notices to the Bot Inbox',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE source_events_next (
        source_event_id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN
          ('human-message', 'bot-message', 'system-message', 'assignment-report',
           'assignment-lifecycle')),
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
        side_effect_started_at, expects_reply, observed_at, payload_json
      )
      SELECT source_event_id, source_kind, bot_slug, channel_id, message_id,
             assignment_session_id, body, created_at, handled_at, attempt_state,
             side_effect_started_at, expects_reply, observed_at, payload_json
        FROM source_events;
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
           'assignment-lifecycle')),
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
        PRIMARY KEY (source_event_id, bot_slug)
      );
      INSERT INTO inbox_admissions_next (
        source_event_id, bot_slug, reason, attempt_state, side_effect_started_at,
        handled_at, last_error, wake_count, wake_interval_ms, wake_policy_revision,
        observed_at, ignored_at, ignored_by_session_id
      )
      SELECT source_event_id, bot_slug, reason, attempt_state, side_effect_started_at,
             handled_at, last_error, wake_count, wake_interval_ms, wake_policy_revision,
             observed_at, ignored_at, ignored_by_session_id
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

export const LOCAL_HUMAN_RECEIPTS_MIGRATION: SchemaMigration = {
  generation: 25,
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
      INSERT INTO channel_human_members
        (channel_id, human_id, display_name, visible_from_revision, joined_at)
      SELECT channel_id, 'local-human', 'Human', 1,
             json_extract(record_json, '$.createdAt')
        FROM channel_records
       WHERE json_extract(record_json, '$.type') = 'group'
         AND json_extract(record_json, '$.deletedAt') IS NULL;
      CREATE TABLE channel_read_positions_next (
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id),
        human_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        read_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, human_id)
      );
      INSERT INTO channel_read_positions_next
        (channel_id, human_id, message_id, revision, read_at)
      SELECT channel_id, 'local-human', message_id, revision, read_at
        FROM channel_read_positions;
      DROP TABLE channel_read_positions;
      ALTER TABLE channel_read_positions_next RENAME TO channel_read_positions;
    `);
  },
};

const GROUP_WAKE_MODE_MIGRATION: SchemaMigration = {
  generation: 26,
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

const GROUP_WAKE_POLICY_AUDIT_MIGRATION: SchemaMigration = {
  generation: 27,
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

const USAGE_DAILY_MIGRATION: SchemaMigration = {
  generation: 28,
  module: 'usage',
  description: 'Derive per-PersonaBot daily token buckets from DSH Session usage events',
  migrate(database) {
    database.exec(`
      CREATE TABLE usage_daily (
        bot_slug TEXT NOT NULL,
        day TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        purpose TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (bot_slug, day, provider, model, purpose)
      );
      CREATE INDEX usage_daily_bot_day ON usage_daily (bot_slug, day);
    `);
  },
};

const BOT_SOURCE_POLICY_MIGRATION: SchemaMigration = {
  generation: 29,
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

const BOT_SOURCE_POLICY_EDIT_MIGRATION: SchemaMigration = {
  generation: 30,
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

const BOT_SOURCE_DELIVERY_MIGRATION: SchemaMigration = {
  generation: 36,
  module: 'bot-inbox',
  description: 'Record the delivery dimension of immediate source policies',
  migrate(database) {
    database.exec(`
      ALTER TABLE bot_source_policy_revisions
        ADD COLUMN delivery TEXT NOT NULL DEFAULT 'steer' CHECK (delivery IN ('steer', 'turn'));
    `);
  },
};

const MEMORY_CHANGE_INBOX_MIGRATION: SchemaMigration = {
  generation: 32,
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

const BOT_SOURCE_GROUP_MODES_MIGRATION: SchemaMigration = {
  generation: 31,
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

const MEMORY_CHANGE_CHECKPOINT_MIGRATION: SchemaMigration = {
  generation: 33,
  module: 'memory',
  description: 'Keep per-Bot Memory observations across Host restarts',
  migrate(database) {
    database.exec(`
      CREATE TABLE memory_change_checkpoints (
        bot_slug TEXT PRIMARY KEY,
        repository_root TEXT NOT NULL,
        repository_identity TEXT NOT NULL,
        observation_json TEXT NOT NULL,
        observed_at TEXT NOT NULL
      );
    `);
  },
};

const MEMORY_RECOVERY_CHECKPOINT_MIGRATION: SchemaMigration = {
  generation: 34,
  module: 'memory',
  description: 'Retain audited Git recovery checkpoints for Memory state',
  migrate(database) {
    database.exec(`
      CREATE TABLE memory_recovery_checkpoints (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        index_tree_sha TEXT NOT NULL,
        working_tree_sha TEXT NOT NULL,
        git_ref TEXT NOT NULL,
        origin_kind TEXT NOT NULL CHECK (origin_kind IN ('host-observation', 'agent-session', 'human-command')),
        origin_id TEXT NOT NULL,
        cause_kind TEXT NOT NULL CHECK (cause_kind IN ('memory-scan', 'source-event', 'human-edit', 'turn-abort', 'human-restore')),
        cause_id TEXT NOT NULL,
        captured_at TEXT NOT NULL
      );
      CREATE INDEX memory_recovery_checkpoints_history
        ON memory_recovery_checkpoints (bot_slug, captured_at DESC);
    `);
  },
};

const ASSIGNMENT_MODEL_ROUTE_MIGRATION: SchemaMigration = {
  generation: 35,
  module: 'assignments',
  description: 'Snapshot each new Assignment Session model route independently of the Bot plan',
  migrate(database) {
    database.exec(`ALTER TABLE assignments ADD COLUMN model_route_json TEXT;`);
  },
};

const USAGE_REPORT_COMPLETENESS_MIGRATION: SchemaMigration = {
  generation: 37,
  module: 'usage',
  description: 'Distinguish unreported provider token buckets from reported zero',
  migrate(database) {
    database.exec(`
      ALTER TABLE usage_daily ADD COLUMN unknown_input INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN unknown_output INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN unknown_cache_read INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN unknown_cache_write INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_daily ADD COLUMN unknown_total INTEGER NOT NULL DEFAULT 0;
      UPDATE usage_daily SET unknown_cache_read = 1, unknown_cache_write = 1, unknown_total = 1;
    `);
  },
};

const MESSAGING_OUTBOUND_MIGRATION: SchemaMigration = {
  generation: 38,
  module: 'messaging',
  description: 'Persist external account bindings, proactive grants and one-attempt Outbox facts',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_bindings (
        id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL, provider_id TEXT NOT NULL,
        platform TEXT NOT NULL, account_ref TEXT NOT NULL, fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL, revoked_at TEXT
      );
      CREATE UNIQUE INDEX messaging_binding_account ON messaging_bindings(provider_id, account_ref) WHERE revoked_at IS NULL;
      CREATE UNIQUE INDEX messaging_binding_principal ON messaging_bindings(provider_id, fingerprint) WHERE revoked_at IS NULL;
      CREATE UNIQUE INDEX messaging_binding_bot_platform ON messaging_bindings(bot_slug, platform) WHERE revoked_at IS NULL;
      CREATE TABLE messaging_grants (
        id TEXT PRIMARY KEY, binding_id TEXT NOT NULL REFERENCES messaging_bindings(id),
        bot_slug TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL,
        revoked_at TEXT, body TEXT NOT NULL
      );
      CREATE TABLE messaging_outbox (
        id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL, grant_id TEXT NOT NULL REFERENCES messaging_grants(id),
        request_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL
      );
      CREATE INDEX messaging_outbox_history ON messaging_outbox(bot_slug, created_at DESC);
      CREATE TABLE messaging_outbox_attempts (
        intent_id TEXT PRIMARY KEY REFERENCES messaging_outbox(id), started_at TEXT NOT NULL,
        state TEXT NOT NULL, finished_at TEXT, reason TEXT
      );
    `);
  },
};

const ATTACHMENT_FILE_BINDING_MIGRATION: SchemaMigration = {
  generation: 39,
  module: 'messaging',
  description: 'Bind retained legacy attachment occurrences to independently managed real files',
  migrate(database) {
    database.exec(`
      CREATE TABLE attachment_file_bindings (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        attachment_index INTEGER NOT NULL CHECK (attachment_index >= 0),
        file_id TEXT NOT NULL UNIQUE,
        original_json TEXT NOT NULL,
        target_json TEXT,
        state TEXT NOT NULL CHECK (state IN ('pending', 'ready')),
        last_error TEXT,
        PRIMARY KEY (source_event_id, attachment_index),
        CHECK (state != 'ready' OR target_json IS NOT NULL)
      );
    `);
  },
};

const USAGE_RETENTION_MIGRATION: SchemaMigration = {
  generation: 40,
  module: 'usage',
  description:
    'Retain daily usage independently of Session histories with durable anonymous receipts',
  migrate(database) {
    database.exec(`
      CREATE TABLE usage_receipt_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        fingerprint_key TEXT NOT NULL
      );
      CREATE TABLE usage_receipts (
        fingerprint TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL
      );
      CREATE INDEX usage_receipts_bot ON usage_receipts(bot_slug);
      CREATE TABLE usage_retired_roots (
        fingerprint TEXT PRIMARY KEY
      );
      CREATE TABLE usage_legacy_baselines (
        bot_slug TEXT PRIMARY KEY,
        through_ms INTEGER NOT NULL
      );
    `);
    database
      .prepare('INSERT INTO usage_receipt_state VALUES (1, ?)')
      .run(randomBytes(32).toString('hex'));
    database
      .prepare(`INSERT INTO usage_legacy_baselines (bot_slug, through_ms)
      SELECT DISTINCT bot_slug, ? FROM usage_daily`)
      .run(Date.now());
  },
};

const LOCAL_HUMAN_NAME_MIGRATION: SchemaMigration = {
  generation: 41,
  module: 'messaging',
  description: 'Retain one optional local Human default name without changing membership',
  migrate(database) {
    database.exec(`CREATE TABLE local_human_names (
      human_id TEXT PRIMARY KEY,
      default_display_name TEXT
    );`);
  },
};

const ORCHESTRATOR_WORKSPACE_WRITE_MIGRATION: SchemaMigration = {
  generation: 42,
  module: 'workspace-grants',
  description: 'Explicit Human-owned Orchestrator write permission on Workspace Grants',
  migrate(database) {
    database.exec(`
      ALTER TABLE workspace_grants ADD COLUMN orchestrator_write INTEGER NOT NULL DEFAULT 0
        CHECK (orchestrator_write IN (0, 1));
      ALTER TABLE workspace_grants ADD COLUMN write_revision INTEGER NOT NULL DEFAULT 0;
    `);
  },
};

const HUMAN_CHANNEL_NICKNAME_MIGRATION: SchemaMigration = {
  generation: 43,
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

const EXTERNAL_SOURCE_MIGRATION: SchemaMigration = {
  generation: 44,
  module: 'messaging',
  description: 'Persist authenticated external IM Source Events without Channel placements',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE source_events_next (
        source_event_id TEXT PRIMARY KEY,
        source_kind TEXT NOT NULL CHECK (source_kind IN
          ('human-message', 'bot-message', 'system-message', 'assignment-report',
           'assignment-lifecycle', 'memory-change', 'bridge-message')),
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

    `);
  },
};

const HUMAN_RESPONSE_INDEX_MIGRATION: SchemaMigration = {
  generation: 45,
  module: 'messaging',
  description: 'Index canonical Human response targets and history time',
  migrate(database) {
    database.exec(
      `CREATE INDEX source_events_human_native_response ON source_events (
        coalesce(json_extract(payload_json, '$.userQuestionResolution.requestMessageId'),
                 json_extract(payload_json, '$.toolApprovalDecision.requestMessageId'),
                 json_extract(payload_json, '$.grantRequestResolution.requestMessageId')), channel_id
      ) WHERE source_kind = 'human-message' AND json_extract(payload_json, '$.author.kind') = 'human';
      CREATE INDEX source_events_human_assignment_response ON source_events (
        json_extract(payload_json, '$.assignmentReply.sourceEventId'),
        json_extract(payload_json, '$.assignmentReply.sessionId')
      ) WHERE source_kind = 'human-message' AND json_extract(payload_json, '$.author.kind') = 'human';
      CREATE INDEX source_events_human_response_time ON source_events (created_at, source_event_id)
        WHERE source_kind = 'human-message' AND json_extract(payload_json, '$.author.kind') = 'human';`,
    );
  },
};

const EXTERNAL_GROUP_POLICY_MIGRATION: SchemaMigration = {
  generation: 46,
  module: 'messaging',
  description: 'Version external group collection and wake independently of Service Grants',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_group_policy_revisions (
        grant_id TEXT NOT NULL REFERENCES messaging_grants(id),
        revision INTEGER NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (grant_id, revision)
      );
      CREATE TRIGGER messaging_group_policy_no_update
        BEFORE UPDATE ON messaging_group_policy_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging Policy revisions are immutable'); END;
      CREATE TRIGGER messaging_group_policy_no_delete
        BEFORE DELETE ON messaging_group_policy_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging Policy revisions are immutable'); END;
    `);
  },
};

const HUMAN_INBOX_DISMISSAL_MIGRATION: SchemaMigration = {
  generation: 47,
  module: 'human-attention',
  description: 'Persist Inbox-only dismissal independently of source request decisions',
  migrate(database) {
    database.exec(`
      CREATE TABLE human_inbox_dismissals (
        human_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        source_key TEXT NOT NULL,
        through_revision INTEGER,
        dismissed_at TEXT NOT NULL,
        PRIMARY KEY (human_id, item_id, source_key)
      );
    `);
  },
};

const EXTERNAL_THREAD_POLICY_MIGRATION: SchemaMigration = {
  generation: 48,
  module: 'messaging',
  description: 'Version exact external Thread participation independently of group reception',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_thread_policy_revisions (
        grant_id TEXT NOT NULL REFERENCES messaging_grants(id),
        thread_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (grant_id, thread_id, revision)
      );
      CREATE TRIGGER messaging_thread_policy_no_update BEFORE UPDATE ON messaging_thread_policy_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging Thread Policy revisions are immutable'); END;
      CREATE TRIGGER messaging_thread_policy_no_delete BEFORE DELETE ON messaging_thread_policy_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging Thread Policy revisions are immutable'); END;
      ALTER TABLE inbox_admissions ADD COLUMN external_thread_policy_revision INTEGER;
    `);
  },
};

const EXTERNAL_IDENTITY_MIGRATION: SchemaMigration = {
  generation: 49,
  module: 'messaging',
  description: 'Separate Bot identity lifecycle from conversation grants',
  migrate(database) {
    database.exec(`
      ALTER TABLE messaging_bindings ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE messaging_bindings ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE messaging_bindings ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
      UPDATE messaging_bindings SET display_name = COALESCE(
        (SELECT json_extract(g.body, '$.accountName') FROM messaging_grants g
         WHERE g.binding_id = messaging_bindings.id ORDER BY g.created_at DESC LIMIT 1), account_ref);
    `);
  },
};

const CHANNEL_BRIDGE_MIGRATION: SchemaMigration = {
  generation: 50,
  module: 'messaging',
  description: 'Fence Channel Bridge intake preference and retain existing grant authority',
  migrate(database) {
    database.exec(`UPDATE messaging_grants SET body = json_set(body, '$.channelBridge', json_object(
      'name', json_extract(body, '$.targetName'),
      'enabled', json(CASE WHEN json_type(body, '$.receiveScope') = 'object' THEN 'true' ELSE 'false' END),
      'collection', COALESCE((SELECT json_extract(p.body, '$.collection') FROM messaging_group_policy_revisions p WHERE p.grant_id = messaging_grants.id ORDER BY p.revision DESC LIMIT 1), 'mentions'),
      'revision', 1))
      WHERE json_type(body, '$.receiveTargetChannelId') = 'text' AND json_type(body, '$.channelBridge') IS NULL;`);
  },
};

const MESSAGING_DEFAULTS_MIGRATION: SchemaMigration = {
  generation: 51,
  module: 'messaging',
  description: 'Version platform preferences and preserve existing explicit Profile behavior',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_default_revisions (
        platform TEXT NOT NULL CHECK (platform = 'feishu'),
        revision INTEGER NOT NULL CHECK (revision > 0), body TEXT NOT NULL,
        PRIMARY KEY (platform, revision)
      );
      CREATE TRIGGER messaging_defaults_no_update BEFORE UPDATE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
      CREATE TRIGGER messaging_defaults_no_delete BEFORE DELETE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
      ALTER TABLE messaging_bindings ADD COLUMN enabled_inherited INTEGER NOT NULL DEFAULT 0;
      UPDATE messaging_grants SET body = json_set(body, '$.receptionInheritance', 'custom');
      ALTER TABLE inbox_admissions ADD COLUMN external_default_revision INTEGER;
    `);
  },
};

const BRIDGE_ROUTES_MIGRATION: SchemaMigration = {
  generation: 52,
  module: 'messaging',
  description:
    'Retain one Source Event with distinct Channel placements and per-member reception paths',
  migrate(database) {
    database.exec(`
      CREATE TABLE channel_placements_multiple (
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id),
        revision INTEGER NOT NULL,
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        message_id TEXT NOT NULL,
        PRIMARY KEY(channel_id, revision),
        UNIQUE(channel_id, source_event_id), UNIQUE(channel_id, message_id)
      );
      INSERT INTO channel_placements_multiple SELECT * FROM channel_placements;
      DROP TABLE channel_placements;
      ALTER TABLE channel_placements_multiple RENAME TO channel_placements;
      CREATE INDEX channel_placements_source ON channel_placements(source_event_id);
      CREATE TABLE messaging_source_paths (
        source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        bot_slug TEXT NOT NULL, grant_id TEXT NOT NULL REFERENCES messaging_grants(id),
        route_id TEXT NOT NULL, channel_id TEXT REFERENCES channel_records(channel_id),
        body TEXT NOT NULL,
        PRIMARY KEY(source_event_id, bot_slug, route_id)
      );
      CREATE INDEX messaging_paths_member ON messaging_source_paths(bot_slug, route_id);
      CREATE TRIGGER messaging_paths_no_update BEFORE UPDATE ON messaging_source_paths
        BEGIN SELECT RAISE(ABORT, 'Reception path snapshots are immutable'); END;
      CREATE TRIGGER messaging_paths_no_delete BEFORE DELETE ON messaging_source_paths
        BEGIN SELECT RAISE(ABORT, 'Reception path snapshots are immutable'); END;
    `);
  },
};

const QUALIFIED_PLATFORM_DEFAULTS_MIGRATION: SchemaMigration = {
  generation: 53,
  module: 'messaging',
  description:
    'Allow independently versioned qualified Slack preferences while retaining every existing override',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_default_revisions_qualified (
        platform TEXT NOT NULL CHECK (platform IN ('feishu', 'slack')),
        revision INTEGER NOT NULL CHECK (revision > 0), body TEXT NOT NULL,
        PRIMARY KEY (platform, revision)
      );
      INSERT INTO messaging_default_revisions_qualified SELECT * FROM messaging_default_revisions;
      DROP TABLE messaging_default_revisions;
      ALTER TABLE messaging_default_revisions_qualified RENAME TO messaging_default_revisions;
      CREATE TRIGGER messaging_defaults_no_update BEFORE UPDATE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
      CREATE TRIGGER messaging_defaults_no_delete BEFORE DELETE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
    `);
  },
};

const MODEL_PRESET_STORAGE_MIGRATION: SchemaMigration = {
  generation: 54,
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

const PERSONA_BOT_REGISTRY_MIGRATION: SchemaMigration = {
  generation: 55,
  module: 'bot-registry',
  description: 'Own PersonaBot identities and applied plans with a durable Registry import marker',
  migrate(database) {
    database.exec(`
      CREATE TABLE persona_bots (slug TEXT PRIMARY KEY, body TEXT NOT NULL CHECK (json_valid(body)));
      CREATE TABLE persona_bots_import (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), imported_at TEXT NOT NULL
      );
    `);
  },
};

const ROSTER_ARRANGEMENT_MIGRATION: SchemaMigration = {
  generation: 56,
  module: 'roster',
  description: 'Own Channel sections and roster arrangement in the Profile database',
  migrate(database) {
    database.exec(`
      CREATE TABLE roster_arrangement (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
      CREATE TABLE roster_arrangement_import (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        imported_at TEXT NOT NULL
      );
    `);
  },
};

function rebuildWithKind(
  database: DatabaseSync,
  table: 'source_events' | 'inbox_admissions',
  lastKind: string,
  addedKinds: readonly string[] = ['schedule'],
): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql: string } | undefined;
  const marker = `'${lastKind}'))`;
  if (row === undefined || row.sql.split(marker).length !== 2)
    throw new Error(`Cannot extend the ${table} kind check`);
  const dependents = (
    database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type IN ('index', 'trigger') AND tbl_name = ? AND sql IS NOT NULL",
      )
      .all(table) as Array<{ sql: string }>
  ).map((dependent) => dependent.sql);
  const next = row.sql
    .replace(marker, `'${[lastKind, ...addedKinds].join("', '")}'))`)
    .replace(/^CREATE TABLE\s+"?\w+"?/u, `CREATE TABLE ${table}_next`);
  database.exec(next);
  database.exec(`INSERT INTO ${table}_next SELECT * FROM ${table};
    DROP TABLE ${table};
    ALTER TABLE ${table}_next RENAME TO ${table};`);
  for (const dependent of dependents) database.exec(dependent);
}

const BOT_SCHEDULE_MIGRATION: SchemaMigration = {
  generation: 57,
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

const DISCORD_PLATFORM_DEFAULTS_MIGRATION: SchemaMigration = {
  generation: 58,
  module: 'messaging',
  description:
    'Qualify independent Discord defaults without rewriting earlier revisions or overrides',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_default_revisions_qualified (
        platform TEXT NOT NULL CHECK (platform IN ('feishu', 'slack', 'discord')),
        revision INTEGER NOT NULL CHECK (revision > 0), body TEXT NOT NULL,
        PRIMARY KEY (platform, revision)
      );
      INSERT INTO messaging_default_revisions_qualified SELECT * FROM messaging_default_revisions;
      DROP TABLE messaging_default_revisions;
      ALTER TABLE messaging_default_revisions_qualified RENAME TO messaging_default_revisions;
      CREATE TRIGGER messaging_defaults_no_update BEFORE UPDATE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
      CREATE TRIGGER messaging_defaults_no_delete BEFORE DELETE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
    `);
  },
};

const BOT_PAIRING_MIGRATION: SchemaMigration = {
  generation: 59,
  module: 'messaging',
  description: 'Own current-Bot Human pairing and explicitly reviewed IM capabilities',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_pairings (
        id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL,
        binding_id TEXT NOT NULL REFERENCES messaging_bindings(id),
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'expired')),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
      CREATE UNIQUE INDEX messaging_pairings_current
        ON messaging_pairings(binding_id, actor_id) WHERE status IN ('pending', 'approved');
      CREATE INDEX messaging_pairings_bot ON messaging_pairings(bot_slug);
    `);
  },
};

const APPROVAL_MESSAGING_MIGRATION: SchemaMigration = {
  generation: 60,
  module: 'messaging',
  description:
    'Own approved management routes and notification receipts without duplicating native decisions',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_approval_routes (
        bot_slug TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision > 0), body TEXT CHECK(body IS NULL OR json_valid(body))
      );
      CREATE TABLE messaging_approval_deliveries (
        id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body))
      );
      CREATE INDEX messaging_approval_deliveries_bot ON messaging_approval_deliveries(bot_slug);
    `);
  },
};

const NEW_CONVERSATION_DEFAULT_MIGRATION: SchemaMigration = {
  generation: 65,
  module: 'messaging',
  description: 'Let a bound app inherit the platform default new-conversation mode',
  migrate(database) {
    database.exec(`
      ALTER TABLE messaging_bindings ADD COLUMN new_conversations_inherited INTEGER NOT NULL DEFAULT 1
        CHECK (new_conversations_inherited IN (0, 1));
      UPDATE messaging_bindings SET new_conversations_inherited = 0 WHERE new_conversations = 'ask';
    `);
  },
};

const BOUND_APP_ADMISSION_MIGRATION: SchemaMigration = {
  generation: 61,
  module: 'messaging',
  description:
    'Admit default traffic through a bound app with implicit conversation entries and a per-binding new-conversation mode',
  migrate(database) {
    database.exec(`
      ALTER TABLE messaging_bindings ADD COLUMN new_conversations TEXT NOT NULL DEFAULT 'auto'
        CHECK (new_conversations IN ('auto', 'ask'));
      UPDATE messaging_grants SET body = json_set(body, '$.origin', 'explicit');
      CREATE UNIQUE INDEX messaging_grants_implicit_conversation ON messaging_grants(
        binding_id,
        json_extract(body, '$.receiveScope.kind'),
        json_extract(body, '$.receiveScope.conversationId')
      ) WHERE revoked_at IS NULL AND json_extract(body, '$.origin') = 'implicit';
    `);
  },
};

const CONVERSATION_LIST_MIGRATION: SchemaMigration = {
  generation: 62,
  module: 'messaging',
  description:
    'Keep durable conversation blocks per Bot and app fingerprint, and held conversations waiting for a decision',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_conversation_blocks (
        bot_slug TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        conversation_kind TEXT NOT NULL CHECK (conversation_kind IN ('dm', 'group')),
        conversation_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        body TEXT NOT NULL CHECK (json_valid(body)),
        PRIMARY KEY (bot_slug, fingerprint, conversation_kind, conversation_id)
      );
      CREATE TABLE messaging_held_conversations (
        binding_id TEXT NOT NULL,
        conversation_kind TEXT NOT NULL CHECK (conversation_kind IN ('dm', 'group')),
        conversation_id TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        body TEXT NOT NULL CHECK (json_valid(body)),
        PRIMARY KEY (binding_id, conversation_kind, conversation_id)
      );
      CREATE INDEX messaging_held_conversations_seen
        ON messaging_held_conversations(binding_id, last_seen_at);
      INSERT OR IGNORE INTO messaging_conversation_blocks
        (bot_slug, fingerprint, conversation_kind, conversation_id, revision, body)
      SELECT g.bot_slug, json_extract(g.body, '$.fingerprint'),
             json_extract(g.body, '$.receiveScope.kind'),
             json_extract(g.body, '$.receiveScope.conversationId'), 1,
             json_object(
               'botSlug', g.bot_slug,
               'fingerprint', json_extract(g.body, '$.fingerprint'),
               'conversation', json_object(
                 'kind', json_extract(g.body, '$.receiveScope.kind'),
                 'id', json_extract(g.body, '$.receiveScope.conversationId')),
               'name', json_extract(g.body, '$.targetName'),
               'blockedAt', g.revoked_at,
               'revision', 1)
        FROM messaging_grants g
       WHERE g.revoked_at IS NOT NULL
         AND json_extract(g.body, '$.origin') = 'explicit'
         AND json_extract(g.body, '$.receiveScope.kind') IN ('dm', 'group')
         AND NOT EXISTS (
           SELECT 1 FROM messaging_grants a
            WHERE a.revoked_at IS NULL AND a.bot_slug = g.bot_slug
              AND json_extract(a.body, '$.fingerprint') = json_extract(g.body, '$.fingerprint')
              AND json_extract(a.body, '$.receiveScope.kind') = json_extract(g.body, '$.receiveScope.kind')
              AND json_extract(a.body, '$.receiveScope.conversationId') =
                  json_extract(g.body, '$.receiveScope.conversationId'));
    `);
  },
};

const SEVERAL_APPS_MIGRATION: SchemaMigration = {
  generation: 63,
  module: 'messaging',
  description:
    'Let one Bot bind several apps of the same platform; one app still belongs to one Bot',
  migrate(database) {
    database.exec('DROP INDEX IF EXISTS messaging_binding_bot_platform;');
  },
};

const CONVERSATION_INGEST_MIGRATION: SchemaMigration = {
  generation: 64,
  module: 'messaging',
  description: 'Let a Channel ingest an external conversation as one-way context',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_conversation_ingests (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        account_ref TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        conversation_kind TEXT NOT NULL CHECK (conversation_kind IN ('dm', 'group')),
        conversation_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
      CREATE UNIQUE INDEX messaging_conversation_ingest_target ON messaging_conversation_ingests
        (channel_id, provider_id, fingerprint, conversation_kind, conversation_id);
      CREATE INDEX messaging_conversation_ingest_source ON messaging_conversation_ingests
        (provider_id, fingerprint, conversation_kind, conversation_id);
    `);
  },
};

const PERSONA_BOT_DELETION_MIGRATION: SchemaMigration = {
  generation: 66,
  module: 'bot-registry',
  description: 'Terminal PersonaBot deletion and exclusive Memory ownership proofs',
  migrate(database) {
    database.exec(`
      CREATE TABLE persona_bot_deletions (
        slug TEXT PRIMARY KEY REFERENCES persona_bots(slug),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
      CREATE TABLE persona_bot_memory_ownership (
        slug TEXT PRIMARY KEY REFERENCES persona_bots(slug),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
    `);
  },
};

const MESSAGING_TYPING_MIGRATION: SchemaMigration = {
  generation: 67,
  module: 'messaging',
  description: 'Persist identity-local native typing preference without persisting tickets',
  migrate(database) {
    database.exec(`
      ALTER TABLE messaging_bindings ADD COLUMN typing_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (typing_enabled IN (0, 1));
    `);
  },
};

const CONTENT_PURGE_MIGRATION: SchemaMigration = {
  generation: 68,
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

const WECHAT_PLATFORM_DEFAULTS_MIGRATION: SchemaMigration = {
  generation: 69,
  module: 'messaging',
  description: 'Qualify WeChat defaults and preserve existing identity-local typing overrides',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_default_revisions_qualified (
        platform TEXT NOT NULL CHECK (platform IN ('feishu', 'slack', 'discord', 'weixin')),
        revision INTEGER NOT NULL CHECK (revision > 0), body TEXT NOT NULL,
        PRIMARY KEY (platform, revision)
      );
      INSERT INTO messaging_default_revisions_qualified SELECT * FROM messaging_default_revisions;
      DROP TABLE messaging_default_revisions;
      ALTER TABLE messaging_default_revisions_qualified RENAME TO messaging_default_revisions;
      CREATE TRIGGER messaging_defaults_no_update BEFORE UPDATE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
      CREATE TRIGGER messaging_defaults_no_delete BEFORE DELETE ON messaging_default_revisions
        BEGIN SELECT RAISE(ABORT, 'Messaging defaults revisions are immutable'); END;
      ALTER TABLE messaging_bindings ADD COLUMN typing_inherited INTEGER NOT NULL DEFAULT 0
        CHECK (typing_inherited IN (0, 1));
      ALTER TABLE messaging_bindings ADD COLUMN receive_after TEXT;
    `);
  },
};

const COMPLETE_CONTENT_PURGE_MIGRATION: SchemaMigration = {
  generation: 70,
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

const BOT_ONBOARDING_MIGRATION: SchemaMigration = {
  generation: 71,
  module: 'bot-onboarding',
  description: 'Persist Profile onboarding receipts and trusted Channel output provenance',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_onboarding (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        profile_id TEXT NOT NULL,
        entered_at TEXT NOT NULL,
        default_bot_slug TEXT,
        preparation TEXT NOT NULL CHECK (preparation IN ('requested', 'ready')),
        tutorial TEXT NOT NULL DEFAULT 'not-started'
          CHECK (tutorial IN ('not-started', 'active', 'paused', 'skipped')),
        completed_channel_id TEXT,
        completed_message_id TEXT
      );
      CREATE TABLE channel_output_origins (
        source_event_id TEXT PRIMARY KEY REFERENCES source_events(source_event_id),
        session_id TEXT NOT NULL REFERENCES session_ownership(session_id),
        request_source_event_id TEXT REFERENCES source_events(source_event_id)
      );
    `);
  },
};

const PROFILE_RECOVERY_MIGRATION: SchemaMigration = {
  generation: 72,
  module: 'profile-portability',
  description: 'Persist Disaster Restore receipt and explicit target-local activation',
  migrate(database) {
    database.exec(`
      CREATE TABLE profile_recovery (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), body TEXT NOT NULL
      );
      CREATE TABLE profile_recovery_bots (
        bot_slug TEXT PRIMARY KEY, desired_json TEXT NOT NULL,
        authorized_plan_revision INTEGER, activated_session_id TEXT
      );
      ALTER TABLE session_ownership ADD COLUMN content_available INTEGER NOT NULL DEFAULT 1
        CHECK (content_available IN (0, 1));
    `);
  },
};

const AVATAR_PART_LIBRARY_MIGRATION: SchemaMigration = {
  generation: 73,
  module: 'avatar-part-library',
  description: 'Persist the Profile Part Library of Human-drawn Avatar Custom Parts',
  migrate(database) {
    database.exec(`
      CREATE TABLE avatar_part_library (
        id TEXT PRIMARY KEY CHECK (length(id) = 64),
        body TEXT NOT NULL CHECK (json_valid(body))
      );
    `);
  },
};

const RECEPTION_HISTORY_MIGRATION: SchemaMigration = {
  generation: 74,
  module: 'messaging',
  description: 'Retain bounded reception coverage observations without copying external messages',
  migrate(database) {
    database.exec(`CREATE TABLE messaging_reception_history (
      bot_slug TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      body TEXT NOT NULL CHECK (json_valid(body)),
      PRIMARY KEY (bot_slug, provider_id, fingerprint)
    );`);
  },
};

const BOT_SELF_RECORD_MIGRATION: SchemaMigration = {
  generation: 75,
  module: 'messaging',
  description: 'Record Bot Self-Records as Channel Notices with born-handled Bot Inbox records',
  rebuildsReferencedTables: true,
  migrate(database) {
    rebuildWithKind(database, 'source_events', 'schedule', ['self-record']);
    rebuildWithKind(database, 'inbox_admissions', 'schedule', ['memory-commit', 'bot-action']);
  },
};

const MEMORY_COMMIT_RECORD_MIGRATION: SchemaMigration = {
  generation: 76,
  module: 'messaging',
  description: 'Track each PersonaBot Memory commit cursor and record each commit once',
  migrate(database) {
    database.exec(`
      CREATE TABLE memory_commit_cursors (
        bot_slug TEXT PRIMARY KEY,
        branch TEXT NOT NULL,
        head TEXT NOT NULL CHECK (length(head) = 40),
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX source_events_memory_commit
        ON source_events (bot_slug, json_extract(payload_json, '$.memoryCommit.sha'))
        WHERE json_type(payload_json, '$.memoryCommit') IS NOT NULL;
    `);
  },
};

const INBOX_HISTORY_MIGRATION: SchemaMigration = {
  generation: 77,
  module: 'messaging',
  description: 'Index canonical Source Events for own-Bot Inbox history with FTS5 trigram',
  migrate(database) {
    database.exec(INBOX_HISTORY_INDEX_SQL);
  },
};

const EXTERNAL_USER_ROLE_MIGRATION: SchemaMigration = {
  generation: 78,
  module: 'messaging',
  description:
    'Keep ordinary conversation roles separate from explicit management grants in Messaging',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_external_roles (id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL, body TEXT NOT NULL CHECK (json_valid(body)));
      CREATE INDEX messaging_external_roles_bot ON messaging_external_roles(bot_slug);
      CREATE TABLE messaging_sender_policies (bot_slug TEXT PRIMARY KEY, restricted INTEGER NOT NULL CHECK (restricted IN (0, 1)), revision INTEGER NOT NULL);
      ALTER TABLE messaging_pairings ADD COLUMN purpose TEXT NOT NULL DEFAULT 'management' CHECK (purpose IN ('management', 'conversation'));
      DROP INDEX messaging_pairings_current;
      CREATE UNIQUE INDEX messaging_pairings_current ON messaging_pairings(binding_id, actor_id, purpose) WHERE status IN ('pending', 'approved');
    `);
  },
};

export const BOT_HARNESS_SCHEMA_PLAN = defineSchemaPlan([
  SESSION_OWNERSHIP_MIGRATION,
  MESSAGING_TRACER_MIGRATION,
  ASSIGNMENT_DIRECTORY_MIGRATION,
  SOURCE_EVENT_ATTEMPT_MIGRATION,
  SESSION_OWNERSHIP_LINEAGE_MIGRATION,
  SOURCE_EVENT_SIDE_EFFECT_MIGRATION,
  ASSIGNMENT_COLLABORATION_MIGRATION,
  SESSION_PERSONA_SNAPSHOT_MIGRATION,
  MEMORY_ACCEPTED_COMMIT_MIGRATION,
  WORKSPACE_GRANT_MIGRATION,
  TOOL_APPROVAL_RULE_MIGRATION,
  ASSIGNMENT_ACCESS_MIGRATION,
  MEMORY_BRANCH_HEAD_MIGRATION,
  CHANNEL_MESSAGING_MIGRATION,
  BOT_DM_ADMISSION_MIGRATION,
  GROUP_INVITATION_ADMISSION_MIGRATION,
  GROUP_DIGEST_ADMISSION_MIGRATION,
  GROUP_JOIN_ADMISSION_MIGRATION,
  ASSIGNMENT_STOP_MIGRATION,
  ASSIGNMENT_REPORT_ADMISSION_MIGRATION,
  HUMAN_ATTENTION_DECISION_MIGRATION,
  BOT_ATTENTION_IGNORE_MIGRATION,
  ASSIGNMENT_LIFECYCLE_NOTICE_MIGRATION,
  LOCAL_HUMAN_RECEIPTS_MIGRATION,
  GROUP_WAKE_MODE_MIGRATION,
  GROUP_WAKE_POLICY_AUDIT_MIGRATION,
  USAGE_DAILY_MIGRATION,
  BOT_SOURCE_POLICY_MIGRATION,
  BOT_SOURCE_POLICY_EDIT_MIGRATION,
  BOT_SOURCE_DELIVERY_MIGRATION,
  BOT_SOURCE_GROUP_MODES_MIGRATION,
  MEMORY_CHANGE_INBOX_MIGRATION,
  MEMORY_CHANGE_CHECKPOINT_MIGRATION,
  MEMORY_RECOVERY_CHECKPOINT_MIGRATION,
  ASSIGNMENT_MODEL_ROUTE_MIGRATION,
  USAGE_REPORT_COMPLETENESS_MIGRATION,
  MESSAGING_OUTBOUND_MIGRATION,
  ATTACHMENT_FILE_BINDING_MIGRATION,
  USAGE_RETENTION_MIGRATION,
  LOCAL_HUMAN_NAME_MIGRATION,
  ORCHESTRATOR_WORKSPACE_WRITE_MIGRATION,
  HUMAN_CHANNEL_NICKNAME_MIGRATION,
  EXTERNAL_SOURCE_MIGRATION,
  HUMAN_RESPONSE_INDEX_MIGRATION,
  EXTERNAL_GROUP_POLICY_MIGRATION,
  HUMAN_INBOX_DISMISSAL_MIGRATION,
  EXTERNAL_THREAD_POLICY_MIGRATION,
  EXTERNAL_IDENTITY_MIGRATION,
  CHANNEL_BRIDGE_MIGRATION,
  MESSAGING_DEFAULTS_MIGRATION,
  BRIDGE_ROUTES_MIGRATION,
  QUALIFIED_PLATFORM_DEFAULTS_MIGRATION,
  MODEL_PRESET_STORAGE_MIGRATION,
  PERSONA_BOT_REGISTRY_MIGRATION,
  ROSTER_ARRANGEMENT_MIGRATION,
  BOT_SCHEDULE_MIGRATION,
  DISCORD_PLATFORM_DEFAULTS_MIGRATION,
  BOT_PAIRING_MIGRATION,
  APPROVAL_MESSAGING_MIGRATION,
  BOUND_APP_ADMISSION_MIGRATION,
  CONVERSATION_LIST_MIGRATION,
  SEVERAL_APPS_MIGRATION,
  CONVERSATION_INGEST_MIGRATION,
  NEW_CONVERSATION_DEFAULT_MIGRATION,
  PERSONA_BOT_DELETION_MIGRATION,
  MESSAGING_TYPING_MIGRATION,
  CONTENT_PURGE_MIGRATION,
  WECHAT_PLATFORM_DEFAULTS_MIGRATION,
  COMPLETE_CONTENT_PURGE_MIGRATION,
  BOT_ONBOARDING_MIGRATION,
  PROFILE_RECOVERY_MIGRATION,
  AVATAR_PART_LIBRARY_MIGRATION,
  RECEPTION_HISTORY_MIGRATION,
  BOT_SELF_RECORD_MIGRATION,
  MEMORY_COMMIT_RECORD_MIGRATION,
  INBOX_HISTORY_MIGRATION,
  EXTERNAL_USER_ROLE_MIGRATION,
]);
