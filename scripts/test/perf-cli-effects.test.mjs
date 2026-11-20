import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

function withRunner({ from = 'inherit', to = 'off', failure = '', baseline }, check) {
  const directory = mkdtempSync(join(tmpdir(), 'perf-cli-effects-unit-'));
  try {
    const checkout = join(directory, 'checkout');
    for (const file of [
      'perf-cli-effects.mjs',
      'test/fixtures/perf-cli-effects-preload.mjs',
      'perf-budgets/cli-effects.json',
    ]) {
      const target = join(checkout, 'scripts', file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(fileURLToPath(new URL('../' + file, import.meta.url)), target);
    }
    expect(existsSync(join(checkout, 'packages/core/cli/index.mjs'))).toBe(false);
    const fixture = join(directory, 'fixture.json');
    const instance = join(directory, 'instance.json');
    const output = join(directory, 'output.json');
    const calls = join(directory, 'calls.json');
    const state = join(directory, 'state.json');
    const fixtureText = JSON.stringify({ bot: 'unit-bot', from, to });
    writeFileSync(fixture, fixtureText);
    writeFileSync(instance, JSON.stringify({ url: 'http://127.0.0.1:1/?token=unit-only' }));
    const args = [
      join(checkout, 'scripts/perf-cli-effects.mjs'),
      '--source-sha',
      'f'.repeat(40),
      '--fixture',
      fixture,
      '--instance',
      instance,
      '--output',
      output,
    ];
    if (baseline) {
      const valid = {
        fixtureSha256: createHash('sha256').update(fixtureText).digest('hex'),
        node: process.version,
        budget: { failures: [] },
        samples: ['list', 'set', 'read'].flatMap((operation) =>
          Array.from({ length: 3 }, (_, round) => ({
            operation,
            round,
            correct: true,
            code: 0,
            processCode: 0,
            wallMs: 1000,
            maxRssKiB: 60000,
          })),
        ),
      };
      baseline(valid);
      const baselinePath = join(directory, 'baseline.json');
      writeFileSync(baselinePath, JSON.stringify(valid));
      args.push('--baseline', baselinePath);
    }
    const preload = pathToFileURL(
      join(checkout, 'scripts/test/fixtures/perf-cli-effects-preload.mjs'),
    ).href;
    const child = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 10000,
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--import=' + preload].filter(Boolean).join(' '),
        PERF_TEST_CALLS: calls,
        PERF_TEST_STATE: state,
        PERF_TEST_FAILURE: failure,
      },
    });
    expect(existsSync(output), child.stderr).toBe(true);
    check({
      status: child.status,
      report: JSON.parse(readFileSync(output, 'utf8')),
      calls: existsSync(calls) ? JSON.parse(readFileSync(calls, 'utf8')) : [],
      selected: existsSync(state) ? JSON.parse(readFileSync(state, 'utf8')) : undefined,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

it.each([
  ['inherit', 'off', 'omitted-off', '@global'],
  ['off', 'inherit', '', null],
  ['named-before', 'inherit', '', 'named-before'],
])(
  'normalizes %s -> %s selections and restores the original choice',
  (from, to, failure, expected) => {
    withRunner({ from, to, failure }, ({ status, report, selected, calls }) => {
      expect(status).toBe(0);
      expect(report.budget.failures).toEqual([]);
      expect(report.samples).toHaveLength(9);
      expect(report.restorations).toHaveLength(3);
      expect(report.restorations.every((row) => row.correct)).toBe(true);
      expect(selected).toBe(expected);
      expect(
        calls.filter((argv) => argv[0] === 'approval-template-set' && argv[2] === from),
      ).toHaveLength(3);
    });
  },
);

it('restores the fixture and writes the failure report after a worker throws', () => {
  withRunner({ failure: 'set-throw' }, ({ status, report, calls, selected }) => {
    expect(status).toBe(1);
    expect(report.budget.failures).toContain('set:incorrect');
    expect(report.samples).toHaveLength(2);
    expect(report.restorations).toHaveLength(1);
    expect(report.restorations[0].correct).toBe(true);
    expect(calls.at(-1)).toEqual(['approval-template-set', 'unit-bot', 'inherit', '--compact']);
    expect(selected).toBe('@global');
  });
});

it('preserves samples and a coded restoration refusal instead of throwing before output', () => {
  withRunner({ failure: 'restore-refusal' }, ({ status, report }) => {
    expect(status).toBe(1);
    expect(report.samples).toHaveLength(3);
    expect(report.budget.failures).toContain('fixture-restore-failed');
    expect(report.restorations[0]).toMatchObject({ code: 7, error: 'unit-restore-refused' });
  });
});

it.each([
  ['failed', (baseline) => baseline.budget.failures.push('set:latency')],
  [
    'missing',
    (baseline) => (baseline.samples = baseline.samples.filter((row) => row.operation !== 'set')),
  ],
  [
    'nonfinite',
    (baseline) => (baseline.samples.find((row) => row.operation === 'read').wallMs = Infinity),
  ],
  ['incorrect', (baseline) => (baseline.samples[0].correct = false)],
  ['worker-failed', (baseline) => (baseline.samples[0].processCode = 1)],
])('refuses a %s baseline before mutating the fixture', (_name, baseline) => {
  withRunner({ baseline }, ({ status, report, calls }) => {
    expect(status).toBe(1);
    expect(report.budget.failures.some((failure) => failure.startsWith('baseline:'))).toBe(true);
    expect(report.samples).toEqual([]);
    expect(report.restorations).toEqual([]);
    expect(calls).toEqual([]);
  });
});

it('uses a complete successful matching baseline for latency comparison', () => {
  withRunner({ baseline: () => {} }, ({ status, report }) => {
    expect(status).toBe(0);
    expect(report.budget.failures).toEqual([]);
    expect(report.samples).toHaveLength(9);
  });
});
