export function clampScaledIconSize(size: number, fontScale: number, maxSize: number): number {
  return Math.min(size * fontScale, maxSize);
}
