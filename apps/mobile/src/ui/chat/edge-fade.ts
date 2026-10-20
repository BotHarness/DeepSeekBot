import { edgeFade } from '../design/tokens';

export function edgeFadeStops(
  height: number,
  cover: number,
): readonly { offset: number; opacity: number }[] {
  if (cover <= 0 || height <= cover) return edgeFade.stops;
  const start = cover / height;
  const peak = edgeFade.stops[0].opacity;
  return [
    { offset: 0, opacity: 1 },
    ...edgeFade.stops.map((stop) => ({
      offset: start + stop.offset * (1 - start),
      opacity: (stop.opacity / peak) * edgeFade.cover,
    })),
  ];
}
