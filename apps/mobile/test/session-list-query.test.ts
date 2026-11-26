import type { HostClient } from '@botharness/host-client/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  SESSION_PAGE_SIZE,
  nextSessionCursors,
  readSessionListPage,
  sessionListKey,
  sessionListRows,
  sessionQueries,
  watchSessionChanges,
  type SessionListPage,
} from '../src/features/sessions/session-list-query';

afterEach(() => sessionQueries.clear());

const options = { sort: 'last-human-turn', source: 'all', search: '' } as const;

const row = (sessionId: string, at: number) => ({
  sessionId,
  title: sessionId,
  source: { kind: 'native' },
  running: false,
  lastPromptAt: at,
  updatedAt: at,
  sortedAt: at,
});

function host(hostId: string, call: (method: string, args: Record<string, unknown>) => unknown) {
  let listener: ((resource: string | undefined) => void) | undefined;
  const client = {
    call: vi.fn(async (method: string, args: Record<string, unknown>) => call(method, args)),
    onResource: (next: (resource: string | undefined) => void) => {
      listener = next;
      return () => undefined;
    },
  } as unknown as HostClient;
  return {
    hostId,
    hostName: hostId,
    client,
    emit: (resource: string | undefined) => listener?.(resource),
  };
}

it('keys the cache by Host set, sort, source and search', () => {
  const base = sessionListKey(['studio'], options);
  expect(sessionListKey(['studio'], options)).toEqual(base);
  for (const other of [
    sessionListKey(['studio', 'laptop'], options),
    sessionListKey(['studio'], { ...options, sort: 'created' }),
    sessionListKey(['studio'], { ...options, source: 'native' }),
    sessionListKey(['studio'], { ...options, search: 'deploy' }),
  ])
    expect(other).not.toEqual(base);
});

it('pages each Host by its own cursor and stops reading a Host once it has no more', async () => {
  const studio = host('studio', (_method, args) =>
    args['cursor'] === undefined
      ? { queryVersion: 1, sources: [], sessions: [row('s1', 9), row('s2', 7)], nextCursor: 'c1' }
      : { queryVersion: 1, sources: [], sessions: [row('s2', 7), row('s3', 3)] },
  );
  const laptop = host('laptop', () => ({
    queryVersion: 1,
    sources: [],
    sessions: [row('l1', 8)],
  }));
  const signal = new AbortController().signal;

  const first = await readSessionListPage([studio, laptop], options, undefined, signal);
  expect(studio.client.call).toHaveBeenCalledWith(
    'sessionList',
    { ...options, limit: SESSION_PAGE_SIZE, queryVersion: 1 },
    expect.anything(),
  );
  const cursors = nextSessionCursors(first);
  expect(cursors).toEqual({ studio: 'c1' });

  const second = await readSessionListPage([studio, laptop], options, cursors, signal);
  expect(laptop.client.call).toHaveBeenCalledTimes(1);
  expect(studio.client.call).toHaveBeenLastCalledWith(
    'sessionList',
    { ...options, limit: SESSION_PAGE_SIZE, cursor: 'c1', queryVersion: 1 },
    expect.anything(),
  );
  expect(nextSessionCursors(second)).toBeUndefined();

  const rows = sessionListRows({ pages: [first, second], pageParams: [undefined, cursors] }, [
    studio,
    laptop,
  ]);
  expect(rows?.map((item) => `${item.hostId}:${item.sessionId}`)).toEqual([
    'studio:s1',
    'laptop:l1',
    'studio:s2',
    'studio:s3',
  ]);
});

it('keeps the rows of the Hosts that answered and fails only when none did', async () => {
  const studio = host('studio', () => ({ queryVersion: 1, sources: [], sessions: [row('s1', 1)] }));
  const broken = host('laptop', () => {
    throw new Error('timeout');
  });
  const signal = new AbortController().signal;
  const page: SessionListPage = await readSessionListPage(
    [studio, broken],
    options,
    undefined,
    signal,
  );
  expect(page.failed).toBe(1);
  expect(page.reads.map((read) => read.hostId)).toEqual(['studio']);
  await expect(readSessionListPage([broken], options, undefined, signal)).rejects.toThrow(
    'timeout',
  );
});

it('invalidates only the cached lists that include the Host whose Sessions changed', async () => {
  const studio = host('studio', () => ({ queryVersion: 1, sources: [], sessions: [] }));
  const laptop = host('laptop', () => ({ queryVersion: 1, sources: [], sessions: [] }));
  watchSessionChanges(studio);
  watchSessionChanges(laptop);
  const studioKey = sessionListKey(['studio'], options);
  const bothKey = sessionListKey(['studio', 'laptop'], options);
  const laptopKey = sessionListKey(['laptop'], options);
  for (const key of [studioKey, bothKey, laptopKey])
    sessionQueries.setQueryData(key, { pages: [], pageParams: [] });
  const stale = () =>
    [studioKey, bothKey, laptopKey].map((key) => sessionQueries.getQueryState(key)?.isInvalidated);

  studio.emit('devices');
  expect(stale()).toEqual([false, false, false]);
  studio.emit('sessions');
  expect(stale()).toEqual([true, true, false]);
  laptop.emit(undefined);
  expect(stale()).toEqual([true, true, true]);
});
