type Size = { width: number; height: number };
type Point = { x: number; y: number };

export function backgroundOverflow(image: Size, viewport: Size, fit: 'cover' | 'contain'): Point {
  if (fit === 'contain' || viewport.width <= 0 || viewport.height <= 0) return { x: 0, y: 0 };
  const scale = Math.max(viewport.width / image.width, viewport.height / image.height);
  return {
    x: Math.max(0, image.width * scale - viewport.width),
    y: Math.max(0, image.height * scale - viewport.height),
  };
}

export function dragBackground(start: Point, overflow: Point, delta: Point): Point {
  const move = (position: number, extent: number, distance: number) =>
    extent < 1 ? position : Math.max(0, Math.min(1, position - distance / extent));
  return { x: move(start.x, overflow.x, delta.x), y: move(start.y, overflow.y, delta.y) };
}
