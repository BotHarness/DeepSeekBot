import { describe, expect, it } from 'vitest';

import {
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  dismissDirection,
  doubleTapZoom,
  fitContain,
  panBounds,
  pinchZoom,
  settleZoom,
} from '../src/ui/chat/zoom-math';

const frame = { width: 400, height: 800 };
const landscape = fitContain({ width: 1200, height: 800 }, frame);

describe('image viewer zoom', () => {
  it('fits the image inside the screen and lets it pan only past the edges', () => {
    expect(landscape).toEqual({ width: 400, height: 400 * (800 / 1200) });
    expect(fitContain({ width: 0, height: 0 }, frame)).toEqual(frame);
    expect(panBounds(landscape, frame, 1)).toEqual({ x: 0, y: 0 });
    expect(panBounds(landscape, frame, 3)).toEqual({ x: 400, y: 0 });
  });

  it('keeps the point under the fingers in place while pinching', () => {
    const origin = { scale: 1, x: 0, y: 0, focalX: 100, focalY: -50 };
    const next = pinchZoom(origin, { x: 100, y: -50 }, 2);
    expect(next).toEqual({ scale: 2, x: -100, y: 50 });
    const moved = pinchZoom(origin, { x: 130, y: -50 }, 2);
    expect(moved.x).toBe(-70);
  });

  it('accepts compensated canvas limits without jumping at the next pinch start', () => {
    expect(
      pinchZoom({ scale: 8, x: 40, y: 105, focalX: 80, focalY: 20 }, { x: 80, y: 20 }, 1, {
        min: 0.6,
        max: 8,
      }),
    ).toEqual({ scale: 8, x: 40, y: 105 });
    expect(
      pinchZoom({ scale: 0.45, x: -20, y: 60, focalX: 80, focalY: 60 }, { x: 80, y: 60 }, 1, {
        min: 0.45,
        max: 7.5,
      }),
    ).toEqual({ scale: 0.45, x: -20, y: 60 });
  });

  it('springs back to fit below 1x and caps the zoom when the fingers lift', () => {
    expect(settleZoom({ scale: 0.7, x: 30, y: 10 }, landscape, frame)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
    const capped = settleZoom({ scale: 7, x: 5000, y: -5000 }, landscape, frame);
    expect(capped.scale).toBe(MAX_SCALE);
    expect(capped.x).toBe(panBounds(landscape, frame, MAX_SCALE).x);
    expect(capped.y).toBe(-panBounds(landscape, frame, MAX_SCALE).y);
  });

  it('double-tap zooms in toward the tapped point and zooms back out', () => {
    const zoomed = doubleTapZoom({ scale: 1, x: 0, y: 0 }, { x: 100, y: 40 }, landscape, frame);
    expect(zoomed.scale).toBe(DOUBLE_TAP_SCALE);
    expect(zoomed.x).toBe(-150);
    expect(Math.abs(zoomed.y)).toBe(0);
    expect(doubleTapZoom(zoomed, { x: 0, y: 0 }, landscape, frame)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });

  it('closes on a long or fast vertical swipe and stays open on a short one', () => {
    expect(dismissDirection(60, 200)).toBe(0);
    expect(dismissDirection(160, 0)).toBe(1);
    expect(dismissDirection(-160, 0)).toBe(-1);
    expect(dismissDirection(30, 1200)).toBe(1);
  });
});
