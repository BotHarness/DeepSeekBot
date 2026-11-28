import type { SchemaMigration } from '../schema.js';

export const CHANNEL_APPROVAL_POLICY_MIGRATION: SchemaMigration = {
  id: 'channel-approval-policy',
  module: 'team',
  description: 'Add Channel approval permissions while preserving existing approval access',
  migrate(db) {
    db.exec(`
      ALTER TABLE channel_records RENAME COLUMN permission_table_json TO previous_permission_table_json;
      ALTER TABLE channel_records ADD COLUMN permission_table_json TEXT NOT NULL DEFAULT '{"version":1,"everyone":{"addMembers":"allow","post":"allow","mentionAll":"allow","addBots":"deny","editDetails":"deny","wakeBot":"allow","seeApprovals":"allow","decideApprovals":"deny"},"overrides":[]}';
      UPDATE channel_records SET permission_table_json =
        json_set(previous_permission_table_json, '$.everyone.seeApprovals', 'allow', '$.everyone.decideApprovals', 'deny');
      UPDATE channel_records SET permission_table_json =
        json_set(permission_table_json, '$.approvalMode', 'legacy')
        WHERE json_extract(record_json, '$.type') = 'group';
      ALTER TABLE channel_records DROP COLUMN previous_permission_table_json;
    `);
  },
};
