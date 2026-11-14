import { afterEach, expect, it, vi } from 'vitest';
import { writeGenuiOpeningResult } from '../perf-genui-opening-output.mjs';

afterEach(() => vi.restoreAllMocks());

const output = (manifest) => {
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
  writeGenuiOpeningResult(manifest, (value) =>
    String(value).replaceAll('private-token', '[redacted]'),
  );
  return {
    stdout: stdout.mock.calls.map(([line]) => line),
    stderr: stderr.mock.calls.map(([line]) => line).join('\n'),
  };
};

it('exposes the preview refusal on stderr when CI discards stdout', () => {
  const { stderr, stdout } = output({
    status: 'failed',
    failure: 'Error: genui-preview-browser-startup-timeout: browser could not start private-token',
    publications: [
      {
        pair: 1,
        arm: 'rich',
        previewFailure: {
          code: 'genui-preview-browser-startup-timeout',
          message: 'browser could not start private-token',
          elapsedMs: 8001,
        },
      },
    ],
    summary: { pairs: 0 },
    budgetResult: { pass: false, failures: [] },
  });
  expect(stderr).toContain('genui-preview-browser-startup-timeout');
  expect(stderr).toContain('"phase":"preview"');
  expect(stderr).toContain('"pair":1');
  expect(stderr).toContain('"elapsedMs":8001');
  expect(stderr).toContain('[redacted]');
  expect(stderr).not.toContain('private-token');
  expect(stdout).toHaveLength(1);
  expect(JSON.parse(stdout[0]).status).toBe('failed');
});

it('shows actual values and limits for budget-only failures', () => {
  const { stderr } = output({
    status: 'failed',
    summary: {},
    budgetResult: {
      pass: false,
      failures: [{ metric: 'rich.ready.maxMs', actual: 1501, max: 1500 }],
    },
  });
  expect(stderr).toContain('"phase":"budget"');
  expect(stderr).toContain('"metric":"rich.ready.maxMs"');
  expect(stderr).toContain('"actual":1501');
  expect(stderr).toContain('"max":1500');
});

it('retains cleanup and page errors and bounds the error output', () => {
  const { stderr } = output({
    status: 'failed',
    failure: 'x'.repeat(10000),
    summary: { cleanupFailures: ['close failed private-token'], pageErrors: ['page failed'] },
    budgetResult: { pass: false, failures: [] },
  });
  expect(stderr).toContain('close failed [redacted]');
  expect(stderr).toContain('page failed');
  expect(stderr.length).toBeLessThan(4000);
});

it('keeps successful stdout as one JSON document without error output', () => {
  const summary = { qualificationEligible: true, pairs: 3 };
  const budget = { pass: true, failures: [] };
  const { stdout, stderr } = output({ status: 'passed', summary, budgetResult: budget });
  expect(stderr).toBe('');
  expect(stdout).toEqual([JSON.stringify({ status: 'passed', ...summary, budget })]);
});
