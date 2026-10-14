import type { OperationalDatabaseModulePort } from '../database/owner.js';

export interface SecretMcpRecord {
  botSlug: string;
  serverName: string;
  account: string;
  program: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
  references: string[];
  approvedAt: string;
}

interface Row {
  bot_slug: string;
  server_name: string;
  account: string;
  program: string;
  args: string;
  env: string;
  reference_set: string;
  approved_at: string;
}

export interface SecretMcpStore {
  list(botSlug: string): SecretMcpRecord[];
  listAll(): SecretMcpRecord[];
  put(record: Omit<SecretMcpRecord, 'approvedAt'>): SecretMcpRecord;
  remove(botSlug: string, serverName: string): boolean;
  eraseBot(botSlug: string): void;
  enabled(botSlug: string): SecretMcpRecord[];
  isEnabled(botSlug: string, record: Pick<SecretMcpRecord, 'botSlug' | 'serverName'>): boolean;
  setEnabled(botSlug: string, ownerSlug: string, serverName: string, enabled: boolean): void;
}

function record(row: Row): SecretMcpRecord {
  return {
    botSlug: row.bot_slug,
    serverName: row.server_name,
    account: row.account,
    program: row.program,
    args: JSON.parse(row.args) as string[],
    env: JSON.parse(row.env) as Array<{ name: string; value: string }>,
    references: JSON.parse(row.reference_set) as string[],
    approvedAt: row.approved_at,
  };
}

export function createSecretMcpStore(database: OperationalDatabaseModulePort): SecretMcpStore {
  return {
    list(botSlug) {
      return (
        database.read((connection) =>
          connection
            .prepare('SELECT * FROM bot_secret_mcp_servers WHERE bot_slug = ? ORDER BY server_name')
            .all(botSlug),
        ) as unknown as Row[]
      ).map(record);
    },
    listAll() {
      return (
        database.read((connection) =>
          connection
            .prepare('SELECT * FROM bot_secret_mcp_servers ORDER BY approved_at, server_name')
            .all(),
        ) as unknown as Row[]
      ).map(record);
    },
    put(input) {
      const approvedAt = new Date().toISOString();
      database.transaction(
        (connection) =>
          connection
            .prepare(
              `INSERT INTO bot_secret_mcp_servers
               (bot_slug, server_name, account, program, args, env, reference_set, approved_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (bot_slug, server_name) DO UPDATE SET account = excluded.account,
                 program = excluded.program, args = excluded.args, env = excluded.env,
                 reference_set = excluded.reference_set, approved_at = excluded.approved_at`,
            )
            .run(
              input.botSlug,
              input.serverName,
              input.account,
              input.program,
              JSON.stringify(input.args),
              JSON.stringify(input.env),
              JSON.stringify(input.references),
              approvedAt,
            ),
        ['secret-mcp'],
      );
      return { ...input, approvedAt };
    },
    remove(botSlug, serverName) {
      return database.transaction(
        (connection) => {
          connection
            .prepare('DELETE FROM bot_secret_mcp_enabled WHERE owner_slug = ? AND server_name = ?')
            .run(botSlug, serverName);
          return (
            Number(
              connection
                .prepare(
                  'DELETE FROM bot_secret_mcp_servers WHERE bot_slug = ? AND server_name = ?',
                )
                .run(botSlug, serverName).changes,
            ) > 0
          );
        },
        ['secret-mcp'],
      );
    },
    eraseBot(botSlug) {
      database.transaction(
        (connection) => {
          connection
            .prepare('DELETE FROM bot_secret_mcp_enabled WHERE bot_slug = ? OR owner_slug = ?')
            .run(botSlug, botSlug);
          connection.prepare('DELETE FROM bot_secret_mcp_servers WHERE bot_slug = ?').run(botSlug);
        },
        ['secret-mcp'],
      );
    },
    enabled(botSlug) {
      return (
        database.read((connection) =>
          connection
            .prepare(
              `SELECT servers.* FROM bot_secret_mcp_servers AS servers
               WHERE servers.bot_slug = ?
                  OR EXISTS (
                    SELECT 1 FROM bot_secret_mcp_enabled AS enabled
                    WHERE enabled.bot_slug = ? AND enabled.owner_slug = servers.bot_slug
                      AND enabled.server_name = servers.server_name
                  )
               ORDER BY CASE WHEN servers.bot_slug = ? THEN 0 ELSE 1 END, servers.approved_at`,
            )
            .all(botSlug, botSlug, botSlug),
        ) as unknown as Row[]
      ).map(record);
    },
    isEnabled(botSlug, target) {
      if (target.botSlug === botSlug) return true;
      return (
        database.read((connection) =>
          connection
            .prepare(
              'SELECT 1 FROM bot_secret_mcp_enabled WHERE bot_slug = ? AND owner_slug = ? AND server_name = ?',
            )
            .get(botSlug, target.botSlug, target.serverName),
        ) !== undefined
      );
    },
    setEnabled(botSlug, ownerSlug, serverName, enabled) {
      database.transaction(
        (connection) => {
          if (enabled)
            connection
              .prepare(
                `INSERT INTO bot_secret_mcp_enabled (bot_slug, owner_slug, server_name, enabled_at)
                 VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
              )
              .run(botSlug, ownerSlug, serverName, new Date().toISOString());
          else
            connection
              .prepare(
                'DELETE FROM bot_secret_mcp_enabled WHERE bot_slug = ? AND owner_slug = ? AND server_name = ?',
              )
              .run(botSlug, ownerSlug, serverName);
        },
        ['secret-mcp'],
      );
    },
  };
}
