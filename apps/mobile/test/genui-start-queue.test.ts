import { expect, it } from 'vitest';

import { genuiStartQueue } from '../src/genui/start-queue';

it('starts at most the limit of GenUI frames at once and lets the next one start as each finishes', () => {
  const queue = genuiStartQueue(2);
  const started: string[] = [];
  const first = queue.take(() => started.push('first'));
  const second = queue.take(() => started.push('second'));
  const third = queue.take(() => started.push('third'));
  const fourth = queue.take(() => started.push('fourth'));
  expect(started).toEqual(['first', 'second']);

  first();
  first();
  expect(started).toEqual(['first', 'second', 'third']);

  fourth();
  second();
  third();
  expect(started).toEqual(['first', 'second', 'third']);

  queue.take(() => started.push('fifth'));
  queue.take(() => started.push('sixth'));
  expect(started).toEqual(['first', 'second', 'third', 'fifth', 'sixth']);
});
