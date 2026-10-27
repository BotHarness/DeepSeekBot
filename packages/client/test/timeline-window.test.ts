import { expect, it } from 'vitest';
import { nearKeys, timelineRuns } from '../src/client/timeline-window.js';

const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
const heights = new Map(keys.map((key) => [key, 100]));

it('keeps the groups that intersect the kept range', () => {
  expect([...nearKeys(keys, heights, 150, 350)]).toEqual(['b', 'c', 'd']);
  expect([...nearKeys(keys, heights, 1000, 1200)]).toEqual([]);
});

it('folds consecutive far groups into one gap of their summed height', () => {
  const near = new Set(['c', 'd']);
  expect(timelineRuns(keys, heights, (key) => near.has(key))).toEqual([
    { kind: 'gap', from: 0, to: 1, height: 200 },
    { kind: 'group', index: 2 },
    { kind: 'group', index: 3 },
    { kind: 'gap', from: 4, to: 5, height: 200 },
  ]);
});

it('always renders groups that were never measured', () => {
  const partial = new Map([
    ['a', 100],
    ['b', 100],
    ['d', 100],
  ]);
  expect(timelineRuns(keys, partial, () => false)).toEqual([
    { kind: 'gap', from: 0, to: 1, height: 200 },
    { kind: 'group', index: 2 },
    { kind: 'gap', from: 3, to: 3, height: 100 },
    { kind: 'group', index: 4 },
    { kind: 'group', index: 5 },
  ]);
});
