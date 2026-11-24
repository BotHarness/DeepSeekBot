import { expect, it } from 'vitest';

import { cappedTextSize, headerLabelScaleCeiling } from '../src/ui/design/capped-text';

it('keeps sizes unchanged up to the header label ceiling', () => {
  expect(cappedTextSize(16, 1, headerLabelScaleCeiling)).toBe(16);
  expect(cappedTextSize(16, 1.3, headerLabelScaleCeiling)).toBe(16);
});

it('caps the rendered size at the header label ceiling above it', () => {
  for (const fontScale of [1.5, 2, 3.2])
    expect(cappedTextSize(16, fontScale, headerLabelScaleCeiling) * fontScale).toBeCloseTo(
      16 * headerLabelScaleCeiling,
    );
});
