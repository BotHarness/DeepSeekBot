import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

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

interface SerializedWorklet {
  __initData: { code: string };
  __closure?: unknown[];
}

function isSerializedWorklet(value: unknown): value is SerializedWorklet {
  return (
    typeof value === 'function' &&
    '__initData' in value &&
    typeof value.__initData === 'object' &&
    value.__initData !== null &&
    'code' in value.__initData &&
    typeof value.__initData.code === 'string'
  );
}

function isolatedWorklet(value: SerializedWorklet): (...args: unknown[]) => unknown {
  const closure = value.__closure?.map((item) =>
    isSerializedWorklet(item) ? isolatedWorklet(item) : item,
  );
  return runInNewContext(value.__initData.code).bind({ __closure: closure });
}

function compiledZoom(mode: 'development' | 'production') {
  const mobile = createRequire(new URL('../package.json', import.meta.url));
  const expo = createRequire(mobile.resolve('expo/package.json'));
  const { transformSync } = createRequire(import.meta.url)('@babel/core');
  const filename = fileURLToPath(new URL('../src/ui/chat/zoom-math.ts', import.meta.url));
  const exported: Record<string, SerializedWorklet> = {};
  vi.stubEnv('NODE_ENV', mode);
  try {
    const result = transformSync(readFileSync(filename, 'utf8'), {
      filename,
      babelrc: false,
      configFile: false,
      envName: mode,
      presets: [expo.resolve('babel-preset-expo')],
      caller: {
        name: 'metro',
        platform: 'android',
        engine: 'hermes',
        isDev: mode === 'development',
        supportsStaticESM: false,
      },
    });
    runInNewContext(result.code, { exports: exported, require: mobile, global: { Error } });
  } finally {
    vi.unstubAllEnvs();
  }
  return exported;
}

describe('image viewer zoom', () => {
  it.each(['development', 'production'] as const)(
    'pinches with default and explicit limits in the isolated %s worklet runtime',
    (mode) => {
      const compiled = compiledZoom(mode);
      const pinch = isolatedWorklet(compiled.pinchZoom!);
      const origin = { scale: 1, x: 0, y: 0, focalX: 100, focalY: -50 };
      const focal = { x: 100, y: -50 };
      expect(pinch(origin, focal, 2)).toEqual(pinchZoom(origin, focal, 2));
      expect(pinch(origin, focal, 100)).toEqual({ scale: 7.5, x: -650, y: 325 });
      expect(pinch(origin, focal, 0.1)).toEqual({ scale: 0.6, x: 40, y: -20 });
      const canvas = { scale: 8, x: 40, y: 105, focalX: 80, focalY: 20 };
      expect(pinch(canvas, { x: 80, y: 20 }, 1, { min: 0.6, max: 8 })).toEqual({
        scale: 8,
        x: 40,
        y: 105,
      });
      expect(isolatedWorklet(compiled.doubleTapZoom!)(origin, focal, landscape, frame)).toEqual(
        doubleTapZoom(origin, focal, landscape, frame),
      );
      expect(
        isolatedWorklet(compiled.settleZoom!)({ scale: 7, x: 5000, y: -5000 }, landscape, frame),
      ).toEqual(settleZoom({ scale: 7, x: 5000, y: -5000 }, landscape, frame));
    },
  );
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
