import { DatabaseSync } from 'node:sqlite';
import { OperationalDatabaseError } from '../owner.js';
import type { SchemaMigration } from '../schema.js';

export const MESSAGING_OUTBOUND_MIGRATION: SchemaMigration = {
  id: 'messaging-outbound',
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

export const EXTERNAL_SOURCE_MIGRATION: SchemaMigration = {
  id: 'external-source',
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

export const EXTERNAL_GROUP_POLICY_MIGRATION: SchemaMigration = {
  id: 'external-group-policy',
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

export const EXTERNAL_THREAD_POLICY_MIGRATION: SchemaMigration = {
  id: 'external-thread-policy',
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

export const EXTERNAL_IDENTITY_MIGRATION: SchemaMigration = {
  id: 'external-identity',
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

export const CHANNEL_BRIDGE_MIGRATION: SchemaMigration = {
  id: 'channel-bridge',
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

export const MESSAGING_DEFAULTS_MIGRATION: SchemaMigration = {
  id: 'messaging-defaults',
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

export const BRIDGE_ROUTES_MIGRATION: SchemaMigration = {
  id: 'bridge-routes',
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

export const QUALIFIED_PLATFORM_DEFAULTS_MIGRATION: SchemaMigration = {
  id: 'qualified-platform-defaults',
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

export const DISCORD_PLATFORM_DEFAULTS_MIGRATION: SchemaMigration = {
  id: 'discord-platform-defaults',
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

export const BOT_PAIRING_MIGRATION: SchemaMigration = {
  id: 'bot-pairing',
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

export const APPROVAL_MESSAGING_MIGRATION: SchemaMigration = {
  id: 'approval-messaging',
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

export const NEW_CONVERSATION_DEFAULT_MIGRATION: SchemaMigration = {
  id: 'new-conversation-default',
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

export const BOUND_APP_ADMISSION_MIGRATION: SchemaMigration = {
  id: 'bound-app-admission',
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

export const CONVERSATION_LIST_MIGRATION: SchemaMigration = {
  id: 'conversation-list',
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

export const SEVERAL_APPS_MIGRATION: SchemaMigration = {
  id: 'several-apps',
  module: 'messaging',
  description:
    'Let one Bot bind several apps of the same platform; one app still belongs to one Bot',
  migrate(database) {
    database.exec('DROP INDEX IF EXISTS messaging_binding_bot_platform;');
  },
};

export const CONVERSATION_INGEST_MIGRATION: SchemaMigration = {
  id: 'conversation-ingest',
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

export const MESSAGING_TYPING_MIGRATION: SchemaMigration = {
  id: 'messaging-typing',
  module: 'messaging',
  description: 'Persist identity-local native typing preference without persisting tickets',
  migrate(database) {
    database.exec(`
      ALTER TABLE messaging_bindings ADD COLUMN typing_enabled INTEGER NOT NULL DEFAULT 1
        CHECK (typing_enabled IN (0, 1));
    `);
  },
};

export const WECHAT_PLATFORM_DEFAULTS_MIGRATION: SchemaMigration = {
  id: 'wechat-platform-defaults',
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

export const EXTERNAL_USER_ROLE_MIGRATION: SchemaMigration = {
  id: 'external-user-role',
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

export const PERMISSION_GROUP_MIGRATION: SchemaMigration = {
  id: 'permission-group',
  module: 'messaging',
  description: 'Persist continuous scoped authorization groups without copying member grants',
  migrate(database) {
    database.exec(`CREATE TABLE messaging_permission_groups (id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL, binding_id TEXT NOT NULL, body TEXT NOT NULL CHECK (json_valid(body)));
      CREATE INDEX messaging_permission_groups_scope ON messaging_permission_groups(bot_slug, binding_id);`);
  },
};

export const PAIRING_CARD_MIGRATION: SchemaMigration = {
  id: 'pairing-card',
  module: 'messaging',
  description: 'Persist scoped pairing-review card receipts and operator choices',
  migrate(database) {
    database.exec(`CREATE TABLE messaging_pairing_cards (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL, bot_slug TEXT NOT NULL,
      destination TEXT NOT NULL, body TEXT NOT NULL CHECK (json_valid(body)),
      UNIQUE(request_id, destination));
      CREATE INDEX messaging_pairing_cards_bot ON messaging_pairing_cards(bot_slug);`);
  },
};

export const BEHAVIOR_PERMISSION_MIGRATION: SchemaMigration = {
  id: 'behavior-permission',
  module: 'messaging',
  description: 'Persist reusable Bot-scoped Group behavior permission items',
  migrate(db) {
    db.exec(`CREATE TABLE messaging_behavior_permissions (
      id TEXT PRIMARY KEY,
      bot_slug TEXT NOT NULL,
      body TEXT NOT NULL CHECK (json_valid(body))
    );
    CREATE INDEX messaging_behavior_permissions_bot ON messaging_behavior_permissions(bot_slug);`);
  },
};

export const FAILURE_ALERT_MIGRATION: SchemaMigration = {
  id: 'failure-alert',
  module: 'messaging',
  description:
    'Persist opt-in failure alerts and bounded delivery metadata on the shared management route',
  migrate(database) {
    database.exec(`CREATE TABLE messaging_failure_alert_settings (
      bot_slug TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)), revision INTEGER NOT NULL
    );
    CREATE TABLE messaging_failure_alert_deliveries (
      id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL, event_key TEXT NOT NULL UNIQUE,
      body TEXT NOT NULL CHECK(json_valid(body))
    );
    CREATE INDEX messaging_failure_alert_deliveries_bot ON messaging_failure_alert_deliveries(bot_slug);`);
  },
};

export const PROACTIVE_POST_LIMIT_MIGRATION: SchemaMigration = {
  id: 'proactive-post-limit',
  module: 'messaging',
  description: 'Persist per-app proactive post limits and independent quota revisions',
  migrate(database) {
    database.exec(`
      ALTER TABLE messaging_bindings ADD COLUMN post_limit INTEGER DEFAULT 60 CHECK (post_limit IS NULL OR post_limit >= 1);
      ALTER TABLE messaging_bindings ADD COLUMN post_limit_revision INTEGER NOT NULL DEFAULT 1 CHECK (post_limit_revision >= 1);
    `);
  },
};

export const CLOUD_CONNECTION_MIGRATION: SchemaMigration = {
  id: 'cloud-connection',
  module: 'messaging',
  description: 'Track explicit cloud Agent connections without storing secret values',
  migrate(database) {
    database.exec(`CREATE TABLE cloud_connections (
      id TEXT PRIMARY KEY,
      connection_json TEXT NOT NULL,
      credential_revision TEXT NOT NULL,
      active INTEGER NOT NULL CHECK (active IN (0,1)),
      cursor INTEGER NOT NULL CHECK (cursor >= 0),
      policy_json TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 1)
    );`);
  },
};

export const CLOUD_WORK_MIGRATION: SchemaMigration = {
  id: 'cloud-work',
  module: 'messaging',
  description: 'Fence bounded cloud work execution and forwarding across retries',
  migrate(database) {
    database.exec(`CREATE TABLE cloud_work (
      connection_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      bot_slug TEXT NOT NULL,
      source_event_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('authorizing','started','outbox','finished','forwarding','forwarded')),
      target_actor_id TEXT,
      environment TEXT NOT NULL,
      execution_count INTEGER NOT NULL CHECK (execution_count IN (0,1)),
      outcome_json TEXT,
      PRIMARY KEY (connection_id,request_id)
    );`);
  },
};

export const QUESTION_MESSAGING_MIGRATION: SchemaMigration = {
  id: 'question-messaging',
  module: 'messaging',
  description: 'Retain checked native question notification references and receipts',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_question_deliveries (
        id TEXT PRIMARY KEY, bot_slug TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body))
      );
      CREATE INDEX messaging_question_deliveries_bot ON messaging_question_deliveries(bot_slug);
    `);
  },
};

export const QUESTION_MESSAGING_RECOVERY_MIGRATION: SchemaMigration = {
  id: 'question-messaging-recovery',
  module: 'messaging',
  description: 'Recover the question schema skipped by the generation-116 QQ defaults hotfix',
  migrate(database) {
    const reference = new DatabaseSync(':memory:');
    try {
      QUESTION_MESSAGING_MIGRATION.migrate(reference);
      const query = `SELECT type, name, tbl_name, sql FROM sqlite_schema
        WHERE tbl_name = 'messaging_question_deliveries'
           OR name IN ('messaging_question_deliveries', 'messaging_question_deliveries_bot')`;
      const expected = reference.prepare(query).all();
      const actual = database.prepare(query).all();
      const normalize = (sql: unknown) =>
        typeof sql === 'string' ? sql.replace(/\s+/gu, ' ').trim() : sql;
      for (const object of actual) {
        const match = expected.find((candidate) => candidate.name === object.name);
        if (
          match === undefined ||
          match.type !== object.type ||
          match.tbl_name !== object.tbl_name ||
          normalize(match.sql) !== normalize(object.sql)
        ) {
          throw new OperationalDatabaseError(
            'migration-failed',
            'Incompatible question notification schema; retain the Profile for recovery',
          );
        }
      }
      for (const object of expected) {
        if (typeof object.sql === 'string' && !actual.some((entry) => entry.name === object.name)) {
          database.exec(object.sql);
        }
      }
    } finally {
      reference.close();
    }
  },
};

export const QQ_PLATFORM_DEFAULTS_MIGRATION: SchemaMigration = {
  id: 'qq-platform-defaults',
  module: 'messaging',
  description:
    'Allow QQ platform defaults while preserving official and historical hotfix preferences',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_default_revisions_qualified (
        platform TEXT NOT NULL CHECK (platform IN ('feishu', 'slack', 'discord', 'weixin', 'qq')),
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

export const BINDING_GROUP_INTERACTIONS_MIGRATION: SchemaMigration = {
  id: 'binding-group-interactions',
  module: 'messaging',
  description:
    'Let one Binding opt in or out of group approvals and answers apart from its platform',
  migrate(database) {
    database.exec(`
      ALTER TABLE messaging_bindings ADD COLUMN group_interactions INTEGER CHECK (group_interactions IS NULL OR group_interactions IN (0, 1));
      ALTER TABLE messaging_bindings ADD COLUMN group_interactions_revision INTEGER NOT NULL DEFAULT 1 CHECK (group_interactions_revision >= 1);
    `);
  },
};
