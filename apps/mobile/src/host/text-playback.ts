import { graphemeSegments } from 'unicode-segmenter/grapheme';

export const playbackTiming = {
  frame: 32,
  warmup: 260,
  maxWarmup: 800,
  reserve: 800,
  maxRate: 900,
  maxRelease: 32,
  settle: 260,
} as const;

export function createTextPlayback(initial = '', now = Date.now()) {
  let target = initial;
  let ends = [...graphemeSegments(initial)].map((part) => part.index + part.segment.length);
  let cursor = ends.length;
  let body = initial;
  let closed = false;
  let started = initial.length > 0;
  let first = now;
  let last = now;
  let arrived = now;
  let arrivalRate = 32;
  let arrivalGap = 100;
  let rate = 28;
  let credit = 0;
  let pauseUntil = 0;
  let drainRate: number | undefined;

  const pending = () => ends.length - cursor;
  const close = (finished: boolean) => {
    if (finished && !closed) drainRate = Math.max(42, rate, pending() / 3);
    if (!finished) drainRate = undefined;
    closed = finished;
  };
  const phase = () =>
    pending() === 0
      ? closed
        ? 'complete'
        : 'waiting'
      : !started
        ? 'buffering'
        : closed
          ? 'draining'
          : 'playing';
  const snapshot = () => ({
    body,
    pending: pending(),
    received: ends.length,
    cursor,
    rate,
    phase: phase(),
  });

  return {
    getSnapshot: snapshot,
    receive(next: string, finished: boolean, at: number) {
      if (next === target) {
        close(finished);
        return;
      }
      if (!next.startsWith(body)) {
        target = next;
        ends = [...graphemeSegments(next)].map((part) => part.index + part.segment.length);
        cursor = ends.length;
        body = next;
        credit = 0;
        close(finished);
        return;
      }
      const oldLength = ends.length;
      const shown = body.length;
      const from = next.startsWith(target) ? (ends.at(-2) ?? 0) : 0;
      const kept = from === 0 ? [] : ends.filter((end) => end <= from);
      ends = [
        ...kept,
        ...[...graphemeSegments(next.slice(from))].map(
          (part) => from + part.index + part.segment.length,
        ),
      ];
      cursor = ends.findIndex((end) => end > shown);
      if (cursor < 0) cursor = ends.length;
      target = next;
      const added = Math.max(0, ends.length - oldLength);
      if (added > 0) {
        const gap = Math.max(16, at - arrived);
        const smoothing = 1 - Math.exp(-gap / 500);
        arrivalRate += (Math.min(6000, (added * 1000) / gap) - arrivalRate) * smoothing;
        arrivalGap += (gap - arrivalGap) * smoothing;
        arrived = at;
      }
      close(finished);
    },
    advance(at: number) {
      const elapsed = Math.min(64, Math.max(0, at - last));
      last = at;
      if (pending() === 0 || at < pauseUntil) return snapshot();
      const reserve = Math.max(8, Math.min(640, (arrivalRate * playbackTiming.reserve) / 1000));
      if (!started) {
        const age = at - first;
        const completeClause = /[，。！？；,.!?;\n]/u.test(target);
        if (
          !closed &&
          (age < playbackTiming.warmup ||
            (pending() < reserve && !completeClause && age < playbackTiming.maxWarmup))
        )
          return snapshot();
        started = true;
        credit = 1;
      }
      const quiet = Math.max(0, at - arrived - Math.max(180, arrivalGap * 1.5));
      const incoming = arrivalRate * Math.exp(-quiet / 650);
      const desired = closed
        ? (drainRate ?? Math.max(42, rate))
        : (incoming * 0.8 + Math.max(0, pending() - reserve) / 0.9) *
          Math.min(1, Math.max(0.12, pending() / reserve));
      const targetRate = Math.max(3, Math.min(playbackTiming.maxRate, desired));
      rate += (targetRate - rate) * (1 - Math.exp(-elapsed / 240));
      credit = Math.min(playbackTiming.maxRelease * 2, credit + (rate * elapsed) / 1000);
      const count = Math.min(pending(), Math.floor(credit), playbackTiming.maxRelease);
      let released = 0;
      for (; released < count; released++) {
        const start = cursor === 0 ? 0 : ends[cursor - 1]!;
        const end = ends[cursor]!;
        const glyph = target.slice(start, end);
        cursor++;
        const sentence = /[。！？.!?]/u.test(glyph);
        const clause = /[，、；：,;:]/u.test(glyph);
        const line = glyph.includes('\n');
        if (sentence || clause || line) {
          if (line && target.slice(end, ends[cursor] ?? end).includes('\n')) continue;
          const fast = rate > 180;
          const scale = Math.min(1, Math.sqrt(42 / rate)) * (fast ? (180 / rate) ** 2 : 1);
          const pause = (line ? 190 : sentence ? 125 : 55) * scale;
          if (fast && !line && pause < playbackTiming.frame) continue;
          pauseUntil = at + Math.max(fast ? playbackTiming.frame : 0, pause);
          released++;
          credit = fast ? credit : 0;
          break;
        }
      }
      credit = Math.max(0, credit - released);
      body = target.slice(0, cursor === 0 ? 0 : ends[cursor - 1]);
      return snapshot();
    },
    flush() {
      cursor = ends.length;
      body = target;
      credit = 0;
      return snapshot();
    },
    resetClock(at: number) {
      last = at;
      first = at;
      arrived = at;
      credit = 0;
      pauseUntil = 0;
    },
  };
}

export type TextPlayback = ReturnType<typeof createTextPlayback>;
