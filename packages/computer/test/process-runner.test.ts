import { describe, expect, it } from 'vitest';
import { createProcessRunner } from '../src/index.js';

describe('bounded Computer subprocesses', () => {
  it('refuses an aborted request before starting any child', async () => {
    const abort = new AbortController();
    abort.abort();
    const result = await createProcessRunner().run(['does-not-exist'], { signal: abort.signal });
    expect(result).toMatchObject({ code: -1, stdout: '', stderr: 'Computer subprocess cancelled before start' });
  });

  it('terminates a child when the configured output bound is exceeded', async () => {
    const result = await createProcessRunner().run([
      process.execPath, '-e', 'process.stdout.write("x".repeat(8192)); setInterval(() => {}, 1000)',
    ], { maxOutputBytes: 1024, timeoutMs: 2_000 });
    expect(result.code).toBe(-1);
    expect(result.stderr).toBe('Computer subprocess output limit exceeded');
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1024);
  });

  it('terminates a child at the deadline instead of leaving extraction running', async () => {
    const result = await createProcessRunner().run([
      process.execPath, '-e', 'process.stdout.write(String(process.pid)); setInterval(() => {}, 1000)',
    ], { timeoutMs: 1_000, maxOutputBytes: 1024 });
    expect(result).toMatchObject({ code: -1, stderr: 'Computer subprocess timed out' });
    const pid = Number(result.stdout);
    expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
