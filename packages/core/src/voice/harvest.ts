import { MAX_GRID_FRAMES } from './keyframes.js';

export const HARVEST_BATCH = MAX_GRID_FRAMES;

export const HARVEST_SPEAKING_HOLD = 2 * HARVEST_BATCH;

export interface Harvest<T> {
  readonly pending: readonly T[];
  readonly dropped: number;
  add(frame: T): number;
  due(speaking: boolean): T[][];
  cut(): { commits: T[][]; sentence: T[] };
  restore(sentence: readonly T[]): number;
  flush(): T[][];
  clear(): void;
}

export function createHarvest<T>(cap: number): Harvest<T> {
  let pending: T[] = [];
  let dropped = 0;
  let restored = false;
  const trim = () => {
    const over = Math.max(0, pending.length - cap);
    if (over > 0) {
      pending = pending.slice(over);
      dropped += over;
    }
    return over;
  };
  const batches = (frames: readonly T[]) => {
    const out: T[][] = [];
    for (let index = 0; index < frames.length; index += HARVEST_BATCH)
      out.push(frames.slice(index, index + HARVEST_BATCH));
    return out;
  };
  return {
    get pending() {
      return pending;
    },
    get dropped() {
      return dropped;
    },
    add(frame) {
      restored = false;
      pending.push(frame);
      return trim();
    },
    due(speaking) {
      if (restored) return [];
      const hold = speaking ? HARVEST_SPEAKING_HOLD : HARVEST_BATCH;
      const commits: T[][] = [];
      while (pending.length >= hold) commits.push(pending.splice(0, HARVEST_BATCH));
      return commits;
    },
    cut() {
      const split = Math.max(0, pending.length - HARVEST_BATCH);
      const commits = batches(pending.slice(0, split));
      const sentence = pending.slice(split);
      pending = [];
      restored = false;
      return { commits, sentence };
    },
    restore(sentence) {
      if (sentence.length === 0) return 0;
      pending = [...sentence, ...pending];
      restored = true;
      return trim();
    },
    flush() {
      const commits = batches(pending);
      pending = [];
      restored = false;
      return commits;
    },
    clear() {
      pending = [];
      restored = false;
    },
  };
}
