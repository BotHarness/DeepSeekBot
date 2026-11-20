import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { createTempRoot } from './helpers.js';
import {
  execFileBuffer,
  execFileText,
  type OffThreadError,
} from '../src/process/exec-off-thread.js';

const node = process.execPath;

describe('processes started off the Host thread', () => {
  it('keeps pending commands alive and exits naturally once the worker is idle', () => {
    const built = buildSync({
      entryPoints: [fileURLToPath(new URL('../src/process/exec-off-thread.ts', import.meta.url))],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
    });
    const [output] = built.outputFiles;
    if (!output) throw new Error('Process runner bundle is missing');
    const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(output.text).toString('base64');
    const runner = join(createTempRoot('exec-worker-lifetime-'), 'runner.mjs');
    writeFileSync(
      runner,
      `
      const { execFileText } = await import(${JSON.stringify(moduleUrl)});
      const results = await Promise.all([
        execFileText(process.execPath, ['-e', "setTimeout(() => process.stdout.write('first'), 20)"]),
        execFileText(process.execPath, ['-e', "setTimeout(() => process.stdout.write('last'), 100)"]),
        execFileText('botharness-no-such-program', []).catch(error => ({ stdout: error.code })),
      ]);
      const again = await execFileText(process.execPath, ['-e', "process.stdout.write('again')"]);
      process.stdout.write([...results, again].map(result => result.stdout).join('|'));
    `,
    );
    expect(
      execFileSync(node, [runner], {
        encoding: 'utf8',
        timeout: 10_000,
        windowsHide: true,
      }),
    ).toBe('first|last|ENOENT|again');
  }, 15_000);

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
