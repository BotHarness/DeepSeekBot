import type { SchemaMigration } from '../schema.js';

export const PERSONABOT_PROTECTION_MIGRATION: SchemaMigration = {
  id: 'personabot-protection',
  module: 'bots',
  description: 'Record the lifecycle and presentation policy for existing Tob identities',
  migrate(database) {
    database.exec(`
      UPDATE persona_bots
      SET body = json_set(body, '$.protection',
        json_object('deletion', 'deny', 'presentation', 'retain-customizations', 'lifetime', 'owner-tenure'))
      WHERE slug IN (
        SELECT t.bot_slug FROM tob_identity t JOIN team_settings s ON s.owner_human_id = t.human_id
      );
    `);
  },
};
