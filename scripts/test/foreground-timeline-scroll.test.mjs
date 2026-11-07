import { describe, expect, it } from 'vitest';
import {
  assertNativeViewport,
  fittingWindowBounds,
  summarizeForegroundScroll,
} from '../foreground-timeline-scroll.mjs';

describe('actual foreground window calibration', () => {
  const screen = { availLeft: 0, availTop: 25, availWidth: 1470, availHeight: 900 };
  const geometry = {
    screen,
    innerWidth: 1400,
    innerHeight: 800,
    outerWidth: 1440,
    outerHeight: 900,
    devicePixelRatio: 2,
    windowBounds: { left: 0, top: 25, width: 1440, height: 900 },
  };
  it('fits the native window to available display coordinates, including small displays', () => {
    expect(fittingWindowBounds(screen)).toEqual({ left: 0, top: 25, width: 1440, height: 900 });
    expect(
      fittingWindowBounds({ availLeft: -800, availTop: 0, availWidth: 800, availHeight: 600 }),
    ).toEqual({ left: -800, top: 0, width: 800, height: 600 });
  });
  it('accepts a real native viewport without forcing DPR to one', () => {
    expect(() => assertNativeViewport(geometry)).not.toThrow();
  });
  it.each([
    { innerWidth: 1500 },
    { innerHeight: 901 },
    { devicePixelRatio: 0 },
    { windowBounds: { ...geometry.windowBounds, left: 400 } },
    { windowBounds: { ...geometry.windowBounds, top: -20 } },
    { outerWidth: 1500 },
  ])('rejects emulated or off-screen geometry: %j', (change) => {
    expect(() => assertNativeViewport({ ...geometry, ...change })).toThrow(/native viewport/);
  });
});

const sample = { visible: true, focused: true, gapPixels: 0, anchor: { id: 'message', offset: 0 } };
const observation = {
  rafIntervalsMs: [20, 10, 30],
  trustedWheels: 8,
  untrustedWheels: 0,
  truncated: false,
  gapFrames: 0,
};

describe('foreground scroll evidence', () => {
  it('keeps callback cadence explicitly separate from presented FPS', () => {
    expect(summarizeForegroundScroll([sample], observation)).toMatchObject({
      correctnessPass: true,
      raf: { count: 3, medianMs: 20, p95Ms: 30, maxMs: 30 },
    });
    expect(summarizeForegroundScroll([sample], observation).scope).toContain('presented FPS');
    expect(summarizeForegroundScroll([sample], observation).scope).toContain('not proof');
  });
  it.each([{ visible: false }, { focused: false }, { gapPixels: 1 }, { anchor: null }])(
    'refuses missing foreground or visible-content evidence: %j',
    (change) => {
      expect(
        summarizeForegroundScroll([{ ...sample, ...change }], observation).correctnessPass,
      ).toBe(false);
    },
  );
  it.each([
    { trustedWheels: 0 },
    { untrustedWheels: 1 },
    { truncated: true },
    { gapFrames: 1 },
    { rafIntervalsMs: [] },
  ])('refuses untrusted, absent or incomplete input evidence: %j', (change) => {
    expect(summarizeForegroundScroll([sample], { ...observation, ...change }).correctnessPass).toBe(
      false,
    );
  });
  it('does not qualify an empty run', () => {
    expect(summarizeForegroundScroll([], observation).correctnessPass).toBe(false);
  });
});
