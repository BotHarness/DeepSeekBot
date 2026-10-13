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
  put(record: Omit<SecretMcpRecord, 'approvedAt'>): SecretMcpRecord;
  remove(botSlug: string, serverName: string): boolean;
  eraseBot(botSlug: string): void;
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
        (connection) =>
          Number(
            connection
              .prepare('DELETE FROM bot_secret_mcp_servers WHERE bot_slug = ? AND server_name = ?')
              .run(botSlug, serverName).changes,
          ) > 0,
        ['secret-mcp'],
      );
    },
    eraseBot(botSlug) {
      database.transaction(
        (connection) =>
          connection.prepare('DELETE FROM bot_secret_mcp_servers WHERE bot_slug = ?').run(botSlug),
        ['secret-mcp'],
      );
    },
  };
}
