import { afterEach, describe, expect, it } from 'vitest';

import {
  readChannelList,
  syncChannelList,
  type ChannelListChanges,
  type ChannelListCursor,
  type ChannelListSource,
} from '../src/host/channel-list-store';
import { openLocalStore, type LocalStore } from '../src/host/local-store';
import type { ChannelListItem } from '../src/host/wire';
import { nodeSqlConnection } from './node-sql-connection';

const opened: LocalStore[] = [];

afterEach(async () => {
  for (const store of opened.splice(0)) await store.close();
});

async function store() {
  const local = await openLocalStore(nodeSqlConnection());
  opened.push(local);
  return local;
}

const channel = (id: string, name = id): ChannelListItem => ({
  id,
  type: 'group',
  name,
  members: [],
});

function host(list: ChannelListItem[], cursor: ChannelListCursor | undefined) {
  const calls: string[] = [];
  let changes: ChannelListChanges | undefined;
  const source: ChannelListSource = {
    async channels() {
      calls.push('channels');
      return list;
    },
    async cursor() {
      calls.push('cursor');
      return cursor;
    },
    async changes(from) {
      calls.push(`changes ${from.epoch}:${from.seq}`);
      return changes;
    },
  };
  return {
    source,
    calls,
    answer(next: ChannelListChanges | undefined) {
      changes = next;
    },
  };
}

const names = (channels: readonly ChannelListItem[]) =>
  channels.map((item) => `${item.id}=${item.name}`).sort();

describe('channel list in the local store', () => {
  it('downloads the full list once, then asks only for changes since the stored cursor', async () => {
    const local = await store();
    const remote = host([channel('a'), channel('b')], { epoch: 'e', seq: 4 });
    expect(names(await syncChannelList(local, remote.source))).toEqual(['a=a', 'b=b']);
    expect(remote.calls).toEqual(['cursor', 'channels']);
    remote.calls.length = 0;
    remote.answer({ channels: [], removed: [], cursor: { epoch: 'e', seq: 4 } });
    expect(names(await syncChannelList(local, remote.source))).toEqual(['a=a', 'b=b']);
    expect(remote.calls).toEqual(['changes e:4']);
  });

  it('applies renamed, new and removed channels and drops the rows of a removed one', async () => {
    const local = await store();
    const remote = host([channel('a'), channel('b')], { epoch: 'e', seq: 4 });
    await syncChannelList(local, remote.source);
    await local.write((tx) =>
      tx.run('insert into messages (channel_id, id, revision, entry) values (?, ?, ?, ?)', [
        'b',
        'm1',
        1,
        '{}',
      ]),
    );
    remote.answer({
      channels: [channel('a', 'Renamed'), channel('c')],
      removed: ['b'],
      cursor: { epoch: 'e', seq: 9 },
    });
    expect(names(await syncChannelList(local, remote.source))).toEqual(['a=Renamed', 'c=c']);
    expect(await local.all('select id from messages')).toEqual([]);
    expect((await readChannelList(local)).cursor).toEqual({ epoch: 'e', seq: 9 });
  });

  it('refetches the full list on a reset or when the Host has no change method', async () => {
    const local = await store();
    const remote = host([channel('a')], { epoch: 'e', seq: 4 });
    await syncChannelList(local, remote.source);
    remote.calls.length = 0;
    remote.answer({ reset: true, cursor: { epoch: 'f', seq: 1 } });
    await syncChannelList(local, remote.source);
    expect(remote.calls).toEqual(['changes e:4', 'cursor', 'channels']);
    const old = host([channel('z')], undefined);
    expect(names(await syncChannelList(local, old.source))).toEqual(['z=z']);
    expect(old.calls).toEqual(['changes e:4', 'cursor', 'channels']);
    expect(await readChannelList(local)).toEqual({ channels: [channel('z')] });
    old.calls.length = 0;
    await syncChannelList(local, old.source);
    expect(old.calls).toEqual(['cursor', 'channels']);
  });
});
