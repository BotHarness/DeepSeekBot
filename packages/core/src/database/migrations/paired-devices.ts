import type { SchemaMigration } from '../schema.js';

export const DEVICE_FEED_READ_MIGRATION: SchemaMigration = {
  id: 'device-feed-read',
  module: 'paired-devices',
  description: 'Retain the paired client acknowledgement of its first Host Feed read',
  migrate(database) {
    database.exec('ALTER TABLE paired_devices ADD COLUMN feed_read_at TEXT');
  },
};
