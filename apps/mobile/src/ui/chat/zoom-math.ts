export const MAX_SCALE = 5;
export const DOUBLE_TAP_SCALE = 2.5;
export const DISMISS_DISTANCE = 120;
export const DISMISS_VELOCITY = 800;

export interface Size {
  width: number;
  height: number;
}

export interface Zoom {
  scale: number;
  x: number;
  y: number;
}

export function fitContain(image: Size, frame: Size): Size {
  'worklet';
  if (image.width <= 0 || image.height <= 0) return frame;
  const ratio = Math.min(frame.width / image.width, frame.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

export function panBounds(content: Size, frame: Size, scale: number): { x: number; y: number } {
  'worklet';
  return {
    x: Math.max(0, (content.width * scale - frame.width) / 2),
    y: Math.max(0, (content.height * scale - frame.height) / 2),
  };
}

export function clampTo(value: number, limit: number): number {
  'worklet';
  return Math.min(limit, Math.max(-limit, value));
}

export function pinchZoom(
  origin: Zoom & { focalX: number; focalY: number },
  focal: { x: number; y: number },
  pinch: number,
): Zoom {
  'worklet';
  const scale = Math.min(MAX_SCALE * 1.5, Math.max(0.6, origin.scale * pinch));
  return {
    scale,
    x: focal.x - ((origin.focalX - origin.x) / origin.scale) * scale,
    y: focal.y - ((origin.focalY - origin.y) / origin.scale) * scale,
  };
}

export function doubleTapZoom(
  current: Zoom,
  focal: { x: number; y: number },
  content: Size,
  frame: Size,
): Zoom {
  'worklet';
  if (current.scale > 1.01) return { scale: 1, x: 0, y: 0 };
  const limit = panBounds(content, frame, DOUBLE_TAP_SCALE);
  return {
    scale: DOUBLE_TAP_SCALE,
    x: clampTo(focal.x * (1 - DOUBLE_TAP_SCALE), limit.x),
    y: clampTo(focal.y * (1 - DOUBLE_TAP_SCALE), limit.y),
  };
}

export function settleZoom(current: Zoom, content: Size, frame: Size): Zoom {
  'worklet';
  if (current.scale < 1) return { scale: 1, x: 0, y: 0 };
  const scale = Math.min(MAX_SCALE, current.scale);
  const limit = panBounds(content, frame, scale);
  return { scale, x: clampTo(current.x, limit.x), y: clampTo(current.y, limit.y) };
}

export function dismissDirection(distance: number, velocity: number): -1 | 0 | 1 {
  'worklet';
  if (Math.abs(distance) <= DISMISS_DISTANCE && Math.abs(velocity) <= DISMISS_VELOCITY) return 0;
  return distance < 0 || velocity < 0 ? -1 : 1;
}
