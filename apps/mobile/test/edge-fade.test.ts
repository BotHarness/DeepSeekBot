import { expect, it } from 'vitest';

import { edgeFadeStops } from '../src/ui/chat/edge-fade';
import { edgeFade } from '../src/ui/design/tokens';

it('keeps the light edge curve when nothing floats over the edge', () => {
  expect(edgeFadeStops(80, 0)).toBe(edgeFade.stops);
});

it('reaches full opacity only at the screen edge and eases out over the whole fade', () => {
  const stops = edgeFadeStops(140, 76);
  expect(stops[0]).toEqual({ offset: 0, opacity: 1 });
  expect(stops.at(-1)).toEqual({ offset: 1, opacity: 0 });
  const chromeEdge = stops.find((stop) => stop.offset >= 76 / 140)!;
  expect(chromeEdge.opacity).toBeLessThan(0.5);
  for (let index = 1; index < stops.length; index += 1) {
    expect(stops[index]!.offset).toBeGreaterThan(stops[index - 1]!.offset);
    expect(stops[index]!.opacity).toBeLessThan(stops[index - 1]!.opacity);
  }
});

it('holds the system bar strip fully opaque before the curve starts', () => {
  const stops = edgeFadeStops(140, 76, 28);
  expect(stops[0]).toEqual({ offset: 0, opacity: 1 });
  expect(stops[1]).toEqual({ offset: 0.2, opacity: 1 });
  expect(stops.at(-1)).toEqual({ offset: 1, opacity: 0 });
});
