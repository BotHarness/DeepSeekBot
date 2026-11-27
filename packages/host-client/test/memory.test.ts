import { expect, it, vi } from 'vitest';
import { loadMemorySnapshot } from '../src/memory';

it('preserves Memory observation separately from repair and accepts snapshots from older Hosts', async () => {
  const snapshot = { head: null, files: ['note.md'], provisional: false, standing: [] };
  const read = (value: unknown) =>
    loadMemorySnapshot({ call: vi.fn().mockResolvedValue({ snapshot: value }) }, 'dm-atlas');

  await expect(read(snapshot)).resolves.toEqual(snapshot);
  await expect(read({ ...snapshot, observing: true })).resolves.toEqual({
    ...snapshot,
    observing: true,
  });
  await expect(read({ ...snapshot, provisional: true })).resolves.toEqual({
    ...snapshot,
    provisional: true,
  });
});
