import { largeTextFallback, radius } from './tokens';

export function accessibilityTextSize(fontScale: number): boolean {
  return fontScale >= largeTextFallback.minScale;
}

export function capsuleRadius(fontScale: number): number {
  return accessibilityTextSize(fontScale) ? largeTextFallback.radius : radius.round;
}

export function capsuleBorderShape(fontScale: number): {
  shape: 'capsule' | 'roundedRectangle';
  cornerRadius?: number;
} {
  return accessibilityTextSize(fontScale)
    ? { shape: 'roundedRectangle', cornerRadius: largeTextFallback.radius }
    : { shape: 'capsule' };
}
