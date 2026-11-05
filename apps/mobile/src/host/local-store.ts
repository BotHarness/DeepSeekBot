export type SqlValue = string | number | null | Uint8Array;

export type SqlConnection = {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
};

export type SqlReader = {
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: readonly SqlValue[]): Promise<T | undefined>;
};

export type SqlWriter = SqlReader & {
  run(sql: string, params?: readonly SqlValue[]): Promise<void>;
};

export type LocalStore = SqlReader & {
  readonly version: number;
  write<T>(work: (tx: SqlWriter) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export class LocalStoreError extends Error {
  constructor(
    readonly code: 'local-store/newer-schema' | 'local-store/closed',
    message: string,
  ) {
    super(message);
    this.name = 'LocalStoreError';
  }
}

export const LOCAL_STORE_MIGRATIONS: readonly string[] = [
  `create table channels (
    id text primary key,
    record text not null
  ) without rowid;
  create table messages (
    channel_id text not null,
    id text not null,
    revision integer not null,
    entry text not null,
    purged integer not null default 0,
    primary key (channel_id, id)
  ) without rowid;
  create index messages_by_revision on messages (channel_id, revision);
  create table cursors (
    channel_id text primary key,
    epoch text not null,
    seq integer not null
  ) without rowid;
  create table gaps (
    channel_id text not null,
    from_revision integer not null,
    to_revision integer not null,
    primary key (channel_id, from_revision)
  ) without rowid;`,
];

const reader = (connection: SqlConnection): SqlReader => ({
  all: (sql, params) => connection.all(sql, params),
  async get(sql, params) {
    const rows = await connection.all<never>(sql, params);
    return rows[0];
  },
});

async function schemaVersion(connection: SqlConnection): Promise<number> {
  const rows = await connection.all<{ user_version: number }>('pragma user_version');
  return rows[0]?.user_version ?? 0;
}

export async function openLocalStore(
  connection: SqlConnection,
  migrations: readonly string[] = LOCAL_STORE_MIGRATIONS,
): Promise<LocalStore> {
  const reads = reader(connection);
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();
  const write = <T>(work: (tx: SqlWriter) => Promise<T>): Promise<T> => {
    const next = queue.then(async () => {
      if (closed) throw new LocalStoreError('local-store/closed', 'The local store is closed.');
      await connection.exec('begin immediate');
      try {
        const result = await work({
          ...reads,
          run: (sql, params) => connection.run(sql, params),
        });
        await connection.exec('commit');
        return result;
      } catch (error) {
        await connection.exec('rollback').catch(() => undefined);
        throw error;
      }
    });
    queue = next.catch(() => undefined);
    return next;
  };
  try {
    await connection.exec('pragma journal_mode = wal');
    await connection.exec('pragma synchronous = normal');
    await connection.exec('pragma foreign_keys = on');
    const current = await schemaVersion(connection);
    if (current > migrations.length)
      throw new LocalStoreError(
        'local-store/newer-schema',
        `The local store has schema ${current}, newer than this app's ${migrations.length}.`,
      );
    for (let version = current + 1; version <= migrations.length; version += 1)
      await write(async () => {
        await connection.exec(migrations[version - 1]!);
        await connection.exec(`pragma user_version = ${version}`);
      });
  } catch (error) {
    closed = true;
    await connection.close().catch(() => undefined);
    throw error;
  }
  return {
    ...reads,
    version: migrations.length,
    write,
    async close() {
      if (closed) return;
      await queue;
      closed = true;
      await connection.close();
    },
  };
}

export function localStoreName(hostId: string): string {
  return `deepseekbot-store-${encodeURIComponent(hostId)}.db`;
}
