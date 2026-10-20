import { expect, it } from 'vitest';

import { edgeFadeStops } from '../src/ui/chat/edge-fade';
import { edgeFade } from '../src/ui/design/tokens';

it('keeps the light edge curve when nothing floats over the edge', () => {
  expect(edgeFadeStops(80, 0)).toBe(edgeFade.stops);
});

it('stays nearly opaque under floating chrome and fades out past it', () => {
  const stops = edgeFadeStops(100, 76);
  expect(stops[0]).toEqual({ offset: 0, opacity: 1 });
  expect(stops[1]).toEqual({ offset: 0.76, opacity: edgeFade.cover });
  expect(stops.at(-1)).toEqual({ offset: 1, opacity: 0 });
  for (let index = 1; index < stops.length; index += 1) {
    expect(stops[index]!.offset).toBeGreaterThan(stops[index - 1]!.offset);
    expect(stops[index]!.opacity).toBeLessThanOrEqual(stops[index - 1]!.opacity);
  }
});
