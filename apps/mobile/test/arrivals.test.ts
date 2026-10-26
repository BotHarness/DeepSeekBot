import { describe, expect, it } from 'vitest';

import { trackArrivals, type Arrivals } from '../src/ui/chat/arrivals';

describe('chat arrivals', () => {
  it('animates only rows appended after the timeline is ready', () => {
    const state: Arrivals = { seen: undefined, fresh: new Set() };
    expect([...trackArrivals(state, ['a', 'b'], false)]).toEqual([]);
    expect([...trackArrivals(state, ['a', 'b'], true)]).toEqual([]);
    expect([...trackArrivals(state, ['older', 'a', 'b', 'c'], true)]).toEqual(['c']);
    expect([...trackArrivals(state, ['older', 'a', 'b', 'c', 'draft:d'], true)]).toEqual([
      'c',
      'draft:d',
    ]);
  });
});
