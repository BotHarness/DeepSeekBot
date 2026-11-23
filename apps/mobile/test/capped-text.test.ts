import { expect, it } from 'vitest';

import { cappedTextScale, cappedTextSize, topBarTextScale } from '../src/ui/design/capped-text';

it('keeps sizes unchanged up to the top app bar ceiling', () => {
  expect(cappedTextSize(16, 1)).toBe(16);
  expect(cappedTextSize(16, 1.3)).toBe(16);
  expect(cappedTextScale(1.2)).toBe(1.2);
});

it('caps the rendered size at the ceiling above it', () => {
  for (const fontScale of [1.5, 2, 3.2])
    expect(cappedTextSize(16, fontScale) * fontScale).toBeCloseTo(16 * topBarTextScale);
  expect(cappedTextScale(2)).toBe(topBarTextScale);
});
