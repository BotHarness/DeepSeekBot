import { expect, it } from 'vitest';
import {
  knownHeights,
  nearKeys,
  timelineChunks,
  timelineSlots,
  windowKeys,
} from '../src/client/timeline-window.js';

const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
const heights = new Map(keys.map((key) => [key, 100]));

it('keeps the groups that intersect the kept range', () => {
  expect([...nearKeys(keys, heights, 150, 350)]).toEqual(['b', 'c', 'd']);
  expect([...nearKeys(keys, heights, 1000, 1200)]).toEqual([]);
});

it('keeps a placeholder of the measured height for every far group', () => {
  const near = new Set(['c', 'd']);
  expect(timelineSlots(keys, heights, (key) => near.has(key))).toEqual([
    { index: 0, placeholder: 100 },
    { index: 1, placeholder: 100 },
    { index: 2 },
    { index: 3 },
    { index: 4, placeholder: 100 },
    { index: 5, placeholder: 100 },
  ]);
});

it('always renders groups that were never measured', () => {
  const partial = new Map([
    ['a', 100],
    ['b', 100],
    ['d', 100],
  ]);
  expect(timelineSlots(keys, partial, () => false)).toEqual([
    { index: 0, placeholder: 100 },
    { index: 1, placeholder: 100 },
    { index: 2 },
    { index: 3, placeholder: 100 },
    { index: 4 },
    { index: 5 },
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
  const slots = timelineSlots(remaining, measured, (key) => !seen.has(key) || near.has(key));
  expect(slots.some((slot) => slot.placeholder === undefined)).toBe(true);
  expect(
    timelineSlots(remaining, measured, (key) => !seen.has(key)).every(
      (slot) => slot.placeholder === 100,
    ),
  ).toBe(true);
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
  const mounted = timelineSlots(regrouped, sizes, (key) => !sizes.has(key) || near.has(key))
    .filter((slot) => slot.placeholder === undefined)
    .map((slot) => regrouped[slot.index]);
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

it('keeps slot chunks stable when older history is prepended and new messages arrive', () => {
  const first = timelineChunks(['a', 'b', 'c', 'd', 'e'], new Map(), 2);
  expect(first.chunks).toEqual([
    { id: 'a', start: 0, end: 2 },
    { id: 'c', start: 2, end: 4 },
    { id: 'e', start: 4, end: 5 },
  ]);
  const next = timelineChunks(
    ['x', 'y', 'z', 'a', 'b', 'c', 'd', 'e', 'f', 'g'],
    first.assigned,
    2,
  );
  expect(next.chunks).toEqual([
    { id: 'x', start: 0, end: 2 },
    { id: 'z', start: 2, end: 3 },
    { id: 'a', start: 3, end: 5 },
    { id: 'c', start: 5, end: 7 },
    { id: 'e', start: 7, end: 9 },
    { id: 'g', start: 9, end: 10 },
  ]);
});

it('keeps every key in exactly one contiguous chunk when groups merge or reorder', () => {
  const first = timelineChunks(['a', 'b', 'c', 'd'], new Map(), 2);
  const next = timelineChunks(['c', 'a', 'd', 'b'], first.assigned, 2);
  const covered = next.chunks.flatMap((chunk) =>
    Array.from({ length: chunk.end - chunk.start }, (_, offset) => chunk.start + offset),
  );
  expect(covered).toEqual([0, 1, 2, 3]);
  expect(new Set(next.chunks.map((chunk) => chunk.id)).size).toBe(next.chunks.length);
});
