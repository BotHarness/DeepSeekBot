import { describe, expect, it } from 'vitest';

import {
  compare,
  runCost,
  summarize,
  type EvalReport,
  type ScenarioRun,
} from './inbox-eval/score.js';

const run = (
  scenario: string,
  cost: number,
  ok = true,
  safe = true,
  inbox?: string,
): ScenarioRun => ({
  scenario,
  ...(inbox === undefined ? {} : { inbox }),
  usage: { uncachedInput: cost * 1000, cacheRead: 0, output: 0, steps: 2 },
  behavior: { ok },
  safety: { safe },
});

const report = (label: string, runs: ScenarioRun[]): EvalReport => ({ label, model: 'm', runs });

describe('Bot Inbox eval scoring', () => {
  it('prices a run from uncached input, cache reads and output', () => {
    expect(
      runCost({ uncachedInput: 1_000_000, cacheRead: 1_000_000, output: 1_000_000, steps: 1 }),
    ).toBeCloseTo(0.753);
  });

  it('accepts a clear cost cut that keeps every gate', () => {
    const base = report(
      'b',
      [10, 11, 10, 12, 11].flatMap((cost) => [run('a', cost), run('b', cost)]),
    );
    const next = report(
      'c',
      [8, 8.5, 8, 9, 8.2].flatMap((cost) => [run('a', cost), run('b', cost)]),
    );
    const verdict = compare(base, next);
    expect(verdict.accepted).toBe(true);
    expect(verdict.change).toBeLessThan(-0.15);
    expect(verdict.interval[1]).toBeLessThan(0);
  });

  it('rejects a cheaper candidate that fails a safety check once', () => {
    const base = report(
      'b',
      [10, 10, 10].map((cost) => run('a', cost)),
    );
    const next = report('c', [run('a', 5), run('a', 5), run('a', 5, true, false)]);
    const verdict = compare(base, next);
    expect(verdict.accepted).toBe(false);
    expect(verdict.reasons).toContain('a: safety 2/3');
  });

  it('rejects a cut that loses behavior passes or sits inside the noise', () => {
    const base = report(
      'b',
      [10, 10, 10, 10, 10].map((cost) => run('a', cost)),
    );
    const worse = report('c', [
      run('a', 5, false),
      run('a', 5, false),
      run('a', 5),
      run('a', 5),
      run('a', 5),
    ]);
    expect(compare(base, worse).accepted).toBe(false);
    const noisy = report(
      'c',
      [4, 16, 10, 9, 8].map((cost) => run('a', cost)),
    );
    const verdict = compare(base, noisy);
    expect(verdict.accepted).toBe(false);
    expect(summarize(noisy)[0]?.behaviorPasses).toBe(5);
  });

  it('prices only the scenarios whose Inbox rendering changed', () => {
    const base = report(
      'b',
      [10, 10, 10].flatMap((cost) => [
        run('a', cost, true, true, 'old'),
        run('b', cost, true, true, 'same'),
      ]),
    );
    const next = report(
      'c',
      [5, 5, 5].flatMap((cost) => [
        run('a', cost, true, true, 'new'),
        run('b', 30, true, true, 'same'),
      ]),
    );
    const verdict = compare(base, next);
    expect(verdict.changed).toEqual(['a']);
    expect(verdict.change).toBeCloseTo(-0.5);
    expect(verdict.accepted).toBe(true);
    const same = compare(base, base);
    expect(same.accepted).toBe(false);
    expect(same.reasons).toContain('no scenario renders differently from the baseline');
  });
});
