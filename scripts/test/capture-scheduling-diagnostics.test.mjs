import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

it('preloads into a separate Node process and writes a readable PID-scoped bounded report', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scheduling-capture-'));
  const prefix = join(directory, 'capture');
  const collector = new URL('../capture-scheduling-diagnostics.mjs', import.meta.url).href;
  try {
    const result = await promisify(execFile)(
      process.execPath,
      [
        '--import',
        collector,
        '-e',
        `
      const {channel}=require('node:diagnostics_channel');
      channel('botharness.scheduling.v1').publish({kind:'steer',turn:1,delivered:true,at:Date.now(),monotonicMs:performance.now(),prompt:'must-not-leak'});
      setTimeout(()=>process.stdout.write(String(process.pid)),1300);
    `,
      ],
      {
        env: {
          ...process.env,
          BOTHARNESS_SCHEDULING_DIAGNOSTICS: '1',
          BOTHARNESS_SCHEDULING_REPORT: prefix,
        },
      },
    );
    const text = await readFile(`${prefix}.${result.stdout}.json`, 'utf8');
    const report = JSON.parse(text);
    expect(report.pid).toBe(Number(result.stdout));
    expect(report.rows).toHaveLength(1);
    expect(report.writeFailures).toBe(0);
    expect(report.rows[0]).toMatchObject({ kind: 'steer', turn: 1, delivered: true });
    expect(text).not.toContain('must-not-leak');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
