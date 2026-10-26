import { describe, expect, it } from 'vitest';

import { trackMessageArrivals, type MessageArrivals } from '../src/client/message-arrivals.js';

const fresh = (): MessageArrivals => ({ scope: 'a', seen: undefined, fresh: new Set() });

describe('trackMessageArrivals', () => {
  it('animates only messages that arrive at the bottom after the first ready load', () => {
    const state = fresh();
    expect([...trackMessageArrivals(state, 'a', ['m1'], false)]).toEqual([]);
    expect([...trackMessageArrivals(state, 'a', ['m1', 'm2'], true)]).toEqual([]);
    expect([...trackMessageArrivals(state, 'a', ['m0', 'm1', 'm2', 'm3'], true)]).toEqual(['m3']);
  });

  it('skips bulk loads and starts over in another conversation', () => {
    const state = fresh();
    trackMessageArrivals(state, 'a', ['m1'], true);
    expect([...trackMessageArrivals(state, 'a', ['m1', 'x1', 'x2', 'x3', 'x4'], true)]).toEqual([]);
    expect([...trackMessageArrivals(state, 'b', ['b1'], true)]).toEqual([]);
    expect([...trackMessageArrivals(state, 'b', ['b1', 'b2'], true)]).toEqual(['b2']);
  });
});
