export const topBarTextScale = 1.35;

export function cappedTextScale(fontScale: number, cap = topBarTextScale): number {
  return Math.min(fontScale, cap);
}

export function cappedTextSize(size: number, fontScale: number, cap = topBarTextScale): number {
  return fontScale > cap ? (size * cap) / fontScale : size;
}
