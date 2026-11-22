import { expect, it, vi } from 'vitest';

import {
  failedNote,
  forgetFailedNote,
  noteQueue,
  rememberFailedNote,
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
      (text) => forgetFailedNote(key, text),
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
