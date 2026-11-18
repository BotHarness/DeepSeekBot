import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { HARVEST_BATCH, createHarvest } from '../src/voice/harvest.js';
import { VOICE_CALL_LIMITS } from '../src/voice/call-contract.js';

const step = fc.oneof(
  fc.record({ op: fc.constant('add' as const), count: fc.integer({ min: 1, max: 12 }) }),
  fc.record({ op: fc.constant('due' as const), speaking: fc.boolean() }),
  fc.record({ op: fc.constant('cut' as const), drop: fc.boolean() }),
  fc.record({ op: fc.constant('flush' as const) }),
);

describe('call frames are harvested without loss (docs/decisions/calls.md)', () => {
  it('writes, sends, keeps or counts every keyframe exactly once, in batches of at most nine', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 60 }), (steps) => {
        const harvest = createHarvest<number>(VOICE_CALL_LIMITS.pendingFrames);
        const written: number[] = [];
        const sent: number[] = [];
        const emitted: number[] = [];
        let added = 0;
        const write = (commits: number[][]) => {
          for (const commit of commits) {
            expect(commit.length).toBeGreaterThan(0);
            expect(commit.length).toBeLessThanOrEqual(HARVEST_BATCH);
            written.push(...commit);
            emitted.push(...commit);
          }
        };
        for (const next of steps) {
          if (next.op === 'add')
            for (let index = 0; index < next.count; index += 1) harvest.add(added++);
          else if (next.op === 'due') write(harvest.due(next.speaking));
          else if (next.op === 'flush') write(harvest.flush());
          else {
            const { commits, sentence } = harvest.cut();
            write(commits);
            expect(sentence.length).toBeLessThanOrEqual(HARVEST_BATCH);
            if (next.drop) {
              harvest.restore(sentence);
            } else {
              sent.push(...sentence);
              emitted.push(...sentence);
            }
          }
          expect(harvest.pending.length).toBeLessThanOrEqual(VOICE_CALL_LIMITS.pendingFrames);
          const seen = [...written, ...sent, ...harvest.pending];
          expect(new Set(seen).size).toBe(seen.length);
          expect(seen.length + harvest.dropped).toBe(added);
          expect(emitted.every((frame, index) => index === 0 || frame > emitted[index - 1]!)).toBe(
            true,
          );
        }
      }),
      { numRuns: 500 },
    );
  });

  it('holds eighteen while the Human speaks, so a sentence still ends with the newest nine', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: VOICE_CALL_LIMITS.pendingFrames }), (count) => {
        const harvest = createHarvest<number>(VOICE_CALL_LIMITS.pendingFrames);
        for (let frame = 0; frame < count; frame += 1) harvest.add(frame);
        const commits = harvest.due(true);
        const written =
          HARVEST_BATCH * Math.max(0, Math.ceil((count - 2 * HARVEST_BATCH + 1) / HARVEST_BATCH));
        expect(commits.flat()).toEqual(Array.from({ length: written }, (_, index) => index));
        expect(harvest.pending).toEqual(
          Array.from({ length: count - written }, (_, index) => written + index),
        );
        const { sentence } = harvest.cut();
        expect(sentence).toEqual(
          Array.from(
            { length: Math.min(count, HARVEST_BATCH) },
            (_, index) => count - Math.min(count, HARVEST_BATCH) + index,
          ),
        );
      }),
    );
  });
});
