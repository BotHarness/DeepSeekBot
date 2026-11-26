import type { SchemaMigration } from '../schema.js';
import { deriveAssignmentTitle } from '../historical-migration-snapshots.js';

export const ASSIGNMENT_DIRECTORY_MIGRATION: SchemaMigration = {
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

export const ASSIGNMENT_COLLABORATION_MIGRATION: SchemaMigration = {
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

export const ASSIGNMENT_STOP_MIGRATION: SchemaMigration = {
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

export const ASSIGNMENT_LIFECYCLE_NOTICE_MIGRATION: SchemaMigration = {
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

export const ASSIGNMENT_MODEL_ROUTE_MIGRATION: SchemaMigration = {
  id: 'assignment-model-route',
  module: 'assignments',
  description: 'Snapshot each new Assignment Session model route independently of the Bot plan',
  migrate(database) {
    database.exec(`ALTER TABLE assignments ADD COLUMN model_route_json TEXT;`);
  },
};

export const ASSIGNMENT_AGENT_PRESET_MIGRATION: SchemaMigration = {
  id: 'assignment-agent-preset',
  module: 'assignments',
  description: 'Snapshot the DSH mode an Orchestrator chose for a new Assignment Session',
  migrate(database) {
    database.exec(`ALTER TABLE assignments ADD COLUMN agent_preset TEXT;`);
  },
};

export const ASSIGNMENT_ARCHIVE_MIGRATION: SchemaMigration = {
  id: 'assignment-archive',
  module: 'assignments',
  description: 'Mirror the DSH Session archive on Orchestrator-archived Assignments (ADR-0188)',
  migrate(database) {
    database.exec('ALTER TABLE assignments ADD COLUMN archived_at TEXT');
  },
};

export const ASSIGNMENT_TITLE_MIGRATION: SchemaMigration = {
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

export const REQUEST_ASSIGNMENT_LINK_MIGRATION: SchemaMigration = {
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

export const ASSIGNMENT_MODEL_GROUP_MIGRATION: SchemaMigration = {
  id: 'assignment-model-group',
  module: 'assignments',
  description: 'Remember the Routing Group an Assignment Session runs on so it can fall back',
  migrate(database) {
    database.exec(`ALTER TABLE assignments ADD COLUMN model_group_id TEXT;`);
  },
};

export const ASSIGNMENT_MODEL_EFFORT_MIGRATION: SchemaMigration = {
  id: 'assignment-model-effort',
  module: 'assignments',
  description: 'Remember the reasoning effort chosen for an Assignment Routing Group',
  migrate(database) {
    database.exec('ALTER TABLE assignments ADD COLUMN model_effort TEXT');
  },
};
