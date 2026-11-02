import { MAX_SCALE, pinchZoom, type Zoom } from './zoom-math';

export function videoPinchUpdate({
  origin,
  current,
  event,
  center,
}: {
  origin: Zoom & { focalX: number; focalY: number };
  current: Zoom;
  event: { numberOfPointers: number; scale: number; focalX: number; focalY: number };
  center: { x: number; y: number };
}): Zoom {
  'worklet';
  if (event.numberOfPointers !== 2) return current;
  return pinchZoom(
    origin,
    { x: event.focalX - center.x, y: event.focalY - center.y },
    event.scale,
    { min: Math.min(0.6, origin.scale), max: Math.max(MAX_SCALE * 1.5, origin.scale) },
  );
}
