import { describe, expect, it } from 'vitest';

import { KEEP, appendEntry, entryOf, median, report } from '../health-trend.mjs';

const health = {
  'file-lines': { 'a.ts': 1200, 'b.ts': 1050 },
  'tsc-exclude': ['x.ts'],
  'agent-prose-bytes': { 'AGENTS.md': 100, 'CLAUDE.md': 20 },
};

const night = (busy, monkeys = [{ label: 'shell', seed: 1, ok: true, steps: 300 }]) =>
  entryOf({
    date: '2026-11-17',
    sha: 'abc',
    run: '1',
    perf: { mainThreadBusyPct: busy, typing: { p95: 30 }, heapMB: 50, nodes: 2500 },
    monkeys,
    health,
  });

describe('health trend', () => {
  it('records performance, monkey and codebase metrics for one night', () => {
    expect(night(2.5)).toMatchObject({
      perf: { idleBusyPct: 2.5, typingP95: 30, heapMB: 50, nodes: 2500 },
      monkeys: [{ label: 'shell', seed: 1, ok: true, steps: 300 }],
      health: { longFiles: 2, overLines: 250, tscExclude: 1, proseBytes: 120 },
    });
  });

  it(`keeps the last ${KEEP} nights`, () => {
    let trend = [];
    for (let index = 0; index < KEEP + 5; index += 1)
      trend = appendEntry(trend, { date: `night-${index}`, run: index });
    expect(trend).toHaveLength(KEEP);
    expect(trend[0].run).toBe(5);
  });

  it('keeps one entry per night, the latest run', () => {
    const trend = appendEntry(appendEntry([], { date: 'd1', run: 1 }), { date: 'd1', run: 2 });
    expect(trend).toEqual([{ date: 'd1', run: 2 }]);
  });

  it('takes the middle value', () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('warns when a metric rises more than 20% over the weekly median', () => {
    const steady = [2, 2.1, 1.9, 2, 2.2, 2, 2].map((busy) => night(busy));
    expect(report([...steady, night(2.3)]).warnings).toEqual([]);
    expect(report([...steady, night(2.6)]).warnings).toEqual([
      'Idle main-thread busy (%) is 2.6, over 7-night median 2',
    ]);
  });

  it('warns when a metric leaves a zero baseline', () => {
    const zero = (count) => ({
      ...night(2),
      health: { ...night(2).health, tscExclude: count },
    });
    expect(report([zero(0), zero(0), zero(1)]).warnings).toEqual([
      'Files excluded from tsc is 1, over 7-night median 0',
    ]);
  });

  it('names a failed monkey run with its seed and step', () => {
    const failed = night(2, [{ label: 'bot', seed: 9, ok: false, steps: 41, failedAt: 41 }]);
    expect(report([failed]).markdown).toContain('- bot: failed at step 41 (seed 9)');
  });

  it('says so when the performance run left no summary', () => {
    const entry = { ...night(2), perf: null };
    expect(report([entry]).markdown).toContain('The performance run produced no summary.');
  });
});
