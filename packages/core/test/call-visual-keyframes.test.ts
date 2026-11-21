import './call-visual-fixtures.js';
import { describe, expect, it } from 'vitest';
import {
  KEYFRAME_DEFAULTS,
  createKeyframePicker,
  detailDifference,
  frameDifference,
  hashDistance,
  perceptualHash,
} from '../src/voice/keyframes.js';

const thumb = (value: number, length = 64 * 36) => new Uint8Array(length).fill(value);

function texture(seed: number, width = 128, height = 80): Uint8Array {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
  const cells = Array.from({ length: 64 }, () => Math.round(random() * 255));
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      out[y * width + x] = cells[Math.floor((y * 8) / height) * 8 + Math.floor((x * 8) / width)]!;
  return out;
}

function noisy(base: Uint8Array, seed: number, amplitude: number): Uint8Array {
  let state = seed >>> 0;
  return base.map((value) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.max(0, Math.min(255, value + ((state / 4_294_967_296) * 2 - 1) * amplitude));
  });
}

describe('keyframe picker', () => {
  it('sends the first sample, skips a still picture and sends a settled change', () => {
    const picker = createKeyframePicker({ ...KEYFRAME_DEFAULTS.screen, stableMs: 500 });
    expect(picker.push(texture(1), 0)).toEqual({ keyframe: true, score: 1 });
    expect(picker.push(texture(1), 500).keyframe).toBe(false);
    expect(picker.push(texture(1), 1000).keyframe).toBe(false);
    expect(picker.push(texture(2), 1500).keyframe).toBe(false);
    expect(picker.push(texture(3), 2000).keyframe).toBe(false);
    const settled = picker.push(texture(3), 2500);
    expect(settled.keyframe).toBe(true);
    expect(settled.score).toBeGreaterThanOrEqual(KEYFRAME_DEFAULTS.screen.threshold);
    expect(picker.push(texture(3), 3000).keyframe).toBe(false);
    expect(picker.keyframes).toBe(2);
    expect(picker.samples).toBe(7);
  });

  it('sends one typed line on an unchanged page through the detail check, but not a cursor blink', () => {
    const picker = createKeyframePicker(KEYFRAME_DEFAULTS.screen);
    const page = new Uint8Array(128 * 80).fill(255);
    const blink = page.slice();
    for (let row = 40; row < 43; row += 1) blink[row * 128 + 70] = 0;
    const typed = page.slice();
    for (let index = 0; index < 30; index += 1) typed[60 * 128 + 10 + index] = 0;
    expect(picker.push(page, 0).keyframe).toBe(true);
    expect(picker.push(blink, 500).keyframe).toBe(false);
    expect(picker.push(page, 1000).keyframe).toBe(false);
    expect(picker.push(blink, 1500).keyframe).toBe(false);
    expect(picker.push(typed, 2000).keyframe).toBe(false);
    const sent = picker.push(typed, 2500);
    expect(sent.keyframe).toBe(true);
    expect(sent.score).toBeGreaterThanOrEqual(KEYFRAME_DEFAULTS.screen.detail!.threshold);
    expect(frameDifference(page, typed)).toBeLessThan(0.004);
  });

  it('sends a page shown for a second, counting stillness from when it appeared', () => {
    const picker = createKeyframePicker(KEYFRAME_DEFAULTS.screen);
    const sent: number[] = [];
    for (let at = 0; at < 4_000; at += 500)
      if (picker.push(texture(10 + Math.floor(at / 1_000)), at).keyframe) sent.push(at);
    expect(sent).toEqual([0, 1_500, 2_500, 3_500]);
  });

  it('still sends a change that never settles, such as a playing video', () => {
    const picker = createKeyframePicker(KEYFRAME_DEFAULTS.camera);
    const width = KEYFRAME_DEFAULTS.camera.thumbWidth;
    picker.push(texture(0, width, 36), 0);
    const sent: number[] = [];
    for (let at = 500; at <= 6000; at += 500)
      if (picker.push(texture(at, width, 36), at).keyframe) sent.push(at);
    const wait = KEYFRAME_DEFAULTS.camera.maxWaitMs;
    expect(sent).toEqual([500 + wait, 2500 + wait, 4500 + wait]);
  });

  it('ignores camera noise and a small brightness drift', () => {
    const picker = createKeyframePicker(KEYFRAME_DEFAULTS.camera);
    const width = KEYFRAME_DEFAULTS.camera.thumbWidth;
    const scene = texture(7, width, 36);
    expect(picker.push(scene, 0).keyframe).toBe(true);
    for (let at = 500; at <= 10_000; at += 500) {
      const gain = 1 + ((at / 500) % 3) * 0.01;
      const frame = noisy(
        scene.map((value) => Math.min(255, value * gain)),
        at,
        12,
      );
      expect(picker.push(frame, at).keyframe).toBe(false);
    }
  });

  it('sends again after a reset, as when the source switches', () => {
    const picker = createKeyframePicker(KEYFRAME_DEFAULTS.camera);
    picker.push(thumb(10), 0);
    expect(picker.push(thumb(10), 500).keyframe).toBe(false);
    picker.reset();
    expect(picker.push(thumb(10), 1000).keyframe).toBe(true);
  });

  it('measures differences from 0 to 1', () => {
    expect(frameDifference(thumb(0), thumb(0))).toBe(0);
    expect(frameDifference(thumb(0), thumb(255))).toBe(1);
    expect(frameDifference(thumb(0, 4), thumb(0, 5))).toBe(1);
    const hash = perceptualHash(texture(4), 128);
    expect(hash).toHaveLength(63);
    expect(hashDistance(hash, perceptualHash(texture(4), 128))).toBe(0);
    expect(hashDistance(hash, perceptualHash(texture(5), 128))).toBeGreaterThan(0.2);
    expect(detailDifference(texture(4), texture(4), 128)).toBe(0);
    expect(detailDifference(thumb(0, 128 * 80), thumb(255, 128 * 80), 128)).toBe(1);
  });
});
