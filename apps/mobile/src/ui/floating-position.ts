export type FloatingBounds = { width: number; top: number; bottom: number };
export type FloatingPoint = { x: number; y: number };

export const FLOATING_SIZE = 44;
export const FLOATING_MARGIN = 8;

export function snapFloating(point: FloatingPoint, bounds: FloatingBounds): FloatingPoint {
  const left = FLOATING_MARGIN;
  const right = Math.max(left, bounds.width - FLOATING_SIZE - FLOATING_MARGIN);
  const highest = bounds.top + FLOATING_MARGIN;
  const lowest = Math.max(highest, bounds.bottom - FLOATING_SIZE - FLOATING_MARGIN);
  return {
    x: point.x + FLOATING_SIZE / 2 < bounds.width / 2 ? left : right,
    y: Math.min(lowest, Math.max(highest, point.y)),
  };
}

export function initialFloating(bounds: FloatingBounds): FloatingPoint {
  return snapFloating(
    { x: bounds.width, y: bounds.top + (bounds.bottom - bounds.top) * 0.4 },
    bounds,
  );
}
