import { describe, expect, it } from 'vitest';

import { moveCursor, stagePoint } from '../src/host/browser-viewer';
import { videoPointerClick } from '../src/host/local-video-pointer';

describe('native video trackpad', () => {
  const frame = { width: 2560, height: 1440 };
  const portrait = { width: 400, height: 700 };

  it('clicks the local cursor after a zoomed trackpad movement', () => {
    const zoom = { scale: 2, x: 40, y: -20 };
    const cursor = moveCursor({ x: 1280, y: 720 }, { x: 50, y: -25 }, frame, portrait, zoom);
    expect(cursor).toEqual({ x: 1440, y: 640 });
    expect(stagePoint(cursor, frame, portrait, zoom)).toEqual({ x: 290, y: 305 });
    expect(videoPointerClick({ point: cursor, frame, button: 'left', driving: true })).toEqual({
      kind: 'click',
      x: 1440,
      y: 640,
      button: 'left',
      count: 1,
    });
  });

  it('keeps right clicks inside the final real display pixel', () => {
    expect(
      videoPointerClick({ point: { x: 2560, y: 1440 }, frame, button: 'right', driving: true }),
    ).toEqual({
      kind: 'click',
      x: 2559,
      y: 1439,
      button: 'right',
      count: 1,
    });
  });

  it('never turns an observer or unavailable geometry into a click', () => {
    expect(
      videoPointerClick({ point: { x: 100, y: 100 }, frame, button: 'left', driving: false }),
    ).toBeUndefined();
    expect(
      videoPointerClick({
        point: { x: 0, y: 0 },
        frame: { width: 0, height: 0 },
        button: 'left',
        driving: true,
      }),
    ).toBeUndefined();
    expect(
      videoPointerClick({ point: { x: -1, y: 100 }, frame, button: 'left', driving: true }),
    ).toBeUndefined();
    expect(
      videoPointerClick({ point: { x: NaN, y: 100 }, frame, button: 'left', driving: true }),
    ).toBeUndefined();
  });
});
