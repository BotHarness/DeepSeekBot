export const VAD_SAMPLE_RATE = 16_000;
export const DEFAULT_SPEECH_DBFS = -50;
export const SPEECH_DBFS_RANGE = { min: -70, max: -20 } as const;

export function clampSpeechDbfs(value: number): number {
  const rounded = Math.round(value);
  return Math.min(SPEECH_DBFS_RANGE.max, Math.max(SPEECH_DBFS_RANGE.min, rounded));
}
const FRAME = 320;
const FRAME_MS = 20;
const MIN_LAG = Math.floor(VAD_SAMPLE_RATE / 400);
const MAX_LAG = Math.ceil(VAD_SAMPLE_RATE / 70);

export interface VadOptions {
  startVoicedMs?: number;
  minVoicedMs?: number;
  endSilenceMs?: number;
  candidateGapMs?: number;
  preRollMs?: number;
  tailMs?: number;
  maxUtteranceMs?: number;
  stream?: boolean;
  segmentSilenceMs?: number;
  minSegmentVoicedMs?: number;
  activeDb?: number;
  minActiveDbfs?: number;
  periodicity?: number;
  voicedMarksMs?: readonly number[];
}

export type VadEvent =
  | { type: 'speech-start'; atMs: number }
  | { type: 'audio'; pcm: Int16Array }
  | {
      type: 'utterance';
      pcm: Int16Array;
      startMs: number;
      endMs: number;
      voicedMs: number;
      cut: boolean;
      segmentedSamples: number;
    }
  | { type: 'segment'; pcm: Int16Array; startMs: number; endMs: number }
  | { type: 'noise'; startMs: number; durationMs: number }
  | { type: 'voiced'; voicedMs: number; atMs: number };

export interface Vad {
  push(samples: Int16Array): VadEvent[];
  reset(): void;
  raise(db: number): void;
  linger(ms: number): void;
  timeMs(): number;
  readonly speaking: boolean;
}

interface FrameFacts {
  db: number;
  periodicity: number;
}

export function frameFacts(frame: Int16Array): FrameFacts {
  let sum = 0;
  let mean = 0;
  for (let index = 0; index < frame.length; index += 1) mean += frame[index]!;
  mean /= frame.length || 1;
  const centered = new Float32Array(frame.length);
  for (let index = 0; index < frame.length; index += 1) {
    const value = (frame[index]! - mean) / 32768;
    centered[index] = value;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / (frame.length || 1));
  const db = rms <= 1e-9 ? -120 : 20 * Math.log10(rms);
  let best = 0;
  if (db > -70) {
    for (let lag = MIN_LAG; lag <= MAX_LAG && lag < centered.length - 32; lag += 1) {
      let cross = 0;
      let left = 0;
      let right = 0;
      for (let index = 0; index + lag < centered.length; index += 1) {
        const a = centered[index]!;
        const b = centered[index + lag]!;
        cross += a * b;
        left += a * a;
        right += b * b;
      }
      const denominator = Math.sqrt(left * right);
      if (denominator > 0) best = Math.max(best, cross / denominator);
    }
  }
  return { db, periodicity: best };
}

export function createVad(options: VadOptions = {}): Vad {
  const frames = (ms: number) => Math.max(1, Math.round(ms / FRAME_MS));
  const startVoiced = frames(options.startVoicedMs ?? 160);
  const minVoiced = frames(options.minVoicedMs ?? 300);
  const endSilence = frames(options.endSilenceMs ?? 700);
  const candidateGap = frames(options.candidateGapMs ?? 240);
  const preRoll = frames(options.preRollMs ?? 300);
  const tail = frames(options.tailMs ?? 200);
  const maxFrames = frames(options.maxUtteranceMs ?? 30_000);
  const activeDb = options.activeDb ?? 12;
  const minActiveDbfs = options.minActiveDbfs ?? DEFAULT_SPEECH_DBFS;
  const periodicityNeeded = options.periodicity ?? 0.55;
  const marks = [...new Set((options.voicedMarksMs ?? []).map(frames))].sort((a, b) => a - b);
  let raised = 0;
  let lingerFrames = 0;
  const segmentSilence =
    options.segmentSilenceMs === undefined ? undefined : frames(options.segmentSilenceMs);
  const minSegmentVoiced = frames(options.minSegmentVoicedMs ?? 200);

  let pending = new Int16Array(0);
  let frameIndex = 0;
  const floorWindow = frames(3_000);
  const levels: number[] = Array.from({ length: frames(1_000) }, () => -65);
  let floor = -65;
  const candidateLimit = frames(1_500);
  let state: 'silence' | 'candidate' | 'speech' = 'silence';
  let history: Int16Array[] = [];
  let current: Int16Array[] = [];
  let startFrame = 0;
  let voiced = 0;
  let activeRun = 0;
  let quiet = 0;
  let lastActive = 0;
  let segmentStart = 0;
  let segmentVoiced = 0;
  let paused = false;

  const clear = () => {
    state = 'silence';
    current = [];
    segmentStart = 0;
    segmentVoiced = 0;
    paused = false;
    voiced = 0;
    activeRun = 0;
    quiet = 0;
    lingerFrames = 0;
  };

  const join = (parts: Int16Array[]) => {
    const out = new Int16Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  };

  const finish = (events: VadEvent[], cut: boolean) => {
    const keep = Math.min(current.length, lastActive - startFrame + 1 + tail);
    const pcm = join(current.slice(0, keep));
    const startMs = startFrame * FRAME_MS;
    if (voiced >= minVoiced)
      events.push({
        type: 'utterance',
        pcm,
        startMs,
        endMs: startMs + keep * FRAME_MS,
        voicedMs: voiced * FRAME_MS,
        cut,
        segmentedSamples: Math.min(segmentStart, keep) * FRAME,
      });
    else events.push({ type: 'noise', startMs, durationMs: keep * FRAME_MS });
    clear();
  };

  const mark = (events: VadEvent[], index: number) => {
    if (marks.includes(voiced))
      events.push({ type: 'voiced', voicedMs: voiced * FRAME_MS, atMs: (index + 1) * FRAME_MS });
  };

  const frame = (samples: Int16Array, events: VadEvent[]) => {
    const facts = frameFacts(samples);
    const active = facts.db > Math.max(floor + activeDb, minActiveDbfs) + raised;
    const isVoiced = active && facts.periodicity >= periodicityNeeded;
    levels.push(facts.db);
    if (levels.length > floorWindow) levels.shift();
    floor = Math.min(-30, Math.max(-90, Math.min(...levels)));

    const index = frameIndex;
    frameIndex += 1;
    if (state === 'silence') {
      history.push(samples);
      if (history.length > preRoll) history.shift();
      if (!active) return;
      state = 'candidate';
      current = [...history];
      startFrame = index - (current.length - 1);
      voiced = isVoiced ? 1 : 0;
      if (isVoiced) mark(events, index);
      activeRun = 1;
      quiet = 0;
      lastActive = index;
      history = [];
      return;
    }
    current.push(samples);
    if (active) {
      activeRun += 1;
      quiet = 0;
      lastActive = index;
      if (isVoiced) {
        voiced += 1;
        segmentVoiced += 1;
        mark(events, index);
      }
      paused = false;
    } else quiet += 1;

    if (state === 'candidate') {
      if (voiced >= startVoiced) {
        state = 'speech';
        events.push({ type: 'speech-start', atMs: startFrame * FRAME_MS });
        if (options.stream === true) events.push({ type: 'audio', pcm: join(current) });
      } else if (quiet >= candidateGap || current.length >= candidateLimit) {
        if (activeRun >= 2)
          events.push({
            type: 'noise',
            startMs: startFrame * FRAME_MS,
            durationMs: (lastActive - startFrame + 1) * FRAME_MS,
          });
        history = current.slice(-preRoll);
        clear();
      }
      return;
    }
    if (options.stream === true) events.push({ type: 'audio', pcm: samples });
    const ending = Math.max(endSilence, lingerFrames);
    if (quiet < ending && segmentSilence !== undefined) {
      const pause = !paused && quiet >= segmentSilence;
      if (pause && segmentVoiced >= minSegmentVoiced) {
        const end = Math.min(current.length, lastActive - startFrame + 1 + tail);
        if (end > segmentStart) {
          events.push({
            type: 'segment',
            pcm: join(current.slice(segmentStart, end)),
            startMs: (startFrame + segmentStart) * FRAME_MS,
            endMs: (startFrame + end) * FRAME_MS,
          });
          segmentStart = end;
          segmentVoiced = 0;
        }
      }
      if (pause) paused = true;
    }
    if (quiet >= ending) {
      finish(events, false);
      history = [];
      return;
    }
    if (current.length >= maxFrames) {
      lastActive = index;
      finish(events, true);
    }
  };

  return {
    get speaking() {
      return state === 'speech';
    },
    timeMs: () => frameIndex * FRAME_MS,
    raise(db) {
      raised = Number.isFinite(db) && db > 0 ? db : 0;
    },
    linger(ms) {
      if (state !== 'silence') lingerFrames = Math.max(lingerFrames, frames(ms));
    },
    push(samples) {
      const events: VadEvent[] = [];
      let input = samples;
      if (pending.length > 0) {
        input = new Int16Array(pending.length + samples.length);
        input.set(pending);
        input.set(samples, pending.length);
      }
      let offset = 0;
      for (; offset + FRAME <= input.length; offset += FRAME)
        frame(input.slice(offset, offset + FRAME), events);
      pending = input.slice(offset);
      return events;
    },
    reset() {
      pending = new Int16Array(0);
      history = [];
      clear();
    },
  };
}
