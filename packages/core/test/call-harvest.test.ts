import { describe, expect, it } from 'vitest';

import { createHarvest, HARVEST_BATCH, HARVEST_SPEAKING_HOLD } from '../src/voice/harvest.js';

const fill = (count: number, from = 1) => Array.from({ length: count }, (_, index) => from + index);

describe('call frame harvest', () => {
  it('writes a batch of nine as soon as nine wait while the Human is silent', () => {
    const harvest = createHarvest<number>(32);
    for (const frame of fill(8)) harvest.add(frame);
    expect(harvest.due(false)).toEqual([]);
    harvest.add(9);
    expect(harvest.due(false)).toEqual([fill(9)]);
    expect(harvest.pending).toEqual([]);
    expect(HARVEST_BATCH).toBe(9);
  });

  it('holds eighteen while speaking and then writes only the oldest nine', () => {
    const harvest = createHarvest<number>(32);
    for (const frame of fill(17)) harvest.add(frame);
    expect(harvest.due(true)).toEqual([]);
    harvest.add(18);
    expect(harvest.due(true)).toEqual([fill(9)]);
    expect(harvest.pending).toEqual(fill(9, 10));
    expect(HARVEST_SPEAKING_HOLD).toBe(18);
  });

  it('sends the newest nine with a sentence and cuts older frames into commits, oldest first', () => {
    const harvest = createHarvest<number>(32);
    for (const frame of fill(20)) harvest.add(frame);
    expect(harvest.cut()).toEqual({
      commits: [fill(9), fill(2, 10)],
      sentence: fill(9, 12),
    });
    expect(harvest.pending).toEqual([]);
    for (const frame of fill(1)) harvest.add(frame);
    expect(harvest.cut()).toEqual({ commits: [], sentence: [1] });
    expect(harvest.cut()).toEqual({ commits: [], sentence: [] });
  });

  it('holds a restored sentence for the next one until a new frame arrives', () => {
    const harvest = createHarvest<number>(32);
    for (const frame of fill(9)) harvest.add(frame);
    const { sentence } = harvest.cut();
    harvest.restore(sentence);
    expect(harvest.due(false)).toEqual([]);
    expect(harvest.cut().sentence).toEqual(fill(9));
    harvest.restore(fill(9));
    harvest.add(10);
    expect(harvest.due(false)).toEqual([fill(9)]);
    expect(harvest.pending).toEqual([10]);
  });

  it('drops the oldest frames past the cap and counts them', () => {
    const harvest = createHarvest<number>(32);
    let dropped = 0;
    for (const frame of fill(40)) dropped += harvest.add(frame);
    expect(dropped).toBe(8);
    expect(harvest.dropped).toBe(8);
    expect(harvest.pending[0]).toBe(9);
    expect(harvest.restore(fill(3, 100))).toBe(3);
    expect(harvest.pending[0]).toBe(9);
    expect(harvest.pending).toHaveLength(32);
    expect(harvest.dropped).toBe(11);
  });

  it('flushes what waits into commits when the share stops', () => {
    const harvest = createHarvest<number>(32);
    for (const frame of fill(11)) harvest.add(frame);
    expect(harvest.flush()).toEqual([fill(9), [10, 11]]);
    expect(harvest.pending).toEqual([]);
  });
});
