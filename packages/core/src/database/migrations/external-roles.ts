import type { SchemaMigration } from '../schema.js';

export const HOST_EXTERNAL_ROLES_MIGRATION: SchemaMigration = {
  id: 'host-external-roles',
  module: 'messaging',
  description: 'Move external roles to Host scope while retaining their original Bot and identity',
  migrate(database) {
    database.exec(`
      CREATE TABLE messaging_host_external_roles (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL CHECK (json_valid(body))
      ) STRICT;
      INSERT INTO messaging_host_external_roles (id, body)
      SELECT id, json_set(
        json_remove(body, '$.botSlug'),
        '$.botScope', json_object('kind', 'only', 'botSlugs', json_array(bot_slug)),
        '$.policy', json_array(),
        '$.deniedCapabilities', json_array()
      )
      FROM messaging_external_roles ORDER BY rowid;
      DROP TABLE messaging_external_roles;
      ALTER TABLE messaging_bindings ADD COLUMN contact_workspace_id TEXT;
      CREATE INDEX messaging_pairings_external_contact
        ON messaging_pairings(actor_id, binding_id)
        WHERE purpose = 'conversation' AND status = 'approved';
    `);
  },
};
