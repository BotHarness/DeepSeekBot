import type {
  HostSessionListChanges,
  HostSessionListCursor,
  HostSessionRow,
  HostSessionSourceOption,
} from '@botharness/host-protocol/host-sessions';
import type { LocalStore, SqlWriter } from './local-store';

export type StoredSessionList = {
  sessions: HostSessionRow[];
  sources: HostSessionSourceOption[];
  cursor?: HostSessionListCursor;
};

export type SessionListSource = {
  changes(cursor: HostSessionListCursor | undefined): Promise<HostSessionListChanges | undefined>;
  all(): Promise<{ sessions: HostSessionRow[]; sources: HostSessionSourceOption[] }>;
};

export async function readSessionList(store: LocalStore): Promise<StoredSessionList | undefined> {
  const [rows, state] = await Promise.all([
    store.all<{ record: string }>('select record from sessions'),
    store.get<{ epoch: string | null; seq: number | null; sources: string }>(
      'select epoch, seq, sources from session_list_state',
    ),
  ]);
  if (state === undefined) return undefined;
  return {
    sessions: rows.map((row) => JSON.parse(row.record) as HostSessionRow),
    sources: JSON.parse(state.sources) as HostSessionSourceOption[],
    ...(state.epoch === null || state.seq === null
      ? {}
      : { cursor: { epoch: state.epoch, seq: state.seq } }),
  };
}

const upsert = (tx: SqlWriter, row: HostSessionRow) =>
  tx.run(
    'insert into sessions (id, record) values (?, ?) on conflict (id) do update set record = excluded.record',
    [row.sessionId, JSON.stringify(row)],
  );

const saveState = (
  tx: SqlWriter,
  cursor: HostSessionListCursor | undefined,
  sources: readonly HostSessionSourceOption[],
) =>
  tx.run(
    'insert into session_list_state (singleton, epoch, seq, sources) values (1, ?, ?, ?) on conflict (singleton) do update set epoch = excluded.epoch, seq = excluded.seq, sources = excluded.sources',
    [cursor?.epoch ?? null, cursor?.seq ?? null, JSON.stringify(sources)],
  );

export function replaceSessionList(store: LocalStore, list: StoredSessionList): Promise<void> {
  return store.write(async (tx) => {
    await tx.run('delete from sessions');
    for (const row of list.sessions) await upsert(tx, row);
    await saveState(tx, list.cursor, list.sources);
  });
}

export function applySessionListChanges(
  store: LocalStore,
  changes: Exclude<HostSessionListChanges, { reset: true }>,
): Promise<void> {
  return store.write(async (tx) => {
    for (const id of changes.removed) await tx.run('delete from sessions where id = ?', [id]);
    for (const row of changes.sessions) await upsert(tx, row);
    await saveState(tx, changes.cursor, changes.sources);
  });
}

export async function syncSessionList(
  store: LocalStore,
  source: SessionListSource,
): Promise<StoredSessionList> {
  const stored = await readSessionList(store);
  if (stored?.cursor !== undefined) {
    const changes = await source.changes(stored.cursor);
    if (changes !== undefined && changes.reset !== true) {
      await applySessionListChanges(store, changes);
      return (await readSessionList(store)) ?? { sessions: [], sources: [] };
    }
  }
  const start = await source.changes(undefined);
  const full = await source.all();
  const list: StoredSessionList = {
    ...full,
    ...(start === undefined ? {} : { cursor: start.cursor }),
  };
  await replaceSessionList(store, list);
  return list;
}
