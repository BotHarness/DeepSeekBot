import type { SchemaMigration } from '../schema.js';

export const SECRET_MCP_SERVER_MIGRATION: SchemaMigration = {
  id: 'secret-mcp-server',
  module: 'secret-mcp',
  description: 'Remember Human-approved secret MCP servers per PersonaBot (ADR-0196)',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_secret_mcp_servers (
        bot_slug TEXT NOT NULL,
        server_name TEXT NOT NULL,
        account TEXT NOT NULL,
        program TEXT NOT NULL,
        args TEXT NOT NULL,
        env TEXT NOT NULL,
        reference_set TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        PRIMARY KEY (bot_slug, server_name)
      );
    `);
  },
};

export const SECRET_MCP_ENABLEMENT_MIGRATION: SchemaMigration = {
  id: 'secret-mcp-enablement',
  module: 'secret-mcp',
  description: 'Record which PersonaBots enabled a remembered secret MCP server (ADR-0198)',
  migrate(database) {
    database.exec(`
      CREATE TABLE bot_secret_mcp_enabled (
        bot_slug TEXT NOT NULL,
        owner_slug TEXT NOT NULL,
        server_name TEXT NOT NULL,
        enabled_at TEXT NOT NULL,
        PRIMARY KEY (bot_slug, owner_slug, server_name)
      );
    `);
  },
};
