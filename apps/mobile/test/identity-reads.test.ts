import { expect, it } from 'vitest';

import { createReadSequence } from '../src/host/identity-reads';

it('marks an older read stale once a newer read starts', () => {
  const sequence = createReadSequence<object>();
  const client = {};
  const older = sequence.begin(client);
  const newer = sequence.begin(client);
  expect(older()).toBe(true);
  expect(newer()).toBe(false);
});

it('marks a read stale when a write lands while it is in flight', () => {
  const sequence = createReadSequence<object>();
  const client = {};
  const read = sequence.begin(client);
  sequence.wrote(client);
  expect(read()).toBe(true);
  expect(sequence.begin(client)()).toBe(false);
});

it('keeps each client separate', () => {
  const sequence = createReadSequence<object>();
  const first = {};
  const read = sequence.begin(first);
  sequence.begin({});
  sequence.wrote({});
  expect(read()).toBe(false);
});
