import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkBudget } from '../perf-budget.mjs';

const budget = JSON.parse(
  readFileSync(new URL('../perf-budgets/timeline.json', import.meta.url), 'utf8'),
);

const healthy = () => ({
  seeded: 600,
  animate: false,
  loadedMessages: 600,
  mountedMessages: 11,
  timelineGaps: 1,
  nodes: 9000,
  heapMB: 42,
  mainThreadBusyPct: 2,
  typing: { p95: 24 },
  scroll: { jumps: 0, gapsInView: 0, emptyInView: 0 },
  pageErrors: [],
});

describe('timeline performance budget', () => {
  it('passes a healthy run', () => {
    const check = checkBudget(healthy(), budget);
    expect(check.pass).toBe(true);
    expect(check.failures).toEqual([]);
  });

  it('fails when the whole history mounts again', () => {
    const check = checkBudget(
      { ...healthy(), mountedMessages: 600, timelineGaps: 0, nodes: 192000 },
      budget,
    );
    expect(check.pass).toBe(false);
    expect(check.failures.map((failure) => failure.metric)).toEqual([
      'mountedMessages',
      'timelineGaps',
      'nodes',
    ]);
  });

  it('fails when the history did not fully load or the scroll check did not run', () => {
    const check = checkBudget({ ...healthy(), loadedMessages: 120, scroll: undefined }, budget);
    expect(check.failures.map((failure) => failure.metric)).toEqual([
      'loadedMessages',
      'scroll.jumps',
      'scroll.gapsInView',
      'scroll.emptyInView',
    ]);
  });

  it('counts page errors', () => {
    const check = checkBudget({ ...healthy(), pageErrors: ['boom'] }, budget);
    expect(check.failures[0]).toMatchObject({ metric: 'pageErrors', actual: 1 });
  });

  it('warns on timing unless timing is strict', () => {
    const slow = { ...healthy(), animate: true, mainThreadBusyPct: 30 };
    expect(checkBudget(slow, budget)).toMatchObject({ pass: true, mode: 'animate' });
    expect(checkBudget(slow, budget).warnings[0].metric).toBe('mainThreadBusyPct');
    expect(checkBudget(slow, budget, { strictTiming: true }).pass).toBe(false);
  });
});
