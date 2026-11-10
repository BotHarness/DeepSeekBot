import { describe, expect, it } from 'vitest';
import {
  execFileBuffer,
  execFileText,
  type OffThreadError,
} from '../src/process/exec-off-thread.js';

const node = process.execPath;

describe('processes started off the Host thread', () => {
  it('returns text and binary output like execFile', async () => {
    const text = await execFileText(node, [
      '-e',
      "process.stdout.write('héllo'); process.stderr.write('warn')",
    ]);
    expect(text).toEqual({ stdout: 'héllo', stderr: 'warn' });
    const binary = await execFileBuffer(node, [
      '-e',
      'process.stdout.write(Buffer.from([0, 255, 7]))',
    ]);
    expect(Buffer.isBuffer(binary.stdout)).toBe(true);
    expect([...binary.stdout]).toEqual([0, 255, 7]);
  });

  it('keeps the exit code, output, missing-program code and timeout on failures', async () => {
    const failed = (await execFileText(node, [
      '-e',
      "process.stdout.write('partial'); process.stderr.write('bad'); process.exit(3)",
    ]).catch((error: unknown) => error)) as OffThreadError;
    expect(failed).toBeInstanceOf(Error);
    expect(failed.code).toBe(3);
    expect(failed.stdout).toBe('partial');
    expect(failed.stderr).toBe('bad');
    const missing = (await execFileText('botharness-no-such-program', []).catch(
      (error: unknown) => error,
    )) as OffThreadError;
    expect(missing.code).toBe('ENOENT');
    const slow = (await execFileText(node, ['-e', 'setTimeout(() => {}, 10000)'], {
      timeout: 200,
    }).catch((error: unknown) => error)) as OffThreadError;
    expect(slow.killed).toBe(true);
  });

  it('runs several commands at once and passes the working directory and environment', async () => {
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        execFileText(node, ['-e', 'process.stdout.write(process.cwd() + "|" + process.env.QA_N)'], {
          cwd: process.cwd(),
          env: { ...process.env, QA_N: String(n) },
        }),
      ),
    );
    expect(results.map((r) => r.stdout)).toEqual([1, 2, 3].map((n) => `${process.cwd()}|${n}`));
  });
});
