import type { SchemaMigration } from '../schema.js';

export const PUSH_DELIVERY_MIGRATION: SchemaMigration = {
  id: 'push-delivery',
  module: 'push',
  description:
    'Record push tokens, notification kinds and sent Human Inbox items per paired device',
  migrate(database) {
    database.exec(`
      CREATE TABLE push_devices (
        device_id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
        locale TEXT,
        preferences_json TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        badge INTEGER
      );
      CREATE INDEX push_devices_token ON push_devices (token);
      CREATE TABLE push_sent (
        device_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        PRIMARY KEY (device_id, item_id)
      );
    `);
  },
};

export const PUSH_APP_RENDER_MIGRATION: SchemaMigration = {
  id: 'push-app-render',
  module: 'push',
  description: 'Record which paired devices draw push notifications in the app',
  migrate(database) {
    database.exec(`ALTER TABLE push_devices ADD COLUMN render TEXT;`);
  },
};

export const DEVICE_NOTIFICATION_PREFERENCE_MIGRATION: SchemaMigration = {
  id: 'device-notification-preference',
  module: 'push',
  description: 'Keep the device-owned notification preference copy without a push token',
  migrate(database) {
    database.exec(`
      CREATE TABLE device_notification_preferences (
        device_id TEXT PRIMARY KEY,
        preferences_json TEXT NOT NULL
      );
      INSERT INTO device_notification_preferences SELECT device_id, preferences_json FROM push_devices;
    `);
  },
};
