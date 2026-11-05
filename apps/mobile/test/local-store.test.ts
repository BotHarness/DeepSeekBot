import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  LOCAL_STORE_MIGRATIONS,
  LocalStoreError,
  localStoreName,
  openLocalStore,
  type LocalStore,
} from '../src/host/local-store';
import { nodeSqlConnection } from './node-sql-connection';

const opened: LocalStore[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const store of opened.splice(0)) await store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

async function open(path = ':memory:', migrations = LOCAL_STORE_MIGRATIONS) {
  const store = await openLocalStore(nodeSqlConnection(path), migrations);
  opened.push(store);
  return store;
}

function scratchFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-store-'));
  directories.push(directory);
  return join(directory, 'store.db');
}

describe('local store', () => {
  it('creates the schema and records its version', async () => {
    const store = await open();
    expect(store.version).toBe(LOCAL_STORE_MIGRATIONS.length);
    const tables = await store.all<{ name: string }>(
      "select name from sqlite_master where type = 'table' order by name",
    );
    expect(tables.map((table) => table.name)).toEqual([
      'channels',
      'cursors',
      'gaps',
      'list_cursor',
      'messages',
    ]);
    expect(await store.get<{ user_version: number }>('pragma user_version')).toEqual({
      user_version: LOCAL_STORE_MIGRATIONS.length,
    });
  });

  it('opens a file in WAL mode and keeps rows across a reopen', async () => {
    const path = scratchFile();
    const first = await open(path);
    expect(await first.get<{ journal_mode: string }>('pragma journal_mode')).toEqual({
      journal_mode: 'wal',
    });
    await first.write((tx) =>
      tx.run('insert into cursors (channel_id, epoch, seq) values (?, ?, ?)', ['c1', 'e1', 7]),
    );
    await first.close();
    const second = await open(path);
    expect(await second.get('select epoch, seq from cursors where channel_id = ?', ['c1'])).toEqual(
      {
        epoch: 'e1',
        seq: 7,
      },
    );
  });

  it('runs only the migrations a store has not applied yet', async () => {
    const path = scratchFile();
    await (await open(path, LOCAL_STORE_MIGRATIONS)).close();
    const next = [...LOCAL_STORE_MIGRATIONS, 'create table later (id text primary key)'];
    const store = await open(path, next);
    expect(store.version).toBe(next.length);
    expect(await store.get("select name from sqlite_master where name = 'later'")).toEqual({
      name: 'later',
    });
  });

  it('refuses a store written by a newer app', async () => {
    const path = scratchFile();
    await (await open(path, [...LOCAL_STORE_MIGRATIONS, 'select 1'])).close();
    await expect(openLocalStore(nodeSqlConnection(path))).rejects.toMatchObject({
      code: 'local-store/newer-schema',
    });
  });

  it('rolls back a failed migration and leaves the version unchanged', async () => {
    const path = scratchFile();
    await (await open(path)).close();
    await expect(
      openLocalStore(nodeSqlConnection(path), [
        ...LOCAL_STORE_MIGRATIONS,
        'create table half (id text); insert into missing values (1)',
      ]),
    ).rejects.toThrow();
    const store = await open(path);
    expect(await store.get("select name from sqlite_master where name = 'half'")).toBeUndefined();
    expect(await store.get('pragma user_version')).toEqual({
      user_version: LOCAL_STORE_MIGRATIONS.length,
    });
  });

  it('closes the connection when opening or a migration fails', async () => {
    const connection = nodeSqlConnection(scratchFile());
    await expect(
      openLocalStore(connection, [...LOCAL_STORE_MIGRATIONS, 'insert into missing values (1)']),
    ).rejects.toThrow();
    expect(connection.database.isOpen).toBe(false);
    const newer = nodeSqlConnection(scratchFile());
    newer.database.exec('pragma user_version = 99');
    await expect(openLocalStore(newer)).rejects.toBeInstanceOf(LocalStoreError);
    expect(newer.database.isOpen).toBe(false);
  });

  it('reports the original error when the rollback itself fails', async () => {
    const inner = nodeSqlConnection();
    const store = await openLocalStore({
      ...inner,
      async exec(sql) {
        if (sql === 'rollback') {
          await inner.exec(sql);
          throw new Error('rollback failed');
        }
        await inner.exec(sql);
      },
    });
    opened.push(store);
    await expect(store.write(() => Promise.reject(new Error('root cause')))).rejects.toThrow(
      'root cause',
    );
    await store.write((tx) =>
      tx.run('insert into channels (id, record) values (?, ?)', ['c', '{}']),
    );
    expect(await store.all('select id from channels')).toEqual([{ id: 'c' }]);
  });

  it('commits a write as one transaction and rolls the whole write back on failure', async () => {
    const store = await open();
    await expect(
      store.write(async (tx) => {
        await tx.run('insert into cursors (channel_id, epoch, seq) values (?, ?, ?)', [
          'c1',
          'e',
          1,
        ]);
        await tx.run('insert into messages (channel_id, id, revision, entry) values (?, ?, ?, ?)', [
          'c1',
          'm1',
          1,
          '{}',
        ]);
        throw new Error('crash mid-apply');
      }),
    ).rejects.toThrow('crash mid-apply');
    expect(await store.all('select * from cursors')).toEqual([]);
    expect(await store.all('select * from messages')).toEqual([]);
  });

  it('serializes concurrent writes so each sees the previous one', async () => {
    const store = await open();
    await store.write((tx) =>
      tx.run('insert into cursors (channel_id, epoch, seq) values (?, ?, ?)', ['c1', 'e', 0]),
    );
    await Promise.all(
      Array.from({ length: 20 }, () =>
        store.write(async (tx) => {
          const row = await tx.get<{ seq: number }>(
            'select seq from cursors where channel_id = ?',
            ['c1'],
          );
          await Promise.resolve();
          await tx.run('update cursors set seq = ? where channel_id = ?', [row!.seq + 1, 'c1']);
        }),
      ),
    );
    expect(await store.get('select seq from cursors')).toEqual({ seq: 20 });
  });

  it('keeps reads outside a write from seeing its uncommitted rows', async () => {
    const store = await open();
    let fail!: () => void;
    let inserted!: () => void;
    const failed = new Promise<void>((resolve) => (fail = resolve));
    const insert = new Promise<void>((resolve) => (inserted = resolve));
    const writing = store.write(async (tx) => {
      await tx.run('insert into channels (id, record) values (?, ?)', ['c1', '{}']);
      inserted();
      expect(await tx.all('select id from channels')).toEqual([{ id: 'c1' }]);
      await failed;
      throw new Error('abort');
    });
    await insert;
    const reading = store.all('select id from channels');
    fail();
    await expect(writing).rejects.toThrow('abort');
    expect(await reading).toEqual([]);
  });

  it('keeps writing after a failed write and refuses writes once closed', async () => {
    const store = await openLocalStore(nodeSqlConnection());
    await expect(store.write(() => Promise.reject(new Error('no')))).rejects.toThrow('no');
    await store.write((tx) =>
      tx.run('insert into channels (id, record) values (?, ?)', ['c1', '{}']),
    );
    expect(await store.all('select id from channels')).toEqual([{ id: 'c1' }]);
    await store.close();
    await expect(store.write(async () => undefined)).rejects.toBeInstanceOf(LocalStoreError);
  });

  it('names one file per Host without path characters', () => {
    expect(localStoreName('host-1')).toBe('deepseekbot-store-host-1.db');
    expect(localStoreName('a/b c')).toBe('deepseekbot-store-a%2Fb%20c.db');
  });

  it('has FTS5 with the trigram tokenizer for Chinese substrings', () => {
    const { database } = nodeSqlConnection();
    database.exec(
      "create virtual table t using fts5(text, tokenize = 'trigram'); insert into t values ('今天下午三点开会 meeting');",
    );
    expect(database.prepare("select count(*) as n from t where t match '下午三点'").get()).toEqual({
      n: 1,
    });
    database.close();
  });
});
