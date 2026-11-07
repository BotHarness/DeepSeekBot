import { describe, expect, it } from 'vitest';
import { summarizeForegroundScroll } from '../foreground-timeline-scroll.mjs';

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
