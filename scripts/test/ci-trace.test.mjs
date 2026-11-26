import { describe, expect, it } from 'vitest';
import { formatReport, parseShardLog, summarizeRuns } from '../ci-trace.mjs';

const at = (second) => new Date(Date.UTC(2026, 10, 24, 12, 0, second)).toISOString();
const job = (name, created, started, completed, steps = []) => ({
  name,
  conclusion: 'success',
  created_at: at(created),
  started_at: at(started),
  completed_at: at(completed),
  steps: steps.map(([step, from, to]) => ({
    name: step,
    started_at: at(from),
    completed_at: at(to),
  })),
});

describe('ci trace', () => {
  it('summarizes job medians, queue time, slack and the job that finished last', () => {
    const summary = summarizeRuns([
      {
        jobs: [
          job('plan tests', 0, 2, 20),
          job('test (shard 1)', 20, 25, 55, [
            ['Run Vitest shard', 30, 55],
            ['Run actions/checkout', 25, 27],
          ]),
          job('test (shard 2)', 20, 30, 50),
          { ...job('skipped', 0, 0, 0), conclusion: 'skipped' },
        ],
      },
    ]);
    expect(summary.runs).toBe(1);
    expect(summary.wall).toEqual({ median: 55, max: 55 });
    expect(summary.lastJobs).toEqual({ 'test (shard N)': 1 });
    const shards = summary.jobs.find((entry) => entry.name === 'test (shard N)');
    expect(shards).toMatchObject({ median: 25, max: 30, queue: 7.5, slack: 2.5 });
    expect(shards.steps).toEqual([{ name: 'Run Vitest shard', median: 25, max: 25 }]);
    expect(summary.jobs.map((entry) => entry.name)).not.toContain('skipped');
  });

  it('reads file results, phases and the tail from a raw or rendered shard log', () => {
    const escape = String.fromCharCode(27);
    const log = [
      `test (shard 1)\tRun Vitest shard\t2026-11-24T12:00:10.0000000Z  ${escape}[32m✓${escape}[39m ${escape}[42m default ${escape}[49m packages/core/test/a.test.ts (3 tests) 8000ms`,
      'test (shard 1)\tRun Vitest shard\t2026-11-24T12:00:12.0000000Z  ^[[32m✓^[[39m default scripts/test/b.test.mjs (2 tests | 1 skipped) 1000ms',
      'test (shard 1)\tRun Vitest shard\t2026-11-24T12:00:12.5000000Z  ✓ default packages/core/test/c.test.ts (1 test)',
      'test (shard 1)\tRun Vitest shard\t2026-11-24T12:00:13.0000000Z    Duration  14.20s (tests 70%, import 20%, transform 10%)',
    ].join('\n');
    const shard = parseShardLog(log);
    expect(shard).toMatchObject({ files: 3, testSeconds: 9, window: 10.5, wall: 14.2 });
    expect(shard.parallelism).toBeCloseTo(9 / 14.2);
    expect(parseShardLog(log.split('\n').slice(0, 3).join('\n'))).toMatchObject({ wall: 10.5 });
    expect(shard.summary).toEqual({
      duration: 14.2,
      phases: { tests: 70, import: 20, transform: 10 },
    });
    expect(shard.slowest[0]).toMatchObject({ file: 'packages/core/test/a.test.ts', ms: 8000 });
    expect(shard.lastFinished[0].file).toBe('packages/core/test/c.test.ts');
  });

  it('formats a Markdown report with job, step and shard tables', () => {
    const summary = summarizeRuns([
      { jobs: [job('test (shard 1)', 0, 0, 60, [['Run Vitest | shard', 0, 60]])] },
    ]);
    const report = formatReport(summary, [{ name: 'test (shard 1)', ...parseShardLog('') }]);
    expect(report).toContain('# Verify trace: 1 runs');
    expect(report).toContain('| test (shard N) | 1.0 min | 1.0 min | 0 s | 0.0 min |');
    expect(report).toContain('| Run Vitest \\| shard | 60 s | 60 s |');
    expect(report).toContain('| test (shard 1) | 0 | 0 s | 0 s | 0 s | 0.0 |  |');
  });
});
