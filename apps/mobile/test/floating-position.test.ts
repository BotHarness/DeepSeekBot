import { describe, expect, it } from 'vitest';

import {
  FLOATING_MARGIN,
  FLOATING_SIZE,
  initialFloating,
  snapFloating,
} from '../src/ui/floating-position';

const bounds = { width: 390, top: 47, bottom: 810 };
const right = 390 - FLOATING_SIZE - FLOATING_MARGIN;

describe('floating close button position', () => {
  it('starts on the right edge, clear of the status bar and home indicator', () => {
    const start = initialFloating(bounds);
    expect(start.x).toBe(right);
    expect(start.y).toBeGreaterThan(bounds.top);
    expect(start.y + FLOATING_SIZE).toBeLessThan(bounds.bottom);
  });

  it('snaps to whichever side edge is nearer after a drag', () => {
    expect(snapFloating({ x: 120, y: 300 }, bounds)).toEqual({ x: FLOATING_MARGIN, y: 300 });
    expect(snapFloating({ x: 240, y: 300 }, bounds)).toEqual({ x: right, y: 300 });
  });

  it('keeps the button inside the safe area vertically', () => {
    expect(snapFloating({ x: 0, y: -40 }, bounds).y).toBe(bounds.top + FLOATING_MARGIN);
    expect(snapFloating({ x: 0, y: 2000 }, bounds).y).toBe(
      bounds.bottom - FLOATING_SIZE - FLOATING_MARGIN,
    );
  });
});
