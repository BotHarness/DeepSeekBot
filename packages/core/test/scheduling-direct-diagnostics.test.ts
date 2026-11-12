import { channel } from 'node:diagnostics_channel';
import { afterEach, expect, it, vi } from 'vitest';
import { createSchedulingCapture } from '../../../scripts/capture-scheduling-diagnostics.mjs';

vi.mock('node:worker_threads', async (original) => ({
  ...(await original<typeof import('node:worker_threads')>()),
  Worker: class {
    constructor() {
      throw new Error('Synthetic unavailable worker');
    }
  },
}));

import { execFileText } from '../src/process/exec-off-thread.js';
afterEach(() => vi.unstubAllEnvs());

it('identifies fallback direct dispatch and preserves success/failure', async () => {
  vi.stubEnv('BOTHARNESS_SCHEDULING_DIAGNOSTICS', '1');
  const capture = createSchedulingCapture();
  const output = channel('botharness.scheduling.v1');
  output.subscribe(capture.record);
  try {
    expect(
      await execFileText(process.execPath, ['-e', 'process.stdout.write("ok")']),
    ).toMatchObject({ stdout: 'ok' });
    await expect(execFileText(process.execPath, ['-e', 'process.exit(9)'])).rejects.toMatchObject({
      code: 9,
    });
    const { rows } = capture.snapshot();
    expect(rows.map((row) => row.kind)).toEqual([
      'exec-dispatch',
      'exec-settle',
      'exec-dispatch',
      'exec-settle',
    ]);
    expect(rows.filter((row) => row.kind === 'exec-dispatch').map((row) => row.mode)).toEqual([
      'direct',
      'direct',
    ]);
    expect(rows.filter((row) => row.kind === 'exec-settle').map((row) => row.outcome)).toEqual([
      'ok',
      'error',
    ]);
  } finally {
    output.unsubscribe(capture.record);
  }
});
