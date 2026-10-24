import { describe, expect, it } from 'vitest';
import { videoPinchUpdate } from '../src/ui/chat/computer-video-gestures';

describe('Computer video pinch contact lifecycle', () => {
  const center = { x: 200, y: 112.5 };
  const origin = { scale: 1, x: 0, y: 0, focalX: 0, focalY: 87.5 };
  const zoomed = videoPinchUpdate({
    origin,
    current: origin,
    center,
    event: { numberOfPointers: 2, scale: 2, focalX: 220, focalY: 220 },
  });

  it('zooms and follows the midpoint while both fingers are down', () => {
    expect(zoomed).toEqual({ scale: 2, x: 20, y: -67.5 });
  });

  it('keeps the last canvas transform as either finger lifts and the midpoint becomes the remaining finger', () => {
    for (const focalX of [100, 340]) {
      expect(
        videoPinchUpdate({
          origin,
          current: zoomed,
          center,
          event: { numberOfPointers: 1, scale: 2, focalX, focalY: 280 },
        }),
      ).toEqual(zoomed);
    }
  });

  it('does not change a free below-fit preview on final contact removal', () => {
    const current = { scale: 0.7, x: -180, y: 360 };
    expect(
      videoPinchUpdate({
        origin: { ...current, focalX: 20, focalY: 30 },
        current,
        center,
        event: { numberOfPointers: 0, scale: 1, focalX: 0, focalY: 0 },
      }),
    ).toEqual(current);
  });
});
