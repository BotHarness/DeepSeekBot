import { edgeFade } from '../design/tokens';

export type EdgeFadeShape = { curve: number; peak: number };

export function edgeFadeStops(
  height: number,
  cover: number,
  solid = 0,
  shape: EdgeFadeShape = { curve: edgeFade.curve, peak: 1 },
): readonly { offset: number; opacity: number }[] {
  if (cover <= 0 || height <= cover) return edgeFade.stops;
  const start = Math.min(solid, cover) / height;
  return [
    ...(start > 0 ? [{ offset: 0, opacity: 1 }] : []),
    ...Array.from({ length: edgeFade.samples + 1 }, (_, index) => {
      const step = index / edgeFade.samples;
      return {
        offset: start + step * (1 - start),
        opacity: step === 0 ? 1 : shape.peak * (1 - step) ** shape.curve,
      };
    }),
  ];
}
