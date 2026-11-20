export type CallVisualSource = 'camera' | 'screen';

export type KeyframeMetric = 'pixel' | 'phash';

export interface KeyframeDetail {
  readonly threshold: number;
  readonly stillness: number;
}

export interface KeyframeOptions {
  readonly sampleFps: number;
  readonly thumbWidth: number;
  readonly metric: KeyframeMetric;
  readonly threshold: number;
  readonly stillness: number;
  readonly stableMs: number;
  readonly maxWaitMs: number;
  readonly detail?: KeyframeDetail;
}

export const KEYFRAME_DEFAULTS: Readonly<Record<CallVisualSource, KeyframeOptions>> = {
  camera: {
    sampleFps: 2,
    thumbWidth: 64,
    metric: 'phash',
    threshold: 0.12,
    stillness: 0.04,
    stableMs: 0,
    maxWaitMs: 1_500,
  },
  screen: {
    sampleFps: 2,
    thumbWidth: 128,
    metric: 'phash',
    threshold: 0.1,
    stillness: 0.04,
    stableMs: 400,
    maxWaitMs: 2_000,
    detail: { threshold: 0.015, stillness: 0.004 },
  },
};

export function frameDifference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index]! - b[index]!);
  return sum / (a.length * 255);
}

const DETAIL_BLOCKS = 8;

export function detailDifference(a: Uint8Array, b: Uint8Array, width: number): number {
  if (a.length !== b.length || a.length === 0 || width < 1) return 1;
  const height = Math.floor(a.length / width);
  const blockWidth = Math.ceil(width / DETAIL_BLOCKS);
  const blockHeight = Math.max(1, Math.ceil(height / DETAIL_BLOCKS));
  let max = 0;
  for (let top = 0; top < height; top += blockHeight)
    for (let left = 0; left < width; left += blockWidth) {
      let sum = 0;
      let count = 0;
      for (let y = top; y < Math.min(height, top + blockHeight); y += 1)
        for (let x = left; x < Math.min(width, left + blockWidth); x += 1) {
          sum += Math.abs(a[y * width + x]! - b[y * width + x]!);
          count += 1;
        }
      if (count > 0) max = Math.max(max, sum / (count * 255));
    }
  return max;
}

const HASH_INPUT = 32;
const HASH_SIDE = 8;
const COSINES = Array.from({ length: HASH_SIDE }, (_, u) =>
  Float64Array.from({ length: HASH_INPUT }, (_, x) =>
    Math.cos(((2 * x + 1) * u * Math.PI) / (2 * HASH_INPUT)),
  ),
);

function shrink(thumb: Uint8Array, width: number): Float64Array {
  const height = Math.max(1, Math.floor(thumb.length / width));
  const out = new Float64Array(HASH_INPUT * HASH_INPUT);
  for (let y = 0; y < HASH_INPUT; y += 1) {
    const y0 = Math.floor((y * height) / HASH_INPUT);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / HASH_INPUT));
    for (let x = 0; x < HASH_INPUT; x += 1) {
      const x0 = Math.floor((x * width) / HASH_INPUT);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / HASH_INPUT));
      let sum = 0;
      for (let row = y0; row < y1; row += 1)
        for (let col = x0; col < x1; col += 1) sum += thumb[row * width + col] ?? 0;
      out[y * HASH_INPUT + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

export function perceptualHash(thumb: Uint8Array, width: number): Uint8Array {
  const pixels = shrink(thumb, width);
  const rows = new Float64Array(HASH_INPUT * HASH_SIDE);
  for (let y = 0; y < HASH_INPUT; y += 1)
    for (let u = 0; u < HASH_SIDE; u += 1) {
      let sum = 0;
      for (let x = 0; x < HASH_INPUT; x += 1) sum += pixels[y * HASH_INPUT + x]! * COSINES[u]![x]!;
      rows[y * HASH_SIDE + u] = sum;
    }
  const coefficients: number[] = [];
  for (let v = 0; v < HASH_SIDE; v += 1)
    for (let u = 0; u < HASH_SIDE; u += 1) {
      if (u === 0 && v === 0) continue;
      let sum = 0;
      for (let y = 0; y < HASH_INPUT; y += 1) sum += rows[y * HASH_SIDE + u]! * COSINES[v]![y]!;
      coefficients.push(sum);
    }
  const median = [...coefficients].sort((a, b) => a - b)[coefficients.length >> 1]!;
  return Uint8Array.from(coefficients, (value) => (value > median ? 1 : 0));
}

export function hashDistance(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let distance = 0;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) distance += 1;
  return distance / a.length;
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

interface Sample {
  readonly thumb: Uint8Array;
  readonly hash: Uint8Array | undefined;
  readonly atMs: number;
}

export function createKeyframePicker(options: KeyframeOptions): KeyframePicker {
  const width = options.thumbWidth;
  const difference = (a: Sample, b: Sample) =>
    options.metric === 'phash' ? hashDistance(a.hash!, b.hash!) : frameDifference(a.thumb, b.thumb);
  let last: Sample | undefined;
  let previous: Sample | undefined;
  let changedAt: number | undefined;
  let stillSince: number | undefined;
  let detailStillSince: number | undefined;
  let samples = 0;
  let keyframes = 0;
  const take = (sample: Sample, score: number): KeyframeDecision => {
    last = sample;
    changedAt = undefined;
    keyframes += 1;
    return { keyframe: true, score };
  };
  return {
    push(thumb, atMs) {
      samples += 1;
      const sample: Sample = {
        thumb,
        hash: options.metric === 'phash' ? perceptualHash(thumb, width) : undefined,
        atMs,
      };
      const before = previous;
      previous = sample;
      const motion = before === undefined ? 1 : difference(before, sample);
      if (motion <= options.stillness) stillSince ??= before?.atMs ?? atMs;
      else stillSince = undefined;
      const detail = options.detail;
      if (detail !== undefined) {
        const detailMotion =
          before === undefined ? 1 : detailDifference(before.thumb, thumb, width);
        if (detailMotion <= detail.stillness) detailStillSince ??= before?.atMs ?? atMs;
        else detailStillSince = undefined;
      }
      if (last === undefined) return take(sample, 1);
      const score = difference(last, sample);
      if (score >= options.threshold) {
        changedAt ??= atMs;
        const settled = stillSince !== undefined && atMs - stillSince >= options.stableMs;
        if (settled || atMs - changedAt >= options.maxWaitMs) return take(sample, score);
        return { keyframe: false, score };
      }
      changedAt = undefined;
      if (detail !== undefined) {
        const local = detailDifference(last.thumb, thumb, width);
        if (
          local >= detail.threshold &&
          detailStillSince !== undefined &&
          atMs - detailStillSince >= options.stableMs
        )
          return take(sample, local);
        return { keyframe: false, score: Math.max(score, local) };
      }
      return { keyframe: false, score };
    },
    reset() {
      last = undefined;
      previous = undefined;
      changedAt = undefined;
      stillSince = undefined;
      detailStillSince = undefined;
    },
    get samples() {
      return samples;
    },
    get keyframes() {
      return keyframes;
    },
  };
}

export const CALL_GRID_LAYOUTS = [
  '1',
  '2',
  '3',
  '2+2',
  '3+2',
  '3+3',
  '3+2+2',
  '3+3+2',
  '3+3+3',
] as const;

export type CallGridLayout = (typeof CALL_GRID_LAYOUTS)[number];

export const MAX_GRID_FRAMES = 9;

export const MAX_GRID_COLUMNS = 3;

export function callGridRows(frames: number): number[] {
  const count = Math.min(MAX_GRID_FRAMES, Math.max(1, Math.floor(frames)));
  const rows = Math.ceil(count / MAX_GRID_COLUMNS);
  const base = Math.floor(count / rows);
  const longer = count % rows;
  return Array.from({ length: rows }, (_, row) => base + (row < longer ? 1 : 0));
}

export function gridLayout(frames: number): {
  layout: CallGridLayout;
  rows: number[];
  cols: number;
} {
  const rows = callGridRows(frames);
  return { layout: rows.join('+') as CallGridLayout, rows, cols: Math.max(...rows) };
}

export function isCallGridLayout(frames: unknown, layout: unknown): boolean {
  return (
    Number.isSafeInteger(frames) &&
    (frames as number) >= 1 &&
    (frames as number) <= MAX_GRID_FRAMES &&
    layout === gridLayout(frames as number).layout
  );
}
