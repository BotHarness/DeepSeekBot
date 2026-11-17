import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DshSessionEvent } from '../src/sessions/source.js';
import { reportedBuckets } from '../src/usage/usage.js';

const BUCKETS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const;
const SETTLED = {
  inputTokens: 'uncachedInputTokens',
  outputTokens: 'outputTokens',
  cacheReadTokens: 'cacheReadTokens',
  cacheWriteTokens: 'cacheWriteTokens',
} as const;

const tokens = fc.nat({ max: 1_000_000 });
const request = fc.record({
  values: fc.tuple(tokens, tokens, tokens, tokens),
  omitted: fc.subarray([0, 1, 2, 3]),
  extra: fc.oneof(fc.constant(0), tokens),
  withTotal: fc.boolean(),
});

const event = (usage: Record<string, number>) =>
  ({ type: 'assistant/message', data: { usage } }) as unknown as DshSessionEvent;

describe('ADR-0204 an exact total settles omitted usage buckets', () => {
  it('fills omitted buckets only when the total determines them, and never contradicts the total', () => {
    fc.assert(
      fc.property(request, ({ values, omitted, extra, withTotal }) => {
        const usage: Record<string, number> = {};
        BUCKETS.forEach((key, index) => {
          if (!omitted.includes(index)) usage[key] = values[index]!;
        });
        const reported = Object.values(usage).reduce((sum, value) => sum + value, 0);
        const total = reported + (omitted.length === 0 ? 0 : extra);
        if (withTotal) usage['totalTokens'] = total;
        const buckets = reportedBuckets(event(usage));

        BUCKETS.forEach((key, index) => {
          if (!omitted.includes(index)) expect(buckets[SETTLED[key]]).toBe(values[index]);
        });
        const settled = omitted.map((index) => buckets[SETTLED[BUCKETS[index]!]]);
        if (!withTotal || omitted.length === 0) {
          expect(settled.every((value) => value === undefined)).toBe(true);
          return;
        }
        expect(buckets.totalTokens).toBe(total);
        if (omitted.length === 1) expect(settled).toEqual([extra]);
        else if (extra === 0) expect(settled.every((value) => value === 0)).toBe(true);
        else expect(settled.every((value) => value === undefined)).toBe(true);
      }),
    );
  });

  it('drops a reported total below the sum of the reported buckets', () => {
    fc.assert(
      fc.property(
        fc.tuple(tokens, tokens, tokens, tokens),
        fc.integer({ min: 1, max: 1000 }),
        (values, short) => {
          const usage: Record<string, number> = Object.fromEntries(
            BUCKETS.map((key, index) => [key, values[index]!]),
          );
          const sum = values.reduce((total, value) => total + value, 0);
          fc.pre(sum >= short);
          usage['totalTokens'] = sum - short;
          expect(reportedBuckets(event(usage)).totalTokens).toBeUndefined();
        },
      ),
    );
  });
});
