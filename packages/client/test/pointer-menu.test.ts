import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ Menu: () => null }));
import { pointerMenuPosition } from '../src/client/ds/pointer-menu.js';

describe('pointer-menu safe viewport', () => {
  const viewport = { width: 800, height: 600, top: 0 };
  it('keeps a fractional viewport pointer unchanged away from edges', () => {
    expect(pointerMenuPosition({ x: 136.25, y: 20 }, 280, 300, viewport)).toEqual({
      x: 136.25,
      y: 20,
    });
  });
  it('moves only as needed at right/bottom edges', () => {
    expect(pointerMenuPosition({ x: 799, y: 599 }, 280, 300, viewport)).toEqual({ x: 508, y: 288 });
  });
  it('respects native traffic-light clearance and offscreen keyboard anchors', () => {
    expect(pointerMenuPosition({ x: -10, y: -20 }, 280, 300, { ...viewport, top: 44 })).toEqual({
      x: 12,
      y: 44,
    });
  });
});
