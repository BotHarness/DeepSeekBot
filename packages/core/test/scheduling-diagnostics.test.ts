import { channel } from 'node:diagnostics_channel';
import { afterEach, expect, it, vi } from 'vitest';
import { execFileText } from '../src/process/exec-off-thread.js';
import {
  SCHEDULING_DIAGNOSTIC_CHANNEL,
  schedulingIdentity,
  withinSchedulingScan,
} from '../src/process/scheduling-diagnostics.js';
import { createSchedulingCapture } from '../../../scripts/capture-scheduling-diagnostics.mjs';

afterEach(() => vi.unstubAllEnvs());

it('is silent by default even when a diagnostic subscriber is present', async () => {
  vi.stubEnv('BOTHARNESS_SCHEDULING_DIAGNOSTICS', '');
  const observer = vi.fn();
  channel(SCHEDULING_DIAGNOSTIC_CHANNEL).subscribe(observer);
  try {
    expect(schedulingIdentity({})).toBe(0);
    await execFileText(process.execPath, ['-e', '']);
    expect(observer).not.toHaveBeenCalled();
  } finally {
    channel(SCHEDULING_DIAGNOSTIC_CHANNEL).unsubscribe(observer);
  }
});

it('correlates real worker completion and failure with an asynchronous scan scope without output', async () => {
  vi.stubEnv('BOTHARNESS_SCHEDULING_DIAGNOSTICS', '1');
  const capture = createSchedulingCapture();
  channel(SCHEDULING_DIAGNOSTIC_CHANNEL).subscribe(capture.record);
  try {
    const scan = schedulingIdentity();
    await withinSchedulingScan(scan, async () => {
      await Promise.resolve();
      expect(
        await execFileText(process.execPath, ['-e', 'process.stdout.write("private-output")']),
      ).toMatchObject({ stdout: 'private-output' });
      await expect(execFileText(process.execPath, ['-e', 'process.exit(7)'])).rejects.toMatchObject(
        { code: 7 },
      );
    });
    const { rows } = capture.snapshot();
    expect(rows.map((row) => row.kind)).toEqual([
      'exec-dispatch',
      'exec-settle',
      'exec-dispatch',
      'exec-settle',
    ]);
    expect(rows.every((row) => row.scan === scan)).toBe(true);
    expect(rows[0]?.mode).toBe('worker');
    expect(rows[1]?.outcome).toBe('ok');
    expect(rows[3]?.outcome).toBe('error');
    expect(rows[0]?.operation).toBe(rows[1]?.operation);
    expect(rows[2]?.operation).toBe(rows[3]?.operation);
    expect(rows[0]?.operation).not.toBe(rows[2]?.operation);
    expect(JSON.stringify(rows)).not.toMatch(/private-output|process.exit|node.exe|stdout|stderr/);
  } finally {
    channel(SCHEDULING_DIAGNOSTIC_CHANNEL).unsubscribe(capture.record);
  }
});

it('bounds retained rows, reports loss, and drops unapproved values and fields', () => {
  const capture = createSchedulingCapture(2);
  for (let n = 0; n < 3; n++)
    capture.record({
      kind: 'steer',
      at: n,
      monotonicMs: n,
      turn: n,
      delivered: true,
      prompt: 'private-content',
    });
  capture.record({
    kind: 'exec-settle',
    at: 4,
    monotonicMs: 4,
    operation: 4,
    scan: 0,
    outcome: 'private-content',
  });
  const snapshot = capture.snapshot();
  expect(snapshot.dropped).toBe(1);
  expect(snapshot.rejected).toBe(1);
  expect(snapshot.rows.map((row) => row.turn)).toEqual([1, 2]);
  expect(JSON.stringify(snapshot)).not.toContain('private-content');
});
