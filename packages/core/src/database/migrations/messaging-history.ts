import type { SchemaMigration } from '../schema.js';
import { INBOX_HISTORY_INDEX_SQL, MESSAGE_SEARCH_INDEX_SQL } from '../inbox-history-index.js';
import { rebuildWithKind } from './shared.js';

export const ATTACHMENT_FILE_BINDING_MIGRATION: SchemaMigration = {
  id: 'attachment-file-binding',
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

export const HUMAN_RESPONSE_INDEX_MIGRATION: SchemaMigration = {
  id: 'human-response-index',
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

export const RECEPTION_HISTORY_MIGRATION: SchemaMigration = {
  id: 'reception-history',
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

export const BOT_SELF_RECORD_MIGRATION: SchemaMigration = {
  id: 'bot-self-record',
  module: 'messaging',
  description: 'Record Bot Self-Records as Channel Notices with born-handled Bot Inbox records',
  rebuildsReferencedTables: true,
  migrate(database) {
    rebuildWithKind(database, 'source_events', 'schedule', ['self-record']);
    rebuildWithKind(database, 'inbox_admissions', 'schedule', ['memory-commit', 'bot-action']);
  },
};

export const MEMORY_COMMIT_RECORD_MIGRATION: SchemaMigration = {
  id: 'memory-commit-record',
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

export const INBOX_HISTORY_MIGRATION: SchemaMigration = {
  id: 'inbox-history',
  module: 'messaging',
  description: 'Index canonical Source Events for own-Bot Inbox history with FTS5 trigram',
  migrate(database) {
    database.exec(INBOX_HISTORY_INDEX_SQL);
  },
};

export const MESSAGE_SEARCH_ATTACHMENT_NAME_MIGRATION: SchemaMigration = {
  id: 'message-search-attachment-name',
  module: 'messaging',
  description: 'Index attachment file names in the message full-text index for global search',
  migrate(database) {
    database.exec(MESSAGE_SEARCH_INDEX_SQL);
  },
};

export const GRANT_RECEPTION_EVIDENCE_MIGRATION: SchemaMigration = {
  id: 'grant-reception-evidence',
  module: 'messaging',
  description: 'Fence grant-backed reception evidence from older Bridge-only readers',
  migrate(database) {
    database.exec(`CREATE INDEX messaging_paths_authority
      ON messaging_source_paths(bot_slug, source_event_id, json_extract(body, '$.kind'));
      CREATE VIEW messaging_bridge_sources AS SELECT DISTINCT source_event_id
        FROM messaging_source_paths WHERE json_extract(body, '$.kind') IS NOT 'grant';`);
  },
};

export const HUMAN_ATTENTION_CANDIDATE_INDEX_MIGRATION: SchemaMigration = {
  id: 'human-attention-candidate-index',
  module: 'messaging',
  description: 'Index canonical pending attention candidates without scanning ordinary history',
  migrate(database) {
    database.exec(`
      CREATE INDEX source_events_attention_question ON source_events (message_id, source_event_id)
        WHERE source_kind = 'bot-message'
          AND json_extract(payload_json, '$.userQuestionRequest') IS NOT NULL;
      CREATE INDEX source_events_attention_approval ON source_events (message_id, source_event_id)
        WHERE source_kind = 'bot-message'
          AND json_extract(payload_json, '$.toolApprovalRequest') IS NOT NULL;
      CREATE INDEX source_events_attention_private ON source_events (message_id, source_event_id)
        WHERE source_kind = 'bot-message'
          AND json_extract(payload_json, '$.privateInputRequest') IS NOT NULL;
      CREATE INDEX source_events_attention_grant ON source_events (message_id, source_event_id)
        WHERE source_kind = 'bot-message'
          AND json_extract(payload_json, '$.grantRequest') = 1;
      CREATE INDEX source_events_attention_rejection ON source_events (message_id, source_event_id)
        WHERE source_kind = 'system-message'
          AND json_extract(payload_json, '$.toolAutoApproval.outcome') = 'rejected';
    `);
  },
};

export const TAKEOVER_ATTENTION_INDEX_MIGRATION: SchemaMigration = {
  id: 'takeover-attention-index',
  module: 'messaging',
  description: 'Index Takeover Handoff requests without scanning ordinary history',
  migrate(database) {
    database.exec(`
      CREATE INDEX source_events_attention_takeover ON source_events (message_id, source_event_id)
        WHERE source_kind = 'bot-message'
          AND json_extract(payload_json, '$.takeoverRequest') IS NOT NULL;
    `);
  },
};

export const GRANT_RESOLUTION_INDEX_MIGRATION: SchemaMigration = {
  id: 'grant-resolution-index',
  module: 'messaging',
  description: 'Index grant request resolutions without scanning Channel history',
  migrate(database) {
    database.exec(`
      CREATE INDEX source_events_grant_resolution
        ON source_events (json_extract(payload_json, '$.grantRequestResolution.requestMessageId'))
        WHERE json_extract(payload_json, '$.grantRequestResolution.requestMessageId') IS NOT NULL;
    `);
  },
};

export const OUTPUT_REQUEST_INDEX_MIGRATION: SchemaMigration = {
  id: 'output-request-index',
  module: 'messaging',
  description: 'Index Bot output lookups by the request that caused them',
  migrate(database) {
    database.exec(`
      CREATE INDEX channel_output_origins_request ON channel_output_origins (request_source_event_id);
    `);
  },
};

export const PLACEMENT_NOTICE_MIGRATION: SchemaMigration = {
  id: 'placement-notice',
  module: 'messaging',
  description: 'Mark notice placements so the latest message is found without walking notices',
  migrate(database) {
    database.exec(`
      ALTER TABLE channel_placements ADD COLUMN notice INTEGER NOT NULL DEFAULT 0;
      UPDATE channel_placements SET notice = 1 WHERE source_event_id IN (
        SELECT source_event_id FROM source_events
         WHERE CASE WHEN json_valid(payload_json) THEN coalesce(json_type(payload_json, '$.botDmAction') = 'object' OR json_type(payload_json, '$.botCreateAction') = 'object' OR json_type(payload_json, '$.botChannelPost') = 'object' OR json_type(payload_json, '$.memoryCommit') = 'object' OR json_type(payload_json, '$.toolAutoApproval') = 'object' OR json_type(payload_json, '$.toolAutoApprovalPause') = 'object', 0) ELSE 0 END
      );
      CREATE INDEX channel_placements_latest_message ON channel_placements (channel_id, revision)
        WHERE notice = 0;
      CREATE TRIGGER channel_placements_notice_insert AFTER INSERT ON channel_placements
        BEGIN
          UPDATE channel_placements SET notice = coalesce((
            SELECT CASE WHEN json_valid(payload_json) THEN coalesce(json_type(payload_json, '$.botDmAction') = 'object' OR json_type(payload_json, '$.botCreateAction') = 'object' OR json_type(payload_json, '$.botChannelPost') = 'object' OR json_type(payload_json, '$.memoryCommit') = 'object' OR json_type(payload_json, '$.toolAutoApproval') = 'object' OR json_type(payload_json, '$.toolAutoApprovalPause') = 'object', 0) ELSE 0 END FROM source_events
             WHERE source_event_id = NEW.source_event_id
          ), 0)
           WHERE channel_id = NEW.channel_id AND revision = NEW.revision;
        END;
      CREATE TRIGGER channel_placements_notice_update AFTER UPDATE OF payload_json ON source_events
        BEGIN
          UPDATE channel_placements SET notice = CASE WHEN json_valid(NEW.payload_json) THEN coalesce(json_type(NEW.payload_json, '$.botDmAction') = 'object' OR json_type(NEW.payload_json, '$.botCreateAction') = 'object' OR json_type(NEW.payload_json, '$.botChannelPost') = 'object' OR json_type(NEW.payload_json, '$.memoryCommit') = 'object' OR json_type(NEW.payload_json, '$.toolAutoApproval') = 'object' OR json_type(NEW.payload_json, '$.toolAutoApprovalPause') = 'object', 0) ELSE 0 END
           WHERE source_event_id = NEW.source_event_id;
        END;
    `);
  },
};

export const PLACEMENT_HUMAN_REPLY_MIGRATION: SchemaMigration = {
  id: 'placement-human-reply',
  module: 'messaging',
  description:
    'Mark Bot replies and mentions for the Human so the replies list skips other history',
  migrate(database) {
    database.exec(`
      ALTER TABLE channel_placements ADD COLUMN for_human INTEGER NOT NULL DEFAULT 0;
      UPDATE channel_placements SET for_human = 1 WHERE (
        SELECT CASE WHEN json_valid(e.payload_json) AND json_extract(e.payload_json, '$.author.kind') = 'bot' THEN coalesce(json_array_length(e.payload_json, '$.humanMentions') > 0 OR EXISTS (SELECT 1 FROM channel_placements o JOIN source_events t ON t.source_event_id = o.source_event_id WHERE o.channel_id = channel_placements.channel_id AND o.message_id = json_extract(e.payload_json, '$.replyTo') AND json_valid(t.payload_json) AND json_extract(t.payload_json, '$.author.kind') = 'human'), 0) ELSE 0 END FROM source_events e WHERE e.source_event_id = channel_placements.source_event_id
      ) = 1;
      CREATE INDEX channel_placements_for_human ON channel_placements (channel_id, revision)
        WHERE for_human = 1;
      CREATE TRIGGER channel_placements_for_human_insert AFTER INSERT ON channel_placements
        BEGIN
          UPDATE channel_placements SET for_human = coalesce((
            SELECT CASE WHEN json_valid(e.payload_json) AND json_extract(e.payload_json, '$.author.kind') = 'bot' THEN coalesce(json_array_length(e.payload_json, '$.humanMentions') > 0 OR EXISTS (SELECT 1 FROM channel_placements o JOIN source_events t ON t.source_event_id = o.source_event_id WHERE o.channel_id = NEW.channel_id AND o.message_id = json_extract(e.payload_json, '$.replyTo') AND json_valid(t.payload_json) AND json_extract(t.payload_json, '$.author.kind') = 'human'), 0) ELSE 0 END FROM source_events e WHERE e.source_event_id = NEW.source_event_id
          ), 0)
           WHERE channel_id = NEW.channel_id AND revision = NEW.revision;
        END;
      CREATE TRIGGER channel_placements_for_human_update AFTER UPDATE OF payload_json ON source_events
        BEGIN
          UPDATE channel_placements SET for_human = coalesce((
            SELECT CASE WHEN json_valid(e.payload_json) AND json_extract(e.payload_json, '$.author.kind') = 'bot' THEN coalesce(json_array_length(e.payload_json, '$.humanMentions') > 0 OR EXISTS (SELECT 1 FROM channel_placements o JOIN source_events t ON t.source_event_id = o.source_event_id WHERE o.channel_id = channel_placements.channel_id AND o.message_id = json_extract(e.payload_json, '$.replyTo') AND json_valid(t.payload_json) AND json_extract(t.payload_json, '$.author.kind') = 'human'), 0) ELSE 0 END FROM source_events e WHERE e.source_event_id = NEW.source_event_id
          ), 0)
           WHERE source_event_id = NEW.source_event_id;
        END;
    `);
  },
};

export const BOUNDED_RANGE_INDEX_MIGRATION: SchemaMigration = {
  id: 'bounded-range-index',
  module: 'messaging',
  description:
    'Index message time, outbound attempts, outbound receipts and external message ids for bounded lookups',
  migrate(database) {
    database.exec(`
      CREATE INDEX source_events_created ON source_events (created_at);
      CREATE INDEX messaging_outbox_attempts_started ON messaging_outbox_attempts (started_at);
      CREATE INDEX messaging_outbox_receipt
        ON messaging_outbox (bot_slug, json_extract(body, '$.receipt.messageId'));
      CREATE INDEX source_events_external_message
        ON source_events (bot_slug, json_extract(payload_json, '$.external.event.messageId'))
        WHERE source_kind = 'bridge-message';
    `);
  },
};

export const ATTENTION_RESOLUTION_INDEX_MIGRATION: SchemaMigration = {
  id: 'attention-resolution-index',
  module: 'messaging',
  description: 'Index attention resolutions and admission activity time for bounded lookups',
  migrate(database) {
    database.exec(`
      CREATE INDEX source_events_question_resolution
        ON source_events (json_extract(payload_json, '$.userQuestionResolution.requestMessageId'))
        WHERE json_extract(payload_json, '$.userQuestionResolution.requestMessageId') IS NOT NULL;
      CREATE INDEX source_events_approval_decision
        ON source_events (json_extract(payload_json, '$.toolApprovalDecision.requestMessageId'))
        WHERE json_extract(payload_json, '$.toolApprovalDecision.requestMessageId') IS NOT NULL;
      CREATE INDEX source_events_approval_override
        ON source_events (json_extract(payload_json, '$.toolAutoApprovalOverride.recordMessageId'))
        WHERE json_extract(payload_json, '$.toolAutoApprovalOverride.recordMessageId') IS NOT NULL;
      CREATE INDEX source_events_private_resolution
        ON source_events (json_extract(payload_json, '$.privateInputResolution.requestMessageId'))
        WHERE json_extract(payload_json, '$.privateInputResolution.requestMessageId') IS NOT NULL;
      CREATE INDEX inbox_admissions_activity
        ON inbox_admissions (bot_slug, coalesce(observed_at, handled_at))
        WHERE ignored_at IS NULL;
    `);
  },
};

export const CALL_VISUAL_UNSAVED_MIGRATION: SchemaMigration = {
  id: 'call-visual-unsaved',
  module: 'messaging',
  description: 'Drop the removed unsaved marker from call message visuals',
  migrate(database) {
    database.exec(`
      UPDATE source_events
         SET payload_json = json_remove(payload_json, '$.voiceCall.visual.unsaved')
       WHERE json_valid(payload_json)
         AND json_type(payload_json, '$.voiceCall.visual.unsaved') IS NOT NULL;
    `);
  },
};

export const CALL_VISUAL_TIMELINE_MIGRATION: SchemaMigration = {
  id: 'call-visual-timeline',
  module: 'messaging',
  description:
    'Drop the removed frame-record list from call message visuals, and grid metadata without a picture range',
  migrate(database) {
    database.exec(`
      UPDATE source_events
         SET payload_json = json_remove(payload_json, '$.voiceCall.visual.records')
       WHERE json_valid(payload_json)
         AND json_type(payload_json, '$.voiceCall.visual.records') IS NOT NULL;
      UPDATE source_events
         SET payload_json = json_remove(payload_json, '$.voiceCall.visual')
       WHERE json_valid(payload_json)
         AND json_type(payload_json, '$.voiceCall.visual.frames') IS NOT NULL
         AND (json_type(payload_json, '$.voiceCall.visual.fromMs') IS NULL
           OR json_type(payload_json, '$.voiceCall.visual.toMs') IS NULL);
    `);
  },
};

const noticeOf = (payload: string) =>
  `CASE WHEN json_valid(${payload}) THEN coalesce(${['botDmAction', 'botCreateAction', 'botChannelPost', 'memoryCommit', 'toolAutoApproval', 'toolAutoApprovalPause', 'modelSwitch'].map((field) => `json_type(${payload}, '$.${field}') = 'object'`).join(' OR ')}, 0) ELSE 0 END`;

export const MODEL_SWITCH_NOTICE_MIGRATION: SchemaMigration = {
  id: 'model-switch-notice',
  module: 'messaging',
  description: 'Mark Model Switch Notices as notice placements',
  migrate(database) {
    database.exec(`
      DROP TRIGGER channel_placements_notice_insert;
      DROP TRIGGER channel_placements_notice_update;
      UPDATE channel_placements SET notice = 1 WHERE notice = 0 AND source_event_id IN (
        SELECT source_event_id FROM source_events WHERE ${noticeOf('payload_json')}
      );
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
    `);
  },
};
