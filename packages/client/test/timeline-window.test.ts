import { expect, it } from 'vitest';
import { nearKeys, timelineRuns, windowKeys } from '../src/client/timeline-window.js';

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

it('falls back to the nearest edge when the kept range left the remaining groups', () => {
  expect([...windowKeys(keys, heights, 1000, 1200)]).toEqual(['e', 'f']);
  expect([...windowKeys(keys, heights, -900, -100)]).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  expect([...windowKeys(keys, heights, -300, -100)]).toEqual(['a', 'b']);
  expect([...windowKeys(keys, heights, 150, 350)]).toEqual(['b', 'c', 'd']);
});

it('keeps rendering groups after the on-screen groups are removed', () => {
  const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const measured = new Map(before.map((key) => [key, 100]));
  const seen = new Set(before);
  const top = 500;
  const bottom = 800;
  const remaining = before.slice(0, 4);
  const near = windowKeys(remaining, measured, top, bottom);
  const runs = timelineRuns(remaining, measured, (key) => !seen.has(key) || near.has(key));
  expect(runs.some((run) => run.kind === 'group')).toBe(true);
  expect(timelineRuns(remaining, measured, (key) => !seen.has(key))).toEqual([
    { kind: 'gap', from: 0, to: 3, height: 400 },
  ]);
});

it('does not invent groups while nothing has been measured', () => {
  expect([...windowKeys(keys, new Map(), 1000, 1200)]).toEqual([]);
});
