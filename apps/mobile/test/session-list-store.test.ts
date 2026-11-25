import { afterEach, expect, it } from 'vitest';
import { openLocalStore, type LocalStore } from '@botharness/host-client/local-store';
import {
  readSessionList,
  syncSessionList,
  type SessionListSource,
} from '@botharness/host-client/session-list-store';
import type {
  HostSessionListChanges,
  HostSessionRow,
} from '@botharness/host-protocol/host-sessions';
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

const row = (sessionId: string, title = sessionId): HostSessionRow => ({
  sessionId,
  title,
  source: { kind: 'native' },
  running: false,
  lastPromptAt: 1,
  updatedAt: 1,
});

function host(rows: HostSessionRow[]) {
  const calls: string[] = [];
  let next: HostSessionListChanges | undefined = { reset: true, cursor: { epoch: 'e1', seq: 4 } };
  const source: SessionListSource = {
    async changes(cursor) {
      calls.push(cursor === undefined ? 'cursor' : `changes:${cursor.epoch}:${cursor.seq}`);
      return cursor === undefined ? { reset: true, cursor: { epoch: 'e1', seq: 4 } } : next;
    },
    async all() {
      calls.push('all');
      return { sessions: rows, sources: [{ kind: 'native' }] };
    },
  };
  return {
    source,
    calls,
    answer: (changes: HostSessionListChanges | undefined) => {
      next = changes;
    },
  };
}

it('downloads the whole list once, then applies only the changes since its cursor', async () => {
  const local = await store();
  const h = host([row('a'), row('b')]);

  const first = await syncSessionList(local, h.source);
  expect(first.sessions.map((r) => r.sessionId)).toEqual(['a', 'b']);
  expect(h.calls).toEqual(['cursor', 'all']);
  expect((await readSessionList(local))?.cursor).toEqual({ epoch: 'e1', seq: 4 });

  h.answer({
    sessions: [row('b', 'Renamed'), row('c')],
    removed: ['a'],
    sources: [{ kind: 'native' }],
    cursor: { epoch: 'e1', seq: 9 },
  });
  const second = await syncSessionList(local, h.source);
  expect(h.calls).toEqual(['cursor', 'all', 'changes:e1:4']);
  expect(second.sessions.map((r) => [r.sessionId, r.title]).sort()).toEqual([
    ['b', 'Renamed'],
    ['c', 'c'],
  ]);
  expect(second.cursor).toEqual({ epoch: 'e1', seq: 9 });
});

it('reads the whole list again when the Host answers reset', async () => {
  const local = await store();
  const h = host([row('a')]);
  await syncSessionList(local, h.source);
  h.answer({ reset: true, cursor: { epoch: 'e2', seq: 1 } });
  const after = await syncSessionList(local, h.source);
  expect(h.calls).toEqual(['cursor', 'all', 'changes:e1:4', 'cursor', 'all']);
  expect(after.sessions.map((r) => r.sessionId)).toEqual(['a']);
});

it('keeps rows without a cursor when the Host has no change log', async () => {
  const local = await store();
  const calls: string[] = [];
  const source: SessionListSource = {
    async changes() {
      calls.push('changes');
      return undefined;
    },
    async all() {
      calls.push('all');
      return { sessions: [row('a')], sources: [] };
    },
  };
  await syncSessionList(local, source);
  await syncSessionList(local, source);
  expect(calls).toEqual(['changes', 'all', 'changes', 'all']);
  expect(await readSessionList(local)).toEqual({
    sessions: [row('a')],
    sources: [],
  });
});

it('has nothing stored before the first sync', async () => {
  expect(await readSessionList(await store())).toBeUndefined();
});
