import type { SchemaMigration } from '../schema.js';

export const HUMAN_AVATAR_MIGRATION: SchemaMigration = {
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

export const HUMAN_AVATAR_CHANGE_MIGRATION: SchemaMigration = {
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

export const HUMAN_PROFILE_SETUP_MIGRATION: SchemaMigration = {
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
