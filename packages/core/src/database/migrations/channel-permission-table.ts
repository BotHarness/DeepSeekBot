import type { SchemaMigration } from '../schema.js';

export const CHANNEL_PERMISSION_TABLE_MIGRATION: SchemaMigration = {
  id: 'channel-permission-table',
  module: 'team',
  description: 'Versioned Channel permission tables with Host Role overrides',
  migrate(db) {
    db.exec(`
      ALTER TABLE channel_records ADD COLUMN permission_table_json TEXT NOT NULL DEFAULT '{"version":1,"everyone":{"addMembers":"allow","post":"allow","mentionAll":"allow","addBots":"deny","editDetails":"deny"},"overrides":[]}';
      UPDATE channel_records SET permission_table_json = json_set(permission_table_json,
        '$.everyone.addMembers', CASE json_extract(policy_json, '$.addMembers') WHEN 'everyone' THEN 'allow' ELSE 'deny' END,
        '$.everyone.post', CASE json_extract(policy_json, '$.post') WHEN 'everyone' THEN 'allow' ELSE 'deny' END,
        '$.everyone.mentionAll', CASE json_extract(policy_json, '$.mentionAll') WHEN 'everyone' THEN 'allow' ELSE 'deny' END,
        '$.everyone.addBots', CASE json_extract(policy_json, '$.addBots') WHEN 'everyone' THEN 'allow' ELSE 'deny' END,
        '$.everyone.editDetails', CASE json_extract(policy_json, '$.editDetails') WHEN 'everyone' THEN 'allow' ELSE 'deny' END
      );
      ALTER TABLE channel_records DROP COLUMN policy_json;
    `);
  },
};
