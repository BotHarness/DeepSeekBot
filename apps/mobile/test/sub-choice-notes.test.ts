import { expect, it, vi } from 'vitest';

import {
  failedNote,
  forgetFailedNote,
  noteQueue,
  rememberFailedNote,
  sharedNoteQueue,
} from '../src/ui/chat/sub-choice-notes';

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('saves a cleared draft committed while an earlier note write is pending', async () => {
  const first = deferred();
  const written: string[] = [];
  const saved = vi.fn();
  const queue = noteQueue(
    async (text) => {
      written.push(text);
      if (text === 'A') await first.promise;
    },
    saved,
    vi.fn(),
  );
  expect(queue.commit('A', '')).toBe(true);
  expect(queue.commit('', '')).toBe(true);
  first.resolve();
  await queue.settled();
  expect(written).toEqual(['A', '']);
  expect(saved.mock.calls).toEqual([['A'], ['']]);
});

it('skips a repeated commit of the queued text and retries after a failed write', async () => {
  const written: string[] = [];
  let fail = true;
  const failed = vi.fn();
  const queue = noteQueue(
    async (text) => {
      written.push(text);
      if (fail) {
        fail = false;
        throw new Error('stale');
      }
    },
    vi.fn(),
    failed,
  );
  expect(queue.commit('A', '')).toBe(true);
  expect(queue.commit('A', '')).toBe(false);
  await queue.settled();
  expect(failed).toHaveBeenCalledOnce();
  expect(queue.commit('A', '')).toBe(true);
  await queue.settled();
  expect(written).toEqual(['A', 'A']);
});

it('keeps a failed draft for the next visit and clears it after a successful retry', async () => {
  const key = 'preset:default:{"kind":"model","provider":"p","model":"m"}';
  let fail = true;
  const visit = () =>
    noteQueue(
      async () => {
        if (fail) throw new Error('offline');
      },
      () => forgetFailedNote(key),
      (cause, text) => rememberFailedNote(key, { text, error: (cause as Error).message }),
    );
  const first = visit();
  first.commit('Draft', '');
  await first.settled();
  expect(failedNote(key)).toEqual({ text: 'Draft', error: 'offline' });
  fail = false;
  const second = visit();
  second.commit(failedNote(key)!.text, '');
  await second.settled();
  expect(failedNote(key)).toBeUndefined();
});

it('clears an older failed draft when a newer note saves', async () => {
  const key = 'host-a:preset:default:x';
  const queue = noteQueue(
    async (text) => {
      if (text === 'A') throw new Error('stale');
    },
    () => forgetFailedNote(key),
    (cause, text) => rememberFailedNote(key, { text, error: (cause as Error).message }),
  );
  queue.commit('A', '');
  queue.commit('B', '');
  await queue.settled();
  expect(failedNote(key)).toBeUndefined();
  expect(failedNote('host-b:preset:default:x')).toBeUndefined();
});

it('keeps commit order across visits so a later failure is not cleared by an older success', async () => {
  const key = 'host-a:bot:ada:y';
  let finishA: () => void = () => undefined;
  const written: string[] = [];
  const handlers = () => ({
    write: async (text: string) => {
      written.push(text);
      if (text === 'A') await new Promise<void>((resolve) => (finishA = resolve));
      if (text === 'C') throw new Error('stale');
    },
    onSaved: () => forgetFailedNote(key),
    onError: (cause: unknown, text: string) =>
      rememberFailedNote(key, { text, error: (cause as Error).message }),
  });
  const firstVisit = sharedNoteQueue(key, handlers());
  firstVisit.commit('A', '');
  firstVisit.commit('B', '');
  const secondVisit = sharedNoteQueue(key, handlers());
  secondVisit.commit('C', '');
  await new Promise((resolve) => setTimeout(resolve, 0));
  finishA();
  await secondVisit.settled();
  expect(written).toEqual(['A', 'B', 'C']);
  expect(failedNote(key)).toEqual({ text: 'C', error: 'stale' });
});

it('does not keep a failed draft that a newer pending note supersedes', async () => {
  const key = 'host-a:preset:p:z';
  let finishB: () => void = () => undefined;
  const queue = sharedNoteQueue(key, {
    write: async (text) => {
      if (text === 'A') throw new Error('stale');
      await new Promise<void>((resolve) => (finishB = resolve));
    },
    onSaved: () => forgetFailedNote(key),
    onError: (cause, text) => rememberFailedNote(key, { text, error: (cause as Error).message }),
  });
  queue.commit('A', '');
  queue.commit('B', '');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(failedNote(key)).toBeUndefined();
  finishB();
  await queue.settled();
  expect(failedNote(key)).toBeUndefined();
});

it('keeps the failure of the latest commit when the same text was committed twice', async () => {
  const key = 'host-a:preset:p:aba';
  const written: string[] = [];
  const queue = noteQueue(
    async (text) => {
      written.push(text);
      if (text === 'A') throw new Error('stale');
    },
    () => forgetFailedNote(key),
    (cause, text) => rememberFailedNote(key, { text, error: (cause as Error).message }),
  );
  expect(queue.commit('A', '')).toBe(true);
  expect(queue.commit('B', '')).toBe(true);
  expect(queue.commit('A', '')).toBe(true);
  await queue.settled();
  expect(written).toEqual(['A', 'B', 'A']);
  expect(failedNote(key)).toEqual({ text: 'A', error: 'stale' });
});

it('accepts a note again after it saved and another client changed it', async () => {
  const queue = noteQueue(async () => undefined, vi.fn(), vi.fn());
  expect(queue.commit('A', '')).toBe(true);
  await queue.settled();
  expect(queue.commit('A', 'B')).toBe(true);
});
