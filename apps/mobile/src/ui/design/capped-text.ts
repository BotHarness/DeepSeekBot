export const headerLabelScaleCeiling = 1.35;

export function cappedTextSize(size: number, fontScale: number, ceiling: number): number {
  return fontScale > ceiling ? (size * ceiling) / fontScale : size;
}
