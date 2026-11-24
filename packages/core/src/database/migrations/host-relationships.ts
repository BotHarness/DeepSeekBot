import type { SchemaMigration } from '../schema.js';

export const HOST_RELATIONSHIP_MIGRATION: SchemaMigration = {
  id: 'host-relationship',
  module: 'host-relationships',
  description: 'Persist pinned reciprocal Host relationships and derived device provenance',
  migrate(database) {
    database.exec(`
      CREATE TABLE host_relationships (
        relationship_id TEXT PRIMARY KEY,
        peer_host_id TEXT NOT NULL,
        peer_name TEXT NOT NULL,
        peer_key TEXT NOT NULL,
        peer_routes TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
        state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'active', 'disconnected')),
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        peer_revocation_pending INTEGER NOT NULL DEFAULT 0 CHECK (peer_revocation_pending IN (0, 1))
      );
      CREATE UNIQUE INDEX host_relationship_live_peer ON host_relationships(peer_host_id)
        WHERE state != 'disconnected';
      CREATE TABLE relationship_device_grants (
        device_id TEXT PRIMARY KEY REFERENCES paired_devices(device_id),
        relationship_id TEXT NOT NULL REFERENCES host_relationships(relationship_id)
      );
      CREATE INDEX relationship_grant_owner ON relationship_device_grants(relationship_id);
    `);
  },
};

export const HOST_RELATIONSHIP_REVOCATION_MIGRATION: SchemaMigration = {
  id: 'host-relationship-revocation',
  module: 'host-relationships',
  description: 'Retain bounded offline reciprocal disconnect retries across Host restart',
  migrate(database) {
    database.exec(`
      ALTER TABLE host_relationships ADD COLUMN revocation_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE host_relationships ADD COLUMN revocation_retry_at INTEGER;
      ALTER TABLE host_relationships ADD COLUMN automatic_enrollment_suppressed INTEGER NOT NULL DEFAULT 0;
      UPDATE host_relationships SET revocation_retry_at = 0 WHERE peer_revocation_pending = 1;
      UPDATE host_relationships SET automatic_enrollment_suppressed = 1 WHERE state = 'disconnected';
    `);
  },
};

export const HOST_RELATIONSHIP_ACCOUNT_MIGRATION: SchemaMigration = {
  id: 'host-relationship-account',
  module: 'host-relationships',
  description: 'Retain verified same-account relationship provenance',
  migrate(database) {
    database.exec(`
      ALTER TABLE host_relationships ADD COLUMN account_origin TEXT;
      CREATE TABLE relationship_client_enrollments (
        relationship_id TEXT NOT NULL REFERENCES host_relationships(relationship_id),
        public_key TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
        state TEXT NOT NULL CHECK (state IN ('unconfirmed', 'committed', 'cleanup-pending', 'cleaned', 'cancelled')),
        expires_at INTEGER NOT NULL,
        account_generation TEXT,
        cleanup_attempts INTEGER NOT NULL DEFAULT 0,
        retry_at INTEGER,
        PRIMARY KEY (relationship_id, public_key, direction)
      );
      CREATE INDEX relationship_enrollment_cleanup ON relationship_client_enrollments(direction, state, retry_at);
    `);
  },
};
