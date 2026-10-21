import { edgeFade } from '../design/tokens';

export function edgeFadeStops(
  height: number,
  cover: number,
  solid = 0,
): readonly { offset: number; opacity: number }[] {
  if (cover <= 0 || height <= cover) return edgeFade.stops;
  const start = Math.min(solid, cover) / height;
  return [
    ...(start > 0 ? [{ offset: 0, opacity: 1 }] : []),
    ...Array.from({ length: edgeFade.samples + 1 }, (_, index) => {
      const step = index / edgeFade.samples;
      return { offset: start + step * (1 - start), opacity: (1 - step) ** edgeFade.curve };
    }),
  ];
}
