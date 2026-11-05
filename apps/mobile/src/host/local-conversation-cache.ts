import type { JournalEntry } from './wire';
import type {
  CachedChanges,
  CachedConversation,
  ChangeCursor,
  ConversationCache,
} from './conversation';
import type { LocalStore, SqlWriter } from './local-store';

const TAIL = 50;

export interface LegacyConversationCache {
  read(key: string): Promise<CachedConversation | undefined>;
  remove(key: string): void;
}

export function conversationHost(key: string): string | undefined {
  try {
    const parts: unknown = JSON.parse(key);
    return Array.isArray(parts) && parts[0] === 'computer' && typeof parts[1] === 'string'
      ? parts[1]
      : undefined;
  } catch {
    return undefined;
  }
}

const upsert = (tx: SqlWriter, entry: JournalEntry) =>
  tx.run(
    `insert into messages (channel_id, id, revision, entry, purged) values (?, ?, ?, ?, ?)
       on conflict (channel_id, id) do update
       set revision = excluded.revision, entry = excluded.entry, purged = excluded.purged`,
    [
      entry.channelId,
      entry.message.id,
      entry.revision,
      JSON.stringify(entry),
      entry.message.contentPurge === undefined ? 0 : 1,
    ],
  );

const saveCursor = (tx: SqlWriter, channelId: string, cursor: ChangeCursor) =>
  tx.run(
    `insert into cursors (channel_id, epoch, seq) values (?, ?, ?)
       on conflict (channel_id) do update set epoch = excluded.epoch, seq = excluded.seq`,
    [channelId, cursor.epoch, cursor.seq],
  );

async function store(tx: SqlWriter, key: string, value: CachedConversation): Promise<void> {
  const channelId = value.entries[0]?.channelId;
  if (channelId === undefined) return;
  const previous = await tx.get<{ epoch: string }>(
    'select epoch from cursors where channel_id = ?',
    [channelId],
  );
  if (
    value.changes !== undefined &&
    previous !== undefined &&
    previous.epoch !== value.changes.epoch
  )
    await tx.run('delete from messages where channel_id = ?', [channelId]);
  await tx.run(
    `insert into conversation_keys (key, channel_id) values (?, ?)
       on conflict (key) do update set channel_id = excluded.channel_id`,
    [key, channelId],
  );
  const revisions = value.entries.map((entry) => entry.revision);
  await tx.run(
    `delete from messages where channel_id = ? and revision between ? and ?
       and id not in (select value from json_each(?))`,
    [
      channelId,
      Math.min(...revisions),
      Math.max(...revisions),
      JSON.stringify(value.entries.map((entry) => entry.message.id)),
    ],
  );
  for (const entry of value.entries) if (entry.channelId === channelId) await upsert(tx, entry);
  if (value.changes === undefined)
    await tx.run('delete from cursors where channel_id = ?', [channelId]);
  else await saveCursor(tx, channelId, value.changes);
}

export function createLocalConversationCache(options: {
  store(hostId: string): Promise<LocalStore>;
  legacy?: LegacyConversationCache;
  warn?(error: unknown): void;
}): ConversationCache & { flush(): Promise<void> } {
  let pending: Promise<unknown> = Promise.resolve();
  const later = (task: () => Promise<unknown>): void => {
    pending = pending.then(task).catch((error: unknown) => options.warn?.(error));
  };
  const withStore = (key: string) => {
    const hostId = conversationHost(key);
    return hostId === undefined ? undefined : options.store(hostId);
  };
  return {
    async read(key) {
      const opening = withStore(key);
      if (opening === undefined) return options.legacy?.read(key);
      await pending;
      const db = await opening.catch((error: unknown) => {
        options.warn?.(error);
        return undefined;
      });
      if (db === undefined) return options.legacy?.read(key);
      const mapped = await db.get<{ channel_id: string }>(
        'select channel_id from conversation_keys where key = ?',
        [key],
      );
      if (mapped === undefined) {
        const old = await options.legacy?.read(key);
        if (old === undefined) return undefined;
        await db.write((tx) => store(tx, key, old));
        options.legacy?.remove(key);
        return old;
      }
      const rows = await db.all<{ entry: string; revision: number }>(
        `select entry, revision from messages where channel_id = ?
           order by revision desc limit ?`,
        [mapped.channel_id, TAIL],
      );
      if (rows.length === 0) return undefined;
      const cursor = await db.get<{ epoch: string; seq: number }>(
        'select epoch, seq from cursors where channel_id = ?',
        [mapped.channel_id],
      );
      return {
        entries: rows.reverse().map((row) => JSON.parse(row.entry) as JournalEntry),
        hasOlder: rows.length === TAIL || rows[0]!.revision > 1,
        ...(cursor === undefined ? {} : { changes: { epoch: cursor.epoch, seq: cursor.seq } }),
      };
    },
    write(key, value) {
      const opening = withStore(key);
      if (opening === undefined) return;
      later(async () => (await opening).write((tx) => store(tx, key, value)));
    },
    applyChanges(key, channelId, changes: CachedChanges) {
      const opening = withStore(key);
      if (opening === undefined) return;
      later(async () =>
        (await opening).write(async (tx) => {
          for (const entry of changes.upserts)
            await tx.run(
              'update messages set revision = ?, entry = ?, purged = ? where channel_id = ? and id = ?',
              [
                entry.revision,
                JSON.stringify(entry),
                entry.message.contentPurge === undefined ? 0 : 1,
                channelId,
                entry.message.id,
              ],
            );
          for (const id of changes.tombstones) await tx.run(REDACT, [channelId, id]);
          for (const id of changes.removed)
            await tx.run('delete from messages where channel_id = ? and id = ?', [channelId, id]);
          await saveCursor(tx, channelId, changes.cursor);
        }),
      );
    },
    flush: async () => {
      await pending;
    },
  };
}

const REDACT = `update messages set purged = 1, entry = json_set(
  json_remove(entry, '$.message.attachments', '$.message.bridgeMedia'),
  '$.message.body', '', '$.message.contentPurge', json('{"actor":"local-human"}'))
  where channel_id = ? and id = ?`;

export function redactLocalConversations(
  db: LocalStore,
  placements: readonly { channelId: string; messageId: string }[],
): Promise<void> {
  return db.write(async (tx) => {
    for (const placement of placements)
      await tx.run(REDACT, [placement.channelId, placement.messageId]);
  });
}

export function pruneLocalConversations(
  db: LocalStore,
  stale: (key: string) => boolean,
): Promise<void> {
  return db.write(async (tx) => {
    const keys = await tx.all<{ key: string; channel_id: string }>(
      'select key, channel_id from conversation_keys',
    );
    for (const row of keys) {
      let part: unknown;
      try {
        part = (JSON.parse(row.key) as unknown[])[2];
      } catch {
        continue;
      }
      if (typeof part !== 'string' || !stale(part)) continue;
      await tx.run('delete from messages where channel_id = ?', [row.channel_id]);
      await tx.run('delete from cursors where channel_id = ?', [row.channel_id]);
      await tx.run('delete from gaps where channel_id = ?', [row.channel_id]);
      await tx.run('delete from conversation_keys where key = ?', [row.key]);
    }
  });
}
