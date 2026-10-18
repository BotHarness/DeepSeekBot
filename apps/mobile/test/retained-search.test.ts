import { expect, it, vi } from 'vitest';
import {
  createRetainedSearch,
  computerCacheKey,
  type SearchSource,
  type RetainedConversation,
} from '../src/host/retained-search';

const a: SearchSource = { hostId: 'a', deviceId: 'phone-a', name: 'Studio' };
const b: SearchSource = { hostId: 'b', deviceId: 'phone-b', name: 'Laptop' };
const record = (text: string): RetainedConversation => ({
  target: { kind: 'channel', id: 'same-channel', name: 'Project' },
  hasOlder: true,
  entries: [
    {
      channelId: 'same-channel',
      revision: 1,
      message: {
        id: 'same-message',
        body: text,
        at: '2026-10-19T00:00:00Z',
        author: { kind: 'human' },
      },
    },
  ],
});
function fixture() {
  let sources = [a, b];
  const disk = new Map([
    [computerCacheKey(a), [record('needle A')]],
    [computerCacheKey(b), [record('needle B')]],
  ]);
  const list = vi.fn(async (source: SearchSource) => disk.get(computerCacheKey(source)) ?? []);
  const search = createRetainedSearch({
    sources: () => sources,
    list,
    read: async (source) => disk.get(computerCacheKey(source))?.[0],
  });
  return {
    search,
    disk,
    list,
    sources: (next: SearchSource[]) => {
      sources = next;
      return search.refresh();
    },
  };
}
it('searches only paired identities and inherited scope despite duplicate channel/message IDs', async () => {
  const f = fixture();
  f.search.enter(JSON.stringify(['computer', 'a']));
  await f.search.query('needle');
  expect(f.list.mock.calls.map(([source]) => source.hostId)).toEqual(['a']);
  expect(f.search.getSnapshot().messages.map((h) => h.message?.body)).toEqual(['needle A']);
  f.search.enter('all');
  await f.search.query('needle');
  const hits = f.search.getSnapshot().messages;
  expect(new Set(hits.map((h) => h.key)).size).toBe(2);
  expect(await f.search.resolve(hits[0]!)).toBe('available');
  await f.sources([{ ...a, deviceId: 'replacement' }, b]);
  expect(f.search.getSnapshot().messages.map((h) => h.message?.body)).toEqual(['needle B']);
  expect(await f.search.resolve(hits[0]!)).toBe('detached');
});
it('groups conversation names and messages, preserves return context, resets new entry', async () => {
  const { search } = fixture();
  await search.query('project');
  expect(search.getSnapshot().conversations).toHaveLength(2);
  expect(search.getSnapshot().messages).toHaveLength(0);
  search.scroll(270);
  await search.resolve(search.getSnapshot().conversations[0]!);
  expect(search.getSnapshot()).toMatchObject({ query: 'project', scope: 'all', scroll: 270 });
  search.enter(JSON.stringify(['computer', 'b']));
  expect(search.getSnapshot()).toMatchObject({
    query: '',
    scroll: 0,
    conversations: [],
    messages: [],
  });
});
it('drops late reads after unpair/refusal and distinguishes eviction from lost identity', async () => {
  const f = fixture();
  await f.search.query('needle');
  const hit = f.search.getSnapshot().messages[0]!;
  f.disk.delete(computerCacheKey(a));
  expect(await f.search.resolve(hit)).toBe('missing');
  let finish!: (value: RetainedConversation[]) => void;
  f.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.search.query('late');
  await f.sources([]);
  finish([record('late secret')]);
  await pending;
  expect(f.search.getSnapshot().messages).toEqual([]);
  expect(await f.search.resolve(hit)).toBe('detached');
});
it('does not search Cloud namespaces and reports cache read failures separately from empty matches', async () => {
  const f = fixture();
  f.search.enter(JSON.stringify(['cloud', 'account', 'org']));
  await f.search.query('needle');
  expect(f.list).not.toHaveBeenCalled();
  f.search.enter('all');
  f.list.mockRejectedValueOnce(new Error('unreadable'));
  await f.search.query('needle');
  expect(f.search.getSnapshot().unavailable).toEqual(['Studio']);
  expect(f.search.getSnapshot().messages).toHaveLength(1);
});

it('retains the visible result window on refresh and avoids inactive cache scans', async () => {
  const f = fixture();
  await f.search.query('needle');
  f.search.scroll(180);
  const previous = f.search.getSnapshot().messages;
  let release!: (value: RetainedConversation[]) => void;
  f.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = f.search.refresh();
  expect(f.search.getSnapshot().messages).toEqual(previous);
  expect(f.search.getSnapshot().scroll).toBe(180);
  release([record('needle A')]);
  await pending;
  f.search.setActive(false);
  f.list.mockClear();
  await f.search.refresh();
  expect(f.list).not.toHaveBeenCalled();
  await f.sources([b]);
  expect(f.search.getSnapshot().messages.map((hit) => hit.source.hostId)).toEqual(['b']);
  f.search.setActive(true);
  await vi.waitFor(() => expect(f.list).toHaveBeenCalledOnce());
});

it('keeps only authorized previous results after a same-query refresh fails', async () => {
  const f = fixture();
  await f.search.query('needle');
  f.list.mockRejectedValueOnce(new Error('temporarily unreadable'));
  f.disk.set(computerCacheKey(b), [record('needle B updated')]);
  await f.search.refresh();
  expect(f.search.getSnapshot().messages.map((hit) => hit.message?.body)).toEqual([
    'needle A',
    'needle B updated',
  ]);
  expect(f.search.getSnapshot().unavailable).toEqual(['Studio']);
  await f.sources([b]);
  expect(f.search.getSnapshot().messages.map((hit) => hit.source.hostId)).toEqual(['b']);
  f.list.mockRejectedValueOnce(new Error('temporarily unreadable'));
  await f.search.query('different');
  expect(f.search.getSnapshot().messages).toEqual([]);
});
