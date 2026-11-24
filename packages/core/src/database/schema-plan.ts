import { z } from 'zod';
import { DEFAULT_CHANNEL_POLICY } from '../team/channel-contract.js';
import { ADMIN_PERMISSIONS, MEMBER_PERMISSIONS } from '../team/permissions.js';
import { randomBytes } from 'node:crypto';
import { defineSchemaPlan, type SchemaMigration } from './schema.js';
import { deriveAssignmentTitle } from '../runtime/assignment-title.js';
import { presetSubFromLegacy, presetSubWithEngine } from '../models/preset-sub.js';
import type { ModelPreset } from '../models/presets.js';
import {
  MESSAGING_TRACER_MIGRATION,
  CHANNEL_MESSAGING_MIGRATION,
  BOT_DM_ADMISSION_MIGRATION,
  GROUP_INVITATION_ADMISSION_MIGRATION,
  GROUP_DIGEST_ADMISSION_MIGRATION,
  GROUP_JOIN_ADMISSION_MIGRATION,
  ASSIGNMENT_REPORT_ADMISSION_MIGRATION,
  LOCAL_HUMAN_RECEIPTS_MIGRATION,
  GROUP_WAKE_POLICY_AUDIT_MIGRATION,
  LOCAL_HUMAN_NAME_MIGRATION,
  HUMAN_CHANNEL_NICKNAME_MIGRATION,
  CHANNEL_REACTION_MIGRATION,
  CHANNEL_CHANGE_LOG_MIGRATION,
  GENUI_PRIVATE_VIEW_MIGRATION,
  SOURCE_EVENT_HUMAN_MIGRATION,
} from './migrations/messaging-channels.js';
import {
  MESSAGING_OUTBOUND_MIGRATION,
  EXTERNAL_SOURCE_MIGRATION,
  EXTERNAL_GROUP_POLICY_MIGRATION,
  EXTERNAL_THREAD_POLICY_MIGRATION,
  EXTERNAL_IDENTITY_MIGRATION,
  CHANNEL_BRIDGE_MIGRATION,
  MESSAGING_DEFAULTS_MIGRATION,
  BRIDGE_ROUTES_MIGRATION,
  QUALIFIED_PLATFORM_DEFAULTS_MIGRATION,
  DISCORD_PLATFORM_DEFAULTS_MIGRATION,
  BOT_PAIRING_MIGRATION,
  APPROVAL_MESSAGING_MIGRATION,
  BOUND_APP_ADMISSION_MIGRATION,
  CONVERSATION_LIST_MIGRATION,
  SEVERAL_APPS_MIGRATION,
  CONVERSATION_INGEST_MIGRATION,
  NEW_CONVERSATION_DEFAULT_MIGRATION,
  MESSAGING_TYPING_MIGRATION,
  WECHAT_PLATFORM_DEFAULTS_MIGRATION,
  EXTERNAL_USER_ROLE_MIGRATION,
  PERMISSION_GROUP_MIGRATION,
  PAIRING_CARD_MIGRATION,
  BEHAVIOR_PERMISSION_MIGRATION,
  FAILURE_ALERT_MIGRATION,
  PROACTIVE_POST_LIMIT_MIGRATION,
  CLOUD_CONNECTION_MIGRATION,
  CLOUD_WORK_MIGRATION,
  QUESTION_MESSAGING_MIGRATION,
  QUESTION_MESSAGING_RECOVERY_MIGRATION,
  QQ_PLATFORM_DEFAULTS_MIGRATION,
} from './migrations/messaging-delivery.js';
import {
  ATTACHMENT_FILE_BINDING_MIGRATION,
  HUMAN_RESPONSE_INDEX_MIGRATION,
  RECEPTION_HISTORY_MIGRATION,
  BOT_SELF_RECORD_MIGRATION,
  MEMORY_COMMIT_RECORD_MIGRATION,
  INBOX_HISTORY_MIGRATION,
  MESSAGE_SEARCH_ATTACHMENT_NAME_MIGRATION,
  GRANT_RECEPTION_EVIDENCE_MIGRATION,
  HUMAN_ATTENTION_CANDIDATE_INDEX_MIGRATION,
  TAKEOVER_ATTENTION_INDEX_MIGRATION,
  GRANT_RESOLUTION_INDEX_MIGRATION,
  OUTPUT_REQUEST_INDEX_MIGRATION,
  PLACEMENT_NOTICE_MIGRATION,
  PLACEMENT_HUMAN_REPLY_MIGRATION,
  BOUNDED_RANGE_INDEX_MIGRATION,
  ATTENTION_RESOLUTION_INDEX_MIGRATION,
  CALL_VISUAL_UNSAVED_MIGRATION,
  CALL_VISUAL_TIMELINE_MIGRATION,
  MODEL_SWITCH_NOTICE_MIGRATION,
} from './migrations/messaging-history.js';
import { rebuildWithKind } from './migrations/shared.js';

export {
  CHANNEL_MESSAGING_MIGRATION,
  LOCAL_HUMAN_RECEIPTS_MIGRATION,
} from './migrations/messaging-channels.js';
export { BEHAVIOR_PERMISSION_MIGRATION } from './migrations/messaging-delivery.js';

const SESSION_OWNERSHIP_MIGRATION: SchemaMigration = {
  id: 'session-ownership',
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

const ASSIGNMENT_DIRECTORY_MIGRATION: SchemaMigration = {
  id: 'assignment-directory',
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

const SESSION_OWNERSHIP_LINEAGE_MIGRATION: SchemaMigration = {
  id: 'session-ownership-lineage',
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

const ASSIGNMENT_COLLABORATION_MIGRATION: SchemaMigration = {
  id: 'assignment-collaboration',
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
  id: 'session-persona-snapshot',
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
  id: 'memory-accepted-commit',
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
  id: 'workspace-grant',
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
  id: 'tool-approval-rule',
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
  id: 'assignment-access',
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
  id: 'memory-branch-head',
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

const ASSIGNMENT_STOP_MIGRATION: SchemaMigration = {
  id: 'assignment-stop',
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

const HUMAN_ATTENTION_DECISION_MIGRATION: SchemaMigration = {
  id: 'human-attention-decision',
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

const ASSIGNMENT_LIFECYCLE_NOTICE_MIGRATION: SchemaMigration = {
  id: 'assignment-lifecycle-notice',
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

const GROUP_WAKE_MODE_MIGRATION: SchemaMigration = {
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

const USAGE_DAILY_MIGRATION: SchemaMigration = {
  id: 'usage-daily',
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

const BOT_SOURCE_POLICY_EDIT_MIGRATION: SchemaMigration = {
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

const BOT_SOURCE_DELIVERY_MIGRATION: SchemaMigration = {
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

const MEMORY_CHANGE_INBOX_MIGRATION: SchemaMigration = {
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

const BOT_SOURCE_GROUP_MODES_MIGRATION: SchemaMigration = {
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

const MEMORY_CHANGE_CHECKPOINT_MIGRATION: SchemaMigration = {
  id: 'memory-change-checkpoint',
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
  id: 'memory-recovery-checkpoint',
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
  id: 'assignment-model-route',
  module: 'assignments',
  description: 'Snapshot each new Assignment Session model route independently of the Bot plan',
  migrate(database) {
    database.exec(`ALTER TABLE assignments ADD COLUMN model_route_json TEXT;`);
  },
};

const USAGE_REPORT_COMPLETENESS_MIGRATION: SchemaMigration = {
  id: 'usage-report-completeness',
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

const USAGE_RETENTION_MIGRATION: SchemaMigration = {
  id: 'usage-retention',
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

const ORCHESTRATOR_WORKSPACE_WRITE_MIGRATION: SchemaMigration = {
  id: 'orchestrator-workspace-write',
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

const HUMAN_INBOX_DISMISSAL_MIGRATION: SchemaMigration = {
  id: 'human-inbox-dismissal',
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

const MODEL_PRESET_STORAGE_MIGRATION: SchemaMigration = {
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

const ASSIGNMENT_AGENT_PRESET_MIGRATION: SchemaMigration = {
  id: 'assignment-agent-preset',
  module: 'assignments',
  description: 'Snapshot the DSH mode an Orchestrator chose for a new Assignment Session',
  migrate(database) {
    database.exec(`ALTER TABLE assignments ADD COLUMN agent_preset TEXT;`);
  },
};

const SESSION_AGENT_PRESET_MIGRATION: SchemaMigration = {
  id: 'session-agent-preset',
  module: 'session-ownership',
  description: 'Record the DSH mode each owned root Session was composed from',
  migrate(database) {
    database.exec(`ALTER TABLE session_ownership ADD COLUMN agent_preset TEXT;`);
  },
};

const ROUTING_GROUP_STORAGE_MIGRATION: SchemaMigration = {
  id: 'routing-group-storage',
  module: 'routing-groups',
  description: 'Own Host-wide Routing Groups: named, ordered model routes and nested groups',
  migrate(database) {
    database.exec(`
      CREATE TABLE routing_groups (id TEXT PRIMARY KEY, body TEXT NOT NULL CHECK (json_valid(body)));
    `);
  },
};

const ROUTING_GROUP_DEFAULT_MIGRATION: SchemaMigration = {
  id: 'routing-group-default',
  module: 'routing-groups',
  description: 'Own the Routing Group chosen as the Profile default model, with its revision',
  migrate(database) {
    database.exec(`
      CREATE TABLE routing_group_default (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        group_id TEXT,
        revision INTEGER NOT NULL CHECK (revision >= 0)
      );
    `);
  },
};

const ROUTING_GROUP_DEFAULT_EFFORT_MIGRATION: SchemaMigration = {
  id: 'routing-group-default-effort',
  module: 'routing-groups',
  description: 'Keep the reasoning effort chosen with the Profile default Routing Group',
  migrate(database) {
    database.exec('ALTER TABLE routing_group_default ADD COLUMN effort TEXT');
  },
};

const GROUP_FALLBACK_OVERRIDES_MIGRATION: SchemaMigration = {
  id: 'group-fallback-overrides',
  module: 'routing-groups',
  description: 'Keep the Routing Group member an Orchestrator Session fell back to across restarts',
  migrate(database) {
    database.exec(`
      CREATE TABLE group_fallback_overrides (
        session_id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        group_id TEXT NOT NULL,
        route_json TEXT NOT NULL CHECK (json_valid(route_json)),
        updated_at TEXT NOT NULL
      );
    `);
  },
};

const PERSONA_BOT_REGISTRY_MIGRATION: SchemaMigration = {
  id: 'persona-bot-registry',
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
  id: 'roster-arrangement',
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

const BOT_SCHEDULE_MIGRATION: SchemaMigration = {
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

const PERSONA_BOT_DELETION_MIGRATION: SchemaMigration = {
  id: 'persona-bot-deletion',
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

const CONTENT_PURGE_MIGRATION: SchemaMigration = {
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

const COMPLETE_CONTENT_PURGE_MIGRATION: SchemaMigration = {
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

const BOT_ONBOARDING_MIGRATION: SchemaMigration = {
  id: 'bot-onboarding',
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
  id: 'profile-recovery',
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
  id: 'avatar-part-library',
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

export const EXTERNAL_TOOL_RULE_CREATOR_MIGRATION: SchemaMigration = {
  id: 'external-tool-rule-creator',
  module: 'tool-approval-rules',
  description: 'Retain external creator provenance for revocable native approval rules',
  migrate(database) {
    database.exec('ALTER TABLE tool_approval_rules ADD COLUMN external_creator TEXT');
  },
};

const ASSIGNMENT_ARCHIVE_MIGRATION: SchemaMigration = {
  id: 'assignment-archive',
  module: 'assignments',
  description: 'Mirror the DSH Session archive on Orchestrator-archived Assignments (ADR-0188)',
  migrate(database) {
    database.exec('ALTER TABLE assignments ADD COLUMN archived_at TEXT');
  },
};

const INBOX_RESOLUTION_MIGRATION: SchemaMigration = {
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

const INBOX_SNOOZE_MIGRATION: SchemaMigration = {
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

const ASSIGNMENT_ACCESS_SCOPE_MIGRATION: SchemaMigration = {
  id: 'assignment-access-scope',
  module: 'assignment-access',
  description: 'Record whether full access also covers the Orchestrator (ADR-0193)',
  migrate(database) {
    database.exec(`
      ALTER TABLE bot_assignment_access ADD COLUMN scope TEXT NOT NULL DEFAULT 'assignments'
        CHECK (scope IN ('chat', 'assignments'));
    `);
  },
};

const SECRET_MCP_SERVER_MIGRATION: SchemaMigration = {
  id: 'secret-mcp-server',
  module: 'secret-mcp',
  description: 'Remember Human-approved secret MCP servers per PersonaBot (ADR-0196)',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_secret_mcp_servers (
        bot_slug TEXT NOT NULL,
        server_name TEXT NOT NULL,
        account TEXT NOT NULL,
        program TEXT NOT NULL,
        args TEXT NOT NULL,
        env TEXT NOT NULL,
        reference_set TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        PRIMARY KEY (bot_slug, server_name)
      );
    `);
  },
};

const SECRET_MCP_ENABLEMENT_MIGRATION: SchemaMigration = {
  id: 'secret-mcp-enablement',
  module: 'secret-mcp',
  description: 'Record which PersonaBots enabled a remembered secret MCP server (ADR-0198)',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_secret_mcp_enabled (
        bot_slug TEXT NOT NULL,
        owner_slug TEXT NOT NULL,
        server_name TEXT NOT NULL,
        enabled_at TEXT NOT NULL,
        PRIMARY KEY (bot_slug, owner_slug, server_name)
      );
    `);
  },
};

const DEVICE_PAIRING_MIGRATION: SchemaMigration = {
  id: 'device-pairing',
  module: 'device-pairing',
  description: 'Record the Host identity and paired devices for the device gateway (ADR-0199)',
  migrate(database) {
    database.exec(`
      CREATE TABLE device_pairing_host (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        host_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE paired_devices (
        device_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        public_key TEXT,
        paired_at TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at TEXT
      );
    `);
  },
};

const PUSH_DELIVERY_MIGRATION: SchemaMigration = {
  id: 'push-delivery',
  module: 'push',
  description:
    'Record push tokens, notification kinds and sent Human Inbox items per paired device',
  migrate(database) {
    database.exec(`
      CREATE TABLE push_devices (
        device_id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
        locale TEXT,
        preferences_json TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        badge INTEGER
      );
      CREATE INDEX push_devices_token ON push_devices (token);
      CREATE TABLE push_sent (
        device_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        PRIMARY KEY (device_id, item_id)
      );
    `);
  },
};

const HUMAN_INBOX_SNOOZE_MIGRATION: SchemaMigration = {
  id: 'human-inbox-snooze',
  module: 'human-attention',
  description: 'Let the Human snooze a Human Inbox item until a later time',
  migrate(database) {
    database.exec(`
      CREATE TABLE human_inbox_snoozes (
        human_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        source_key TEXT NOT NULL,
        until TEXT NOT NULL,
        snoozed_at TEXT NOT NULL,
        PRIMARY KEY (human_id, item_id, source_key)
      );
    `);
  },
};

const SECRET_CLI_TOOL_RULE_MIGRATION: SchemaMigration = {
  id: 'secret-cli-tool-rule',
  module: 'tool-approval-rules',
  description: 'Allow secret_cli always-allow rules per program, account and variable names',
  migrate(database) {
    database.exec(`
      CREATE TABLE tool_approval_rules_next (
        id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('orchestrator', 'assignment')),
        scope_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('exact', 'all-opaque', 'secret-cli')),
        tool_name TEXT NOT NULL,
        input TEXT NOT NULL,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        revoked_at TEXT,
        external_creator TEXT
      );
      INSERT INTO tool_approval_rules_next
        (id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active, revoked_at,
         external_creator)
      SELECT id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active, revoked_at,
             external_creator
        FROM tool_approval_rules;
      DROP TABLE tool_approval_rules;
      ALTER TABLE tool_approval_rules_next RENAME TO tool_approval_rules;
      CREATE INDEX tool_approval_rules_lookup
        ON tool_approval_rules (bot_slug, role, scope_key, active, revoked_at);
    `);
  },
};

const TOB_IDENTITY_MIGRATION: SchemaMigration = {
  id: 'tob-identity',
  module: 'tob',
  description: 'Reserve the protected local Tob identity',
  migrate(database) {
    database.exec(`CREATE TABLE tob_identity (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1), bot_slug TEXT NOT NULL UNIQUE
    );`);
  },
};

const BOT_CREATION_OPERATION_MIGRATION: SchemaMigration = {
  id: 'bot-creation-operation',
  module: 'bot-creation',
  description: 'Reserve stable Bot creation identities for idempotent live CLI retries',
  migrate(database) {
    database.exec(`CREATE TABLE bot_creation_operations (
      operation_key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL,
      bot_slug TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('reserved','created'))
    );`);
  },
};

const CHANNEL_MANAGEMENT_OPERATION_MIGRATION: SchemaMigration = {
  id: 'channel-management-operation',
  module: 'channel-management',
  description: 'Reserve canonical Channel and invitation identities for scoped CLI retries',
  migrate(database) {
    database.exec(`CREATE TABLE channel_management_operations (
      operation_key TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('create','invite')),
      payload_hash TEXT NOT NULL, channel_id TEXT NOT NULL, invitation_id TEXT,
      targets_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('reserved','completed'))
    );`);
  },
};

const GROUP_SEND_REVIEW_MIGRATION: SchemaMigration = {
  id: 'group-send-review',
  module: 'channel-send-review',
  description: 'Opt-in local Group send review and bounded durable draft intents',
  migrate(database) {
    database.exec(`
      CREATE TABLE group_send_review_enabled (channel_id TEXT PRIMARY KEY);
      CREATE TABLE group_send_review_drafts (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, channel_id TEXT NOT NULL,
        source_event_id TEXT NOT NULL, record_json TEXT NOT NULL
      );
      CREATE INDEX group_send_review_source ON group_send_review_drafts(source_event_id);
    `);
  },
};

const TOB_ONBOARDING_MIGRATION: SchemaMigration = {
  id: 'tob-onboarding',
  module: 'bot-onboarding',
  description: 'Version the short Tob journey without restarting legacy tutorials',
  migrate(database) {
    database.exec(`
      ALTER TABLE bot_onboarding ADD COLUMN journey_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE bot_onboarding ADD COLUMN journey_started_at TEXT;
      ALTER TABLE bot_onboarding ADD COLUMN journey_bot TEXT;
      ALTER TABLE bot_onboarding ADD COLUMN journey_group TEXT;
      ALTER TABLE bot_onboarding ADD COLUMN journey_done INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE onboarding_creation_results (
        operation_key TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT,
        session_id TEXT NOT NULL, recorded_at TEXT NOT NULL,
        PRIMARY KEY (operation_key, kind)
      );
    `);
  },
};

const USAGE_IDLE_COMPACTION_MIGRATION: SchemaMigration = {
  id: 'usage-idle-compaction',
  module: 'usage',
  description: 'Record idle Orchestrator Session compactions for Bot activity',
  migrate(database) {
    database.exec(`
      CREATE TABLE usage_idle_compactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_slug TEXT NOT NULL,
        at TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        idle_gap_ms INTEGER NOT NULL,
        cache_lifetime_ms INTEGER NOT NULL,
        cache_lifetime_source TEXT NOT NULL,
        tokens_before INTEGER NOT NULL,
        tokens_after INTEGER,
        outcome TEXT NOT NULL CHECK (outcome IN ('compacted', 'nothing', 'failed')),
        error TEXT,
        input_tokens INTEGER,
        cache_read_tokens INTEGER,
        output_tokens INTEGER
      );
      CREATE INDEX usage_idle_compactions_bot_at ON usage_idle_compactions (bot_slug, at);
    `);
  },
};

const THREE_ACTION_APPROVAL_MIGRATION: SchemaMigration = {
  id: 'three-action-approval',
  module: 'tool-approval-rules',
  description: 'Remember one tool per authority scope and retain native ask for Full Access',
  migrate(database) {
    database.exec(`
      CREATE TABLE tool_approval_rules_next (
        id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('orchestrator', 'assignment')),
        scope_key TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('exact', 'tool', 'all-opaque', 'secret-cli')),
        tool_name TEXT NOT NULL, input TEXT NOT NULL, created_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)), revoked_at TEXT, external_creator TEXT
      );
      INSERT INTO tool_approval_rules_next
        SELECT * FROM tool_approval_rules;
      DROP TABLE tool_approval_rules;
      ALTER TABLE tool_approval_rules_next RENAME TO tool_approval_rules;
      CREATE INDEX tool_approval_rules_lookup
        ON tool_approval_rules (bot_slug, role, scope_key, active, revoked_at);
      UPDATE assignments SET approval_policy = 'ask'
        WHERE permission_mode = 'danger-full-access' AND approval_policy = 'never';
    `);
  },
};

const PUSH_APP_RENDER_MIGRATION: SchemaMigration = {
  id: 'push-app-render',
  module: 'push',
  description: 'Record which paired devices draw push notifications in the app',
  migrate(database) {
    database.exec(`ALTER TABLE push_devices ADD COLUMN render TEXT;`);
  },
};

const DEVICE_NOTIFICATION_PREFERENCE_MIGRATION: SchemaMigration = {
  id: 'device-notification-preference',
  module: 'push',
  description: 'Keep the device-owned notification preference copy without a push token',
  migrate(database) {
    database.exec(`
      CREATE TABLE device_notification_preferences (
        device_id TEXT PRIMARY KEY,
        preferences_json TEXT NOT NULL
      );
      INSERT INTO device_notification_preferences SELECT device_id, preferences_json FROM push_devices;
    `);
  },
};

const DEVICE_LIVE_ACTIVITY_MIGRATION: SchemaMigration = {
  id: 'device-live-activity',
  module: 'live-activity',
  description: 'Track device-owned Live Activity delivery handles, never request execution state',
  migrate(database) {
    database.exec(`CREATE TABLE device_live_activities (
      client_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL, source_event_id TEXT NOT NULL, handle TEXT NOT NULL,
      expires_at INTEGER NOT NULL, locale TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
      terminal INTEGER NOT NULL DEFAULT 0, last_sent INTEGER NOT NULL DEFAULT 0,
      last_state TEXT NOT NULL DEFAULT '', pending_state TEXT NOT NULL DEFAULT '',
      attempt_at INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0
    );`);
  },
};

const ASSIGNMENT_TITLE_MIGRATION: SchemaMigration = {
  id: 'assignment-title',
  module: 'assignments',
  description: 'Give Assignments a Title and turn purpose into their Description (ADR-0262)',
  migrate(database) {
    database.exec(`
      ALTER TABLE assignments RENAME COLUMN purpose TO description;
      ALTER TABLE assignments ADD COLUMN title TEXT NOT NULL DEFAULT '';
    `);
    const rows = database
      .prepare('SELECT session_id, description FROM assignments')
      .all() as Array<{
      session_id: string;
      description: string;
    }>;
    const update = database.prepare('UPDATE assignments SET title = ? WHERE session_id = ?');
    for (const row of rows) update.run(deriveAssignmentTitle(row.description), row.session_id);
  },
};

const SESSION_PROMPT_SNAPSHOT_MIGRATION: SchemaMigration = {
  id: 'session-prompt-snapshot',
  module: 'session-ownership',
  description: 'Freeze each Session Prompt Preset text at its first assembly',
  migrate(database) {
    database.exec('ALTER TABLE session_ownership ADD COLUMN prompt_snapshot TEXT;');
  },
};

const TOOL_RULE_AUTO_APPROVAL_COUNT_MIGRATION: SchemaMigration = {
  id: 'tool-rule-auto-approval-count',
  module: 'tool-approval-rules',
  description: 'Count the approval requests each always-allow rule answers',
  migrate(database) {
    database.exec(
      'ALTER TABLE tool_approval_rules ADD COLUMN auto_approved_count INTEGER NOT NULL DEFAULT 0;',
    );
  },
};

const REQUEST_ASSIGNMENT_LINK_MIGRATION: SchemaMigration = {
  id: 'request-assignment-link',
  module: 'assignments',
  description: 'Record which Assignment each Human request created or advanced',
  migrate(database) {
    database.exec(`
      CREATE TABLE request_assignments (
        request_source_event_id TEXT NOT NULL REFERENCES source_events(source_event_id),
        session_id TEXT NOT NULL REFERENCES session_ownership(session_id),
        linked_at TEXT NOT NULL,
        PRIMARY KEY (request_source_event_id, session_id)
      );
    `);
  },
};

const BOT_LAN_ADMISSION_MIGRATION: SchemaMigration = {
  id: 'bot-lan-admission',
  module: 'bot-lan',
  description: 'Record explicit Host-key-bound LAN Bot collaboration admissions',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_lan_admissions (
        host_id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        admission_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        admitted_at TEXT NOT NULL,
        revoked_at TEXT
      );
    `);
  },
};

const VOICE_PROVIDER_MIGRATION: SchemaMigration = {
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

const SESSION_PARENT_INDEX_MIGRATION: SchemaMigration = {
  id: 'session-parent-index',
  module: 'session-ownership',
  description: 'Index child Sessions by parent without scanning every Session',
  migrate(database) {
    database.exec(`
      CREATE INDEX session_ownership_parent ON session_ownership (parent_session_id);
    `);
  },
};

const NEEDS_REPAIR_INDEX_MIGRATION: SchemaMigration = {
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

const CAUSAL_PURGE_TOMBSTONE_MIGRATION: SchemaMigration = {
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

const VOICE_DEFAULTS_MIGRATION: SchemaMigration = {
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

const VOICE_SETTINGS_MIGRATION: SchemaMigration = {
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

const WORKSPACE_GRANT_PATH_MIGRATION: SchemaMigration = {
  id: 'workspace-grant-path',
  module: 'workspace-grants',
  description: 'Keep one active Workspace Grant per Bot and canonical directory',
  migrate(database) {
    database.exec(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY bot_slug, workspace_path ORDER BY created_at DESC, id DESC
        ) AS position,
        MAX(created_at) OVER (PARTITION BY bot_slug, workspace_path) AS superseded_at
        FROM workspace_grants WHERE revoked_at IS NULL
      )
      UPDATE workspace_grants SET revoked_at = (
        SELECT superseded_at FROM ranked WHERE ranked.id = workspace_grants.id
      ) WHERE id IN (SELECT id FROM ranked WHERE position > 1);
      CREATE UNIQUE INDEX workspace_grants_active_path
        ON workspace_grants (bot_slug, workspace_path) WHERE revoked_at IS NULL;
    `);
  },
};

const CLIENT_ACKNOWLEDGEMENT_MIGRATION: SchemaMigration = {
  id: 'client-acknowledgement',
  module: 'bot-onboarding',
  description: 'Remember one-time Client notices per Profile instead of per browser origin',
  migrate(database) {
    database.exec(`
      CREATE TABLE client_acknowledgements (
        ack_key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
    `);
  },
};

const callGridLayoutFor = (frames: string) =>
  `CASE ${frames} WHEN 1 THEN '1' WHEN 2 THEN '2' WHEN 3 THEN '3' WHEN 4 THEN '2+2' WHEN 5 THEN '3+2'
    WHEN 6 THEN '3+3' WHEN 7 THEN '3+2+2' WHEN 8 THEN '3+3+2' WHEN 9 THEN '3+3+3' END`;

const CALL_GRID_ROWS_MIGRATION: SchemaMigration = {
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

const DEVICE_FEED_READ_MIGRATION: SchemaMigration = {
  id: 'device-feed-read',
  module: 'paired-devices',
  description: 'Retain the paired client acknowledgement of its first Host Feed read',
  migrate(database) {
    database.exec('ALTER TABLE paired_devices ADD COLUMN feed_read_at TEXT');
  },
};

const TEAM_MEMBERS_MIGRATION: SchemaMigration = {
  id: 'team-members',
  module: 'team',
  description: 'Host-owned Human identities, password credentials and revocable member grants',
  migrate(database) {
    database.exec(`
      CREATE TABLE humans (
        human_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
        created_at TEXT NOT NULL
      );
      INSERT INTO humans SELECT 'local-human', COALESCE(
        (SELECT default_display_name FROM local_human_names WHERE human_id = 'local-human'),
        'Human'), 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
      CREATE TABLE member_credentials (
        human_id TEXT PRIMARY KEY REFERENCES humans(human_id),
        username TEXT NOT NULL UNIQUE,
        password_json TEXT NOT NULL,
        history_json TEXT NOT NULL,
        must_change INTEGER NOT NULL CHECK (must_change IN (0, 1))
      );
      CREATE TABLE member_grants (
        grant_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        human_id TEXT NOT NULL REFERENCES humans(human_id),
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX member_grants_human ON member_grants(human_id, revoked_at);
      CREATE TABLE team_settings (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        insecure_http_allowed INTEGER NOT NULL DEFAULT 0 CHECK (insecure_http_allowed IN (0, 1))
      );
      INSERT INTO team_settings(singleton) VALUES (1);
      ALTER TABLE paired_devices ADD COLUMN human_id TEXT NOT NULL DEFAULT 'local-human';
      ALTER TABLE channel_records ADD COLUMN public INTEGER NOT NULL DEFAULT 0 CHECK (public IN (0, 1));
      CREATE INDEX public_group_channels ON channel_records(channel_id) WHERE public = 1;
    `);
  },
};

const TEAM_ROLES_MIGRATION: SchemaMigration = {
  id: 'team-roles',
  module: 'team',
  description: 'Host Roles, member assignments and transferable Owner authority',
  migrate(database) {
    database.exec(`
      CREATE TABLE team_settings_next (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        insecure_http_allowed INTEGER NOT NULL DEFAULT 0 CHECK (insecure_http_allowed IN (0, 1)),
        owner_human_id TEXT NOT NULL REFERENCES humans(human_id)
      );
      INSERT INTO team_settings_next SELECT singleton, enabled, insecure_http_allowed, 'local-human' FROM team_settings;
      DROP TABLE team_settings;
      ALTER TABLE team_settings_next RENAME TO team_settings;
      CREATE TABLE host_roles (
        role_id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        builtin TEXT UNIQUE CHECK (builtin IN ('admin', 'member')),
        permissions_json TEXT NOT NULL
      );
      CREATE TABLE human_roles (
        human_id TEXT NOT NULL REFERENCES humans(human_id),
        role_id TEXT NOT NULL REFERENCES host_roles(role_id),
        PRIMARY KEY (human_id, role_id)
      );
      CREATE INDEX human_roles_role ON human_roles(role_id, human_id);
    `);
    const insert = database.prepare('INSERT INTO host_roles VALUES (?, ?, ?, ?)');
    insert.run('admin', 'admin', 'admin', JSON.stringify(ADMIN_PERMISSIONS));
    insert.run('member', 'member', 'member', JSON.stringify(MEMBER_PERMISSIONS));
    database.exec(
      `INSERT INTO human_roles SELECT human_id, 'member' FROM humans WHERE human_id <> 'local-human'`,
    );
  },
};

const PRIVATE_BOTS_MIGRATION: SchemaMigration = {
  id: 'private-bots',
  module: 'team',
  description: 'Private Bot ownership and one durable Tob identity per Human',
  migrate(database) {
    database.exec(`
      ALTER TABLE persona_bots ADD COLUMN owner_human_id TEXT NOT NULL DEFAULT 'local-human';
      CREATE INDEX persona_bots_owner ON persona_bots(owner_human_id, slug);
      UPDATE persona_bots SET body = json_set(body, '$.ownerHumanId', owner_human_id);
      ALTER TABLE tob_identity RENAME TO tob_identity_owner;
      CREATE TABLE tob_identity (
        human_id TEXT PRIMARY KEY,
        bot_slug TEXT NOT NULL UNIQUE
      );
      INSERT INTO tob_identity SELECT 'local-human', bot_slug FROM tob_identity_owner;
      DROP TABLE tob_identity_owner;
    `);
  },
};

const HOST_RELATIONSHIP_MIGRATION: SchemaMigration = {
  id: 'host-relationship',
  module: 'host-relationships',
  description: 'Persist pinned reciprocal Host relationships and derived device provenance',
  migrate(database) {
    database.exec(`
      CREATE TABLE host_relationships (
        relationship_id TEXT PRIMARY KEY,
        peer_host_id TEXT NOT NULL,
        peer_name TEXT NOT NULL,
        peer_key TEXT NOT NULL,
        peer_routes TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
        state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'active', 'disconnected')),
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        peer_revocation_pending INTEGER NOT NULL DEFAULT 0 CHECK (peer_revocation_pending IN (0, 1))
      );
      CREATE UNIQUE INDEX host_relationship_live_peer ON host_relationships(peer_host_id)
        WHERE state != 'disconnected';
      CREATE TABLE relationship_device_grants (
        device_id TEXT PRIMARY KEY REFERENCES paired_devices(device_id),
        relationship_id TEXT NOT NULL REFERENCES host_relationships(relationship_id)
      );
      CREATE INDEX relationship_grant_owner ON relationship_device_grants(relationship_id);
    `);
  },
};

const MEMBER_LIFECYCLE_MIGRATION: SchemaMigration = {
  id: 'member-lifecycle',
  module: 'team',
  description: 'Deactivation, mode suspension and deleted member identities',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE humans_next (
        human_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'deactivated')),
        created_at TEXT NOT NULL
      );
      INSERT INTO humans_next SELECT * FROM humans;
      DROP TABLE humans;
      ALTER TABLE humans_next RENAME TO humans;
      CREATE INDEX humans_status ON humans(status, human_id);
      CREATE TABLE team_mode_suspensions (
        human_id TEXT PRIMARY KEY REFERENCES humans(human_id),
        previous_status TEXT NOT NULL CHECK (previous_status IN ('active', 'deactivated'))
      );
      CREATE TABLE deleted_humans (human_id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
      UPDATE channel_records SET record_json = json_set(record_json, '$.ownerHumanId',
        (SELECT owner_human_id FROM team_settings))
        WHERE json_extract(record_json, '$.type') = 'group'
          AND json_extract(record_json, '$.ownerBotSlug') IS NULL;
    `);
  },
};

const CHANNEL_ACCESS_MIGRATION: SchemaMigration = {
  id: 'channel-access',
  module: 'team',
  description: 'Channel visibility, Human ownership, policy and admins',
  migrate(database) {
    database.exec(`
      ALTER TABLE channel_records ADD COLUMN visibility_json TEXT NOT NULL DEFAULT '{"kind":"private"}';
      ALTER TABLE channel_records ADD COLUMN policy_json TEXT NOT NULL DEFAULT '${JSON.stringify(DEFAULT_CHANNEL_POLICY)}';
      ALTER TABLE channel_records ADD COLUMN owner_human_id TEXT REFERENCES humans(human_id) ON DELETE SET NULL;
      UPDATE channel_records SET visibility_json = '{"kind":"public"}' WHERE public = 1;
      UPDATE channel_records SET owner_human_id = COALESCE(json_extract(record_json, '$.ownerHumanId'), (SELECT owner_human_id FROM team_settings));
      CREATE TABLE channel_admins (
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id) ON DELETE CASCADE,
        human_id TEXT NOT NULL REFERENCES humans(human_id) ON DELETE CASCADE,
        PRIMARY KEY(channel_id, human_id)
      );
    `);
  },
};

const HOST_RELATIONSHIP_REVOCATION_MIGRATION: SchemaMigration = {
  id: 'host-relationship-revocation',
  module: 'host-relationships',
  description: 'Retain bounded offline reciprocal disconnect retries across Host restart',
  migrate(database) {
    database.exec(`
      ALTER TABLE host_relationships ADD COLUMN revocation_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE host_relationships ADD COLUMN revocation_retry_at INTEGER;
      ALTER TABLE host_relationships ADD COLUMN automatic_enrollment_suppressed INTEGER NOT NULL DEFAULT 0;
      UPDATE host_relationships SET revocation_retry_at = 0 WHERE peer_revocation_pending = 1;
      UPDATE host_relationships SET automatic_enrollment_suppressed = 1 WHERE state = 'disconnected';
    `);
  },
};

const TEAM_MODELS_MIGRATION: SchemaMigration = {
  id: 'team-models',
  module: 'team',
  description: 'Role model route policy',
  migrate(db) {
    db.exec(`ALTER TABLE host_roles ADD COLUMN models_json TEXT NOT NULL DEFAULT '{"kind":"all"}'`);
  },
};

const MEMBER_USAGE_MIGRATION: SchemaMigration = {
  id: 'member-usage',
  module: 'usage',
  description: 'Human-attributed usage receipts and daily buckets',
  migrate(db) {
    db.exec(`
      ALTER TABLE usage_daily RENAME TO usage_daily_old;
      CREATE TABLE usage_daily (
        bot_slug TEXT NOT NULL, day TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, purpose TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        unknown_input INTEGER NOT NULL DEFAULT 0, unknown_output INTEGER NOT NULL DEFAULT 0,
        unknown_cache_read INTEGER NOT NULL DEFAULT 0, unknown_cache_write INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0, unknown_total INTEGER NOT NULL DEFAULT 0,
        human_id TEXT NOT NULL DEFAULT '', legacy INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (bot_slug, day, provider, model, purpose, human_id, legacy)
      );
      INSERT INTO usage_daily SELECT *, (SELECT owner_human_id FROM team_settings WHERE singleton = 1), 1 FROM usage_daily_old;
      DROP TABLE usage_daily_old;
      CREATE INDEX usage_daily_bot_day ON usage_daily(bot_slug, day);
      CREATE INDEX usage_daily_period_human ON usage_daily(day, human_id, bot_slug);
      ALTER TABLE usage_receipts ADD COLUMN human_id TEXT;
      UPDATE usage_receipts SET human_id = (SELECT owner_human_id FROM team_settings WHERE singleton = 1);
      ALTER TABLE usage_idle_compactions ADD COLUMN human_id TEXT;
      ALTER TABLE bot_schedules ADD COLUMN creator_human_id TEXT;
      CREATE TABLE usage_turn_humans (session_id TEXT NOT NULL, turn INTEGER NOT NULL, human_id TEXT NOT NULL, at_ms INTEGER NOT NULL,
        PRIMARY KEY(session_id, turn));
      CREATE INDEX usage_turn_humans_time ON usage_turn_humans(session_id, at_ms DESC, turn DESC) WHERE turn >= 0;
    `);
  },
};

const HOST_RELATIONSHIP_ACCOUNT_MIGRATION: SchemaMigration = {
  id: 'host-relationship-account',
  module: 'host-relationships',
  description: 'Retain verified same-account relationship provenance',
  migrate(database) {
    database.exec(`
      ALTER TABLE host_relationships ADD COLUMN account_origin TEXT;
      CREATE TABLE relationship_client_enrollments (
        relationship_id TEXT NOT NULL REFERENCES host_relationships(relationship_id),
        public_key TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
        state TEXT NOT NULL CHECK (state IN ('unconfirmed', 'committed', 'cleanup-pending', 'cleaned', 'cancelled')),
        expires_at INTEGER NOT NULL,
        account_generation TEXT,
        cleanup_attempts INTEGER NOT NULL DEFAULT 0,
        retry_at INTEGER,
        PRIMARY KEY (relationship_id, public_key, direction)
      );
      CREATE INDEX relationship_enrollment_cleanup ON relationship_client_enrollments(direction, state, retry_at);
    `);
  },
};

const WORKSPACE_SPACES_MIGRATION: SchemaMigration = {
  id: 'workspace-spaces',
  module: 'workspace-spaces',
  description:
    'Account and audience-contained shared Workspace roots and resumable Memory relocation',
  migrate(database) {
    database.exec(`
      CREATE TABLE workspace_spaces (
        space_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('account', 'shared')),
        name TEXT NOT NULL COLLATE NOCASE,
        owner_human_id TEXT UNIQUE,
        audience_json TEXT,
        CHECK ((kind = 'account' AND owner_human_id IS NOT NULL AND audience_json IS NULL)
          OR (kind = 'shared' AND owner_human_id IS NULL AND json_valid(audience_json)))
      );
      CREATE UNIQUE INDEX workspace_shared_names ON workspace_spaces(name) WHERE kind = 'shared';
      INSERT INTO workspace_spaces
        SELECT 'spaces/' || human_id, 'account', display_name, human_id, NULL FROM humans;
      CREATE TABLE workspace_file_transfers (human_id TEXT PRIMARY KEY, moves_json TEXT NOT NULL);
      CREATE TABLE workspace_memory_moves (
        slug TEXT PRIMARY KEY,
        source TEXT,
        target TEXT,
        proof_json TEXT
      );
      INSERT INTO workspace_memory_moves(slug)
        SELECT b.slug FROM persona_bots b
        WHERE b.owner_human_id <> (SELECT owner_human_id FROM team_settings WHERE singleton = 1)
          AND NOT EXISTS (SELECT 1 FROM persona_bot_deletions d WHERE d.slug = b.slug
          AND (json_extract(d.body, '$.memory') = 'erased' OR json_extract(d.body, '$.eraseMemory') = 1));
    `);
  },
};

const PRIVATE_CONTENT_AUDIT_MIGRATION: SchemaMigration = {
  id: 'private-content-audit',
  module: 'team',
  description: 'Hash-chained private-content access audit and durable tail anchor',
  migrate(database) {
    database.exec(`
        CREATE TABLE private_access_audit (
          seq INTEGER PRIMARY KEY,
          audit_id TEXT NOT NULL UNIQUE,
          record_json TEXT NOT NULL CHECK(json_valid(record_json))
        );
        CREATE TABLE private_audit_head (
          seq INTEGER NOT NULL,
          audit_id TEXT NOT NULL,
          hash TEXT NOT NULL
        );
        INSERT INTO private_audit_head VALUES (0, '', '');
      `);
  },
};

const MINIMAL_MEMBER_MIGRATION: SchemaMigration = {
  id: 'minimal-member',
  module: 'team',
  description: 'Minimal Member grants, split Bot creation and Owner-only Tob',
  migrate(db) {
    const previousMember = ['channels.create', 'dm.humans', 'bots.create', 'models.use'];
    const rows = z
      .array(
        z.object({
          role_id: z.string(),
          builtin: z.string().nullable(),
          name: z.string(),
          permissions_json: z.string(),
          models_json: z.string(),
        }),
      )
      .parse(
        db
          .prepare('SELECT role_id, builtin, name, permissions_json, models_json FROM host_roles')
          .all(),
      );
    for (const row of rows) {
      const permissions = z.array(z.string()).parse(JSON.parse(row.permissions_json));
      const unmodifiedMember =
        row.builtin === 'member' &&
        row.name === 'member' &&
        row.models_json === '{"kind":"all"}' &&
        permissions.length === previousMember.length &&
        previousMember.every((permission) => permissions.includes(permission));
      const grants = unmodifiedMember
        ? ['dm.humans']
        : [
            ...new Set(
              permissions.map((permission) =>
                permission === 'bots.create' ? 'bots.createPrivate' : permission,
              ),
            ),
          ];
      db.prepare('UPDATE host_roles SET permissions_json = ? WHERE role_id = ?').run(
        JSON.stringify(grants),
        row.role_id,
      );
    }
    db.exec(
      'DELETE FROM tob_identity WHERE human_id <> (SELECT owner_human_id FROM team_settings)',
    );
  },
};

const MIGRATION_LEDGER_MIGRATION: SchemaMigration = {
  id: 'migration-ledger',
  module: 'database',
  description: 'Require named migration history on every subsequent open',
  migrate() {},
};

const CHANNEL_MEMBERSHIP_BASIS_MIGRATION: SchemaMigration = {
  id: 'channel-membership-basis',
  module: 'team',
  description: 'Distinguish named invitations from role-based Channel joins',
  migrate(db) {
    db.exec(`
      ALTER TABLE channel_human_members ADD COLUMN membership_basis TEXT NOT NULL DEFAULT 'invited'
        CHECK (membership_basis IN ('role', 'invited'));
      CREATE INDEX channel_role_members_by_human ON channel_human_members(human_id, channel_id)
        WHERE left_at IS NULL AND membership_basis = 'role';
      UPDATE channel_human_members AS m SET membership_basis = 'role'
      WHERE m.human_id <> (SELECT owner_human_id FROM team_settings)
        AND EXISTS (SELECT 1 FROM channel_records c WHERE c.channel_id = m.channel_id
          AND json_extract(c.record_json, '$.type') = 'group'
          AND json_extract(c.visibility_json, '$.kind') = 'roles'
          AND c.owner_human_id <> m.human_id)
        AND NOT EXISTS (SELECT 1 FROM channel_admins a
          WHERE a.channel_id = m.channel_id AND a.human_id = m.human_id);
      UPDATE channel_human_members AS m SET left_at = COALESCE(left_at, datetime('now'))
      WHERE membership_basis = 'role' AND NOT EXISTS (
        SELECT 1 FROM channel_records c, json_each(c.visibility_json, '$.roleIds') vr
        JOIN human_roles r ON r.role_id = vr.value AND r.human_id = m.human_id
        WHERE c.channel_id = m.channel_id);
    `);
  },
};

export const BOT_VISIBILITY_MIGRATION: SchemaMigration = {
  id: 'bot-visibility',
  module: 'team',
  description: 'Bot visibility, participant DM authority, switches and revisioned speaker policy',
  migrate(database) {
    database.exec(`
      ALTER TABLE persona_bots ADD COLUMN visibility_json TEXT NOT NULL DEFAULT '{"kind":"private"}';
      ALTER TABLE persona_bots ADD COLUMN switches_json TEXT NOT NULL DEFAULT '{"proactiveDms":false,"joinPrincipalChannels":true,"speakerContext":true}';
      ALTER TABLE host_roles ADD COLUMN policy_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE host_roles ADD COLUMN policy_revision INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX channel_bot_human_dms ON channel_records(json_extract(record_json,'$.botSlug'),json_extract(record_json,'$.dmHumanId'))
        WHERE json_extract(record_json,'$.type')='dm' AND json_extract(record_json,'$.botSlug') IS NOT NULL;
      CREATE TABLE bot_channel_adders (
        bot_slug TEXT NOT NULL, channel_id TEXT NOT NULL, human_id TEXT NOT NULL,
        PRIMARY KEY (bot_slug, channel_id)
      ) STRICT;
      INSERT INTO bot_channel_adders
        SELECT b.slug, c.channel_id, b.owner_human_id FROM persona_bots b JOIN channel_records c
        ON EXISTS (SELECT 1 FROM json_each(c.record_json, '$.members') m WHERE m.value = b.slug)
        WHERE json_extract(c.record_json, '$.type') = 'group';
      INSERT INTO channel_human_members(channel_id,human_id,display_name,visible_from_revision,joined_at)
        SELECT DISTINCT c.channel_id,h.human_id,h.display_name,1,json_extract(c.record_json,'$.createdAt')
        FROM persona_bots b JOIN team_settings s ON b.owner_human_id=s.owner_human_id
        JOIN humans h ON h.human_id=b.owner_human_id JOIN channel_records c
          ON EXISTS (SELECT 1 FROM json_each(c.record_json,'$.members') m WHERE m.value=b.slug)
        WHERE json_extract(c.record_json,'$.type')='group'
          AND NOT EXISTS (SELECT 1 FROM channel_human_members m WHERE m.channel_id=c.channel_id AND m.human_id=h.human_id);
      INSERT OR IGNORE INTO channel_admins(channel_id,human_id)
        SELECT DISTINCT c.channel_id,s.owner_human_id FROM persona_bots b JOIN team_settings s ON b.owner_human_id=s.owner_human_id
        JOIN channel_records c ON EXISTS (SELECT 1 FROM json_each(c.record_json,'$.members') m WHERE m.value=b.slug)
        JOIN channel_human_members hm ON hm.channel_id=c.channel_id AND hm.human_id=s.owner_human_id AND hm.left_at IS NULL
        WHERE json_extract(c.record_json,'$.type')='group' AND json_extract(c.visibility_json,'$.kind')='roles';
      CREATE TABLE bot_proactive_opt_outs (
        bot_slug TEXT NOT NULL, human_id TEXT NOT NULL,
        PRIMARY KEY (bot_slug, human_id)
      ) STRICT;
      CREATE TABLE session_speaker_policies (
        session_id TEXT NOT NULL, role_id TEXT NOT NULL, revision INTEGER NOT NULL,
        PRIMARY KEY (session_id, role_id)
      ) STRICT;
    `);
  },
};

const HUMAN_ROSTER_ARRANGEMENTS_MIGRATION: SchemaMigration = {
  id: 'human-roster-arrangements',
  module: 'roster',
  description: 'Keep each Human sidebar arrangement independent from the legacy local Human roster',
  migrate(database) {
    database.exec(`CREATE TABLE human_roster_arrangements (
      human_id TEXT PRIMARY KEY REFERENCES humans(human_id) ON DELETE CASCADE,
      body TEXT NOT NULL
    )`);
  },
};

const HUMAN_MODEL_FAVORITES_MIGRATION: SchemaMigration = {
  id: 'human-model-favorites',
  module: 'model-favorites',
  description: 'Keep each Human favorite models as a personal preference shared by their devices',
  migrate(database) {
    database.exec(`CREATE TABLE human_model_favorites (
      human_id TEXT NOT NULL REFERENCES humans(human_id) ON DELETE CASCADE,
      favorite_key TEXT NOT NULL,
      favorite_json TEXT NOT NULL CHECK (json_valid(favorite_json)),
      position INTEGER NOT NULL,
      PRIMARY KEY (human_id, favorite_key)
    )`);
  },
};

const CHANNEL_AUTO_JOIN_MIGRATION: SchemaMigration = {
  id: 'channel-auto-join',
  module: 'team',
  description: 'Join every active Human to each public or role Channel they can view',
  migrate(db) {
    db.exec(`
      UPDATE channel_human_members AS m SET left_at = datetime('now')
      WHERE left_at IS NULL AND membership_basis = 'role'
        AND EXISTS (SELECT 1 FROM channel_records c WHERE c.channel_id = m.channel_id
          AND json_extract(c.visibility_json, '$.kind') = 'private');
      INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at, membership_basis)
      SELECT c.channel_id, h.human_id, h.display_name, 1, datetime('now'), 'role'
      FROM channel_records c JOIN humans h ON h.status = 'active'
      WHERE json_extract(c.record_json, '$.type') = 'group'
        AND json_extract(c.record_json, '$.deletedAt') IS NULL
        AND json_extract(c.visibility_json, '$.kind') IN ('public', 'roles')
        AND (json_extract(c.visibility_json, '$.kind') = 'public'
          OR EXISTS (SELECT 1 FROM human_roles r JOIN json_each(c.visibility_json, '$.roleIds') v
            ON v.value = r.role_id WHERE r.human_id = h.human_id))
        AND NOT EXISTS (SELECT 1 FROM channel_human_members x
          WHERE x.channel_id = c.channel_id AND x.human_id = h.human_id AND x.left_at IS NULL)
      ON CONFLICT(channel_id, human_id) DO UPDATE SET left_at = NULL, membership_basis = 'role';
    `);
  },
};

const MEMBER_DEVICES_MIGRATION: SchemaMigration = {
  id: 'member-devices',
  module: 'team',
  description: 'Member grants distinguish browser sessions and paired devices',
  migrate(database) {
    database.exec(`
      ALTER TABLE member_grants ADD COLUMN kind TEXT NOT NULL DEFAULT 'browser-session'
        CHECK (kind IN ('browser-session', 'paired-device'));
      ALTER TABLE member_grants ADD COLUMN device_name TEXT;
      ALTER TABLE member_grants ADD COLUMN public_key TEXT;
    `);
  },
};

const REMOTE_HOST_CUSTODY_MIGRATION: SchemaMigration = {
  id: 'remote-host-custody',
  module: 'remote-host-custody',
  description: 'The local Host keeps Remote Host credentials; the Client only holds handles',
  migrate(database) {
    database.exec(`
      CREATE TABLE remote_host_custody (
        handle TEXT PRIMARY KEY,
        owner_human_id TEXT NOT NULL,
        host_id TEXT NOT NULL,
        member INTEGER NOT NULL CHECK (member IN (0, 1)),
        routes TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;
    `);
  },
};

const ASSIGNMENT_MODEL_GROUP_MIGRATION: SchemaMigration = {
  id: 'assignment-model-group',
  module: 'assignments',
  description: 'Remember the Routing Group an Assignment Session runs on so it can fall back',
  migrate(database) {
    database.exec(`ALTER TABLE assignments ADD COLUMN model_group_id TEXT;`);
  },
};

const HUMAN_AVATAR_MIGRATION: SchemaMigration = {
  id: 'human-avatar',
  module: 'human-identity',
  description: 'A Host-owned chat avatar for each Human, independent of any Tobs account',
  migrate(database) {
    database.exec(`
      CREATE TABLE human_avatars (
        human_id TEXT PRIMARY KEY,
        avatar TEXT NOT NULL,
        version TEXT NOT NULL
      ) STRICT;
    `);
  },
};

const HUMAN_AVATAR_CHANGE_MIGRATION: SchemaMigration = {
  id: 'human-avatar-channel-changes',
  module: 'human-identity',
  description: 'Tell Channel readers to refresh member avatar versions when a Human avatar changes',
  migrate(database) {
    database.exec(`
      CREATE TRIGGER channel_change_avatar_insert AFTER INSERT ON human_avatars
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES ('*', NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_avatar_update AFTER UPDATE ON human_avatars
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES ('*', NULL, 'channel');
        END;
      CREATE TRIGGER channel_change_avatar_delete AFTER DELETE ON human_avatars
        BEGIN
          INSERT INTO channel_changes (channel_id, message_id, kind) VALUES ('*', NULL, 'channel');
        END;
    `);
  },
};

const HUMAN_PROFILE_SETUP_MIGRATION: SchemaMigration = {
  id: 'human-profile-setup',
  module: 'human-identity',
  description:
    'Remember which Team members finished or skipped the first chat name and photo prompt',
  migrate(database) {
    database.exec(`
      CREATE TABLE human_profile_setup (
        human_id TEXT PRIMARY KEY,
        finished_at TEXT NOT NULL
      ) STRICT;
    `);
  },
};

const ASSIGNMENT_MODEL_EFFORT_MIGRATION: SchemaMigration = {
  id: 'assignment-model-effort',
  module: 'assignments',
  description: 'Remember the reasoning effort chosen for an Assignment Routing Group',
  migrate(database) {
    database.exec('ALTER TABLE assignments ADD COLUMN model_effort TEXT');
  },
};

const MODELS_CONFIGURE_PERMISSION_MIGRATION: SchemaMigration = {
  id: 'models-configure-permission',
  module: 'team',
  description: 'Grant shared model configuration to the built-in Admin with its default grants',
  migrate(database) {
    const previousAdmin = [
      'members.manage',
      'roles.manage',
      'team.settings',
      'channels.create',
      'channels.manageAll',
      'dm.humans',
      'bots.createPrivate',
      'bots.createPublic',
      'bots.manageAll',
      'models.use',
      'im.bind',
      'workspaces.manageShared',
      'approvals.opaqueTools',
      'usage.view',
      'audit.view',
    ];
    database
      .prepare(`UPDATE host_roles SET permissions_json = json_insert(permissions_json, '$[#]', ?)
      WHERE builtin = 'admin' AND json_array_length(permissions_json) = ?
      AND NOT EXISTS (
        SELECT value FROM json_each(?) EXCEPT SELECT value FROM json_each(permissions_json)
      )`)
      .run('models.configure', previousAdmin.length, JSON.stringify(previousAdmin));
  },
};

const ROLE_MODEL_PROVIDERS_MIGRATION: SchemaMigration = {
  id: 'role-model-providers',
  module: 'team',
  description: 'Add an empty provider allowlist to existing restricted Host Roles',
  migrate(database) {
    database.exec(`
      UPDATE host_roles
      SET models_json = json_set(models_json, '$.providers', json('[]'))
      WHERE json_extract(models_json, '$.kind') = 'only'
        AND json_type(models_json, '$.providers') IS NULL
    `);
  },
};

const SESSION_TURN_TARGET_MIGRATION: SchemaMigration = {
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

const ROLE_ENGINE_ACCOUNTS_MIGRATION: SchemaMigration = {
  id: 'role-engine-accounts',
  module: 'team',
  description: 'Start existing Host Roles with no subscription account grants',
  migrate(database) {
    database.exec(`
      UPDATE host_roles
      SET models_json = json_set(models_json, '$.engineAccounts', json('[]'))
      WHERE json_type(models_json, '$.engineAccounts') IS NULL
    `);
  },
};

const DEFAULT_MODEL_PRESET_MIGRATION: SchemaMigration = {
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

const SESSION_MODEL_CHOICES_MIGRATION: SchemaMigration = {
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

const MODEL_PRESET_SUB_MIGRATION: SchemaMigration = {
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

const MODEL_PRESET_SUB_ENGINE_MIGRATION: SchemaMigration = {
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

const OWNER_PASSWORD_SIGN_IN_MIGRATION: SchemaMigration = {
  id: 'owner-password-sign-in',
  module: 'team',
  description: 'Standalone Owner password sign-in policy and paired-device enrollment provenance',
  migrate(database) {
    database.exec(`
      ALTER TABLE team_settings ADD COLUMN owner_password_sign_in INTEGER NOT NULL DEFAULT 0
        CHECK (owner_password_sign_in IN (0, 1));
      ALTER TABLE paired_devices ADD COLUMN enrollment TEXT
        CHECK (enrollment = 'owner-password');
    `);
  },
};

const CHANNEL_HUMAN_ADD_RECEIPTS_MIGRATION: SchemaMigration = {
  id: 'channel-human-add-receipts',
  module: 'team',
  description: 'Replay bulk Human additions without restoring ended access',
  migrate(database) {
    database.exec(`
      CREATE TABLE channel_human_add_receipts (
        actor_human_id TEXT NOT NULL REFERENCES humans(human_id) ON DELETE CASCADE,
        operation_key TEXT NOT NULL,
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id) ON DELETE CASCADE,
        target_human_id TEXT NOT NULL REFERENCES humans(human_id) ON DELETE CASCADE,
        PRIMARY KEY (actor_human_id, operation_key)
      ) STRICT;
      CREATE INDEX channel_human_add_receipts_channel ON channel_human_add_receipts(channel_id);
      CREATE INDEX channel_human_add_receipts_target ON channel_human_add_receipts(target_human_id);
    `);
  },
};

const BOT_SCHEDULE_CREATION_RECEIPTS_MIGRATION: SchemaMigration = {
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

const PENDING_ORCHESTRATOR_REPLACEMENTS_MIGRATION: SchemaMigration = {
  id: 'pending-orchestrator-replacements',
  module: 'session-ownership',
  description: 'Store Orchestrator reservations separately from committed Session ownership',
  migrate(database) {
    database.exec(`
      CREATE TABLE pending_orchestrator_replacements (
        session_id TEXT PRIMARY KEY NOT NULL,
        bot_slug TEXT NOT NULL,
        cwd_reference TEXT,
        previous_cwd_reference TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX pending_orchestrator_replacements_bot
        ON pending_orchestrator_replacements (bot_slug, created_at DESC, session_id);
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
  BOT_SOURCE_GROUP_MODES_MIGRATION,
  MEMORY_CHANGE_INBOX_MIGRATION,
  MEMORY_CHANGE_CHECKPOINT_MIGRATION,
  MEMORY_RECOVERY_CHECKPOINT_MIGRATION,
  ASSIGNMENT_MODEL_ROUTE_MIGRATION,
  BOT_SOURCE_DELIVERY_MIGRATION,
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
  PERMISSION_GROUP_MIGRATION,
  PAIRING_CARD_MIGRATION,
  BEHAVIOR_PERMISSION_MIGRATION,
  EXTERNAL_TOOL_RULE_CREATOR_MIGRATION,
  FAILURE_ALERT_MIGRATION,
  ASSIGNMENT_ARCHIVE_MIGRATION,
  INBOX_RESOLUTION_MIGRATION,
  INBOX_SNOOZE_MIGRATION,
  ASSIGNMENT_ACCESS_SCOPE_MIGRATION,
  SECRET_MCP_SERVER_MIGRATION,
  PROACTIVE_POST_LIMIT_MIGRATION,
  SECRET_MCP_ENABLEMENT_MIGRATION,
  DEVICE_PAIRING_MIGRATION,
  PUSH_DELIVERY_MIGRATION,
  HUMAN_INBOX_SNOOZE_MIGRATION,
  CHANNEL_REACTION_MIGRATION,
  SECRET_CLI_TOOL_RULE_MIGRATION,
  TOB_IDENTITY_MIGRATION,
  BOT_CREATION_OPERATION_MIGRATION,
  CHANNEL_MANAGEMENT_OPERATION_MIGRATION,
  GROUP_SEND_REVIEW_MIGRATION,
  CLOUD_CONNECTION_MIGRATION,
  CLOUD_WORK_MIGRATION,
  TOB_ONBOARDING_MIGRATION,
  USAGE_IDLE_COMPACTION_MIGRATION,
  THREE_ACTION_APPROVAL_MIGRATION,
  PUSH_APP_RENDER_MIGRATION,
  DEVICE_NOTIFICATION_PREFERENCE_MIGRATION,
  DEVICE_LIVE_ACTIVITY_MIGRATION,
  ASSIGNMENT_TITLE_MIGRATION,
  SESSION_PROMPT_SNAPSHOT_MIGRATION,
  TOOL_RULE_AUTO_APPROVAL_COUNT_MIGRATION,
  REQUEST_ASSIGNMENT_LINK_MIGRATION,
  MESSAGE_SEARCH_ATTACHMENT_NAME_MIGRATION,
  GRANT_RECEPTION_EVIDENCE_MIGRATION,
  HUMAN_ATTENTION_CANDIDATE_INDEX_MIGRATION,
  BOT_LAN_ADMISSION_MIGRATION,
  QUESTION_MESSAGING_MIGRATION,
  TAKEOVER_ATTENTION_INDEX_MIGRATION,
  VOICE_PROVIDER_MIGRATION,
  GRANT_RESOLUTION_INDEX_MIGRATION,
  OUTPUT_REQUEST_INDEX_MIGRATION,
  SESSION_PARENT_INDEX_MIGRATION,
  NEEDS_REPAIR_INDEX_MIGRATION,
  PLACEMENT_NOTICE_MIGRATION,
  PLACEMENT_HUMAN_REPLY_MIGRATION,
  BOUNDED_RANGE_INDEX_MIGRATION,
  ATTENTION_RESOLUTION_INDEX_MIGRATION,
  CAUSAL_PURGE_TOMBSTONE_MIGRATION,
  VOICE_DEFAULTS_MIGRATION,
  VOICE_SETTINGS_MIGRATION,
  CHANNEL_CHANGE_LOG_MIGRATION,
  WORKSPACE_GRANT_PATH_MIGRATION,
  GENUI_PRIVATE_VIEW_MIGRATION,
  CALL_GRID_ROWS_MIGRATION,
  CALL_VISUAL_UNSAVED_MIGRATION,
  CALL_VISUAL_TIMELINE_MIGRATION,
  CLIENT_ACKNOWLEDGEMENT_MIGRATION,
  QUESTION_MESSAGING_RECOVERY_MIGRATION,
  QQ_PLATFORM_DEFAULTS_MIGRATION,
  DEVICE_FEED_READ_MIGRATION,
  SOURCE_EVENT_HUMAN_MIGRATION,
  TEAM_MEMBERS_MIGRATION,
  TEAM_ROLES_MIGRATION,
  PRIVATE_BOTS_MIGRATION,
  HOST_RELATIONSHIP_MIGRATION,
  MEMBER_LIFECYCLE_MIGRATION,
  CHANNEL_ACCESS_MIGRATION,
  HOST_RELATIONSHIP_REVOCATION_MIGRATION,
  TEAM_MODELS_MIGRATION,
  MEMBER_USAGE_MIGRATION,
  HOST_RELATIONSHIP_ACCOUNT_MIGRATION,
  WORKSPACE_SPACES_MIGRATION,
  PRIVATE_CONTENT_AUDIT_MIGRATION,
  MINIMAL_MEMBER_MIGRATION,
  MIGRATION_LEDGER_MIGRATION,
  CHANNEL_MEMBERSHIP_BASIS_MIGRATION,
  BOT_VISIBILITY_MIGRATION,
  HUMAN_ROSTER_ARRANGEMENTS_MIGRATION,
  CHANNEL_AUTO_JOIN_MIGRATION,
  MEMBER_DEVICES_MIGRATION,
  REMOTE_HOST_CUSTODY_MIGRATION,
  ROUTING_GROUP_STORAGE_MIGRATION,
  MODEL_SWITCH_NOTICE_MIGRATION,
  ASSIGNMENT_MODEL_GROUP_MIGRATION,
  HUMAN_AVATAR_MIGRATION,
  HUMAN_AVATAR_CHANGE_MIGRATION,
  HUMAN_PROFILE_SETUP_MIGRATION,
  HUMAN_MODEL_FAVORITES_MIGRATION,
  ROUTING_GROUP_DEFAULT_MIGRATION,
  GROUP_FALLBACK_OVERRIDES_MIGRATION,
  ASSIGNMENT_AGENT_PRESET_MIGRATION,
  SESSION_AGENT_PRESET_MIGRATION,
  ROUTING_GROUP_DEFAULT_EFFORT_MIGRATION,
  ASSIGNMENT_MODEL_EFFORT_MIGRATION,
  MODELS_CONFIGURE_PERMISSION_MIGRATION,
  ROLE_MODEL_PROVIDERS_MIGRATION,
  SESSION_TURN_TARGET_MIGRATION,
  ROLE_ENGINE_ACCOUNTS_MIGRATION,
  DEFAULT_MODEL_PRESET_MIGRATION,
  SESSION_MODEL_CHOICES_MIGRATION,
  MODEL_PRESET_SUB_MIGRATION,
  MODEL_PRESET_SUB_ENGINE_MIGRATION,
  OWNER_PASSWORD_SIGN_IN_MIGRATION,
  CHANNEL_HUMAN_ADD_RECEIPTS_MIGRATION,
  BOT_SCHEDULE_CREATION_RECEIPTS_MIGRATION,
  PENDING_ORCHESTRATOR_REPLACEMENTS_MIGRATION,
]);
