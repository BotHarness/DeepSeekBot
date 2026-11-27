import type { SchemaMigration } from '../schema.js';

export const CHANNEL_BOT_RECEPTION_MIGRATION: SchemaMigration = {
  id: 'channel-bot-reception',
  module: 'team',
  description: 'Set a Channel Bot mention audience and scope person × Bot blocks to a Channel',
  migrate(db) {
    db.exec(`
      UPDATE channel_records SET permission_table_json =
        json_set(permission_table_json, '$.everyone.wakeBot', 'allow');
      CREATE TABLE channel_bot_mention_audiences (
        channel_id TEXT NOT NULL REFERENCES channel_records(channel_id) ON DELETE CASCADE,
        bot_slug TEXT NOT NULL,
        audience_json TEXT NOT NULL CHECK (json_valid(audience_json)),
        PRIMARY KEY (channel_id, bot_slug)
      );
      ALTER TABLE messaging_sender_blocks RENAME TO previous_sender_blocks;
      CREATE TABLE messaging_sender_blocks (
        bot_slug TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        channel_id TEXT NOT NULL DEFAULT '',
        revision INTEGER NOT NULL CHECK (revision > 0),
        body TEXT NOT NULL CHECK (json_valid(body)),
        PRIMARY KEY (bot_slug, fingerprint, actor_id, channel_id),
        CHECK ((channel_id = '') <> (fingerprint = ''))
      );
      INSERT INTO messaging_sender_blocks (bot_slug, fingerprint, actor_id, revision, body)
        SELECT bot_slug, fingerprint, actor_id, revision, body FROM previous_sender_blocks;
      DROP TABLE previous_sender_blocks;
      CREATE INDEX channel_sender_blocks ON messaging_sender_blocks(channel_id, actor_id)
        WHERE channel_id <> '';
    `);
  },
};
