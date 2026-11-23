import { describe, expect, it } from 'vitest';

import {
  accessibilityTextSize,
  capsuleBorderShape,
  capsuleRadius,
} from '../src/ui/design/large-text-fallback';
import { largeTextFallback, radius } from '../src/ui/design/tokens';

const xxxLarge = 23 / 17;
const ax1 = 28 / 17;
const ax5 = 3.571;

describe('large-text capsule fallback', () => {
  it('keeps capsules up to xxxLarge', () => {
    for (const scale of [0.82, 1, xxxLarge]) {
      expect(accessibilityTextSize(scale)).toBe(false);
      expect(capsuleRadius(scale)).toBe(radius.round);
      expect(capsuleBorderShape(scale)).toEqual({ shape: 'capsule' });
    }
  });

  it('switches to rounded rectangles at accessibility sizes', () => {
    for (const scale of [ax1, ax5]) {
      expect(accessibilityTextSize(scale)).toBe(true);
      expect(capsuleRadius(scale)).toBe(largeTextFallback.radius);
      expect(capsuleBorderShape(scale)).toEqual({
        shape: 'roundedRectangle',
        cornerRadius: largeTextFallback.radius,
      });
    }
  });
});
