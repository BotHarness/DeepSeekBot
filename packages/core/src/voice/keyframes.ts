export type CallVisualSource = 'camera' | 'screen';

export interface KeyframeOptions {
  readonly sampleFps: number;
  readonly thumbWidth: number;
  readonly threshold: number;
  readonly stillness: number;
  readonly stableMs: number;
  readonly maxWaitMs: number;
}

export const KEYFRAME_DEFAULTS: Readonly<Record<CallVisualSource, KeyframeOptions>> = {
  camera: {
    sampleFps: 2,
    thumbWidth: 64,
    threshold: 0.08,
    stillness: 0.04,
    stableMs: 0,
    maxWaitMs: 1_500,
  },
  screen: {
    sampleFps: 2,
    thumbWidth: 128,
    threshold: 0.004,
    stillness: 0.001,
    stableMs: 400,
    maxWaitMs: 2_000,
  },
};

export function frameDifference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index]! - b[index]!);
  return sum / (a.length * 255);
}

export interface KeyframeDecision {
  readonly keyframe: boolean;
  readonly score: number;
}

export interface KeyframePicker {
  push(thumb: Uint8Array, atMs: number): KeyframeDecision;
  reset(): void;
  readonly samples: number;
  readonly keyframes: number;
}

export function createKeyframePicker(options: KeyframeOptions): KeyframePicker {
  let last: Uint8Array | undefined;
  let previous: Uint8Array | undefined;
  let changedAt: number | undefined;
  let stillSince: number | undefined;
  let previousAt: number | undefined;
  let samples = 0;
  let keyframes = 0;
  const take = (thumb: Uint8Array, score: number): KeyframeDecision => {
    last = thumb;
    changedAt = undefined;
    keyframes += 1;
    return { keyframe: true, score };
  };
  return {
    push(thumb, atMs) {
      samples += 1;
      const motion = previous === undefined ? 1 : frameDifference(previous, thumb);
      if (motion <= options.stillness) stillSince ??= previousAt ?? atMs;
      else stillSince = undefined;
      previous = thumb;
      previousAt = atMs;
      if (last === undefined) return take(thumb, 1);
      const score = frameDifference(last, thumb);
      if (score < options.threshold) {
        changedAt = undefined;
        return { keyframe: false, score };
      }
      changedAt ??= atMs;
      const settled = stillSince !== undefined && atMs - stillSince >= options.stableMs;
      if (settled || atMs - changedAt >= options.maxWaitMs) return take(thumb, score);
      return { keyframe: false, score };
    },
    reset() {
      last = undefined;
      previous = undefined;
      previousAt = undefined;
      changedAt = undefined;
      stillSince = undefined;
    },
    get samples() {
      return samples;
    },
    get keyframes() {
      return keyframes;
    },
  };
}

export type CallGridLayout = '1x1' | '2x2' | '3x3' | '4x4';

export const MAX_GRID_FRAMES = 16;

export function gridLayout(frames: number): { layout: CallGridLayout; cols: number } {
  if (frames <= 1) return { layout: '1x1', cols: 1 };
  if (frames <= 4) return { layout: '2x2', cols: 2 };
  if (frames <= 9) return { layout: '3x3', cols: 3 };
  return { layout: '4x4', cols: 4 };
}

export function pickGridFrames<T extends { readonly score: number }>(
  frames: readonly T[],
  max = MAX_GRID_FRAMES,
): T[] {
  if (frames.length <= max) return [...frames];
  const ranked = frames
    .slice(1)
    .map((frame, index) => ({ frame, index: index + 1 }))
    .sort((left, right) => right.frame.score - left.frame.score || left.index - right.index)
    .slice(0, max - 1)
    .map((entry) => entry.index);
  const keep = new Set([0, ...ranked]);
  return frames.filter((_, index) => keep.has(index));
}
