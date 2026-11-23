import { describe, expect, it } from 'vitest';

import { clippedHeight } from '../src/ui/primitives/keyboard-form-context';

describe('clippedHeight', () => {
  it('reserves the part of a native scroll frame that hangs below the visible form frame', () => {
    expect(clippedHeight(812, 714)).toBe(98);
  });

  it('reserves nothing when the scroll frame fits or the frame is not measured yet', () => {
    expect(clippedHeight(714, 714)).toBe(0);
    expect(clippedHeight(519, 714)).toBe(0);
    expect(clippedHeight(812, 0)).toBe(0);
  });
});
