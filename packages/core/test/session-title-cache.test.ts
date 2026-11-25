import { expect, it, vi } from 'vitest';
import { createSessionTitleCache } from '../src/features/sessions/session-title-cache.js';

const rows = (count: number, updatedAt = 1) =>
  Array.from({ length: count }, (_, index) => ({ sessionId: `s${index}`, updatedAt }));

it('answers within the wait on a Host with hundreds of untitled Sessions and finishes the reads in the background', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = vi.fn(async (ids: readonly string[]) => {
    await gate;
    return new Map(ids.filter((id) => id !== 's1').map((id) => [id, `Title ${id}`]));
  });
  const titles = createSessionTitleCache(read, { waitMs: 20, batch: 100 });

  const started = Date.now();
  expect((await titles(rows(300))).size).toBe(0);
  expect(Date.now() - started).toBeLessThan(1_000);

  release();
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  const second = await titles(rows(300));
  expect(second.size).toBe(299);
  expect(second.get('s0')).toBe('Title s0');
  expect(second.has('s1')).toBe(false);
  expect(read).toHaveBeenCalledTimes(3);
});

it('reads a Session again only after it changes, and keeps its last title meanwhile', async () => {
  let round = 0;
  const read = vi.fn(async (ids: readonly string[]) => {
    round += 1;
    return new Map(ids.map((id) => [id, `${id} v${round}`]));
  });
  const titles = createSessionTitleCache(read, { waitMs: 1_000 });

  expect((await titles(rows(2))).get('s0')).toBe('s0 v1');
  expect((await titles(rows(2))).get('s0')).toBe('s0 v1');
  expect(read).toHaveBeenCalledTimes(1);

  const changed = [
    { sessionId: 's0', updatedAt: 2 },
    { sessionId: 's1', updatedAt: 1 },
  ];
  const after = await titles(changed);
  expect(read).toHaveBeenLastCalledWith(['s0']);
  expect(after.get('s0')).toBe('s0 v2');
  expect(after.get('s1')).toBe('s1 v1');
});

it('retries a failed read on the next list instead of caching the failure', async () => {
  const read = vi
    .fn<(ids: readonly string[]) => Promise<ReadonlyMap<string, string>>>()
    .mockRejectedValueOnce(new Error('DSH busy'))
    .mockResolvedValue(new Map([['s0', 'Recovered']]));
  const titles = createSessionTitleCache(read, { waitMs: 1_000 });

  expect((await titles(rows(1))).size).toBe(0);
  expect((await titles(rows(1))).get('s0')).toBe('Recovered');
  expect(read).toHaveBeenCalledTimes(2);
});
