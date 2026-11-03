import { expect, it } from 'vitest';
import { knownHeights, nearKeys, timelineRuns, windowKeys } from '../src/client/timeline-window.js';

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

it('sizes regrouped history from its measured messages so only nearby groups mount', () => {
  const shares = new Map(Array.from({ length: 40 }, (_, index) => [`m${index}`, 50]));
  const members = new Map<string, string[]>([['new', ['n0', 'n1']]]);
  const regrouped: string[] = ['new'];
  for (let start = 3; start < 40; start += 8) {
    const ids = Array.from({ length: Math.min(8, 40 - start) }, (_, index) => `m${start + index}`);
    members.set(ids[0]!, ids);
    regrouped.push(ids[0]!);
  }
  members.set('m0', ['m0', 'm1', 'm2']);
  regrouped.splice(1, 0, 'm0');
  const sizes = knownHeights(regrouped, new Map(), members, shares);
  expect(sizes.has('new')).toBe(false);
  expect(sizes.get('m0')).toBe(150);
  expect(sizes.get('m3')).toBe(400);
  const near = windowKeys(regrouped, sizes, 0, 500);
  const mounted = timelineRuns(regrouped, sizes, (key) => !sizes.has(key) || near.has(key))
    .filter((run) => run.kind === 'group')
    .map((run) => regrouped[run.kind === 'group' ? run.index : 0]);
  expect(mounted).toEqual(['new', 'm0', 'm3']);
});

it('prefers a measured group height over the estimate from its messages', () => {
  const sizes = knownHeights(
    ['a'],
    new Map([['a', 120]]),
    new Map([['a', ['x', 'y']]]),
    new Map([
      ['x', 10],
      ['y', 10],
    ]),
  );
  expect(sizes.get('a')).toBe(120);
});
