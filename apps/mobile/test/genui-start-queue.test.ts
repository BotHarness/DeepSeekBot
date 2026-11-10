import { expect, it } from 'vitest';

import { genuiStartQueue } from '../src/genui/start-queue';

const settle = () => Promise.resolve();

it('starts at most the limit of GenUI frames at once and lets the next one start as each finishes', async () => {
  const queue = genuiStartQueue(2);
  const started: string[] = [];
  const first = queue.take(() => started.push('first'));
  const second = queue.take(() => started.push('second'));
  const third = queue.take(() => started.push('third'));
  const fourth = queue.take(() => started.push('fourth'));
  await settle();
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
  await settle();
  expect(started).toEqual(['first', 'second', 'third', 'fifth', 'sixth']);
});

it('starts the newest of the frames that mount together first, keeping arrival order among equals', async () => {
  const queue = genuiStartQueue(1);
  const started: string[] = [];
  const older = queue.take(() => started.push('older'), 1);
  queue.take(() => started.push('older peer'), 1);
  const newest = queue.take(() => started.push('newest'), 3);
  const middle = queue.take(() => started.push('middle'), 2);
  await settle();
  expect(started).toEqual(['newest']);

  newest();
  middle();
  older();
  expect(started).toEqual(['newest', 'middle', 'older', 'older peer']);
});
