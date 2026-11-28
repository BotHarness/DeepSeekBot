import { randomUUID } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type ConnectorAccess = 'read' | 'write';
export type ConnectorAccountStatus = 'pending' | 'active' | 'expired' | 'failed';
export type ConnectorProvider = 'composio' | 'mcp' | 'google';
export const CONNECTOR_ACCOUNT_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} ._@+-]{0,63}$/u;

export interface ConnectorMcpServerRecord {
  service: string;
  name: string;
  url: string;
  icon?: string;
  createdAt: string;
}

interface McpServerRow {
  service: string;
  name: string;
  url: string;
  icon: string | null;
  created_at: string;
}

export interface ConnectorAccountRecord {
  accountId: string;
  provider: ConnectorProvider;
  service: string;
  label: string;
  identity?: string;
  holderSlug?: string;
  externalId: string;
  status: ConnectorAccountStatus;
  access?: ConnectorAccess;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorGrantRecord {
  botSlug: string;
  accountId: string;
  access: ConnectorAccess;
  grantedAt: string;
}

interface AccountRow {
  account_id: string;
  provider: ConnectorProvider;
  service: string;
  label: string;
  identity: string | null;
  holder_slug: string | null;
  external_id: string;
  status: ConnectorAccountStatus;
  access: ConnectorAccess | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface GrantRow {
  bot_slug: string;
  account_id: string;
  access: ConnectorAccess;
  granted_at: string;
}

export interface ConnectorStore {
  accounts(): ConnectorAccountRecord[];
  account(accountId: string): ConnectorAccountRecord | undefined;
  createAccount(input: {
    provider?: ConnectorProvider;
    service: string;
    label: string;
    holderSlug?: string;
    externalId: string;
    access?: ConnectorAccess;
  }): ConnectorAccountRecord;
  updateAccount(
    accountId: string,
    change: {
      status: ConnectorAccountStatus;
      identity?: string | null;
      externalId?: string;
      access?: ConnectorAccess;
    },
  ): ConnectorAccountRecord | undefined;
  removeAccount(accountId: string): boolean;
  grants(botSlug?: string): ConnectorGrantRecord[];
  setGrant(botSlug: string, accountId: string, access: ConnectorAccess | undefined): boolean;
  eraseBot(botSlug: string): string[];
  mcpServers(): ConnectorMcpServerRecord[];
  mcpServer(service: string): ConnectorMcpServerRecord | undefined;
  saveMcpServer(input: {
    service: string;
    name: string;
    url: string;
    icon?: string;
  }): ConnectorMcpServerRecord;
  removeMcpServer(service: string): boolean;
}

function mcpServer(row: McpServerRow): ConnectorMcpServerRecord {
  return {
    service: row.service,
    name: row.name,
    url: row.url,
    ...(row.icon === null ? {} : { icon: row.icon }),
    createdAt: row.created_at,
  };
}

function account(row: AccountRow): ConnectorAccountRecord {
  return {
    accountId: row.account_id,
    provider: row.provider,
    service: row.service,
    label: row.label,
    ...(row.identity === null ? {} : { identity: row.identity }),
    ...(row.holder_slug === null ? {} : { holderSlug: row.holder_slug }),
    externalId: row.external_id,
    status: row.status,
    ...(row.access === null || row.access === undefined ? {} : { access: row.access }),
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function grant(row: GrantRow): ConnectorGrantRecord {
  return {
    botSlug: row.bot_slug,
    accountId: row.account_id,
    access: row.access,
    grantedAt: row.granted_at,
  };
}

const MODULE = ['connectors'];

export function createConnectorStore(database: OperationalDatabaseModulePort): ConnectorStore {
  const read = (accountId: string) =>
    database.read(
      (connection) =>
        connection
          .prepare('SELECT * FROM connector_accounts WHERE account_id = ?')
          .get(accountId) as unknown as AccountRow | undefined,
    );
  return {
    accounts() {
      return (
        database.read((connection) =>
          connection.prepare('SELECT * FROM connector_accounts ORDER BY service, label').all(),
        ) as unknown as AccountRow[]
      ).map(account);
    },
    account(accountId) {
      const row = read(accountId);
      return row === undefined ? undefined : account(row);
    },
    createAccount(input) {
      const now = new Date().toISOString();
      const accountId = randomUUID();
      database.transaction(
        (connection) =>
          connection
            .prepare(
              `INSERT INTO connector_accounts
               (account_id, provider, service, label, identity, holder_slug, external_id, status,
                access, revision, created_at, updated_at)
               VALUES (?, ?, ?, ?, NULL, ?, ?, 'pending', ?, 1, ?, ?)`,
            )
            .run(
              accountId,
              input.provider ?? 'composio',
              input.service,
              input.label,
              input.holderSlug ?? null,
              input.externalId,
              input.access ?? null,
              now,
              now,
            ),
        MODULE,
      );
      return account(read(accountId)!);
    },
    updateAccount(accountId, change) {
      const current = read(accountId);
      if (current === undefined) return undefined;
      const identity = change.identity === null ? null : (change.identity ?? current.identity);
      const externalId = change.externalId ?? current.external_id;
      const access = change.access ?? current.access;
      if (
        current.status === change.status &&
        current.identity === identity &&
        current.external_id === externalId &&
        current.access === access
      )
        return account(current);
      database.transaction(
        (connection) =>
          connection
            .prepare(
              `UPDATE connector_accounts SET status = ?, identity = ?, external_id = ?, access = ?,
               revision = revision + 1, updated_at = ? WHERE account_id = ?`,
            )
            .run(change.status, identity, externalId, access, new Date().toISOString(), accountId),
        MODULE,
      );
      return account(read(accountId)!);
    },
    removeAccount(accountId) {
      return database.transaction((connection) => {
        connection.prepare('DELETE FROM connector_grants WHERE account_id = ?').run(accountId);
        return (
          Number(
            connection.prepare('DELETE FROM connector_accounts WHERE account_id = ?').run(accountId)
              .changes,
          ) > 0
        );
      }, MODULE);
    },
    grants(botSlug) {
      return (
        database.read((connection) =>
          botSlug === undefined
            ? connection
                .prepare('SELECT * FROM connector_grants ORDER BY bot_slug, account_id')
                .all()
            : connection
                .prepare('SELECT * FROM connector_grants WHERE bot_slug = ? ORDER BY account_id')
                .all(botSlug),
        ) as unknown as GrantRow[]
      ).map(grant);
    },
    setGrant(botSlug, accountId, access) {
      return database.transaction((connection) => {
        if (access === undefined)
          return (
            Number(
              connection
                .prepare('DELETE FROM connector_grants WHERE bot_slug = ? AND account_id = ?')
                .run(botSlug, accountId).changes,
            ) > 0
          );
        if (
          connection
            .prepare('SELECT 1 FROM connector_accounts WHERE account_id = ?')
            .get(accountId) === undefined
        )
          return false;
        connection
          .prepare(
            `INSERT INTO connector_grants (bot_slug, account_id, access, granted_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT (bot_slug, account_id) DO UPDATE SET access = excluded.access`,
          )
          .run(botSlug, accountId, access, new Date().toISOString());
        return true;
      }, MODULE);
    },
    eraseBot(botSlug) {
      return database.transaction((connection) => {
        const held = (
          connection
            .prepare('SELECT account_id FROM connector_accounts WHERE holder_slug = ?')
            .all(botSlug) as unknown as Array<{ account_id: string }>
        ).map((row) => row.account_id);
        connection.prepare('DELETE FROM connector_grants WHERE bot_slug = ?').run(botSlug);
        for (const accountId of held) {
          connection.prepare('DELETE FROM connector_grants WHERE account_id = ?').run(accountId);
          connection.prepare('DELETE FROM connector_accounts WHERE account_id = ?').run(accountId);
        }
        return held;
      }, MODULE);
    },
    mcpServers() {
      return (
        database.read((connection) =>
          connection.prepare('SELECT * FROM connector_mcp_servers ORDER BY name').all(),
        ) as unknown as McpServerRow[]
      ).map(mcpServer);
    },
    mcpServer(service) {
      const row = database.read(
        (connection) =>
          connection
            .prepare('SELECT * FROM connector_mcp_servers WHERE service = ?')
            .get(service) as unknown as McpServerRow | undefined,
      );
      return row === undefined ? undefined : mcpServer(row);
    },
    saveMcpServer(input) {
      database.transaction(
        (connection) =>
          connection
            .prepare(
              `INSERT INTO connector_mcp_servers (service, name, url, icon, created_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (service) DO UPDATE SET name = excluded.name, icon = excluded.icon`,
            )
            .run(
              input.service,
              input.name,
              input.url,
              input.icon ?? null,
              new Date().toISOString(),
            ),
        MODULE,
      );
      return this.mcpServer(input.service)!;
    },
    removeMcpServer(service) {
      return database.transaction(
        (connection) =>
          Number(
            connection.prepare('DELETE FROM connector_mcp_servers WHERE service = ?').run(service)
              .changes,
          ) > 0,
        MODULE,
      );
    },
  };
}
