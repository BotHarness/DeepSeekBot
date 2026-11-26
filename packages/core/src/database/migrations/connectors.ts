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

export const CONNECTOR_REMOTE_MCP_MIGRATION: SchemaMigration = {
  id: 'connector-remote-mcp',
  module: 'connectors',
  description: 'Remote MCP servers signed in with OAuth as Connector Accounts (#5333)',
  rebuildsReferencedTables: true,
  migrate(database) {
    database.exec(`
      CREATE TABLE connector_accounts_next (
        account_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK (provider IN ('composio', 'mcp')),
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
      INSERT INTO connector_accounts_next SELECT * FROM connector_accounts;
      DROP TABLE connector_accounts;
      ALTER TABLE connector_accounts_next RENAME TO connector_accounts;
      CREATE TABLE connector_mcp_servers (
        service TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        icon TEXT,
        created_at TEXT NOT NULL
      );
    `);
  },
};
