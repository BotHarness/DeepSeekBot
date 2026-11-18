import { expect, it } from 'vitest';

import { createReadSequence } from '../src/host/identity-reads';

it('keeps an older read from committing after a newer read committed', () => {
  const sequence = createReadSequence<object>();
  const client = {};
  const older = sequence.begin(client);
  const newer = sequence.begin(client);
  expect(newer()).toBe(true);
  expect(older()).toBe(false);
});

it('lets an older read commit while a newer read is still pending', () => {
  const sequence = createReadSequence<object>();
  const client = {};
  const older = sequence.begin(client);
  const newer = sequence.begin(client);
  expect(older()).toBe(true);
  expect(newer()).toBe(true);
});

it('drops a read when a write lands while it is in flight', () => {
  const sequence = createReadSequence<object>();
  const client = {};
  const read = sequence.begin(client);
  sequence.wrote(client);
  expect(read()).toBe(false);
  expect(sequence.begin(client)()).toBe(true);
});

it('keeps each client separate', () => {
  const sequence = createReadSequence<object>();
  const first = {};
  const read = sequence.begin(first);
  sequence.begin({})();
  sequence.wrote({});
  expect(read()).toBe(true);
});
