import type { SchemaMigration } from '../schema.js';

export const CONNECTOR_ACCOUNTS_MIGRATION: SchemaMigration = {
  id: 'connector-accounts',
  module: 'connectors',
  description: 'Host-level Connector Accounts and per-Bot Account Grants (#5307)',
  migrate(database) {
    database.exec(`
      CREATE TABLE connector_accounts (
        account_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK (provider IN ('composio')),
        service TEXT NOT NULL,
        label TEXT NOT NULL,
        identity TEXT,
        holder_slug TEXT,
        external_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'failed')),
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (service, label),
        UNIQUE (provider, external_id)
      );
      CREATE TABLE connector_grants (
        bot_slug TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES connector_accounts(account_id) ON DELETE CASCADE,
        access TEXT NOT NULL CHECK (access IN ('read', 'write')),
        granted_at TEXT NOT NULL,
        PRIMARY KEY (bot_slug, account_id)
      );
    `);
  },
};
