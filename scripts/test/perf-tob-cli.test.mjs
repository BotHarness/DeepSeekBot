import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it.each(['coded-json', 'non-json'])(
  'stops the actual performance runner after a %s cancellation failure',
  (mode) => {
    const home = mkdtempSync(join(tmpdir(), 'perf-tob-cancel-unit-'));
    try {
      const fixture = join(home, 'fixture.json'),
        instance = join(home, 'instance.json');
      const output = join(home, 'output.json'),
        calls = join(home, 'calls.json');
      writeFileSync(fixture, JSON.stringify({ argv: ['approval-templates'] }));
      writeFileSync(instance, JSON.stringify({ home, url: 'http://127.0.0.1:1/?token=unit-only' }));
      const child = spawnSync(
        process.execPath,
        [
          '--import',
          new URL('./fixtures/perf-tob-cli-refusal-preload.mjs', import.meta.url).href,
          fileURLToPath(new URL('../perf-tob-cli.mjs', import.meta.url)),
          '--source-sha',
          'f'.repeat(40),
          '--fixture',
          fixture,
          '--instance',
          instance,
          '--output',
          output,
        ],
        {
          encoding: 'utf8',
          shell: false,
          windowsHide: true,
          timeout: 10000,
          env: { ...process.env, PERF_TEST_CALLS: calls, PERF_TEST_CANCEL_MODE: mode },
        },
      );
      expect(child.status).toBe(1);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      expect(report.failures).toContain('cancel-request-failed');
      expect(report.samples).toHaveLength(1);
      const commands = JSON.parse(readFileSync(calls, 'utf8'));
      expect(commands.filter((argv) => argv[0] === 'tob-cli' && argv[1] === 'start')).toHaveLength(
        1,
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

it.each(['decoder-unavailable', 'audit-after-oversize'])(
  'persists a failed %s audit without discarding collected samples',
  (mode) => {
    const home = mkdtempSync(join(tmpdir(), 'perf-tob-audit-unit-'));
    try {
      const fixture = join(home, 'fixture.json');
      const instance = join(home, 'instance.json');
      const output = join(home, 'output.json');
      const calls = join(home, 'calls.json');
      writeFileSync(fixture, JSON.stringify({ argv: ['approval-templates'] }));
      writeFileSync(instance, JSON.stringify({ home, url: 'http://127.0.0.1:1/?token=unit-only' }));
      const capture = join(home, 'sessions', 'unit-provider', 'unit-session');
      mkdirSync(capture, { recursive: true });
      const oversized = join(capture, 'session.v4.jsonl.zstd');
      writeFileSync(oversized, '');
      truncateSync(oversized, 16 * 1024 * 1024 + 1);
      const child = spawnSync(
        process.execPath,
        [
          '--import',
          new URL('./fixtures/perf-tob-cli-refusal-preload.mjs', import.meta.url).href,
          fileURLToPath(new URL('../perf-tob-cli.mjs', import.meta.url)),
          '--source-sha',
          'f'.repeat(40),
          '--fixture',
          fixture,
          '--instance',
          instance,
          '--output',
          output,
          '--rounds',
          '1',
        ],
        {
          encoding: 'utf8',
          shell: false,
          windowsHide: true,
          timeout: 10000,
          env: { ...process.env, PERF_TEST_CALLS: calls, PERF_TEST_CANCEL_MODE: mode },
        },
      );
      expect(child.status).toBe(1);
      const report = JSON.parse(readFileSync(output, 'utf8'));
      if (mode === 'decoder-unavailable') {
        expect(report.failures).toEqual(['native-audit-before-failed:unsupported-audit-decoder']);
        expect(report.nativeAudit.before).toEqual({
          valid: false,
          error: 'unsupported-audit-decoder',
        });
        expect(report.samples).toEqual([]);
      } else {
        expect(report.failures).toEqual(['native-audit-after-failed:native-audit-unavailable']);
        expect(report.nativeAudit.before.valid).toBe(true);
        expect(report.nativeAudit.after).toEqual({
          valid: false,
          error: 'native-audit-unavailable',
        });
        expect(report.samples).toHaveLength(1);
        expect(report.samples[0].correct).toBe(true);
        expect(Number.isFinite(report.samples[0].journeyMs)).toBe(true);
        const commands = JSON.parse(readFileSync(calls, 'utf8'));
        expect(
          commands.filter((argv) => argv[0] === 'tob-cli' && argv[1] === 'cancel'),
        ).toHaveLength(1);
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);
