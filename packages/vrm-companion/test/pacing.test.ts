import { describe, expect, it } from 'vitest';
import { RATIOS, createPacing, frameRate, nextPacing, type Pacing } from '../src/client/pacing.js';

const run = (state: Pacing, windows: number, fps: number, work: number, calm = false) => {
  let next = state;
  for (let i = 0; i < windows; i++)
    next = nextPacing(next, { fps, work, target: frameRate(next, calm, false), reduced: false });
  return next;
};

describe('pacing', () => {
  it('caps a calm character at 30 fps', () => {
    const pacing = createPacing(2);
    expect(frameRate(pacing, false, false)).toBe(60);
    expect(frameRate(pacing, true, false)).toBe(30);
    expect(frameRate(pacing, true, true)).toBe(10);
  });

  it('does not count a calm 30 fps window as slow', () => {
    const pacing = run(createPacing(2), 10, 30, 4, true);
    expect(pacing.pace).toBe(60);
    expect(pacing.ratioStep).toBe(pacing.top);
  });

  it('drops to 30 fps, then lowers the pixel ratio', () => {
    const slow = run(createPacing(2), 2, 40, 20);
    expect(slow.pace).toBe(30);
    const blurry = run(slow, 2, 20, 40);
    expect(RATIOS[blurry.ratioStep]).toBe(1.25);
  });

  it('restores the frame rate and then the pixel ratio once frames are cheap again', () => {
    const degraded = run(run(createPacing(2), 2, 40, 20), 2, 20, 40);
    const paced = run(degraded, degraded.promoteAfter, 30, 4);
    expect(paced.pace).toBe(60);
    expect(paced.ratioStep).toBe(degraded.ratioStep);
    const restored = run(paced, paced.promoteAfter, 60, 4);
    expect(restored.ratioStep).toBe(restored.top);
  });

  it('stays at the device pixel ratio on low-density screens', () => {
    expect(RATIOS[createPacing(1).ratioStep]).toBe(1);
    expect(RATIOS[createPacing(0.5).ratioStep]).toBe(0.75);
  });
});
