import { expect, it, vi } from 'vitest';
import { MethodRefused } from '../src/client-errors';
import { readHostSessionList } from '../src/host-sessions';

const page = { queryVersion: 1, sources: [], sessions: [], nextCursor: 'next' };
const options = { search: '', sort: 'last-human-turn', source: 'all' } as const;

it('asks for one page and returns the cursor for the next one', async () => {
  const call = vi.fn(async () => page);
  const result = await readHostSessionList({ call }, { ...options, limit: 50, cursor: 'c1' });
  expect(call).toHaveBeenCalledWith('sessionList', {
    ...options,
    limit: 50,
    cursor: 'c1',
    queryVersion: 1,
  });
  expect(result.nextCursor).toBe('next');
});

it('reads the whole list from an older Host that refuses paging arguments', async () => {
  const call = vi
    .fn()
    .mockRejectedValueOnce(new MethodRefused('gateway/arguments-invalid', 'unexpected "limit"'))
    .mockResolvedValueOnce({ queryVersion: 1, sources: [], sessions: [] });
  const result = await readHostSessionList({ call }, { ...options, limit: 50 });
  expect(call).toHaveBeenLastCalledWith('sessionList', { ...options, queryVersion: 1 });
  expect(result.nextCursor).toBeUndefined();

  const other = vi.fn().mockRejectedValue(new MethodRefused('permission-required', 'no'));
  await expect(readHostSessionList({ call: other }, { ...options, limit: 50 })).rejects.toThrow();
  expect(other).toHaveBeenCalledTimes(1);
});
