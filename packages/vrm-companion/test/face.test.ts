import { describe, expect, it } from 'vitest';
import {
  FACE_EXPRESSIONS,
  FaceBlend,
  dominantFace,
  faceTarget,
  type FaceInput,
} from '../src/client/face.js';

const live = (activity: FaceInput['activity'], speaking = false): FaceInput => ({
  activity,
  speaking,
  sync: 'live',
  available: true,
  paused: false,
});
const all = new Set<string>(FACE_EXPRESSIONS);

describe('Activity face mapping', () => {
  it('gives each Activity a distinct dominant expression', () => {
    const faces = (['idle', 'thinking', 'working', 'waiting', 'blocked'] as const).map((activity) =>
      dominantFace(faceTarget(live(activity), 5)),
    );
    expect(faces).toEqual(['relaxed', 'sad', 'angry', 'happy', 'sad']);
    expect(faceTarget(live('blocked'), 5).sad).toBeGreaterThan(faceTarget(live('thinking'), 5).sad);
  });

  it('returns to neutral when the view is not live', () => {
    for (const change of [{ sync: 'reconnecting' }, { available: false }, { paused: true }])
      expect(dominantFace(faceTarget({ ...live('blocked'), ...change } as FaceInput, 5))).toBe(
        'neutral',
      );
    expect(dominantFace(faceTarget(undefined, 5))).toBe('neutral');
  });

  it('opens the eyes and adds warmth while speaking, except when blocked', () => {
    const idle = faceTarget(live('idle', true), 5);
    expect(idle.relaxed).toBe(0);
    expect(idle.happy).toBeGreaterThan(0);
    expect(faceTarget(live('blocked', true), 5).happy).toBe(0);
  });

  it('only smiles at idle as an animation, so reduced motion keeps a still face', () => {
    expect(faceTarget(live('idle'), 1.2).happy).toBeGreaterThan(0.4);
    expect(faceTarget(live('idle'), 1.2, true).happy).toBe(0);
    expect(faceTarget(live('idle'), 6).happy).toBe(0);
  });
});

describe('face blending', () => {
  it('eases toward the target instead of snapping', () => {
    const blend = new FaceBlend(all);
    const target = faceTarget(live('blocked'), 5);
    blend.step(target, 1 / 30, false);
    expect(blend.weights.sad).toBeGreaterThan(0);
    expect(blend.weights.sad).toBeLessThan(target.sad);
    for (let i = 0; i < 90; i++) blend.step(target, 1 / 30, false);
    expect(blend.weights.sad).toBe(target.sad);
  });

  it('snaps under reduced motion', () => {
    const blend = new FaceBlend(all);
    blend.step(faceTarget(live('working'), 5), 1 / 10, true);
    expect(blend.weights.angry).toBe(0.2);
  });

  it('keeps expressions the model lacks at zero', () => {
    const blend = new FaceBlend(new Set(['happy']));
    for (let i = 0; i < 90; i++) blend.step(faceTarget(live('blocked'), 5), 1 / 30, false);
    expect(dominantFace(blend.weights)).toBe('neutral');
  });
});
