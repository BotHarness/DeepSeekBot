import {
  ADMIN_PERMISSIONS,
  DEFAULT_CHANNEL_POLICY,
  MEMBER_PERMISSIONS,
  z,
} from '../historical-migration-snapshots.js';
import type { SchemaMigration } from '../schema.js';

export const TEAM_MEMBERS_MIGRATION: SchemaMigration = {
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

export const TEAM_ROLES_MIGRATION: SchemaMigration = {
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

export const PRIVATE_BOTS_MIGRATION: SchemaMigration = {
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

export const MEMBER_LIFECYCLE_MIGRATION: SchemaMigration = {
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

export const CHANNEL_ACCESS_MIGRATION: SchemaMigration = {
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

export const TEAM_MODELS_MIGRATION: SchemaMigration = {
  id: 'team-models',
  module: 'team',
  description: 'Role model route policy',
  migrate(db) {
    db.exec(`ALTER TABLE host_roles ADD COLUMN models_json TEXT NOT NULL DEFAULT '{"kind":"all"}'`);
  },
};

export const PRIVATE_CONTENT_AUDIT_MIGRATION: SchemaMigration = {
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

export const MINIMAL_MEMBER_MIGRATION: SchemaMigration = {
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

export const CHANNEL_MEMBERSHIP_BASIS_MIGRATION: SchemaMigration = {
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

export const CHANNEL_AUTO_JOIN_MIGRATION: SchemaMigration = {
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

export const MEMBER_DEVICES_MIGRATION: SchemaMigration = {
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

export const MODELS_CONFIGURE_PERMISSION_MIGRATION: SchemaMigration = {
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

export const ROLE_MODEL_PROVIDERS_MIGRATION: SchemaMigration = {
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

export const ROLE_ENGINE_ACCOUNTS_MIGRATION: SchemaMigration = {
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

export const OWNER_PASSWORD_SIGN_IN_MIGRATION: SchemaMigration = {
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

export const CHANNEL_HUMAN_ADD_RECEIPTS_MIGRATION: SchemaMigration = {
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

export const ROLE_DENIED_PERMISSIONS_MIGRATION: SchemaMigration = {
  id: 'role-denied-permissions',
  module: 'team',
  description: 'Host Roles can explicitly deny Host Permissions; any deny wins across roles',
  migrate(database) {
    database.exec(
      `ALTER TABLE host_roles ADD COLUMN denied_permissions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(denied_permissions_json))`,
    );
  },
};

export const HOST_ROLE_REVISION_MIGRATION: SchemaMigration = {
  id: 'host-role-revision',
  module: 'team',
  description: 'Host Role revisions protect snapshot-based edits',
  migrate(database) {
    database.exec('ALTER TABLE host_roles ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');
  },
};

export const HOST_ROLE_BOT_SCOPE_MIGRATION: SchemaMigration = {
  id: 'host-role-bot-scope',
  module: 'team',
  description:
    'Host Roles can grant access to all public Bots, with selected access stored on Bots',
  migrate(database) {
    database.exec(`
      ALTER TABLE host_roles ADD COLUMN all_public_bots INTEGER NOT NULL DEFAULT 0
        CHECK (all_public_bots IN (0, 1));
      CREATE TRIGGER host_role_bot_scope_changed AFTER UPDATE OF visibility_json ON persona_bots
      WHEN OLD.visibility_json <> NEW.visibility_json
      BEGIN
        UPDATE host_roles SET revision = revision + 1 WHERE
          EXISTS (SELECT 1 FROM json_each(OLD.visibility_json, '$.audience.roleIds') old_role
            WHERE old_role.value = host_roles.role_id)
          <> EXISTS (SELECT 1 FROM json_each(NEW.visibility_json, '$.audience.roleIds') new_role
            WHERE new_role.value = host_roles.role_id);
      END;
    `);
  },
};
