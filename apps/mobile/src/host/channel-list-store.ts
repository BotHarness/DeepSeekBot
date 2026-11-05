import type { LocalStore, SqlWriter } from './local-store';
import type { ChannelListItem } from './wire';

export type ChannelListCursor = { epoch: string; seq: number };

export type ChannelListChanges =
  | { reset: true; cursor: ChannelListCursor }
  | { reset?: never; channels: ChannelListItem[]; removed: string[]; cursor: ChannelListCursor };

export type ChannelListSource = {
  channels(): Promise<ChannelListItem[]>;
  cursor(): Promise<ChannelListCursor | undefined>;
  changes(cursor: ChannelListCursor): Promise<ChannelListChanges | undefined>;
};

export type StoredChannelList = {
  channels: ChannelListItem[];
  cursor?: ChannelListCursor;
};

export async function readChannelList(store: LocalStore): Promise<StoredChannelList> {
  const [rows, cursor] = await Promise.all([
    store.all<{ record: string }>('select record from channels'),
    store.get<ChannelListCursor>('select epoch, seq from list_cursor'),
  ]);
  return {
    channels: rows.map((row) => JSON.parse(row.record) as ChannelListItem),
    ...(cursor === undefined ? {} : { cursor: { epoch: cursor.epoch, seq: cursor.seq } }),
  };
}

const upsert = (tx: SqlWriter, channel: ChannelListItem) =>
  tx.run(
    'insert into channels (id, record) values (?, ?) on conflict (id) do update set record = excluded.record',
    [channel.id, JSON.stringify(channel)],
  );

async function removeChannel(tx: SqlWriter, id: string): Promise<void> {
  for (const table of ['messages', 'cursors', 'gaps'])
    await tx.run(`delete from ${table} where channel_id = ?`, [id]);
  await tx.run('delete from channels where id = ?', [id]);
}

async function saveCursor(tx: SqlWriter, cursor: ChannelListCursor | undefined): Promise<void> {
  if (cursor === undefined) {
    await tx.run('delete from list_cursor');
    return;
  }
  await tx.run(
    'insert into list_cursor (singleton, epoch, seq) values (1, ?, ?) on conflict (singleton) do update set epoch = excluded.epoch, seq = excluded.seq',
    [cursor.epoch, cursor.seq],
  );
}

export function replaceChannelList(
  store: LocalStore,
  channels: readonly ChannelListItem[],
  cursor: ChannelListCursor | undefined,
): Promise<void> {
  return store.write(async (tx) => {
    const kept = new Set(channels.map((channel) => channel.id));
    const stored = await tx.all<{ id: string }>('select id from channels');
    for (const { id } of stored) if (!kept.has(id)) await removeChannel(tx, id);
    for (const channel of channels) await upsert(tx, channel);
    await saveCursor(tx, cursor);
  });
}

export function applyChannelListChanges(
  store: LocalStore,
  changes: Exclude<ChannelListChanges, { reset: true }>,
): Promise<void> {
  return store.write(async (tx) => {
    for (const id of changes.removed) await removeChannel(tx, id);
    for (const channel of changes.channels) await upsert(tx, channel);
    await saveCursor(tx, changes.cursor);
  });
}

export async function syncChannelList(
  store: LocalStore,
  source: ChannelListSource,
): Promise<ChannelListItem[]> {
  const stored = await readChannelList(store);
  if (stored.cursor !== undefined) {
    const changes = await source.changes(stored.cursor);
    if (changes !== undefined && changes.reset !== true) {
      await applyChannelListChanges(store, changes);
      return (await readChannelList(store)).channels;
    }
  }
  const cursor = await source.cursor();
  const channels = await source.channels();
  await replaceChannelList(store, channels, cursor);
  return channels;
}
